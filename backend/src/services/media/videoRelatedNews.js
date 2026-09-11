const { meaningfulTokens } = require('./imageSourceContextVerifier');

const MAX_RELATED_VIDEO_PAGES = 8;

function normalizedUrl(value = '') {
  try {
    const url = new URL(value);
    url.hash = '';
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid']
      .forEach(key => url.searchParams.delete(key));
    return url.toString().replace(/\/$/, '');
  } catch (_) {
    return String(value || '').trim();
  }
}

function publisherKey(article = {}) {
  return String(article.publisher || article.domain || '').toLocaleLowerCase().replace(/^www\./, '').trim();
}

function collectCandidates(provenance = {}, options = {}) {
  const byUrl = new Map();
  const add = (candidate, origin, metadata = {}) => {
    const sourceUrl = candidate.sourceUrl || candidate.url;
    const key = normalizedUrl(sourceUrl).toLocaleLowerCase();
    if (!key) return;
    const current = byUrl.get(key) || {
      ...candidate,
      sourceUrl,
      origins: [],
      matchedFrameTimestamps: [],
      exactFrameMatches: 0,
      transcriptQueryMatches: 0
    };
    if (!current.origins.includes(origin)) current.origins.push(origin);
    current.exactFrameMatches = Math.max(Number(current.exactFrameMatches || 0), Number(candidate.exactFrameMatches || 0), metadata.exactMatch ? 1 : 0);
    current.transcriptQueryMatches = Math.max(Number(current.transcriptQueryMatches || 0), Number(candidate.transcriptQueryMatches || 0), origin === 'TRANSCRIPT' ? 1 : 0);
    current.matchedFrameTimestamps = Array.from(new Set([
      ...(current.matchedFrameTimestamps || []),
      ...(candidate.matchedFrameTimestamps || []),
      ...(Number.isFinite(Number(metadata.timestamp)) ? [Number(metadata.timestamp)] : [])
    ])).sort((a, b) => a - b);
    Object.entries(candidate).forEach(([field, value]) => {
      if (value !== null && value !== undefined && value !== '') current[field] = value;
    });
    byUrl.set(key, current);
  };

  if (options.allowExternalVisualSearch === true) {
    (provenance.frameSearches || []).forEach(search => (search.matches || []).forEach(match => add(match, 'KEYFRAME', {
      exactMatch: search.exactMatch === true && Number(match.similarity || 0) >= 0.86,
      timestamp: search.timestamp
    })));
  }
  if (options.allowExternalTranscriptSearch === true) {
    (provenance.transcriptSearch?.matches || []).forEach(match => add(match, 'TRANSCRIPT'));
  }
  (provenance.sourceCandidates || []).forEach(candidate => {
    const visuallyAllowed = options.allowExternalVisualSearch === true && Number(candidate.exactFrameMatches || 0) > 0;
    const transcriptAllowed = options.allowExternalTranscriptSearch === true && Number(candidate.transcriptEvidenceScore || 0) > 0;
    if (visuallyAllowed || transcriptAllowed || candidate.resolverVerified === true) {
      add(candidate, candidate.resolverVerified ? 'RESOLVER' : visuallyAllowed ? 'KEYFRAME' : 'TRANSCRIPT');
    }
  });
  return [...byUrl.values()]
    .sort((left, right) => {
      const proof = value => (value.resolverVerified ? 300 : 0) + Number(value.exactFrameMatches || 0) * 100 + Number(value.transcriptEvidenceScore || 0);
      return proof(right) - proof(left);
    })
    .slice(0, MAX_RELATED_VIDEO_PAGES);
}

function compareVideoToCandidate({ videoSummary = '', transcript = '', entities = [], candidate = {} }) {
  const sourceText = [candidate.title, candidate.snippet, candidate.sourceTranscript, candidate.articleText].filter(Boolean).join(' ');
  const videoText = [videoSummary, transcript, ...(entities || [])].filter(Boolean).join(' ');
  const videoTokens = meaningfulTokens(videoText);
  const sourceTokens = new Set(meaningfulTokens(sourceText));
  const shared = videoTokens.filter(token => sourceTokens.has(token));
  const coverage = videoTokens.length ? shared.length / videoTokens.length : 0;
  const normalizedSource = sourceText.normalize('NFKC').toLocaleLowerCase();
  const matchedEntities = (entities || []).map(String).filter(entity => entity.length >= 3 && normalizedSource.includes(entity.normalize('NFKC').toLocaleLowerCase()));
  const strongTranscript = candidate.strongTranscriptMatch === true && candidate.sourceTranscriptAvailable === true && Number(candidate.transcriptEvidenceScore || 0) >= 78;
  const exactVisual = candidate.resolverVerified === true || Number(candidate.exactFrameMatches || 0) > 0;
  const contextMatched = matchedEntities.length > 0 || shared.length >= 5 || coverage >= 0.22 || strongTranscript;
  const confidence = Math.min(95, Math.round((exactVisual ? 40 : 0) + (strongTranscript ? 40 : 0) + coverage * 45 + Math.min(10, matchedEntities.length * 5)));
  const suppliedVerdict = String(candidate.contextualVerdict || '').toUpperCase();
  const relationship = ['CONTEXT_MISREPRESENTED', 'MISLEADING_OUT_OF_CONTEXT'].includes(suppliedVerdict)
    ? 'REFUTES'
    : ['CONTEXT_SUPPORTED', 'FAITHFUL_EXCERPT'].includes(suppliedVerdict)
      ? 'SUPPORTS'
      : contextMatched ? 'QUALIFIES' : 'NEUTRAL';
  return {
    relationship, confidence, contextMatched, sharedTerms: shared.slice(0, 12), matchedEntities: matchedEntities.slice(0, 8),
    rationale: relationship === 'REFUTES'
      ? 'Recovered source context indicates that the submitted excerpt changes or omits material context.'
      : relationship === 'SUPPORTS'
        ? 'Recovered source context supports the meaning presented by the submitted excerpt.'
        : contextMatched
          ? 'The retrieved source is tied to the footage and supplies related event context, but does not establish whether the excerpt preserves the full meaning.'
          : 'The retrieved source metadata does not contain enough specific context for a conclusion.'
  };
}

function deduplicateEvidenceArticles(articles = []) {
  const output = articles.map(article => ({ ...article }));
  const seenPublishers = new Map();
  const seenTitles = new Map();
  output.map((article, index) => ({ article, index })).filter(item => item.article.evidenceEligible)
    .sort((left, right) => (Date.parse(left.article.publishedAt || '') || Number.MAX_SAFE_INTEGER) - (Date.parse(right.article.publishedAt || '') || Number.MAX_SAFE_INTEGER))
    .forEach(({ article, index }) => {
      const publisher = publisherKey(article);
      const title = String(article.title || '').normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
      const duplicateOf = (publisher && seenPublishers.get(publisher)) || (title && seenTitles.get(title));
      if (duplicateOf) {
        output[index].evidenceEligible = false;
        output[index].duplicateOf = duplicateOf;
        output[index].sourceRole = 'SYNDICATED_OR_DUPLICATE_VIDEO_NEWS';
        output[index].limitation = 'Excluded from independent evidence counts as a duplicate publication or same-publisher copy.';
      } else {
        if (publisher) seenPublishers.set(publisher, article.url);
        if (title) seenTitles.set(title, article.url);
      }
    });
  return output;
}

function buildSummary(articles = [], candidateCount = 0) {
  const eligible = articles.filter(article => article.evidenceEligible);
  const supporting = eligible.filter(article => article.relationship === 'SUPPORTS');
  const refuting = eligible.filter(article => article.relationship === 'REFUTES');
  const qualifying = eligible.filter(article => article.relationship === 'QUALIFIES');
  const dated = (eligible.length ? eligible : articles).filter(article => article.publishedAt && !Number.isNaN(Date.parse(article.publishedAt)))
    .sort((left, right) => Date.parse(left.publishedAt) - Date.parse(right.publishedAt));
  let overallContextVerdict = 'INSUFFICIENT_EVIDENCE';
  if (supporting.length && refuting.length) overallContextVerdict = 'MIXED_CONTEXT';
  else if (refuting.length) overallContextVerdict = 'CONTEXT_MISREPRESENTED';
  else if (supporting.length) overallContextVerdict = 'CONTEXT_SUPPORTED';
  else if (qualifying.length) overallContextVerdict = 'RELATED_CONTEXT_FOUND';
  return {
    summary: articles.length
      ? `${articles.length} related video/news source${articles.length === 1 ? ' was' : 's were'} reviewed; ${eligible.length} independently published source${eligible.length === 1 ? '' : 's'} passed the media-link and context gates. Context verdict: ${overallContextVerdict.replaceAll('_', ' ').toLowerCase()}.`
      : `No usable source was recovered from ${candidateCount} video/news candidate${candidateCount === 1 ? '' : 's'}.`,
    overallContextVerdict, candidateCount, readableArticleCount: articles.length, evidenceEligibleCount: eligible.length,
    independentPublisherCount: new Set(eligible.map(publisherKey).filter(Boolean)).size,
    supportingCount: supporting.length, refutingCount: refuting.length, qualifyingCount: qualifying.length,
    earliestPublication: dated[0] ? { title: dated[0].title, url: dated[0].url, domain: dated[0].domain, publishedAt: dated[0].publishedAt } : null,
    newsDigest: articles.map(article => article.newsSummary || article.description || article.title).filter(Boolean).slice(0, 4)
  };
}

function collectVideoRelatedNews({ provenance = {}, videoSummary = '', transcript = '', entities = [] }, options = {}) {
  if (options.allowExternalVisualSearch !== true && options.allowExternalTranscriptSearch !== true && !(provenance.sourceCandidates || []).some(candidate => candidate.resolverVerified)) {
    return { status: 'WITHHELD', articles: [], ...buildSummary([], 0), limitations: ['Related video/news evidence was withheld because no external visual or transcript search was authorized.'] };
  }
  const candidates = collectCandidates(provenance, options);
  if (!candidates.length) return { status: 'NO_MATCH', articles: [], ...buildSummary([], 0), limitations: ['No keyframe-, transcript-, or resolver-linked sources were available.'] };
  const articles = candidates.map(candidate => {
    const comparison = compareVideoToCandidate({ videoSummary, transcript, entities, candidate });
    const exactVisual = candidate.resolverVerified === true || Number(candidate.exactFrameMatches || 0) > 0;
    const strongTranscript = candidate.strongTranscriptMatch === true && candidate.sourceTranscriptAvailable === true && Number(candidate.transcriptEvidenceScore || 0) >= 78;
    const evidenceEligible = (exactVisual || strongTranscript) && comparison.contextMatched && comparison.confidence >= 60;
    return {
      url: candidate.sourceUrl, domain: candidate.domain || null, publisher: candidate.publisher || candidate.domain || null,
      title: candidate.title || null, publishedAt: candidate.publishedAt || null, description: candidate.snippet || null,
      newsSummary: candidate.snippet || candidate.title || '', fetchStatus: 'AVAILABLE', relationship: comparison.relationship,
      contextConfidence: comparison.confidence, rationale: comparison.rationale,
      matchingDetails: [...comparison.matchedEntities.map(value => `Entity: ${value}`), ...(comparison.sharedTerms.length ? [`Shared context: ${comparison.sharedTerms.join(', ')}`] : [])],
      mediaLinkStatus: candidate.resolverVerified ? 'RESOLVER_VERIFIED' : exactVisual ? 'VERIFIED_KEYFRAME_LINK' : strongTranscript ? 'STRONG_SOURCE_TRANSCRIPT_LINK' : 'UNVERIFIED_CANDIDATE',
      exactFrameMatches: Number(candidate.exactFrameMatches || 0), matchedFrameTimestamps: candidate.matchedFrameTimestamps || [],
      transcriptEvidenceScore: Number(candidate.transcriptEvidenceScore || 0), transcriptMatchType: candidate.transcriptMatchType || null,
      matchedTranscriptPhrases: candidate.matchedTranscriptPhrases || [], origins: candidate.origins || [], evidenceEligible,
      sourceRole: evidenceEligible ? 'RELATED_VIDEO_NEWS_CONTEXT' : 'REVIEWED_VIDEO_NEWS_CANDIDATE'
    };
  });
  const deduplicated = deduplicateEvidenceArticles(articles);
  const summary = buildSummary(deduplicated, candidates.length);
  return {
    status: deduplicated.length ? 'AVAILABLE' : 'UNAVAILABLE', ...summary,
    articles: deduplicated.sort((left, right) => Number(right.evidenceEligible) - Number(left.evidenceEligible) || Number(right.contextConfidence || 0) - Number(left.contextConfidence || 0)),
    limitations: [
      'This digest reuses metadata already returned by authorized keyframe and transcript searches; it does not upload more frames or open additional third-party pages.',
      'Related sources do not automatically verify unrelated claims, and syndicated copies count only once.'
    ]
  };
}

module.exports = { collectVideoRelatedNews, collectCandidates, compareVideoToCandidate, deduplicateEvidenceArticles, buildSummary, normalizedUrl };
