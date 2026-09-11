const {
  fetchImageSourceContext,
  compareImageSummaryToSource,
  meaningfulTokens
} = require('./imageSourceContextVerifier');

const MAX_RELATED_ARTICLES = 8;

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

function deduplicateCandidates(reverseSearch = {}) {
  const candidates = [
    ...(Array.isArray(reverseSearch.matches) ? reverseSearch.matches : []),
    ...(Array.isArray(reverseSearch.candidateMatches) ? reverseSearch.candidateMatches : [])
  ];
  const seen = new Set();
  return candidates.filter(candidate => {
    const sourceUrl = normalizedUrl(candidate?.sourceUrl);
    if (!sourceUrl || seen.has(sourceUrl)) return false;
    seen.add(sourceUrl);
    return true;
  }).slice(0, MAX_RELATED_ARTICLES);
}

function articleRelationship(comparison = {}) {
  if (comparison.status === 'MATCHED') return 'SUPPORTS';
  if (comparison.status === 'CONTRADICTED') return 'REFUTES';
  return 'NEUTRAL';
}

function deduplicateEvidenceArticles(articles = []) {
  const output = articles.map(article => ({ ...article }));
  const eligibleByDate = output
    .map((article, index) => ({ article, index }))
    .filter(item => item.article.evidenceEligible)
    .sort((left, right) => {
      const leftDate = Date.parse(left.article.publishedAt || '') || Number.MAX_SAFE_INTEGER;
      const rightDate = Date.parse(right.article.publishedAt || '') || Number.MAX_SAFE_INTEGER;
      return leftDate - rightDate;
    });
  const seenPublishers = new Map();
  const seenTitles = new Map();
  for (const { article, index } of eligibleByDate) {
    const publisher = publisherKey(article);
    const title = String(article.title || '').normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const duplicateOf = (publisher && seenPublishers.get(publisher)) || (title && seenTitles.get(title));
    if (duplicateOf) {
      output[index].evidenceEligible = false;
      output[index].duplicateOf = duplicateOf;
      output[index].sourceRole = 'SYNDICATED_OR_DUPLICATE_IMAGE_NEWS';
      output[index].limitation = 'Excluded from independent evidence counts as a duplicate publication or same-publisher copy.';
      continue;
    }
    if (publisher) seenPublishers.set(publisher, article.url);
    if (title) seenTitles.set(title, article.url);
  }
  return output;
}

function buildRelatedNewsSummary(articles = [], candidateCount = 0) {
  const readable = articles.filter(article => article.fetchStatus === 'AVAILABLE');
  const eligible = readable.filter(article => article.evidenceEligible);
  const supporting = eligible.filter(article => article.relationship === 'SUPPORTS');
  const refuting = eligible.filter(article => article.relationship === 'REFUTES');
  const qualifying = eligible.filter(article => article.relationship === 'QUALIFIES');
  const publishers = new Set(eligible.map(publisherKey).filter(Boolean));
  const datedPool = eligible.length ? eligible : readable;
  const dated = datedPool.filter(article => article.publishedAt && !Number.isNaN(Date.parse(article.publishedAt)))
    .sort((left, right) => Date.parse(left.publishedAt) - Date.parse(right.publishedAt));
  const earliest = dated[0] || null;

  let overallContextVerdict = 'INSUFFICIENT_EVIDENCE';
  if (supporting.length && refuting.length) overallContextVerdict = 'MIXED_CONTEXT';
  else if (refuting.length) overallContextVerdict = 'CONTEXT_MISREPRESENTED';
  else if (supporting.length) overallContextVerdict = 'CONTEXT_SUPPORTED';

  const summaries = readable
    .map(article => article.newsSummary || article.description || article.title)
    .filter(Boolean)
    .filter((value, index, list) => list.findIndex(item => item.toLocaleLowerCase() === value.toLocaleLowerCase()) === index)
    .slice(0, 4);
  const commonTerms = meaningfulTokens(readable.map(article => `${article.title || ''} ${article.description || ''}`).join(' '))
    .filter(term => readable.filter(article => meaningfulTokens(`${article.title || ''} ${article.description || ''}`).includes(term)).length >= 2)
    .slice(0, 8);

  const summary = readable.length === 0
    ? `No readable news page was recovered from ${candidateCount} related-image result${candidateCount === 1 ? '' : 's'}.`
    : `${readable.length} related news page${readable.length === 1 ? ' was' : 's were'} reviewed across ${new Set(readable.map(publisherKey).filter(Boolean)).size} publisher${new Set(readable.map(publisherKey).filter(Boolean)).size === 1 ? '' : 's'}. ${eligible.length} page${eligible.length === 1 ? '' : 's'} passed both the local same-image and source-context evidence gates. Context verdict: ${overallContextVerdict.replaceAll('_', ' ').toLowerCase()}.`;

  return {
    summary,
    overallContextVerdict,
    candidateCount,
    readableArticleCount: readable.length,
    evidenceEligibleCount: eligible.length,
    independentPublisherCount: publishers.size,
    supportingCount: supporting.length,
    refutingCount: refuting.length,
    qualifyingCount: qualifying.length,
    earliestPublication: earliest ? {
      title: earliest.title,
      url: earliest.url,
      domain: earliest.domain,
      publishedAt: earliest.publishedAt
    } : null,
    commonTerms,
    newsDigest: summaries
  };
}

async function collectImageRelatedNews({ reverseSearch, visualSummary = '', ocrText = '', entities = [] }, options = {}) {
  if (options.allowExternalVisualSearch !== true) {
    return {
      status: 'WITHHELD',
      articles: [],
      ...buildRelatedNewsSummary([], 0),
      limitations: ['Related-image news pages were not fetched because external visual-search consent was not enabled.']
    };
  }

  const candidates = deduplicateCandidates(reverseSearch);
  if (!candidates.length) {
    return {
      status: reverseSearch?.status === 'NO_MATCH' ? 'NO_MATCH' : 'UNAVAILABLE',
      articles: [],
      ...buildRelatedNewsSummary([], 0),
      limitations: ['No related-image source pages were available to analyze.']
    };
  }

  const articles = await Promise.all(candidates.map(async candidate => {
    const sourceUrl = candidate.sourceUrl;
    const html = options.sourcePageHtmlByUrl?.[sourceUrl];
    const sourceContext = await fetchImageSourceContext(sourceUrl, {
      ...options,
      ...(html ? { sourcePageHtml: html } : {})
    });
    const similarity = Number(candidate.similarity);
    const locallyVerifiedImage = candidate.matchType === 'LOCAL_PERCEPTUAL_MATCH'
      && Number.isFinite(similarity)
      && similarity >= 0.86;

    if (sourceContext.status !== 'AVAILABLE') {
      return {
        url: sourceUrl,
        domain: candidate.domain || sourceContext.domain || null,
        title: candidate.title || null,
        publishedAt: candidate.publishedDate || null,
        imageUrl: candidate.originalImageUrl || candidate.thumbnailUrl || null,
        imageSimilarity: Number.isFinite(similarity) ? Math.round(similarity * 100) : null,
        imageMatchStatus: locallyVerifiedImage ? 'VERIFIED_SAME_IMAGE' : 'UNVERIFIED_CANDIDATE',
        fetchStatus: 'UNAVAILABLE',
        relationship: 'NEUTRAL',
        evidenceEligible: false,
        limitation: sourceContext.error || 'The news page could not be read.'
      };
    }

    const comparison = await compareImageSummaryToSource({ visualSummary, ocrText, entities, sourceContext }, options);
    const relationship = articleRelationship(comparison);
    const evidenceEligible = locallyVerifiedImage
      && ['SUPPORTS', 'REFUTES'].includes(relationship)
      && comparison.confidence >= 60;
    return {
      url: sourceContext.url || sourceUrl,
      requestedUrl: sourceUrl,
      domain: sourceContext.domain || candidate.domain || null,
      publisher: sourceContext.publisher || candidate.domain || null,
      title: sourceContext.title || candidate.title || null,
      author: sourceContext.author || null,
      publishedAt: sourceContext.publishedAt || candidate.publishedDate || null,
      description: sourceContext.description || null,
      newsSummary: comparison.sourceSummary || sourceContext.description || sourceContext.articleText?.slice(0, 500) || '',
      imageUrl: candidate.originalImageUrl || candidate.thumbnailUrl || null,
      imageSimilarity: Number.isFinite(similarity) ? Math.round(similarity * 100) : null,
      imageMatchStatus: locallyVerifiedImage ? 'VERIFIED_SAME_IMAGE' : 'UNVERIFIED_CANDIDATE',
      pageImageAssociation: 'REVERSE_SEARCH_LINKED',
      fetchStatus: 'AVAILABLE',
      relationship,
      contextStatus: comparison.status,
      contextConfidence: comparison.confidence,
      rationale: comparison.rationale,
      matchingDetails: comparison.matchingDetails || [],
      contradictions: comparison.contradictions || [],
      evidenceEligible,
      sourceRole: evidenceEligible ? 'RELATED_IMAGE_NEWS_CONTEXT' : 'REVIEWED_IMAGE_NEWS_CANDIDATE'
    };
  }));

  const deduplicatedArticles = deduplicateEvidenceArticles(articles);
  const summary = buildRelatedNewsSummary(deduplicatedArticles, candidates.length);
  return {
    status: summary.readableArticleCount > 0 ? 'AVAILABLE' : 'UNAVAILABLE',
    ...summary,
    articles: deduplicatedArticles.sort((left, right) => {
      if (left.evidenceEligible !== right.evidenceEligible) return left.evidenceEligible ? -1 : 1;
      return Number(right.imageSimilarity || 0) - Number(left.imageSimilarity || 0);
    }),
    limitations: [
      'Only pages tied to locally verified same-image results can affect the report verdict.',
      'Syndicated copies from the same publisher are not counted as independent corroboration.'
    ]
  };
}

module.exports = {
  collectImageRelatedNews,
  buildRelatedNewsSummary,
  deduplicateCandidates,
  deduplicateEvidenceArticles,
  articleRelationship,
  normalizedUrl
};
