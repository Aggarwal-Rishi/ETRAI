const fetch = require('node-fetch');
const { GoogleGenAI } = require('@google/genai');
const { evaluateSourceCredibility, getDomainTrustScore } = require('./domainTrust');
const { evaluateFuzzyVerdict, CONFIGURABLE_THRESHOLDS } = require('./fuzzyEngine');
const { analyzeSentiment, crossCheckSentiment } = require('./sentimentService');
const { getProviderStatus, getMockSearchFixtures, isKeyValid, createGeminiClient, createOpenAIClient } = require('./providerManager');
const { inferClaimScope } = require('./claimExtractor');
const { isSsrfSafeUrl } = require('./ssrfGuard');

/**
 * Extracts key entities, proper nouns, numbers, dates, and important terms from a claim sentence
 */
function extractSearchKeywords(claimText) {
  if (!claimText || typeof claimText !== 'string') return '';

  const stopWords = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'if', 'because', 'as', 'until', 'while', 'of', 'at',
    'by', 'for', 'with', 'about', 'against', 'between', 'into', 'through', 'during', 'before',
    'after', 'above', 'below', 'to', 'from', 'up', 'down', 'in', 'out', 'on', 'off', 'over',
    'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how',
    'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
    'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 's', 't', 'can', 'will', 'just',
    'don', 'should', 'now', 'd', 'll', 'm', 'o', 're', 've', 'y', 'ain', 'aren', 'couldn',
    'didn', 'doesn', 'hadn', 'hasn', 'haven', 'isn', 'ma', 'mightn', 'mustn', 'needn', 'shan',
    'shouldn', 'wasn', 'weren', 'won', 'wouldn', 'according', 'stated', 'announced', 'claims',
    'claimed', 'reported', 'says', 'said', 'today', 'yesterday', 'advertisement', 'read', 'full',
    'story', 'local', 'sources', 'allegedly', 'report', 'news', 'article'
  ]);

  const cleaned = claimText.replace(/[^\w\s$%.-]/g, ' ').replace(/\s+/g, ' ');
  const words = cleaned.split(' ');

  const keyTerms = words.filter(word => {
    const wLower = word.toLowerCase().trim();
    if (!wLower || stopWords.has(wLower)) return false;
    if (/\d+/.test(word)) return true;
    if (word.length >= 3) return true;
    return false;
  });

  const query = keyTerms.slice(0, 8).join(' ');
  return query.length >= 5 ? query : claimText.substring(0, 100);
}

/**
 * Broadens query for Regional/Local claims when initial search returns 0 results
 */
function broadenSearchQuery(claimText) {
  if (!claimText || typeof claimText !== 'string') return '';
  
  const cleaned = claimText.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ');
  const words = cleaned.split(' ');
  
  const coreEntities = words.filter(w => 
    w.length >= 4 && !/^(the|a|an|is|are|was|were|and|or|in|on|at|to|for|with|by|from|about|over|under|after|before)$/i.test(w)
  );

  if (coreEntities.length >= 2) {
    return coreEntities.slice(0, 4).join(' ');
  }

  return extractSearchKeywords(claimText).split(' ').slice(0, 4).join(' ');
}

/**
 * Live HTTP URL validator to ensure no dead, 404, or search engine result pages are included in reports
 */
async function validateSourceUrl(url) {
  const ssrfCheck = isSsrfSafeUrl(url);
  if (!ssrfCheck.safe) {
    console.warn(`[URL Validator]: Dropped SSRF restricted URL (${ssrfCheck.reason}): ${url}`);
    return false;
  }

  if (url.includes('.example.local') || url.includes('.local') || url.includes('test-fixture') || process.env.ETRAI_TEST_MODE === 'mock') {
    return true;
  }
  
  if (!url.startsWith('http')) {
    return false;
  }

  // Explicitly REJECT any search engine query page (Bug 1 Guardrail)
  if (/\b(search\?q=|google\.com\/search|news\.google\.com\/search|bing\.com\/search|duckduckgo\.com|\/search\?|webcache\.googleusercontent\.com\/search)\b/i.test(url)) {
    console.warn(`[URL Validator]: Rejected search engine results page URL: ${url}`);
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

    if (res.ok || res.status === 301 || res.status === 302 || res.status === 308 || res.status === 403) {
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
 * DuckDuckGo Search Fallback Engine
 * Provides resilient open web search when Serper API credits are exhausted.
 */
async function searchDuckDuckGo(searchQuery) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const url = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(searchQuery);
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!res.ok) return [];

    const html = await res.text();
    const titleRegex = /<a[^>]+class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const snippetRegex = /<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;

    const titles = [];
    let m;
    while ((m = titleRegex.exec(html)) !== null) {
      let link = m[1];
      if (link.includes('uddg=')) {
        const uMatch = link.match(/uddg=([^&]+)/);
        if (uMatch) link = decodeURIComponent(uMatch[1]);
      }
      const titleText = m[2].replace(/<[^>]+>/g, '').trim();
      titles.push({ title: titleText, url: link });
    }

    const snippets = [];
    while ((m = snippetRegex.exec(html)) !== null) {
      const snipText = m[1].replace(/<[^>]+>/g, '').trim();
      snippets.push(snipText);
    }

    const results = [];
    for (let i = 0; i < Math.min(titles.length, 5); i++) {
      const t = titles[i];
      let domain = 'news';
      try {
        domain = new URL(t.url).hostname.replace(/^www\./, '');
      } catch (e) {}

      results.push({
        index: i,
        title: t.title,
        url: t.url,
        domain: domain,
        snippet: snippets[i] || t.title
      });
    }

    return results;
  } catch (err) {
    return [];
  }
}

/**
 * Pass 1: General Web Search via Serper API with DuckDuckGo Fallback
 */
async function searchSerper(queryInput, forceBroad = false) {
  const queryText = typeof queryInput === 'string' ? queryInput : (queryInput.text || '');
  const agent2Query = typeof queryInput === 'object' && queryInput.searchQuery ? queryInput.searchQuery : null;
  let searchQuery = forceBroad 
    ? broadenSearchQuery(queryText) 
    : (agent2Query || extractSearchKeywords(queryText));

  // Failsafe Query Sanitization & Entity Injection
  if (!searchQuery || searchQuery.length < 5 || /^\b(The company|The worker|The victim|The incident|He|She|They)\b/i.test(searchQuery)) {
    const entityStr = Array.isArray(queryInput?.entities) ? queryInput.entities.join(' ') : '';
    const locStr = queryInput?.articleContext?.location || '';
    searchQuery = `${entityStr} ${locStr} ${extractSearchKeywords(queryText)}`.replace(/\s+/g, ' ').trim();
  }

  const providerStatus = getProviderStatus();

  // MOCK Mode: Return test fixture evidence clearly marked as test-fixture.local
  if (providerStatus.mode === 'MOCK') {
    return {
      searchQuery,
      results: getMockSearchFixtures(searchQuery)
    };
  }

  const apiKey = process.env.SERPER_API_KEY;

  try {
    if (apiKey && apiKey.length > 10) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout guardrail

      const res = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          q: searchQuery,
          num: 5
        }),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        const organic = data.organic || [];

        const items = organic.map((item, idx) => ({
          index: idx,
          title: item.title,
          url: item.link,
          snippet: item.snippet,
          domain: new URL(item.link).hostname.replace('www.', '')
        }));

        if (items.length > 0) {
          return { searchQuery, results: items };
        }
      }
    }

    // Fallback to DuckDuckGo search if Serper is unavailable or returned 0 results
    const ddgResults = await searchDuckDuckGo(searchQuery);
    return { searchQuery, results: ddgResults };
  } catch (err) {
    const ddgResults = await searchDuckDuckGo(searchQuery);
    return { searchQuery, results: ddgResults };
  }
}

/**
 * Pass 2: X/Twitter Scoped Search with Fallback
 */
async function searchSerperX(queryText) {
  const searchQuery = extractSearchKeywords(queryText) + ' site:x.com OR site:twitter.com';
  const providerStatus = getProviderStatus();

  if (providerStatus.mode === 'MOCK') {
    return { searchQuery, results: [] };
  }

  const apiKey = process.env.SERPER_API_KEY;

  try {
    if (apiKey && apiKey.length > 10) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const res = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          q: searchQuery,
          num: 5
        }),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        const organic = data.organic || [];

        const items = organic.map((item, idx) => ({
          index: idx,
          title: item.title,
          url: item.link,
          snippet: item.snippet,
          domain: new URL(item.link).hostname.replace('www.', '')
        }));

        if (items.length > 0) {
          return { searchQuery, results: items };
        }
      }
    }

    const ddgResults = await searchDuckDuckGo(searchQuery);
    return { searchQuery, results: ddgResults };
  } catch (err) {
    const ddgResults = await searchDuckDuckGo(searchQuery);
    return { searchQuery, results: ddgResults };
  }
}

/**
 * Extracts Part B Discourse Volume, Social Corroboration, and Community Skepticism
 */
function analyzeSocialDiscourse(xSearchResults, claimText, claimSignificance = 70) {
  const volume = Array.isArray(xSearchResults) ? xSearchResults.length : 0;
  
  let discourseVolumeLabel = 'Silent';
  if (volume >= 4) discourseVolumeLabel = 'High';
  else if (volume >= 2) discourseVolumeLabel = 'Moderate';
  else if (volume === 1) discourseVolumeLabel = 'Low';

  const aggregatedText = (xSearchResults || []).map(s => `${s.title} ${s.snippet}`).join(' ');

  const verifiedAccountRegex = /@(bbc|bbcbreaking|reuters|ap|cnn|nytimes|indiatoday|ndtv|timesofindia|thehindu|washingtonpost|wsj|pmoindia|potus|whitehouse|who|un|nasa|nature|factcheck|snopes)\b/i;
  const hasVerifiedAccount = (xSearchResults || []).some(s => (s.url && (s.url.includes('twitter.com') || s.url.includes('x.com'))) && verifiedAccountRegex.test(`${s.title} ${s.snippet} ${s.url}`));

  let socialCorroborationScore = 0.0;
  let socialCorroborationLabel = 'None';
  if (hasVerifiedAccount) {
    socialCorroborationScore = 0.85;
    socialCorroborationLabel = 'Strong';
  } else if (volume > 0) {
    socialCorroborationScore = 0.45;
    socialCorroborationLabel = 'Weak';
  }

  const skepticismTerms = ['fake', 'hoax', 'debunked', 'false', 'misinformation', 'fact check', 'not true', 'no evidence', 'made up', 'disinformation', 'fabricated', 'untrue', 'bunk'];
  let skepticismCount = 0;
  skepticismTerms.forEach(term => {
    const matches = aggregatedText.toLowerCase().match(new RegExp(`\\b${term}\\b`, 'g'));
    if (matches) skepticismCount += matches.length;
  });

  let communitySkepticismScore = 0.0;
  let communitySkepticismLabel = 'Low';
  if (skepticismCount >= 2 || (volume > 0 && skepticismCount / Math.max(volume, 1) >= 0.5)) {
    communitySkepticismScore = 0.85;
    communitySkepticismLabel = 'High';
  } else if (skepticismCount === 1) {
    communitySkepticismScore = 0.45;
    communitySkepticismLabel = 'Moderate';
  }

  let socialReasoningNote = '';
  if (socialCorroborationLabel === 'Strong') {
    socialReasoningNote = 'Multiple X posts from verified news accounts corroborate this claim.';
  } else if (communitySkepticismLabel === 'High') {
    socialReasoningNote = 'Social media discourse actively flags this assertion as fake or debunked.';
  } else if (discourseVolumeLabel === 'Silent') {
    if (claimSignificance >= 75) {
      socialReasoningNote = 'No social discourse found for a claim of this significance, indicating potential fabrication.';
    } else {
      socialReasoningNote = 'This claim shows no notable social media discussion, which is unremarkable given its minor or regional scope.';
    }
  } else {
    socialReasoningNote = 'Social discourse volume is low to moderate with neutral public sentiment.';
  }

  return {
    discourseVolume: volume,
    discourseVolumeLabel,
    socialCorroborationScore,
    socialCorroborationLabel,
    communitySkepticismScore,
    communitySkepticismLabel,
    skepticismCount,
    socialReasoningNote
  };
}

/**
 * Deterministic Evidence Stance & Relevance Evaluator
 */
function evaluateEvidenceStanceHeuristic(claim, searchResults = []) {
  const { evaluateSemanticStance } = require('./semanticVerification');

  return searchResults.map((src, idx) => {
    const semEval = evaluateSemanticStance(claim, src);

    const entityMatch = semEval.dimensionAnalysis.subject === 'MATCH';
    const eventMatch = semEval.dimensionAnalysis.event === 'MATCH' || semEval.dimensionAnalysis.action === 'MATCH';
    const temporalMatch = semEval.dimensionAnalysis.time !== 'MISMATCH';
    const locationMatch = semEval.dimensionAnalysis.location !== 'MISMATCH';

    let relevanceScore = src.retrievalRelevance || 50;
    if (semEval.stance === 'SUPPORTS') relevanceScore = Math.max(relevanceScore, 85);
    else if (semEval.stance === 'REFUTES') relevanceScore = Math.max(relevanceScore, 85);
    else if (semEval.stance === 'IRRELEVANT') relevanceScore = Math.min(relevanceScore, 20);

    return {
      sourceIndex: src.index !== undefined ? src.index : idx,
      stance: semEval.stance,
      entityMatch,
      eventMatch,
      temporalMatch,
      locationMatch,
      relevanceScore,
      reason: semEval.reason,
      claimProposition: semEval.claimProposition,
      evidenceProposition: semEval.evidenceProposition,
      dimensionAnalysis: semEval.dimensionAnalysis,
      componentAnalysis: semEval.componentAnalysis,
      evidenceQuality: semEval.evidenceQuality,
      evidenceCompleteness: semEval.evidenceCompleteness,
      sourceAccess: semEval.sourceAccess
    };
  });
}

/**
 * Deduplicates search hits that are republished/syndicated wire copies of a single original source.
 */
function deduplicateWireSources(evaluations, searchResults) {
  const seenSignatures = new Map();

  return evaluations.map((e, idx) => {
    const src = searchResults.find(s => (s.index !== undefined ? s.index : idx) === e.sourceIndex) || searchResults[idx] || {};
    const titleSig = (src.title || '').toLowerCase().replace(/[^\w]/g, '').slice(0, 40);
    const snippetSig = (src.snippet || '').toLowerCase().replace(/[^\w]/g, '').slice(0, 60);
    const signature = `${titleSig}_${snippetSig}`;

    if (signature.length > 10 && seenSignatures.has(signature)) {
      return {
        ...e,
        isSyndicatedDuplicate: true,
        primarySourceIndex: seenSignatures.get(signature)
      };
    } else {
      if (signature.length > 10) {
        seenSignatures.set(signature, e.sourceIndex);
      }
      return {
        ...e,
        isSyndicatedDuplicate: false
      };
    }
  });
}

function computePlausibilityFlag(claimText) {
  const t = (claimText || '').toLowerCase();
  
  if (
    (/\b(prime minister|president|rbi|governor|supreme court|federal reserve|bank of england)\b/i.test(t) && /\b(unilaterally|overnight|instantly|without parliament|without cabinet|abolished all|banned all)\b/i.test(t))
  ) {
    return {
      plausibilityFlag: true,
      plausibilityReasoning: "Procedural Implausibility: Actions like this typically require formal multi-step legislative, regulatory, or institutional processes; this claim describes it occurring unilaterally or instantly without standard procedure."
    };
  }

  return {
    plausibilityFlag: false,
    plausibilityReasoning: null
  };
}

/**
 * STAGE 2 — AGENT 3 SEMANTIC RETRIEVAL & EVIDENCE SEARCH ENGINE
 */

/**
 * Builds a structured internal Search Representation from Agent 2 semantic fields
 */
function buildSearchRepresentation(claim) {
  const claimObj = typeof claim === 'string' ? { text: claim } : (claim || {});
  const claimText = claimObj.resolvedText || claimObj.text || claimObj.claimText || '';
  const claimMeaning = claimObj.claimMeaning || {};
  const articleContext = claimObj.articleContext || {};

  const entities = Array.from(new Set([
    ...(claimMeaning.entities || []),
    ...(claimObj.entities || []),
    ...(articleContext.entities || [])
  ])).filter(Boolean);

  const quantities = Array.isArray(claimMeaning.quantities) && claimMeaning.quantities.length > 0
    ? claimMeaning.quantities
    : (claimText.match(/\b(\d+(?:\.\d+)?%?|\$\d+|\d+\s*million|\d+\s*billion)\b/gi) || []);

  return {
    claimId: claimObj.id || 'claim_1',
    canonicalClaim: claimText,
    searchReadyText: claimObj.searchReadyText || claimObj.searchQuery || claimText,
    subject: claimMeaning.subject || (entities[0] || 'Subject'),
    predicate: claimMeaning.predicate || 'asserted',
    object: claimMeaning.object || claimText,
    objectDetails: claimMeaning.objectDetails || null,
    event: claimMeaning.event || articleContext.mainEvent || 'Reported Event',
    topic: claimMeaning.topic || articleContext.mainTopic || 'Topic',
    location: claimMeaning.location || articleContext.location || null,
    time: claimMeaning.time || articleContext.date || null,
    entities,
    quantities,
    qualifiers: claimMeaning.qualifiers || [],
    epistemicStatus: claimMeaning.epistemicStatus || 'asserted'
  };
}

/**
 * Generates 3-7 multi-perspective search queries across distinct retrieval strategies
 */
function generateMultiPerspectiveQueries(searchRep) {
  const queries = [];
  const seenQueryTexts = new Set();

  const addQuery = (qText, strategy, description) => {
    if (!qText || typeof qText !== 'string') return;
    const cleaned = qText.replace(/[^\w\s$%.-]/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleaned.length < 4) return;
    const normalizedKey = cleaned.toLowerCase();
    if (!seenQueryTexts.has(normalizedKey)) {
      seenQueryTexts.add(normalizedKey);
      queries.push({ query: cleaned, strategy, description });
    }
  };

  // Strategy A: Canonical Context-Resolved Claim Query
  addQuery(searchRep.searchReadyText || searchRep.canonicalClaim, 'canonical', 'Context-resolved search-ready claim query');

  // Strategy B: Semantic Paraphrase Query (synonyms / verb variations preserving meaning, numbers & negation)
  let paraphraseText = searchRep.canonicalClaim;
  if (/\brejected\b/i.test(paraphraseText)) {
    paraphraseText = paraphraseText.replace(/\brejected\b/gi, 'turned down');
  } else if (/\bturned down\b/i.test(paraphraseText)) {
    paraphraseText = paraphraseText.replace(/\bturned down\b/gi, 'declined');
  } else if (/\bannounced\b/i.test(paraphraseText)) {
    paraphraseText = paraphraseText.replace(/\bannounced\b/gi, 'unveiled');
  } else if (/\bacquired\b/i.test(paraphraseText)) {
    paraphraseText = paraphraseText.replace(/\bacquired\b/gi, 'purchased');
  } else if (/\bincreased\b/i.test(paraphraseText)) {
    paraphraseText = paraphraseText.replace(/\bincreased\b/gi, 'climbed');
  } else if (/\breported\b/i.test(paraphraseText)) {
    paraphraseText = paraphraseText.replace(/\breported\b/gi, 'stated');
  }
  addQuery(paraphraseText, 'semantic_paraphrase', 'Semantic synonym / verb variation query');

  // Strategy C: Entity + Event Query
  const entityStr = searchRep.entities.slice(0, 3).join(' ');
  const locStr = searchRep.location || '';
  const timeStr = searchRep.time || '';
  const eventStr = (searchRep.event && searchRep.event !== 'Reported Event') ? searchRep.event : searchRep.topic;
  addQuery(`${entityStr} ${eventStr} ${locStr} ${timeStr}`, 'entity_event', 'Entity, event, location & temporal anchor query');

  // Strategy D: Subject + Action + Object Query
  const subj = searchRep.subject !== 'Subject' ? searchRep.subject : '';
  const obj = typeof searchRep.object === 'string' ? searchRep.object.substring(0, 60) : '';
  addQuery(`${subj} ${searchRep.predicate} ${obj}`, 'subject_action_object', 'Subject-predicate-object tuple query');

  // Strategy E: Source Discovery Query (Story-level background query)
  if (searchRep.topic || searchRep.event) {
    addQuery(`${searchRep.topic} ${searchRep.event} ${locStr}`, 'source_discovery', 'Story-level background discovery query');
  }

  // Strategy F: Numerical Detail Anchor Query (if quantities exist)
  if (Array.isArray(searchRep.quantities) && searchRep.quantities.length > 0) {
    addQuery(`${subj} ${searchRep.quantities.join(' ')} ${searchRep.topic}`, 'numerical_anchor', 'Exact numerical and statistical metric query');
  }

  // Strategy G: Location & Time Anchor Query
  if (locStr || timeStr) {
    addQuery(`${subj} ${locStr} ${timeStr} ${searchRep.topic}`, 'location_time_anchor', 'Location and date anchor query');
  }

  return queries.slice(0, 7); // Maximum 7 distinct queries per claim
}

/**
 * Filter to reject SERP pages, invalid protocols, and internal/restricted URLs
 */
function isRejectableUrl(urlString) {
  if (!urlString || typeof urlString !== 'string') return true;
  try {
    const parsed = new URL(urlString);
    if (!['http:', 'https:'].includes(parsed.protocol)) return true;

    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    // Allow mock/fixture domains for testing
    if (host.endsWith('.example.local') || host.endsWith('.test') || host.endsWith('.local')) {
      return false;
    }

    // Internal & loopback / private IP addresses
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '169.254.169.254' || host === '::1') {
      return true;
    }
    if (/^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(host)) {
      return true;
    }

    // Search Engine Results Pages (SERPs) are discovery mechanisms, not authoritative primary sources
    if (
      (host.includes('google.') && (path.startsWith('/search') || path.startsWith('/url') || path.startsWith('/m'))) ||
      (host.includes('bing.com') && (path.startsWith('/search') || path.startsWith('/videos/search') || path.startsWith('/images/search'))) ||
      (host.includes('search.yahoo.com')) ||
      (host.includes('duckduckgo.com') && (path.startsWith('/html') || path.startsWith('/?q='))) ||
      (host.includes('baidu.com') && path.startsWith('/s')) ||
      (host.includes('yandex.') && path.startsWith('/search'))
    ) {
      return true;
    }

    return false;
  } catch (e) {
    return true;
  }
}

/**
 * Multi-pass candidate evidence deduplication and candidate utility ranking
 */
function deduplicateAndRankCandidates(rawCandidateHits, searchRep) {
  const seenUrls = new Map();
  const seenSignatures = new Map();
  const candidateList = [];

  rawCandidateHits.forEach(hit => {
    if (!hit || !hit.url || isRejectableUrl(hit.url)) return;

    let normalizedUrl = hit.url;
    try {
      const parsedUrl = new URL(hit.url);
      normalizedUrl = `${parsedUrl.hostname}${parsedUrl.pathname}`.replace(/\/$/, '').toLowerCase();
    } catch (e) {}

    const titleSig = (hit.title || '').toLowerCase().replace(/[^\w]/g, '').slice(0, 40);
    const domainSig = (hit.domain || '').toLowerCase();
    const signature = `${domainSig}_${titleSig}`;

    const existingIndex = seenUrls.has(normalizedUrl) 
      ? seenUrls.get(normalizedUrl) 
      : (signature.length > 8 && seenSignatures.has(signature) ? seenSignatures.get(signature) : null);

    if (existingIndex !== null && existingIndex !== undefined) {
      const existing = candidateList[existingIndex];
      if (hit.queryUsed && !existing.queriesUsed.includes(hit.queryUsed)) {
        existing.queriesUsed.push(hit.queryUsed);
      }
      if (hit.retrievalStrategy && !existing.retrievalStrategies.includes(hit.retrievalStrategy)) {
        existing.retrievalStrategies.push(hit.retrievalStrategy);
      }
    } else {
      const newIdx = candidateList.length;
      if (normalizedUrl) seenUrls.set(normalizedUrl, newIdx);
      if (signature.length > 8) seenSignatures.set(signature, newIdx);

      // Compute Candidate Utility Score (retrievalRelevance)
      const text = `${hit.title || ''} ${hit.snippet || ''}`.toLowerCase();
      let utilityScore = 50;

      // Entity overlap boost
      if (Array.isArray(searchRep.entities)) {
        const entityHits = searchRep.entities.filter(e => text.includes(e.toLowerCase()));
        utilityScore += Math.min(30, entityHits.length * 15);
      }

      // Quantity / Number match boost
      if (Array.isArray(searchRep.quantities)) {
        const numHits = searchRep.quantities.filter(q => text.includes(q.toLowerCase()));
        if (numHits.length > 0) utilityScore += 15;
      }

      // Location match boost
      if (searchRep.location && text.includes(searchRep.location.toLowerCase())) {
        utilityScore += 10;
      }

      // Strategy weight boost
      if (hit.retrievalStrategy === 'canonical' || hit.retrievalStrategy === 'semantic_paraphrase') {
        utilityScore += 10;
      }

      utilityScore = Math.min(99, Math.max(10, utilityScore));

      candidateList.push({
        index: newIdx,
        title: hit.title,
        url: hit.url,
        domain: hit.domain || (new URL(hit.url).hostname.replace('www.', '')),
        snippet: hit.snippet,
        publishedAt: hit.publishedAt || null,
        queriesUsed: hit.queryUsed ? [hit.queryUsed] : [],
        retrievalStrategies: hit.retrievalStrategy ? [hit.retrievalStrategy] : [],
        potentialStance: 'undetermined', // Stage 2 explicitly keeps stance undetermined
        candidateType: 'news_report',
        retrievalRelevance: utilityScore
      });
    }
  });

  // Sort candidate list by candidate utility score (retrievalRelevance)
  candidateList.sort((a, b) => b.retrievalRelevance - a.retrievalRelevance);

  // Re-index candidates
  candidateList.forEach((c, idx) => { c.index = idx; });

  const sourceDomains = Array.from(new Set(candidateList.map(c => c.domain)));

  return {
    candidates: candidateList,
    uniqueSourceCount: candidateList.length,
    uniqueDomainCount: sourceDomains.length,
    sourceDomains
  };
}

/**
 * Multi-Perspective Candidate Retrieval Engine
 */
async function executeSemanticCandidateRetrieval(claim, optionsObj = {}) {
  const { fetchFullPageText } = require('./articleResearch');
  const searchRep = buildSearchRepresentation(claim);
  const queries = generateMultiPerspectiveQueries(searchRep);

  const providerStatus = getProviderStatus();
  const TOP_CANDIDATE_FETCH_LIMIT = optionsObj.topCandidateFetchLimit || 5;

  if (providerStatus.mode === 'MOCK') {
    const mockFixtures = Array.isArray(optionsObj.mockSearchResults) 
      ? optionsObj.mockSearchResults 
      : getMockSearchFixtures(searchRep.canonicalClaim);

    const rawHits = mockFixtures.map(hit => ({
      ...hit,
      queryUsed: searchRep.canonicalClaim,
      retrievalStrategy: 'canonical'
    }));

    const deduped = deduplicateAndRankCandidates(rawHits, searchRep);
    return {
      retrievalStatus: 'success',
      searchRepresentation: searchRep,
      queries,
      results: deduped.candidates,
      evidenceCandidates: deduped.candidates,
      uniqueSourceCount: deduped.uniqueSourceCount,
      uniqueDomainCount: deduped.uniqueDomainCount,
      sourceDomains: deduped.sourceDomains
    };
  }

  if (providerStatus.webSearch === 'UNAVAILABLE') {
    return {
      retrievalStatus: 'provider_unavailable',
      searchRepresentation: searchRep,
      queries,
      results: [],
      evidenceCandidates: [],
      uniqueSourceCount: 0,
      uniqueDomainCount: 0,
      sourceDomains: []
    };
  }

  const rawCandidateHits = [];
  let queryFailedCount = 0;

  for (const qObj of queries) {
    try {
      const searchRes = await searchSerper(qObj.query);
      if (Array.isArray(searchRes.results)) {
        searchRes.results.forEach(hit => {
          rawCandidateHits.push({
            ...hit,
            queryUsed: qObj.query,
            retrievalStrategy: qObj.strategy
          });
        });
      }
    } catch (e) {
      queryFailedCount++;
    }
  }

  const deduped = deduplicateAndRankCandidates(rawCandidateHits, searchRep);
  const candidateList = deduped.candidates;

  // Staged Full Source Page Fetching for TOP_CANDIDATE_FETCH_LIMIT candidates
  const topCandidatesToFetch = candidateList.slice(0, TOP_CANDIDATE_FETCH_LIMIT);
  await Promise.allSettled(
    topCandidatesToFetch.map(async (candidate) => {
      if (!candidate.url) return;
      try {
        const fullText = await fetchFullPageText(candidate.url);
        if (fullText && fullText.length > 100) {
          // Extract most relevant paragraph window matching claim entities or topic
          const paragraphs = fullText.split(/\n+/).filter(p => p.trim().length > 40);
          let bestPassage = candidate.snippet || '';
          let maxScore = -1;

          paragraphs.forEach(p => {
            const pLower = p.toLowerCase();
            let score = 0;
            if (Array.isArray(searchRep.entities)) {
              searchRep.entities.forEach(e => { if (pLower.includes(e.toLowerCase())) score += 10; });
            }
            if (searchRep.topic && pLower.includes(searchRep.topic.toLowerCase())) score += 10;
            if (searchRep.location && pLower.includes(searchRep.location.toLowerCase())) score += 5;
            if (score > maxScore) {
              maxScore = score;
              bestPassage = p.trim().substring(0, 400);
            }
          });

          candidate.fetchedPassage = bestPassage;
          candidate.sourceAccess = 'FULL_ARTICLE';
          candidate.evidenceCompleteness = 'HIGH';
        } else {
          candidate.sourceAccess = 'SNIPPET_ONLY';
          candidate.evidenceCompleteness = 'MEDIUM';
        }
      } catch (e) {
        candidate.sourceAccess = 'SNIPPET_ONLY';
        candidate.evidenceCompleteness = 'MEDIUM';
      }
    })
  );

  let retrievalStatus = 'success';
  if (candidateList.length === 0) {
    retrievalStatus = queryFailedCount === queries.length ? 'search_failed' : 'no_relevant_sources_found';
  }

  return {
    retrievalStatus,
    searchRepresentation: searchRep,
    queries,
    results: candidateList,
    evidenceCandidates: candidateList,
    uniqueSourceCount: deduped.uniqueSourceCount,
    uniqueDomainCount: deduped.uniqueDomainCount,
    sourceDomains: deduped.sourceDomains
  };
}

/**
 * Evaluates a single claim independently (thread worker)
 */
async function verifySingleClaim(claim, i, optionsObj, thresholds, articleResearchContext, primarySourceUrl, openai) {
  const { generateClaimCorrection } = require('./correctionsService');
  const { performPerClaimDeepResearch } = require('./articleResearch');

  const scope = claim.claimScope || inferClaimScope(claim.text);
  
  // Execute Primary Multi-Perspective Semantic Web Candidate Retrieval
  const retrievalRes = Array.isArray(optionsObj.mockSearchResults)
    ? { searchQuery: claim.text, results: optionsObj.mockSearchResults }
    : await executeSemanticCandidateRetrieval(claim, optionsObj);
  let searchResults = retrievalRes.results || [];
  let webRetryQueryExecuted = null;

  if (searchResults.length === 0 && !Array.isArray(optionsObj.mockSearchResults) && getProviderStatus().webSearch === 'AVAILABLE') {
    const broadenedQuery = broadenSearchQuery(claim.text);
    const retrySearch = await searchSerper(broadenedQuery, true);
    searchResults = retrySearch.results;
    webRetryQueryExecuted = retrySearch.searchQuery;
  }

  // Execute Secondary Pass: X / Twitter Scoped Search
  const xSearch = await searchSerperX(claim.text);
  const xSearchResults = xSearch.results;

  // Evaluate VADER Sentiment
  const vaderSentiment = analyzeSentiment(claim.text);
  let gptEmotionalIntensity = vaderSentiment.intensity;
  const sentimentCrossCheck = crossCheckSentiment(vaderSentiment.intensity, gptEmotionalIntensity);

  // Evaluate Domain Trust Scores
  const domainTrustAudits = searchResults.map(s => ({
    url: s.url,
    domain: s.domain,
    score: getDomainTrustScore(s.domain)
  }));

  let primaryDomain = null;
  if (primarySourceUrl) {
    try {
      primaryDomain = new URL(primarySourceUrl).hostname.replace(/^www\./, '');
    } catch (e) {}
  } else if (articleResearchContext?.primaryDomain) {
    primaryDomain = articleResearchContext.primaryDomain;
  }

  const sourceCredibilityEval = evaluateSourceCredibility(searchResults, null, primaryDomain);
  const socialDiscourse = analyzeSocialDiscourse(xSearchResults, claim.text);

  let corroborationScore = Math.min(10.0, searchResults.length * 3.33);

  let modelConfidence = 75;
  let gptExplanation = '';
  let supportingIndices = [];
  let refutingIndices = [];
  let gptPromptSent = null;
  let gptRawResponse = null;

  const evidencePayload = searchResults && searchResults.length > 0 
    ? JSON.stringify(searchResults.map(s => ({ index: s.index, title: s.title, snippet: s.snippet, domain: s.domain })), null, 2)
    : "[] (Zero search results returned)";

  const entitiesStr = JSON.stringify(claim.entities || []);
  const articleContextStr = JSON.stringify(claim.articleContext || {});
  const articleSummaryStr = articleResearchContext?.summary ? `Article-Level Research Context Summary: "${articleResearchContext.summary}"` : '';

  gptPromptSent = `You are Agent 3 (Fact Verification Agent). Evaluate the claim below against EACH search evidence item individually.

Claim to verify: "${claim.text}"
Claim Scope: ${scope}
Claim Entities: ${entitiesStr}
Article Context: ${articleContextStr}
${articleSummaryStr}

Search Evidence Items (Indexed):
${evidencePayload}

═══ CRITICAL EVALUATION RULES ═══
For EACH indexed search item, evaluate entityMatch, eventMatch, temporalMatch, locationMatch, stance (SUPPORTS|REFUTES|NEUTRAL|IRRELEVANT), relevanceScore (0-100), and reason.

Return JSON object:
{
  "evidenceEvaluations": [
    {
      "sourceIndex": 0,
      "stance": "SUPPORTS | REFUTES | NEUTRAL | IRRELEVANT",
      "entityMatch": true,
      "eventMatch": true,
      "temporalMatch": true,
      "locationMatch": true,
      "relevanceScore": 85,
      "reason": "..."
    }
  ],
  "emotionalIntensity": 50,
  "modelConfidence": 80,
  "explanation": "Executive summary of evidence stance evaluation",
  "plausibilityFlag": false,
  "plausibilityReasoning": null
}`;

/**
 * Gemini Search Grounding Verification Fallback Engine
 * Uses Gemini's built-in Google Search Grounding when Serper is unavailable or credit-depleted.
 */
async function verifyClaimWithGeminiSearchGrounding(claim, scope, entitiesStr, articleContextStr, articleSummaryStr) {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!isKeyValid(geminiKey)) return null;

  try {
    const { GoogleGenAI } = require('@google/genai');
    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const modelName = (process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim();

    const prompt = `You are Agent 3 (Fact Verification & Semantic Stance Evaluator) in an AI Fact-Checking platform.

Your task is to perform GENUINE SEMANTIC FACT VERIFICATION for the claim by retrieving live web evidence via Google Search and comparing the MEANING of the claim against each retrieved evidence source.

Claim to verify: "${claim.text}"
Claim Scope: ${scope}
Claim Entities: ${entitiesStr}
Article Context: ${articleContextStr}
${articleSummaryStr}

═══ CRITICAL EVALUATION RULES ═══
1. Use Google Search to retrieve actual news articles and reports regarding this claim.
2. Compare MEANING vs MEANING, not exact keyword matching.
3. For each retrieved source, evaluate:
   - stance: "SUPPORTS | REFUTES | NEUTRAL | IRRELEVANT"
   - entityMatch: true/false
   - eventMatch: true/false
   - temporalMatch: true/false
   - locationMatch: true/false
   - relevanceScore: 0 to 100
   - reason: detailed semantic comparison explanation
4. Determine overallStance: "SUPPORTS | REFUTES | NEUTRAL | INSUFFICIENT"
5. If no credible sources report on this event at all, overallStance MUST be "INSUFFICIENT".

Return ONLY a valid JSON object matching this schema:
{
  "evidenceEvaluations": [
    {
      "sourceIndex": 0,
      "sourceTitle": "string",
      "sourceUrl": "string",
      "domain": "string",
      "snippet": "string",
      "stance": "SUPPORTS | REFUTES | NEUTRAL | IRRELEVANT",
      "entityMatch": true,
      "eventMatch": true,
      "temporalMatch": true,
      "locationMatch": true,
      "relevanceScore": 90,
      "reason": "explanation"
    }
  ],
  "overallStance": "SUPPORTS | REFUTES | NEUTRAL | INSUFFICIENT",
  "confidence": 95,
  "explanation": "Executive summary of evidence evaluation"
}`;

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Gemini Search Grounding timed out after 25000ms')), 25000);
    });

    const apiPromise = ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0.1
      }
    });

    const res = await Promise.race([apiPromise, timeoutPromise]);
    const candidate = res.candidates?.[0];
    const textPart = candidate?.content?.parts?.find(p => p.text);
    const rawText = textPart?.text || '';

    let jsonStr = rawText.trim();
    if (jsonStr.includes('```json')) {
      jsonStr = jsonStr.split('```json')[1].split('```')[0].trim();
    } else if (jsonStr.includes('```')) {
      jsonStr = jsonStr.split('```')[1].split('```')[0].trim();
    }

    const parsed = JSON.parse(jsonStr);
    const groundingChunks = candidate?.groundingMetadata?.groundingChunks || [];

    const searchResults = (parsed.evidenceEvaluations || []).map((ev, idx) => {
      let domain = ev.domain || 'news';
      try {
        if (ev.sourceUrl && ev.sourceUrl.startsWith('http')) {
          domain = new URL(ev.sourceUrl).hostname.replace(/^www\./, '');
        }
      } catch (e) {}

      return {
        index: idx,
        title: ev.sourceTitle || `Source ${idx + 1}`,
        url: ev.sourceUrl || (groundingChunks[idx]?.web?.uri || 'https://google.com'),
        domain: domain,
        snippet: ev.snippet || ev.reason || '',
        fetchedPassage: ev.snippet || null,
        sourceAccess: 'GROUNDED_SEARCH',
        retrievalRelevance: ev.relevanceScore || 85
      };
    });

    return {
      promptSent: prompt,
      rawCompletion: parsed,
      searchResults,
      evidenceEvaluations: parsed.evidenceEvaluations || [],
      explanation: parsed.explanation || '',
      confidence: parsed.confidence || 85,
      groundingChunks
    };
  } catch (err) {
    console.warn('[Gemini Search Grounding Exception]:', err.message);
    return null;
  }
}

  let plausibilityFlag = false;
  let plausibilityReasoning = null;
  let evidenceEvaluations = [];
  let geminiSuccess = false;

  // If initial search returned 0 results, attempt Gemini Search Grounding
  if ((!searchResults || searchResults.length === 0) && !Array.isArray(optionsObj.mockSearchResults) && getProviderStatus().mode !== 'MOCK') {
    console.log(`[Agent 3 Search]: Serper returned 0 hits. Engaging Gemini Search Grounding for claim: "${claim.text.slice(0, 60)}..."`);
    const groundedRes = await verifyClaimWithGeminiSearchGrounding(claim, scope, entitiesStr, articleContextStr, articleSummaryStr);
    if (groundedRes && groundedRes.searchResults && groundedRes.searchResults.length > 0) {
      searchResults = groundedRes.searchResults;
      evidenceEvaluations = groundedRes.evidenceEvaluations;
      gptPromptSent = groundedRes.promptSent;
      gptRawResponse = groundedRes.rawCompletion;
      gptExplanation = groundedRes.explanation;
      modelConfidence = groundedRes.confidence;
      geminiSuccess = true;
    }
  }

  // Zero-Evidence Guard: If search STILL returned 0 hits, short-circuit immediately without LLM call or fabricated evals
  if (!searchResults || searchResults.length === 0) {
    const pCheck = computePlausibilityFlag(claim.text);
    return {
      claimId: claim.id || `claim_${i + 1}`,
      claimText: claim.text,
      category: claim.category || 'Factual Statement',
      extractionMode: claim.extractionMode || 'REAL_LLM',
      evaluationMode: 'INSUFFICIENT_EVIDENCE',
      status: 'SUSPICIOUS',
      verdict: 'UNVERIFIED',
      confidence: 25,
      claimVerificationResult: {
        evidenceState: 'INSUFFICIENT',
        verdict: 'UNVERIFIED',
        confidence: 25,
        evidenceQuality: 0,
        sourceAgreement: 0,
        sourceIndependence: 0
      },
      evidenceState: 'INSUFFICIENT',
      evidenceEvaluations: [],
      supportingSourceIndices: [],
      refutingSourceIndices: [],
      neutralSourceIndices: [],
      irrelevantSourceIndices: [],
      explanation: 'Zero relevant web search evidence items matched. No corroborating evidence could be retrieved for this claim.',
      sources: [],
      socialDiscourse: analyzeSocialDiscourse([], claim.text),
      claimScope: scope,
      isRecentBreaking: !!claim.isRecentBreaking,
      plausibilityFlag: pCheck.plausibilityFlag,
      plausibilityReasoning: pCheck.plausibilityReasoning,
      auditTrail: {
        searchQueries: {
          webQuery: retrievalRes.searchQuery || claim.searchQuery || claim.text || '',
          webRetryQuery: webRetryQueryExecuted,
          xQuery: xSearch ? xSearch.searchQuery : ''
        },
        rawSearchHits: { webHitsCount: 0, webHits: [], xHitsCount: 0, xHits: [] },
        evidenceEvaluations: [],
        gptCrossVerification: {
          promptSent: 'Zero search results returned. LLM evaluation skipped.',
          rawCompletion: { status: 'SKIPPED_ZERO_EVIDENCE', evaluationMode: 'INSUFFICIENT_EVIDENCE' }
        }
      }
    };
  }

  // Agent 3 Gemini Semantic Stance Evaluator (if not already verified via Search Grounding)
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!geminiSuccess && isKeyValid(geminiKey) && getProviderStatus().mode !== 'MOCK' && !Array.isArray(optionsObj.mockSearchResults)) {
    const { GoogleGenAI } = require('@google/genai');
    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const modelName = (process.env.GEMINI_MODEL || 'gemini-flash-lite-latest').trim();

    const evidenceListFormatted = searchResults.map((s, idx) => ({
      sourceIndex: s.index !== undefined ? s.index : idx,
      title: s.title,
      domain: s.domain,
      url: s.url,
      snippet: s.snippet,
      fullPassage: s.fetchedPassage || null,
      sourceAccess: s.sourceAccess || (s.fetchedPassage ? 'FULL_ARTICLE' : 'SNIPPET_ONLY')
    }));

    gptPromptSent = `You are Agent 3 (Fact Verification & Semantic Stance Evaluator) in an AI Fact-Checking platform.

Your task is to perform GENUINE SEMANTIC FACT VERIFICATION comparing the MEANING of the claim against the MEANING of each retrieved article/evidence item.

Claim to verify: "${claim.text}"
Claim Scope: ${scope}
Claim Entities: ${entitiesStr}
Article Context: ${articleContextStr}
${articleSummaryStr}

Search Evidence Items (Indexed):
${JSON.stringify(evidenceListFormatted, null, 2)}

═══ CRITICAL EVALUATION RULES ═══
1. Compare MEANING vs MEANING, not exact keyword matching.
2. Paraphrases or different wording expressing the same underlying proposition MUST be evaluated as SUPPORTS.
3. Distinguish Event States: SIGNED != COMPLETED, PLANNED != COMPLETED, ANNOUNCED != IMPLEMENTED. Event state mismatches must NOT be marked SUPPORTS.
4. Entity Mismatch: If a DIFFERENT entity performed the action, classify as REFUTES.
5. Quantity Mismatch: Numerical discrepancies (e.g. $2B vs $500M) must NOT be marked SUPPORTS.
6. Location Mismatch: Events in different locations (e.g. Mumbai vs New York) must be classified as REFUTES.

Return ONLY a valid JSON object matching this schema:
{
  "evidenceEvaluations": [
    {
      "sourceIndex": 0,
      "stance": "SUPPORTS | REFUTES | NEUTRAL | IRRELEVANT",
      "entityMatch": true,
      "eventMatch": true,
      "temporalMatch": true,
      "locationMatch": true,
      "relevanceScore": 85,
      "reason": "Detailed explanation of semantic stance comparison"
    }
  ],
  "emotionalIntensity": 50,
  "modelConfidence": 80,
  "explanation": "Executive summary of evidence stance evaluation",
  "plausibilityFlag": false,
  "plausibilityReasoning": null
}`;

    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Gemini Agent 3 API call timed out after 20000ms')), 20000);
      });

      const apiPromise = ai.models.generateContent({
        model: modelName,
        contents: gptPromptSent,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.0,
          maxOutputTokens: 4096
        }
      });

      const geminiResponse = await Promise.race([apiPromise, timeoutPromise]);
      let rawText = null;
      if (typeof geminiResponse.text === 'string') rawText = geminiResponse.text;
      else if (typeof geminiResponse.text === 'function') rawText = geminiResponse.text();
      else if (geminiResponse.candidates?.[0]?.content?.parts) {
        rawText = geminiResponse.candidates[0].content.parts.map(p => p.text || '').join('');
      }

      if (rawText) {
        gptRawResponse = JSON.parse(rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim());
        gptEmotionalIntensity = typeof gptRawResponse.emotionalIntensity === 'number' ? gptRawResponse.emotionalIntensity : vaderSentiment.intensity;
        modelConfidence = typeof gptRawResponse.modelConfidence === 'number' ? gptRawResponse.modelConfidence : 80;
        
        let rawEvals = Array.isArray(gptRawResponse.evidenceEvaluations) ? gptRawResponse.evidenceEvaluations : [];
        if (rawEvals.length > 0) {
          evidenceEvaluations = deduplicateWireSources(rawEvals, searchResults);
          geminiSuccess = true;
        }
        gptExplanation = gptRawResponse.explanation || '';
        plausibilityFlag = typeof gptRawResponse.plausibilityFlag === 'boolean' ? gptRawResponse.plausibilityFlag : computePlausibilityFlag(claim.text).plausibilityFlag;
        plausibilityReasoning = gptRawResponse.plausibilityReasoning || computePlausibilityFlag(claim.text).plausibilityReasoning;
      }
    } catch (err) {
      console.warn('[Agent 3 Gemini Reasoning Exception]:', err.message);
      gptRawResponse = { error: err.message, fallbackActive: true, evaluationMode: 'LLM_FALLBACK' };
    }
  }

  if (!geminiSuccess) {
    const pCheck = computePlausibilityFlag(claim.text);
    plausibilityFlag = pCheck.plausibilityFlag;
    plausibilityReasoning = pCheck.plausibilityReasoning;

    const rawEvals = evaluateEvidenceStanceHeuristic(claim, searchResults);
    evidenceEvaluations = deduplicateWireSources(rawEvals, searchResults);
    if (!gptRawResponse) {
      gptRawResponse = { status: 'HEURISTIC_FALLBACK', fallbackActive: true, evaluationMode: 'LLM_UNAVAILABLE' };
    }
  }

  supportingIndices = evidenceEvaluations
    .filter(e => e.stance === 'SUPPORTS' && !e.isSyndicatedDuplicate)
    .map(e => e.sourceIndex);

  refutingIndices = evidenceEvaluations
    .filter(e => e.stance === 'REFUTES' && !e.isSyndicatedDuplicate)
    .map(e => e.sourceIndex);

  const neutralIndices = evidenceEvaluations
    .filter(e => e.stance === 'NEUTRAL')
    .map(e => e.sourceIndex);

  const irrelevantIndices = evidenceEvaluations
    .filter(e => e.stance === 'IRRELEVANT')
    .map(e => e.sourceIndex);

  if (searchResults.length === 0) {
    gptExplanation = `Zero relevant web search evidence items matched. No corroborating evidence could be retrieved for this claim.`;
    modelConfidence = 30;
  } else if (!gptExplanation) {
    gptExplanation = `Evaluated ${evidenceEvaluations.length} search evidence item(s): ${supportingIndices.length} SUPPORTS, ${refutingIndices.length} REFUTES, ${neutralIndices.length} NEUTRAL, ${irrelevantIndices.length} IRRELEVANT.`;
    modelConfidence = supportingIndices.length > 0 || refutingIndices.length > 0 ? 80 : 35;
  }

  const validatedSources = [];
  for (let idx = 0; idx < searchResults.length; idx++) {
    const src = searchResults[idx];
    const srcUrl = src.url || src.link || '';
    if (!srcUrl || isRejectableUrl(srcUrl)) continue;

    // Match stance evaluation for candidate
    const evalObj = evidenceEvaluations.find(e => e.sourceIndex === idx || e.sourceIndex === src.index);

    // Filter out off-topic / IRRELEVANT sources or sources with low relevance score (< 30)
    if (evalObj && evalObj.stance === 'IRRELEVANT') continue;
    if (evalObj && typeof evalObj.relevanceScore === 'number' && evalObj.relevanceScore < 30) continue;
    if (irrelevantIndices.includes(idx) || (src.index !== undefined && irrelevantIndices.includes(src.index))) continue;

    const isTestDomain = srcUrl.includes('.local') || srcUrl.includes('.test');
    const isValid = isTestDomain || await validateSourceUrl(srcUrl);
    if (isValid) {
      let cleanDomain = src.domain;
      try {
        cleanDomain = new URL(srcUrl).hostname.replace(/^www\./i, '');
      } catch (e) {}

      const evalStance = evalObj ? evalObj.stance : 'NEUTRAL';
      const evalRelevance = evalObj ? (evalObj.relevanceScore || 50) : (src.retrievalRelevance || 50);
      const { evaluateSourceIntelligence } = require('./sourceIntelligence');
      const intel = evaluateSourceIntelligence(src);

      validatedSources.push({
        ...src,
        url: srcUrl,
        link: srcUrl,
        domain: cleanDomain,
        publication: intel.publication,
        sourceType: intel.sourceType,
        authorityRank: intel.rank,
        authorityScore: intel.authorityScore,
        directness: intel.directness,
        primarySecondaryStatus: intel.primarySecondaryStatus,
        accessibility: intel.accessibility,
        duplicationRelationship: intel.duplicationRelationship,
        sourcePurpose: intel.sourcePurpose,
        sourceReasoning: intel.reasoning,
        stance: evalStance,
        relevanceScore: evalRelevance,
        reason: evalObj ? evalObj.reason : intel.reasoning
      });
    }
  }

  // Sort validated sources by relevance score descending
  validatedSources.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

  const supportingCount = supportingIndices.length;
  const refutingCount = refutingIndices.length;
  corroborationScore = supportingCount > 0 ? Math.min(10.0, supportingCount * 3.33) : 0.0;

  const fuzzyEval = evaluateFuzzyVerdict({
    corroborationScore,
    supportingCount,
    refutingCount,
    sourceCredibilityScore: sourceCredibilityEval.averageTrustScore,
    sentimentIntensity: sentimentCrossCheck.finalIntensity,
    claimSignificance: claim.importanceScore || 70,
    modelConfidence,
    discourseVolume: socialDiscourse.discourseVolume,
    socialCorroborationScore: socialDiscourse.socialCorroborationScore,
    communitySkepticismScore: socialDiscourse.communitySkepticismScore,
    claimScope: scope,
    plausibilityFlag,
    thresholds
  });

  let finalStatus = fuzzyEval.verdict;
  let confidenceScore = fuzzyEval.crispScore;

  if (supportingCount === 0 && refutingCount === 0 && !plausibilityFlag) {
    finalStatus = 'SUSPICIOUS';
    confidenceScore = Math.min(confidenceScore, 40);
  }

  if (searchResults.length === 0 && (finalStatus === 'TRUSTED' || finalStatus === 'Verified')) {
    finalStatus = 'SUSPICIOUS';
    confidenceScore = Math.min(confidenceScore, 40);
  }

  const evidenceState = fuzzyEval.evidenceState || 'INSUFFICIENT';
  const evidenceQuality = Math.round((sourceCredibilityEval.averageTrustScore || 0) * 100);
  const totalStanceHits = supportingCount + refutingCount;
  
  let sourceAgreement = 0;
  if (evidenceState === 'SUPPORTED') {
    sourceAgreement = 100;
  } else if (evidenceState === 'REFUTED') {
    sourceAgreement = 100;
  } else if (evidenceState === 'MIXED') {
    sourceAgreement = Math.round((supportingCount / Math.max(1, totalStanceHits)) * 100);
  } else {
    sourceAgreement = 0;
  }

  const nonDuplicateSupportingCount = evidenceEvaluations.filter(e => e.stance === 'SUPPORTS' && !e.isSyndicatedDuplicate).length;
  const totalHitCount = Math.max(1, evidenceEvaluations.length);
  const sourceIndependence = Math.round((nonDuplicateSupportingCount / totalHitCount) * 100);

  let derivedConfidence = 0;
  if (evidenceState === 'INSUFFICIENT') {
    derivedConfidence = 30;
  } else {
    derivedConfidence = Math.round(evidenceQuality * 0.4 + sourceAgreement * 0.3 + sourceIndependence * 0.3);
  }
  derivedConfidence = Math.max(0, Math.min(100, derivedConfidence));

  let canonicalVerdict = 'UNVERIFIED';
  const maxRefutingAuthority = Math.max(0, ...refutingIndices.map(idx => {
    const src = searchResults.find(s => s.index === idx) || searchResults[idx];
    return src ? getDomainTrustScore(src.domain || src.url) * 100 : 0;
  }));
  const maxSupportingAuthority = Math.max(0, ...supportingIndices.map(idx => {
    const src = searchResults.find(s => s.index === idx) || searchResults[idx];
    return src ? getDomainTrustScore(src.domain || src.url) * 100 : 0;
  }));

  if (evidenceState === 'REFUTED' || (maxRefutingAuthority >= 95 && maxSupportingAuthority <= 50 && refutingIndices.length > 0)) {
    canonicalVerdict = 'FALSE';
  } else if (evidenceState === 'MIXED') {
    canonicalVerdict = 'PARTIALLY_VERIFIED';
  } else if (evidenceState === 'SUPPORTED' && derivedConfidence >= 55) {
    canonicalVerdict = 'VERIFIED';
  } else {
    canonicalVerdict = 'UNVERIFIED';
  }

  const claimVerificationResult = {
    evidenceState,
    verdict: canonicalVerdict,
    confidence: derivedConfidence,
    evidenceQuality,
    sourceAgreement,
    sourceIndependence
  };

  let recencyNote = '';
  if (claim.isRecentBreaking && corroborationScore < 5.0) {
    recencyNote = ' Note: This claim describes a very recent event; limited search coverage may reflect search indexing delay rather than inaccuracy.';
  }

  const explanationText = `${gptExplanation} Fuzzy Engine evaluated ${fuzzyEval.ruleActivations.length} active rule(s), yielding crisp trust score of ${confidenceScore}% (${finalStatus}).${recencyNote}`;

  const auditTrail = {
    searchQueries: {
      webQuery: retrievalRes.searchQuery || claim.searchQuery || claim.text || '',
      webRetryQuery: webRetryQueryExecuted,
      xQuery: xSearch ? xSearch.searchQuery : ''
    },
    rawSearchHits: {
      webHitsCount: searchResults.length,
      webHits: searchResults,
      xHitsCount: xSearchResults.length,
      xHits: xSearchResults
    },
    searchDiagnostics: {
      query: retrievalRes.searchQuery || claim.searchQuery || claim.text || '',
      serperHttpStatus: 200,
      rawResultCount: retrievalRes.rawCount || (searchResults.length * 2),
      normalizedResultCount: retrievalRes.dedupedCount || searchResults.length,
      filteredResultCount: searchResults.length,
      fetchedArticleCount: searchResults.filter(s => s.sourceAccess === 'FULL_ARTICLE' || s.fetchedPassage).length,
      usableEvidenceCount: evidenceEvaluations.length,
      finalEvidenceCount: searchResults.length,
      discardedResults: retrievalRes.discardedResults || []
    },
    evidenceEvaluations: evidenceEvaluations,
    claimVerificationResult: claimVerificationResult,
    domainTrustEvaluations: domainTrustAudits,
    gptCrossVerification: {
      promptSent: gptPromptSent,
      rawCompletion: gptRawResponse
    },
    fuzzyMathTrace: {
      rawInputs: {
        corroborationScore: Number(corroborationScore.toFixed(1)),
        sourceCredibilityScore: sourceCredibilityEval.averageTrustScore,
        sentimentIntensity: sentimentCrossCheck.finalIntensity,
        claimSignificance: claim.importanceScore || 70,
        modelConfidence,
        discourseVolume: socialDiscourse.discourseVolume,
        socialCorroborationScore: socialDiscourse.socialCorroborationScore,
        communitySkepticismScore: socialDiscourse.communitySkepticismScore,
        claimScope: scope,
        plausibilityFlag
      },
      fuzzifiedSets: fuzzyEval.fuzzified,
      activatedRules: fuzzyEval.ruleActivations,
      defuzzificationMath: fuzzyEval.defuzzificationMath
    }
  };

  let verifiedObj = {
    claimId: claim.id || `claim_${i + 1}`,
    claimText: claim.text,
    category: claim.category || 'Factual Statement',
    extractionMode: claim.extractionMode || 'REAL_LLM',
    status: canonicalVerdict === 'VERIFIED' ? 'TRUSTED' : canonicalVerdict === 'FALSE' ? 'FABRICATED' : 'SUSPICIOUS',
    verdict: canonicalVerdict,
    confidence: derivedConfidence,
    claimVerificationResult,
    evidenceState,
    evidenceEvaluations: evidenceEvaluations,
    supportingSourceIndices: supportingIndices,
    refutingSourceIndices: refutingIndices,
    neutralSourceIndices: neutralIndices,
    irrelevantSourceIndices: irrelevantIndices,
    explanation: explanationText,
    sources: validatedSources,
    socialDiscourse,
    claimScope: scope,
    isRecentBreaking: !!claim.isRecentBreaking,
    plausibilityFlag,
    plausibilityReasoning,
    auditTrail,
    fuzzySignalBreakdown: {
      corroborationScore: Number(corroborationScore.toFixed(1)),
      sourceCredibilityScore: sourceCredibilityEval.averageTrustScore,
      sourceCredibilityLabel: sourceCredibilityEval.label,
      sentimentVader: vaderSentiment.compound,
      sentimentIntensity: sentimentCrossCheck.finalIntensity,
      sentimentStatus: sentimentCrossCheck.sentimentStatus,
      claimSignificance: claim.importanceScore || 70,
      modelConfidence,
      discourseVolume: socialDiscourse.discourseVolume,
      discourseVolumeLabel: socialDiscourse.discourseVolumeLabel,
      socialCorroborationLabel: socialDiscourse.socialCorroborationLabel,
      communitySkepticismLabel: socialDiscourse.communitySkepticismLabel,
      claimScope: scope,
      plausibilityFlag,
      plausibilityReasoning,
      crispDefuzzifiedScore: confidenceScore,
      activatedRules: fuzzyEval.ruleActivations
    }
  };

  // PART B — AUTOMATIC DEEP RESEARCH ESCALATION SYSTEM
  if (finalStatus === 'SUSPICIOUS') {
    try {
      const deepRes = await performPerClaimDeepResearch(claim, articleResearchContext, false, optionsObj.mockSearchResults);
      verifiedObj.deepResearch = deepRes;
      if (deepRes && deepRes.updatedConfidence !== undefined) {
        verifiedObj.status = deepRes.updatedStatus;
        verifiedObj.verdict = (deepRes.evidenceState === 'SUPPORTED' || deepRes.evidenceState === 'Verified') 
          ? 'VERIFIED' 
          : ((deepRes.evidenceState === 'REFUTES' || deepRes.evidenceState === 'REFUTED') 
            ? 'FALSE' 
            : (deepRes.evidenceState === 'MIXED' || deepRes.updatedStatus === 'PARTIALLY_VERIFIED' ? 'PARTIALLY_VERIFIED' : 'UNVERIFIED'));
        verifiedObj.confidence = deepRes.updatedConfidence;
        verifiedObj.claimVerificationResult = {
          evidenceState: deepRes.evidenceState,
          verdict: verifiedObj.verdict,
          confidence: deepRes.updatedConfidence,
          evidenceQuality: deepRes.confidence,
          sourceAgreement: deepRes.evidenceState === 'SUPPORTED' || deepRes.evidenceState === 'REFUTES' ? 100 : 50,
          sourceIndependence: 100
        };
        verifiedObj.explanation = verifiedObj.explanation.replace(/yielding crisp trust score of [\d.]+% \([A-Z]+\)/i, `yielding crisp trust score of ${verifiedObj.confidence}% (${verifiedObj.status})`);
      }
    } catch (err) {
      console.warn('[Part B Automatic Deep Research Warning]:', err.message);
    }
  }

  // PART A — AI-GENERATED CORRECTIONS & PARTIALLY ACCURATE FLAG
  try {
    const correctionData = await generateClaimCorrection(claim, verifiedObj, articleResearchContext);
    verifiedObj.hasCorrection = correctionData.hasCorrection;
    verifiedObj.correctedClaim = correctionData.correctedClaim;
    verifiedObj.correctionBasis = correctionData.correctionBasis;
    verifiedObj.partiallyAccurate = correctionData.partiallyAccurate;
  } catch (err) {
    console.warn('[Part A AI Correction Warning]:', err.message);
    verifiedObj.hasCorrection = false;
    verifiedObj.correctedClaim = null;
    verifiedObj.correctionBasis = null;
    verifiedObj.partiallyAccurate = false;
  }

  return verifiedObj;
}

function createFallbackVerifiedClaim(claim, i, errorMsg) {
  return {
    claimId: claim.id || `claim_${i + 1}`,
    claimText: claim.text || '',
    category: claim.category || 'Factual Statement',
    extractionMode: claim.extractionMode || 'REAL_LLM',
    status: 'SUSPICIOUS',
    verdict: 'UNVERIFIED',
    confidence: 30,
    claimVerificationResult: {
      evidenceState: 'INSUFFICIENT',
      verdict: 'UNVERIFIED',
      confidence: 30,
      evidenceQuality: 0,
      sourceAgreement: 0,
      sourceIndependence: 0
    },
    evidenceState: 'INSUFFICIENT',
    evidenceEvaluations: [],
    supportingSourceIndices: [],
    refutingSourceIndices: [],
    neutralSourceIndices: [],
    irrelevantSourceIndices: [],
    explanation: `Verification for this claim was interrupted due to a temporary service error: ${errorMsg}`,
    sources: [],
    socialDiscourse: analyzeSocialDiscourse([], claim.text || ''),
    claimScope: claim.claimScope || 'National',
    isRecentBreaking: !!claim.isRecentBreaking,
    plausibilityFlag: false,
    plausibilityReasoning: null,
    hasCorrection: false,
    correctedClaim: null,
    correctionBasis: null,
    partiallyAccurate: false,
    auditTrail: {
      error: errorMsg
    }
  };
}

/**
 * Main Fact Verification Service (Agent 3) with Controlled Parallel Concurrency & Progress Callback
 */
async function verifyClaims(claims, customThresholds = CONFIGURABLE_THRESHOLDS, articleResearchContext = null, primarySourceUrl = null, onProgress = null) {
  if (!Array.isArray(claims) || claims.length === 0) return [];

  const isOptionsObject = customThresholds && typeof customThresholds === 'object' && !customThresholds.VERIFIED_MIN_CRISP;
  const optionsObj = isOptionsObject ? customThresholds : {};
  const thresholds = (customThresholds && typeof customThresholds === 'object' && customThresholds.VERIFIED_MIN_CRISP) ? customThresholds : CONFIGURABLE_THRESHOLDS;
  
  const progressFn = typeof onProgress === 'function' 
    ? onProgress 
    : (typeof optionsObj.onProgress === 'function' ? optionsObj.onProgress : null);

  const aiClient = createGeminiClient() || createOpenAIClient();

  const results = new Array(claims.length);
  let completedCount = 0;
  let currentIndex = 0;

  // Process claims in parallel using controlled concurrency (4 parallel workers)
  const concurrency = Math.min(4, claims.length);

  const workers = Array.from({ length: concurrency }, async () => {
    while (currentIndex < claims.length) {
      const i = currentIndex++;
      const claim = claims[i];
      try {
        const verifiedObj = await verifySingleClaim(claim, i, optionsObj, thresholds, articleResearchContext, primarySourceUrl, aiClient);
        results[i] = verifiedObj;
      } catch (err) {
        console.error(`[Verify Claim Worker Error] Claim #${i + 1}:`, err.message);
        results[i] = createFallbackVerifiedClaim(claim, i, err.message);
      } finally {
        completedCount++;
        if (progressFn) {
          try {
            progressFn(completedCount, claims.length);
          } catch (e) {}
        }
      }
    }
  });

  await Promise.all(workers);
  return results;
}

module.exports = {
  verifyClaims,
  searchSerper,
  searchSerperX,
  broadenSearchQuery,
  analyzeSocialDiscourse,
  validateSourceUrl,
  extractSearchKeywords,
  buildSearchRepresentation,
  generateMultiPerspectiveQueries,
  deduplicateAndRankCandidates,
  executeSemanticCandidateRetrieval,
  evaluateEvidenceStanceHeuristic
};
