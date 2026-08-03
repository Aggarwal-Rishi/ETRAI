const fetch = require('node-fetch');
const OpenAI = require('openai');

const TRUSTED_DOMAINS = [
  'reuters.com',
  'apnews.com',
  'bbc.com',
  'factcheck.org',
  'snopes.com',
  'wikipedia.org',
  'bloomberg.com',
  'ft.com',
  'wsj.com',
  'gov',
  'edu'
];

/**
 * Live HTTP URL validator to ensure no dead or 404 links are included in reports
 */
async function validateSourceUrl(url) {
  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    return false;
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (res.status === 404) {
      console.warn(`[URL Validator]: Dropped dead URL (404 Not Found): ${url}`);
      return false;
    }

    if (res.ok || res.status === 301 || res.status === 302 || res.status === 308) {
      return true;
    }

    // 403 Forbidden may indicate bot protection on live pages, check if path exists
    if (res.status === 403) {
      return true;
    }

    console.warn(`[URL Validator]: Dropped URL with status ${res.status}: ${url}`);
    return false;
  } catch (err) {
    console.warn(`[URL Validator]: Dropped unreachable URL (${err.message}): ${url}`);
    return false;
  }
}

/**
 * Searches Serper API for evidence relevant to a claim
 */
async function searchSerper(query) {
  const apiKey = process.env.SERPER_API_KEY;

  if (!apiKey || apiKey.includes('your_serper_api_key')) {
    console.log(`[Serper API]: SERPER_API_KEY unconfigured/missing. Returning empty search results.`);
    return [];
  }

  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        q: query,
        num: 5
      }),
      timeout: 8000
    });

    if (!res.ok) {
      console.warn(`[Serper API Error]: HTTP ${res.status} ${res.statusText}`);
      return [];
    }

    const data = await res.json();
    const organic = data.organic || [];

    return organic.map((item, idx) => ({
      index: idx,
      title: item.title,
      url: item.link,
      snippet: item.snippet,
      domain: new URL(item.link).hostname.replace('www.', '')
    }));
  } catch (err) {
    console.warn('[Serper Search Exception]:', err.message);
    return [];
  }
}

/**
 * Agent 3 – Fact Verification Agent Service
 * Grounded strictly in real Serper search results with zero LLM URL generation
 */
async function verifyClaims(claims) {
  const openAiKey = process.env.OPENAI_API_KEY;
  const hasOpenAi = openAiKey && !openAiKey.includes('your_openai_api_key');
  const openai = hasOpenAi ? new OpenAI({ apiKey: openAiKey }) : null;

  const results = [];

  for (let i = 0; i < claims.length; i++) {
    const claim = claims[i];
    const searchResults = await searchSerper(claim.text);

    // Rule 2: NO SEARCH RESULTS = NO FORCED SOURCE
    if (!searchResults || searchResults.length === 0 || !openai) {
      results.push({
        claimId: claim.id,
        claimText: claim.text,
        category: claim.category,
        status: 'Suspicious',
        confidence: 50,
        explanation: 'No reliable search sources found to confirm or refute this claim.',
        sources: []
      });
      continue;
    }

    // OpenAI Verification Grounded strictly in Search Snippets
    try {
      const prompt = `You are Agent 3 (Fact Verification Agent) in an AI Fact-Checking system.
Analyze the claim below against the retrieved web search evidence.

Claim to verify: "${claim.text}"

Search Evidence Items (Indexed):
${JSON.stringify(searchResults.map(s => ({ index: s.index, title: s.title, snippet: s.snippet, domain: s.domain })), null, 2)}

STRICT VERIFICATION & GROUNDING INSTRUCTIONS:
1. "Verified": ONLY mark if the search result snippets DIRECTLY, EXPLICITLY, and SPECIFICALLY confirm this exact claim.
2. "False": ONLY mark if search result snippets explicitly contradict or refute the claim.
3. "Suspicious": Default here if sources are absent, ambiguous, unrelated, insufficient, or if the claim describes a major public news event/person/statement that search results have NO record of.
4. "sourceIndices": Array of integer indices (e.g. [0, 1]) corresponding ONLY to search items above that directly support or refute the claim. If no search item directly addresses the claim, return [].
5. NEVER invent, fabricate, or rephrase source titles or URLs.

Return ONLY a JSON object:
{
  "status": "Verified" | "Suspicious" | "False",
  "confidence": number (0-100),
  "explanation": "1-2 sentence concise justification based strictly on the search snippets",
  "sourceIndices": [number]
}`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.0
      });

      const parsed = JSON.parse(completion.choices[0].message.content);
      const selectedIndices = Array.isArray(parsed.sourceIndices) ? parsed.sourceIndices : [];

      // Extract verbatim sources from raw Serper items corresponding to selected indices
      const candidateSources = selectedIndices
        .map(idx => searchResults.find(s => s.index === idx))
        .filter(Boolean)
        .map(s => ({
          title: s.title,
          url: s.url,
          snippet: s.snippet,
          domain: s.domain
        }));

      // Rule 3: Live HTTP URL Validation - drop dead or 404 links
      const validatedSources = [];
      for (const src of candidateSources) {
        const isValid = await validateSourceUrl(src.url);
        if (isValid) {
          validatedSources.push(src);
        }
      }

      // Rule 4: Stricter Verification Logic — if status is Verified but no validated sources remain, default to Suspicious
      let finalStatus = parsed.status || 'Suspicious';
      let finalExplanation = parsed.explanation || 'Analyzed against web search results.';

      if (finalStatus === 'Verified' && validatedSources.length === 0) {
        finalStatus = 'Suspicious';
        finalExplanation = 'Claim could not be corroborated by verified, reachable source evidence.';
      }

      results.push({
        claimId: claim.id,
        claimText: claim.text,
        category: claim.category,
        status: finalStatus,
        confidence: parsed.confidence || 60,
        explanation: finalExplanation,
        sources: validatedSources
      });
    } catch (err) {
      console.warn(`[Agent 3 Error]: Exception during claim verification:`, err.message);
      results.push({
        claimId: claim.id,
        claimText: claim.text,
        category: claim.category,
        status: 'Suspicious',
        confidence: 50,
        explanation: 'No reliable search sources found to confirm or refute this claim.',
        sources: []
      });
    }
  }

  return results;
}

module.exports = {
  verifyClaims,
  searchSerper,
  validateSourceUrl,
  TRUSTED_DOMAINS
};
