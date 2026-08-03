const OpenAI = require('openai');

const MAX_CLAIMS = 25;

/**
 * Heuristic claim extraction fallback when OpenAI API key is unconfigured or in mock mode
 */
function extractMockClaims(text) {
  const sentences = text
    .split(/(?<=[.?!])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 20 && s.length < 250);

  // Filter for factual statements (sentences containing numbers, dates, or factual terms)
  const factualSentences = sentences.filter(s => 
    /\d+|percent|dollar|company|market|report|announced|according|growth|year|million|billion|increase|decrease|found|proved|stated/i.test(s)
  );

  const pool = factualSentences.length >= 5 ? factualSentences : sentences;
  const selected = pool.slice(0, MAX_CLAIMS);

  return selected.map((sentence, index) => ({
    id: `claim_${index + 1}`,
    text: sentence,
    category: index % 3 === 0 ? 'Factual Statement' : index % 3 === 1 ? 'Statistical Metric' : 'Market/Event Claim',
    importanceScore: Math.round((1 - index / Math.max(selected.length, 1)) * 40 + 60)
  }));
}

/**
 * Agent 2 – Claim Extractor Service
 */
async function extractClaims(extractedText) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey || apiKey.includes('your_openai_api_key')) {
    console.log('[Agent 2 Claim Extractor]: Using heuristic claim extraction fallback.');
    return extractMockClaims(extractedText);
  }

  try {
    const openai = new OpenAI({ apiKey });
    const prompt = `You are Agent 2 (Claim Extractor) in an AI Fact-Checking system.
Your task is to analyze the text below and extract up to 25 of the most important, specific, and verifiable factual claims.
Focus on:
1. Specific quantitative metrics, numbers, percentages, dates, and financial figures.
2. Direct factual assertions regarding events, companies, people, or scientific claims.
3. Statements that can be proven True or False by independent web search.

Return ONLY a valid JSON array of objects, where each object has:
- id: string (e.g. "claim_1")
- text: string (exact claim sentence, cleaned)
- category: string (e.g., "Statistical Metric", "Event Assertion", "Financial Claim", "Factual Statement")
- importanceScore: number (1-100)

STRICT RULE: Maximum 25 claims. Do not include opinions or subjective commentary.

Text to analyze:
"""
${extractedText.substring(0, 15000)}
"""`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.2
    });

    const content = response.choices[0].message.content;
    const parsed = JSON.parse(content);
    const claims = Array.isArray(parsed) ? parsed : parsed.claims || [];

    // Ensure strict cap of 25 claims
    return claims.slice(0, MAX_CLAIMS).map((c, i) => ({
      id: c.id || `claim_${i + 1}`,
      text: c.text || c.claim || '',
      category: c.category || 'Factual Statement',
      importanceScore: c.importanceScore || 80
    }));
  } catch (err) {
    console.warn('[Agent 2 OpenAI Error]: Falling back to heuristic claim extraction.', err.message);
    return extractMockClaims(extractedText);
  }
}

module.exports = {
  extractClaims,
  extractMockClaims,
  MAX_CLAIMS
};
