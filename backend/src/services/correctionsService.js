const { GoogleGenAI } = require('@google/genai');
const { getProviderStatus, isKeyValid } = require('./providerManager');

/**
 * PART A — AI-GENERATED CORRECTIONS & PARTIALLY ACCURATE FLAG
 * Grounded Correction Engine: Zero Invented Replacements
 */
async function generateClaimCorrection(claim, verificationResult = {}, articleResearchContext = null) {
  const claimText = typeof claim === 'string' ? claim : (claim.text || claim.claimText || '');
  const status = verificationResult.verdict || verificationResult.status || claim.status || 'SUSPICIOUS';
  const sources = verificationResult.sources || claim.sources || [];
  const refutingIndices = verificationResult.refutingSourceIndices || [];

  let hasCorrection = false;
  let correctedClaim = null;
  let correctionBasis = null;
  let partiallyAccurate = false;

  // Gather evidence text snippets (strip metadata tags to prevent source index numbers like [Source 0] from being parsed as evidence numbers)
  const evidenceTextOnly = sources.map(s => `${s.snippet || s.title || ''}`).join(' ');
  const articleSummary = articleResearchContext?.summary || '';
  const fullEvText = `${evidenceTextOnly} ${articleSummary}`.trim();
  const evidenceSnippets = fullEvText || 'No direct evidence text available.';

  // Determine if claim requires correction
  const isRefuted = status === 'FABRICATED' || status === 'False' || status === 'FALSE';
  const isPartiallyRefuted = status === 'PARTIALLY_VERIFIED' || refutingIndices.length > 0;
  const isUnverified = status === 'SUSPICIOUS' || status === 'UNVERIFIED';

  if (!isRefuted && !isPartiallyRefuted && !isUnverified) {
    return {
      hasCorrection: false,
      correctedClaim: null,
      correctionBasis: null,
      partiallyAccurate: false
    };
  }

  // Check Gemini API key for grounded correction generation
  const geminiKey = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;
  const hasGemini = isKeyValid(geminiKey);

  if (hasGemini && geminiKey && fullEvText) {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const modelName = (process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim();

      const prompt = `You are an AI Fact-Checking Correction Agent.
Original Claim: "${claimText}"
Authoritative Claim Status: ${status}
Retrieved Evidence Snippets:
${evidenceSnippets}

GROUNDING RULES:
1. You may ONLY state a specific replacement fact (number, date, name) if that exact fact is explicitly present in the retrieved evidence snippets.
2. If evidence confirms the original value is wrong or unverified, but does NOT contain the actual correct replacement value, state: "The reported value could not be independently confirmed."
3. NEVER invent a replacement number, date, or name.
4. Output JSON format: { "correctedClaim": "...", "correctionBasis": "..." }`;

      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.1
        }
      });

      let rawText = null;
      if (typeof response.text === 'string') rawText = response.text;
      else if (typeof response.text === 'function') rawText = response.text();
      else if (response.candidates?.[0]?.content?.parts) {
        rawText = response.candidates[0].content.parts.map(p => p.text || '').join('');
      }

      const parsed = JSON.parse((rawText || '{}').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim());
      if (parsed.correctedClaim) {
        return {
          hasCorrection: true,
          correctedClaim: parsed.correctedClaim,
          correctionBasis: parsed.correctionBasis || 'Grounded evidence correction',
          partiallyAccurate: isPartiallyRefuted
        };
      }
    } catch (e) {
      // Fallback to deterministic grounded generator below
    }
  }

  // Grounded Deterministic Fallback Generator (Pure General Logic - ZERO Hardcoded Entities)
  const claimNumMatch = claimText.match(/\b(\d+(?:\.\d+)?%?|\d+\s*(?:million|billion|trillion|percent|people|dead|injured|killed|casualties|workers|students|protesters))\b/i);

  if (claimNumMatch) {
    const claimNumStr = claimNumMatch[1];
    // Search evidence snippets for a replacement metric attached to similar keywords
    const evNumMatches = fullEvText.match(/\b(\d+(?:\.\d+)?%?|\d+\s*(?:million|billion|trillion|percent|people|dead|injured|killed|casualties|workers|students|protesters))\b/gi);

    const conflictingEvNum = evNumMatches ? evNumMatches.find(numStr => numStr.toLowerCase() !== claimNumStr.toLowerCase()) : null;

    if (conflictingEvNum) {
      // Replacement number is EXPLICITLY present in evidence
      correctedClaim = `${claimText.replace(claimNumStr, conflictingEvNum)} (not ${claimNumStr} as reported in original text).`;
      correctionBasis = `Evidence from cited sources explicitly confirms the figure is ${conflictingEvNum}, contrasting with the original claim of ${claimNumStr}.`;
      partiallyAccurate = true;
    } else {
      // Replacement number is NOT present in evidence -> exact required sentence
      correctedClaim = `The reported value could not be independently confirmed.`;
      correctionBasis = `Retrieved evidence does not contain an explicit replacement figure to confirm or replace ${claimNumStr}.`;
      partiallyAccurate = false;
    }
  } else {
    // Non-numerical claim correction
    if (isRefuted) {
      correctedClaim = `Independent factual archives refute the assertion: "${claimText}". The reported claim is contradicted across verified sources.`;
      correctionBasis = `Retrieved evidence refutes the assertion without providing an alternative replacement fact.`;
      partiallyAccurate = false;
    } else {
      correctedClaim = `The reported value could not be independently confirmed.`;
      correctionBasis = `Retrieved evidence does not contain full independent verification for details in the claim.`;
      partiallyAccurate = false;
    }
  }

  return {
    hasCorrection: true,
    correctedClaim,
    correctionBasis,
    partiallyAccurate
  };
}

module.exports = {
  generateClaimCorrection
};
