const fetch = require('node-fetch');
const { normalizeArticleContext, selectEvidencePassage } = require('./articleContext');
const { evaluateSemanticStance } = require('./semanticVerification');
const { guardEvidence } = require('./evidenceGuard');
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
      return cleaned.slice(0, 120000); // Bounded source body; callers select relevant passages and label excerpts.
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
  articleContext = normalizeArticleContext(articleContext);
  const mainTopic = articleContext?.mainTopic || 'Article Story';
  const location = articleContext?.location || '';
  const date = articleContext?.date || '';
  const event = articleContext?.event || '';

  // Gather entities across all claims
  const allEntities = new Set(articleContext.entities);
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
  const topSources = overallSources.sort((a, b) => getDomainTrustScore(b.domain) - getDomainTrustScore(a.domain)).slice(0, 3);
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
${JSON.stringify(articleEvidencePool.map(e => ({ title: e.title, snippet: e.snippet, passage: selectEvidencePassage(e.fullText, mainTopic), url: e.url })))}`;

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
      summary = `Retrieved ${articleEvidencePool.length} source page(s) about ${mainTopic}; their presence alone does not establish support for any claim. No research synthesis is available.`;
    } else {
      summary = `No usable article-level research was retrieved for ${mainTopic}. This is a retrieval limitation, not evidence that the story is false.`;
    }
  }

  return {
    ...articleContext,
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
  const claimObject = typeof claim === 'string' ? { text: claim } : (claim || {});
  if (claimObject.extractionWarning) {
    return { evidenceState: 'INSUFFICIENT', confidence: 0, updatedConfidence: 0,
      updatedStatus: 'SUSPICIOUS', reasoning: claimObject.extractionWarning,
      evaluatedSources: [], deepResearchHits: [], supportingSources: [], refutingSources: [], neutralSources: [],
      decomposedQueries: [], fullPagesFetched: [], fullPagesFetchedCount: 0,
      limitations: ['Re-run article extraction to resolve the flagged wording before re-searching this detail.'],
      searchedAt: new Date().toISOString(), triggerType: isManualTrigger ? 'MANUAL' : 'AUTOMATIC' };
  }
  const claimText = String(claimObject.resolvedText || claimObject.text || claimObject.claimText || '').trim();
  if (!claimText) throw new Error('Claim text is required for individual research.');
  const searchQ = String(claimObject.searchQuery || claimText).trim();
  const entities = Array.isArray(claimObject.entities) ? claimObject.entities.filter(Boolean).map(String) : [];
  const claimContext = normalizeArticleContext(claimObject.articleContext || articleResearchContext || {});

  // 1. QUERY DECOMPOSITION: 3-5 distinct search angles
  const {buildSearchRepresentation,generateMultiPerspectiveQueries}=require('./factVerifier');
  const planned=generateMultiPerspectiveQueries(buildSearchRepresentation(claimObject));
  const selected=['local_context','search_ready','required_detail','metric_context','entity_event','source_discovery','canonical']
    .map(strategy=>planned.find(q=>q.strategy===strategy)?.query).filter(Boolean);
  const decomposedQueries=[...new Set([...selected,`official report ${planned.find(q=>q.strategy==='local_context')?.query || searchQ}`])].slice(0,6);


  const deepHits = Array.isArray(mockDeepHits) ? [...mockDeepHits] : [];
  const searchLimitations = [];
  const apiKey = process.env.SERPER_API_KEY;
  const hasSerper = isKeyValid(apiKey);

  if (!Array.isArray(mockDeepHits) && hasSerper) {
    const executeSearch = async dq => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const res = await fetch('https://google.serper.dev/search', {
          method: 'POST',
          headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: dq, num: 3 }),
          signal: controller.signal
        });
        if (!res.ok) {
          return { query: dq, hits: [], limitation: `Search provider returned HTTP ${res.status}.` };
        }
        const data = await res.json();
        return { query: dq, hits: Array.isArray(data.organic) ? data.organic : [] };
      } catch (error) {
        return {
          query: dq,
          hits: [],
          limitation: error.name === 'AbortError' ? 'Search provider timed out.' : 'Search provider request failed.'
        };
      } finally {
        clearTimeout(timeout);
      }
    };

    // Two searches at a time avoids both the former minute-long serial path
    // and a burst of four simultaneous provider requests.
    const searchResults = [];
    for (let start = 0; start < decomposedQueries.length; start += 2) {
      searchResults.push(...await Promise.all(decomposedQueries.slice(start, start + 2).map(executeSearch)));
    }
    searchResults.forEach(result => {
      if (result.limitation) searchLimitations.push(`${result.query}: ${result.limitation}`);
      result.hits.forEach(hit => {
        const sourceUrl = hit.link || hit.url || '';
        if (!sourceUrl || deepHits.some(existing => (existing.link || existing.url) === sourceUrl)) return;
        let domain = '';
        try { domain = new URL(sourceUrl).hostname.replace(/^www\./, ''); } catch (_) {}
        deepHits.push({
          title: hit.title,
          snippet: hit.snippet,
          link: sourceUrl,
          url: sourceUrl,
          domain,
          query: result.query
        });
      });
    });
  } else if (!Array.isArray(mockDeepHits)) {
    searchLimitations.push('Serper web search is not configured.');
  }

  // Bound all downstream evaluation and response payloads.
  if (deepHits.length > 12) {
    deepHits.splice(12);
  }

  deepHits.sort((a,b) => Number(/(?:instagram|facebook|youtube|x)\.com$/.test(a.domain || '')) - Number(/(?:instagram|facebook|youtube|x)\.com$/.test(b.domain || '')));
  // 2. DEEPER CONTENT RETRIEVAL: Fetch top source pages concurrently.
  const fullPagesFetched = await Promise.all(deepHits.slice(0, 5).map(async hit => {
    const linkUrl = hit.link || hit.url || '';
    const pageText = linkUrl.startsWith('http') ? await fetchFullPageText(linkUrl) : (hit.snippet || '');
    return {
      url: linkUrl,
      domain: hit.domain || '',
      title: hit.title || '',
      textLength: pageText.length,
      snippet: hit.snippet || '',
      fetchedPassage: selectEvidencePassage(pageText, claimText)
    };
  }));
  const fetchedTextByUrl = new Map(fullPagesFetched.map(page => [page.url, page.fetchedPassage || '']));

  // 3. DETERMINISTIC EVIDENCE EVALUATION (Per Hit)
  const stopWords = new Set(['the','a','an','is','are','was','were','and','or','in','on','at','to','for','with','by','from','that','this','it','as','be','has','have','had']);
  const cLower = claimText.toLowerCase();
  const claimTokens = cLower.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(t => t.length > 3 && !stopWords.has(t));
  const claimDate = claimContext.date || '';
  const claimLocation = claimContext.location || '';

  const seenSignatures = new Set();
  const batchSources = deepHits.map((hit,index)=>({...hit,index,url:hit.url||hit.link,fetchedPassage:fetchedTextByUrl.get(hit.url||hit.link)||''}));
  const batch = await require('./evidenceEvaluator').evaluateEvidenceBatch(claimObject,batchSources,{heuristicOnly:Array.isArray(mockDeepHits)});
  if(batch.limitation)searchLimitations.push(batch.limitation);
  const evaluatedSources = deepHits.map((hit,index) => {
    const title = (hit.title || '').toLowerCase();
    const snippet = (hit.snippet || '').toLowerCase();
    const sourceUrl = hit.link || hit.url || '';
    const fetchedPassage = fetchedTextByUrl.get(sourceUrl) || '';
    const fullContent = `${title} ${snippet} ${fetchedPassage.toLowerCase()}`;

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

    // Evaluate the proposition, not whether the article contains words such as "rejected".
    const checked = batch.evidenceEvaluations.find(e=>e.sourceIndex===index) || {stance:'NEUTRAL',reason:'No evidence assessment available'};
    const stance = checked.stance;

    // Source Independence (syndication check)
    const titleSig = title.replace(/[^\p{L}\p{N}]/gu, '');
    const isSyndicatedCopy = seenSignatures.has(titleSig);
    if (titleSig.length > 8) seenSignatures.add(titleSig);

    return {
      url: hit.link || hit.url,
      link: hit.link || hit.url,
      domain: hit.domain,
      title: hit.title,
      snippet: hit.snippet,
      fetchedPassage,
      sourceAccess: fetchedPassage ? 'ARTICLE_EXCERPT' : 'SNIPPET_ONLY',
      relevanceScore,
      entityMatch,
      eventMatch,
      dateMatch,
      locationMatch,
      stance,
      reason: checked.reason,
      supportingPassage: checked.supportingPassage || null,
      allEssentialDetailsSupported: checked.allEssentialDetailsSupported ?? null,
      ...require('./sourceIntelligence').evaluateSourceIntelligence(hit),
      domainTier,
      domainTrust,
      isIndependent: !isSyndicatedCopy
    };
  });

  // Categorize only independent sources so syndicated copies cannot inflate
  // evidence state or confidence. Duplicates remain in evaluatedSources for audit.
  const independentSources = evaluatedSources.filter(source => source.isIndependent !== false);
  const supportingSources = independentSources.filter(s => s.stance === 'SUPPORTS');
  const refutingSources = independentSources.filter(s => s.stance === 'REFUTES');
  const neutralSources = independentSources.filter(s => s.stance === 'NEUTRAL');

  // Compute Evidence State
  let evidenceState = 'INSUFFICIENT';
  const isSocial = source => source.sourceType === 'SOCIAL_MEDIA' || /(?:instagram|facebook|youtube|twitter|x)\.com$/i.test(source.domain || '');
  const credibleRefute = refutingSources.filter(source => !isSocial(source) && Number(source.authorityScore || 0) >= 65);
  const strongRefute = credibleRefute.some(source => Number(source.authorityScore || 0) >= 80) || credibleRefute.length >= 2;
  if (supportingSources.length > 0 && refutingSources.length === 0) {
    evidenceState = 'SUPPORTED';
  } else if (credibleRefute.length > 0 && supportingSources.length === 0) {
    evidenceState = 'REFUTED';
  } else if (supportingSources.length > 0 && refutingSources.length > 0) {
    const maxRefuteTrust = Math.max(0, ...refutingSources.map(s => s.domainTrust || 0));
    const maxSupportTrust = Math.max(0, ...supportingSources.map(s => s.domainTrust || 0));
    if (strongRefute && maxRefuteTrust >= 0.80 && maxSupportTrust <= 0.50) {
      evidenceState = 'REFUTED';
    } else {
      evidenceState = 'MIXED';
    }
  } else {
    evidenceState = 'INSUFFICIENT';
  }

  const confidenceMetrics=require('./evidenceConfidence').calculateEvidenceConfidence(independentSources);
  const confidence=confidenceMetrics.confidence;

  const reasoning = `Deep Research analyzed ${decomposedQueries.length} search vectors and evaluated ${evaluatedSources.length} source(s): ${supportingSources.length} SUPPORTS, ${refutingSources.length} REFUTES, ${neutralSources.length} NEUTRAL. Calculated evidence confidence: ${confidence}%.`;

  // Map to status for legacy compatibility
  let updatedStatus = 'SUSPICIOUS';
  if (evidenceState === 'SUPPORTED' && confidence >= 55) updatedStatus = 'TRUSTED';
  else if (evidenceState === 'REFUTED' && strongRefute) updatedStatus = 'FABRICATED';
  else if (evidenceState === 'MIXED') updatedStatus = 'PARTIALLY_VERIFIED';

  return {
    evidenceState,
    confidence,
    evidenceQuality: confidenceMetrics.evidenceQuality,
    sourceAgreement: confidenceMetrics.sourceAgreement,
    sourceIndependence: confidenceMetrics.sourceIndependence,
    supportingSources,
    refutingSources,
    neutralSources,
    reasoning,
    decomposedQueries,
    fullPagesFetched,
    fullPagesFetchedCount: fullPagesFetched.filter(page => page.textLength > 0).length,
    evaluatedSources,
    deepResearchHits: evaluatedSources,
    triggerType: isManualTrigger ? 'MANUAL' : 'AUTOMATIC',
    limitations: Array.from(new Set(searchLimitations)),
    searchedAt: new Date().toISOString(),
    updatedConfidence: confidence,
    updatedStatus
  };
}

module.exports = {
  performArticleDeepResearch,
  performPerClaimDeepResearch,
  fetchFullPageText
};
