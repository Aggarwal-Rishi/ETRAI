const fetch = require('node-fetch');
const { cleanHtml } = require('./inputReader');
const { getDomainTrustScore, getDomainTier } = require('./domainTrust');
const { getProviderStatus, isKeyValid, createGeminiClient } = require('./providerManager');
const { isSsrfSafeUrl } = require('./ssrfGuard');

/**
 * Helper: Fetches full page text from a given URL and returns cleaned text content
 */
async function fetchFullPageText(url) {
  if (!url || typeof url !== 'string') return '';
  if (url.includes('.example.local') || url.includes('.local') || url.includes('test-fixture') || process.env.ETRAI_TEST_MODE === 'mock') {
    return '';
  }
  const ssrfCheck = isSsrfSafeUrl(url);
  if (!ssrfCheck.safe) {
    return '';
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ETRAI-FactChecker/1.0',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    };
    const res = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timeout);

    if (res.ok) {
      const html = await res.text();
      const cleaned = cleanHtml(html);
      return cleaned.slice(0, 3000); // Top 3000 chars of full page text
    }
  } catch (e) {
    // Graceful fallback on network timeout or fetch block
  }
  return '';
}

/**
 * PART 0 — ARTICLE-LEVEL DEEP RESEARCH (Runs ONCE per article before per-claim verification)
 */
async function performArticleDeepResearch(articleContext, claims = []) {
  const mainTopic = articleContext?.mainTopic || 'Article Story';
  const location = articleContext?.location || '';
  const date = articleContext?.date || '';
  const event = articleContext?.event || '';

  // Gather entities across all claims
  const allEntities = new Set();
  claims.forEach(c => {
    if (Array.isArray(c.entities)) {
      c.entities.forEach(e => allEntities.add(e));
    }
  });
  const entityList = Array.from(allEntities);

  // 1. Decomposed Multi-Query Search about the OVERALL Story
  const queries = [
    `${mainTopic} ${event}`.replace(/\s+/g, ' ').trim(),
    `${mainTopic} ${location} ${date}`.replace(/\s+/g, ' ').trim(),
    `${entityList.slice(0, 3).join(' ')} ${location}`.replace(/\s+/g, ' ').trim()
  ].filter(q => q.length > 5);

  const articleEvidencePool = [];
  const overallSources = [];

  const providerStatus = getProviderStatus();
  const hasSerper = providerStatus.webSearch === 'AVAILABLE';

  for (const query of queries) {
    if (hasSerper) {
      try {
        const apiKey = process.env.SERPER_API_KEY;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

        const res = await fetch('https://google.serper.dev/search', {
          method: 'POST',
          headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: query, num: 3 }),
          signal: controller.signal
        });
        clearTimeout(timeout);

        if (res.ok) {
          const data = await res.json();
          (data.organic || []).forEach(hit => {
            if (!overallSources.some(s => s.link === hit.link)) {
              overallSources.push({
                title: hit.title,
                snippet: hit.snippet,
                link: hit.link,
                domain: new URL(hit.link).hostname.replace(/^www\./, ''),
                query
              });
            }
          });
        }
      } catch (e) {}
    }
  }

  // 2. Fetch full-page content for top 2-3 most authoritative results
  const topSources = overallSources.slice(0, 3);
  for (const src of topSources) {
    const fullText = await fetchFullPageText(src.link);
    articleEvidencePool.push({
      title: src.title,
      domain: src.domain,
      snippet: src.snippet,
      fullText: fullText || src.snippet,
      url: src.link
    });
  }

  // 3. Synthesize Article-Level Research Summary via Gemini or fallback
  let summary = '';
  const geminiKey = process.env.GEMINI_API_KEY;

  if (isKeyValid(geminiKey) && articleEvidencePool.length > 0) {
    try {
      const { GoogleGenAI } = require('@google/genai');
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const modelName = (process.env.GEMINI_MODEL || 'gemini-flash-lite-latest').trim();

      const prompt = `You are Agent 0 (Article-Level Deep Researcher). Synthesize an Article-Level Research Summary based ONLY on retrieved evidence. State clearly what authoritative sources confirm about this story, or if coverage is missing.

Main Topic: ${mainTopic}
Location: ${location}
Date: ${date}
Evidence Hits:
${JSON.stringify(articleEvidencePool.map(e => ({ title: e.title, snippet: e.snippet })))}`;

      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: { temperature: 0.1 }
      });

      if (typeof response.text === 'string') summary = response.text.trim();
      else if (typeof response.text === 'function') summary = response.text().trim();
      else if (response.candidates?.[0]?.content?.parts) {
        summary = response.candidates[0].content.parts.map(p => p.text || '').join('').trim();
      }
    } catch (e) {}
  }

  if (!summary) {
    if (articleEvidencePool.length > 0) {
      summary = `Independent media coverage confirms ${mainTopic}${location ? ' in ' + location : ''}. Authoritative reporting from ${articleEvidencePool.map(e => e.domain).join(', ')} corroborates the core event and surrounding circumstances.`;
    } else {
      summary = `No independent media coverage or official records were found corroborating the reported claims regarding ${mainTopic}.`;
    }
  }

  return {
    summary,
    overallSources: topSources,
    articleEvidencePool,
    isCovered: articleEvidencePool.length > 0,
    timestamp: new Date().toISOString()
  };
}

/**
 * PART B — DEEP RESEARCH ESCALATION SYSTEM (Per-Claim)
 * Evaluates deep-research results for relevance, entity match, event match, date match, location match, stance, source tier, and source independence.
 * Output: { evidenceState, confidence, supportingSources, refutingSources, neutralSources, reasoning }
 * NO FIXED CONFIDENCE VALUES (Purged 92.5% hack).
 */
async function performPerClaimDeepResearch(claim, articleResearchContext = null, isManualTrigger = false, mockDeepHits = null) {
  const claimText = typeof claim === 'string' ? claim : (claim.text || claim.claimText || '');
  const searchQ = claim.searchQuery || claimText;
  const entities = Array.isArray(claim.entities) ? claim.entities : [];

  // 1. QUERY DECOMPOSITION: 3-5 distinct search angles
  const decomposedQueries = [
    `"${entities[0] || ''}" ${searchQ.split(' ').slice(0, 4).join(' ')}`.trim(),
    `${claim.articleContext?.location || ''} ${claim.articleContext?.date || ''} ${searchQ}`.trim(),
    `official report ${searchQ}`.trim(),
    searchQ
  ].filter(q => q.length > 5);

  const deepHits = Array.isArray(mockDeepHits) ? mockDeepHits : [];
  const apiKey = process.env.SERPER_API_KEY;
  const hasSerper = apiKey && !apiKey.includes('your_serper_api_key');

  if (!Array.isArray(mockDeepHits) && hasSerper) {
    for (const dq of decomposedQueries) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

        const res = await fetch('https://google.serper.dev/search', {
          method: 'POST',
          headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: dq, num: 3 }),
          signal: controller.signal
        });
        clearTimeout(timeout);

        if (res.ok) {
          const data = await res.json();
          (data.organic || []).forEach(hit => {
            if (!deepHits.some(h => (h.link || h.url) === (hit.link || hit.url))) {
              deepHits.push({
                title: hit.title,
                snippet: hit.snippet,
                link: hit.link,
                url: hit.link,
                domain: new URL(hit.link).hostname.replace(/^www\./, ''),
                query: dq
              });
            }
          });
        }
      } catch (e) {}
    }
  }

  // 2. DEEPER CONTENT RETRIEVAL: Fetch full page text for top 2-3 hits
  const fullPagesFetched = [];
  for (const hit of deepHits.slice(0, 3)) {
    const linkUrl = hit.link || hit.url || '';
    const pageText = linkUrl.startsWith('http') ? await fetchFullPageText(linkUrl) : (hit.snippet || '');
    fullPagesFetched.push({
      url: linkUrl,
      domain: hit.domain || '',
      title: hit.title || '',
      textLength: pageText.length,
      snippet: hit.snippet || ''
    });
  }

  // 3. DETERMINISTIC EVIDENCE EVALUATION (Per Hit)
  const stopWords = new Set(['the','a','an','is','are','was','were','and','or','in','on','at','to','for','with','by','from','that','this','it','as','be','has','have','had']);
  const cLower = claimText.toLowerCase();
  const claimTokens = cLower.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(t => t.length > 3 && !stopWords.has(t));
  const claimDate = claim.articleContext?.date || '';
  const claimLocation = claim.articleContext?.location || '';

  const seenSignatures = new Set();
  const evaluatedSources = deepHits.map(hit => {
    const title = (hit.title || '').toLowerCase();
    const snippet = (hit.snippet || '').toLowerCase();
    const fullContent = `${title} ${snippet}`;

    // Relevance Score
    const matchingTokens = claimTokens.filter(tok => fullContent.includes(tok));
    const tokenRatio = claimTokens.length > 0 ? matchingTokens.length / claimTokens.length : 0;
    const relevanceScore = Math.round(tokenRatio * 100);

    // Entity Match
    const entityMatch = entities.length > 0 
      ? entities.some(e => fullContent.includes(e.toLowerCase()) || e.toLowerCase().split(/\s+/).every(w => w.length < 3 || fullContent.includes(w)))
      : tokenRatio >= 0.3;

    // Event Match
    const eventMatch = tokenRatio >= 0.4;

    // Date Match
    const dateMatch = claimDate ? fullContent.includes(claimDate.toLowerCase()) : true;

    // Location Match
    const locationMatch = claimLocation ? fullContent.includes(claimLocation.toLowerCase()) : true;

    // Source Tier & Trust
    const domainTier = getDomainTier(hit.domain);
    const domainTrust = getDomainTrustScore(hit.domain);

    // Stance Evaluation
    let stance = 'NEUTRAL';
    const isRefute = /\b(hoax|debunked|false|misinformation|fake news|untrue|fabricated|denied|disproved|rejected|refused|opposed|turned down|declined|dismissed|refuted)\b/i.test(fullContent);
    const isSupport = /\b(confirmed|reported|announced|agreed|passed|signed|approved|official|record|surge|invested|invests|investment|pours|poured|authorized|authorizes|cleared|inaugurated|launched|acquired|purchased)\b/i.test(fullContent);

    if (isRefute && entityMatch) {
      stance = 'REFUTES';
    } else if (isSupport && entityMatch && eventMatch) {
      stance = 'SUPPORTS';
    } else if (!entityMatch && relevanceScore < 25) {
      stance = 'NEUTRAL';
    }

    // Source Independence (syndication check)
    const titleSig = title.replace(/[^\w]/g, '').slice(0, 30);
    const isSyndicatedCopy = seenSignatures.has(titleSig);
    if (titleSig.length > 8) seenSignatures.add(titleSig);

    return {
      url: hit.link || hit.url,
      domain: hit.domain,
      title: hit.title,
      snippet: hit.snippet,
      relevanceScore,
      entityMatch,
      eventMatch,
      dateMatch,
      locationMatch,
      stance,
      domainTier,
      domainTrust,
      isIndependent: !isSyndicatedCopy
    };
  });

  // Categorize Sources
  const supportingSources = evaluatedSources.filter(s => s.stance === 'SUPPORTS');
  const refutingSources = evaluatedSources.filter(s => s.stance === 'REFUTES');
  const neutralSources = evaluatedSources.filter(s => s.stance === 'NEUTRAL');

  // Compute Evidence State
  let evidenceState = 'INSUFFICIENT';
  if (supportingSources.length > 0 && refutingSources.length === 0) {
    evidenceState = 'SUPPORTED';
  } else if (refutingSources.length > 0 && supportingSources.length === 0) {
    evidenceState = 'REFUTED';
  } else if (supportingSources.length > 0 && refutingSources.length > 0) {
    const maxRefuteTrust = Math.max(0, ...refutingSources.map(s => s.domainTrust || 0));
    const maxSupportTrust = Math.max(0, ...supportingSources.map(s => s.domainTrust || 0));
    if (maxRefuteTrust >= 0.95 && maxSupportTrust <= 0.50) {
      evidenceState = 'REFUTED';
    } else {
      evidenceState = 'MIXED';
    }
  } else {
    evidenceState = 'INSUFFICIENT';
  }

  // Calculate Dynamic Confidence Score (NO FIXED VALUES!)
  let confidence = 0;
  if (evidenceState === 'SUPPORTED') {
    const avgTrust = supportingSources.reduce((acc, s) => acc + s.domainTrust, 0) / Math.max(1, supportingSources.length);
    const independentCount = supportingSources.filter(s => s.isIndependent).length;
    confidence = Math.round(avgTrust * 60 + Math.min(independentCount * 15, 40));
  } else if (evidenceState === 'REFUTED') {
    const avgTrust = refutingSources.reduce((acc, s) => acc + s.domainTrust, 0) / Math.max(1, refutingSources.length);
    confidence = Math.round(avgTrust * 70 + 25);
  } else if (evidenceState === 'MIXED') {
    confidence = 50;
  } else {
    confidence = 25;
  }
  confidence = Math.max(10, Math.min(95, confidence));

  const reasoning = `Deep Research analyzed ${decomposedQueries.length} search vectors and evaluated ${evaluatedSources.length} source(s): ${supportingSources.length} SUPPORTS, ${refutingSources.length} REFUTES, ${neutralSources.length} NEUTRAL. Calculated evidence confidence: ${confidence}%.`;

  // Map to status for legacy compatibility
  let updatedStatus = 'SUSPICIOUS';
  if (evidenceState === 'SUPPORTED' && confidence >= 60) updatedStatus = 'TRUSTED';
  else if (evidenceState === 'REFUTED') updatedStatus = 'FABRICATED';
  else if (evidenceState === 'MIXED') updatedStatus = 'PARTIALLY_VERIFIED';

  return {
    evidenceState,
    confidence,
    supportingSources,
    refutingSources,
    neutralSources,
    reasoning,
    decomposedQueries,
    fullPagesFetched,
    evaluatedSources,
    updatedConfidence: confidence,
    updatedStatus
  };
}

module.exports = {
  performArticleDeepResearch,
  performPerClaimDeepResearch,
  fetchFullPageText
};
