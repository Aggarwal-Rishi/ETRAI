require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

async function testFalseClaim() {
  const claimText = 'The Eiffel Tower collapsed into the Seine river in August 2024.';
  const serperKey = process.env.SERPER_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const modelName = (process.env.GEMINI_FLASH_MODEL || 'gemini-3.5-flash-lite').trim();

  const cleanQuery = claimText.replace(/[^\w\s$%.-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);

  const t0 = Date.now();
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': serperKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: cleanQuery, num: 5 })
  });
  const data = await res.json();
  const searchResults = (data.organic || []).map(o => ({ title: o.title, snippet: o.snippet, url: o.link }));
  const tSearch = Date.now() - t0;

  const prompt = `You are an expert fact-checker powered by Gemini.
Verify this claim: "${claimText}"

Here are the real-time Google search results retrieved for this claim:
${JSON.stringify(searchResults, null, 2)}

INSTRUCTIONS:
1. Cross-reference the claim against the retrieved search results.
2. Determine if the claim is VERIFIED, PARTIALLY_VERIFIED, FALSE, or UNVERIFIED.
3. Provide a confidence rating (0 to 100).
4. Provide a 1-2 sentence executive explanation of your verdict.
5. Provide 2-3 key corroborating or refuting findings.
6. List the relevant cited sources from the search results that informed your decision.

Return ONLY a valid JSON object matching this schema:
{
  "verdict": "FALSE",
  "confidence": 95,
  "explanation": "Executive summary of findings.",
  "keyFindings": ["Finding 1", "Finding 2"],
  "citedSources": [
    {
      "title": "Exact source title",
      "url": "https://...",
      "domain": "domain.com",
      "stance": "REFUTES"
    }
  ]
}`;

  const ai = new GoogleGenAI({ apiKey: geminiKey });
  const genRes = await ai.models.generateContent({
    model: modelName,
    contents: prompt,
    config: { temperature: 0.1 }
  });
  const tGemini = Date.now() - t0 - tSearch;

  const rawText = genRes.candidates[0].content.parts[0].text;
  console.log(`Search: ${tSearch}ms, Gemini: ${tGemini}ms, Total: ${Date.now() - t0}ms`);
  console.log(rawText);
}

testFalseClaim().catch(console.error);
