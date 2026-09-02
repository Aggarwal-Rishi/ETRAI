'use strict';

const { isKeyValid } = require('../providerManager');
const { querySerperSearch } = require('./reverseImageSearch');

const GENERIC_VISUAL_LABEL = /^(?:person|people|man|woman|male|female|speaker|crowd|individual|unknown|unidentified|multiple|several|group|police officer|security personnel|audience|vehicle|building|podium)(?:\b|$)/i;
const PERSON_TITLE = /\b(?:president|prime minister|minister|governor|senator|mp|chief minister|secretary|justice|judge|professor|dr\.?|mr\.?|ms\.?)\b/i;
const ORGANIZATION_MARKER = /\b(?:inc|corp|corporation|company|limited|ltd|bank|ministry|department|agency|commission|party|foundation|university|association|bureau|organisation|organization)\b/i;
const AUTHORITATIVE_DOMAINS = [
  '.gov', '.gov.in', '.nic.in', 'reuters.com', 'apnews.com', 'afp.com', 'bbc.com',
  'un.org', 'who.int', 'worldbank.org', 'imf.org', 'pib.gov.in'
];

function cleanEntityName(value) {
  return String(value || '').replace(/\s+/g, ' ').replace(/^["'“”]+|["'“”.,:;]+$/g, '').trim();
}

function entityKey(value) {
  return cleanEntityName(value).toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function isImportantNamedEntity(value) {
  const name = cleanEntityName(value);
  if (name.length < 3 || name.length > 100 || GENERIC_VISUAL_LABEL.test(name)) return false;
  if (/\b(?:unknown|unidentified|possible person|someone|several people|multiple people)\b/i.test(name)) return false;
  if (/^[A-Z]{2,10}$/.test(name)) return true;
  if (PERSON_TITLE.test(name) || ORGANIZATION_MARKER.test(name)) return true;
  const capitalizedWords = name.split(/\s+/).filter(word => /^[A-Z][\p{L}'-]+$/u.test(word));
  return capitalizedWords.length >= 2 && capitalizedWords.length === name.split(/\s+/).length;
}

function normalizePublicFigure(figure, timestamp = null, origin = 'VISUAL_PUBLIC_FIGURE') {
  const raw = typeof figure === 'string' ? { name: figure } : (figure || {});
  const name = cleanEntityName(raw.name);
  const confidence = Math.max(0, Math.min(100, Number(raw.confidence || 0)));
  if (!isImportantNamedEntity(name) || confidence < 60) return null;
  return {
    name,
    normalizedName: name,
    type: 'PERSON',
    role: 'VISIBLE_PUBLIC_FIGURE',
    jurisdiction: 'Unknown',
    mentionsCount: 1,
    confidence,
    visualConfidence: confidence,
    visuallyDetected: true,
    prominent: confidence >= 75,
    verificationStatus: confidence >= 75 ? 'UNVERIFIED' : 'AMBIGUOUS',
    detectionMethods: [origin],
    frameTimestamps: Number.isFinite(Number(timestamp)) ? [Number(timestamp)] : [],
    visibleAppearance: cleanEntityName(raw.visibleAppearance),
    attire: cleanEntityName(raw.attire),
    visualBasis: cleanEntityName(raw.basis) || 'Visual model proposed this public-figure identity; independent corroboration is required.'
  };
}

function normalizeNamedVisual(value, type, method, timestamp = null, confidence = 78) {
  const name = cleanEntityName(value);
  if (!isImportantNamedEntity(name)) return null;
  return {
    name,
    normalizedName: name,
    type,
    role: type === 'LOCATION' ? 'VISIBLE_LOCATION' : 'VISIBLE_ENTITY',
    jurisdiction: 'Unknown',
    mentionsCount: 1,
    confidence,
    visualConfidence: confidence,
    visuallyDetected: true,
    prominent: confidence >= 75,
    verificationStatus: 'UNVERIFIED',
    detectionMethods: [method],
    frameTimestamps: Number.isFinite(Number(timestamp)) ? [Number(timestamp)] : [],
    visualBasis: `${type.replaceAll('_', ' ').toLowerCase()} observed in submitted media.`
  };
}

function mergeCandidate(map, candidate) {
  if (!candidate) return;
  const key = entityKey(candidate.normalizedName || candidate.name);
  if (!key) return;
  const current = map.get(key);
  if (!current) {
    map.set(key, candidate);
    return;
  }
  current.mentionsCount = Number(current.mentionsCount || 1) + Number(candidate.mentionsCount || 1);
  current.confidence = Math.max(Number(current.confidence || 0), Number(candidate.confidence || 0));
  current.visualConfidence = Math.max(Number(current.visualConfidence || 0), Number(candidate.visualConfidence || 0));
  current.visuallyDetected = current.visuallyDetected === true || candidate.visuallyDetected === true;
  current.prominent = current.prominent === true || candidate.prominent === true;
  current.detectionMethods = Array.from(new Set([...(current.detectionMethods || []), ...(candidate.detectionMethods || [])]));
  current.frameTimestamps = Array.from(new Set([...(current.frameTimestamps || []), ...(candidate.frameTimestamps || [])])).sort((a, b) => a - b);
  current.visibleAppearance ||= candidate.visibleAppearance;
  current.attire ||= candidate.attire;
  current.visualBasis ||= candidate.visualBasis;
  if (current.type !== 'PERSON' && candidate.type === 'PERSON') current.type = 'PERSON';
}

function collectObservedEntityCandidates(observed = {}, timestamp = null, originPrefix = 'IMAGE') {
  const candidates = [];
  (observed.publicFigures || []).forEach(item => candidates.push(normalizePublicFigure(item, timestamp, `${originPrefix}_PUBLIC_FIGURE`)));
  (observed.logos || []).forEach(item => candidates.push(normalizeNamedVisual(item, 'ORGANIZATION', `${originPrefix}_LOGO`, timestamp, 82)));
  (observed.landmarks || []).forEach(item => candidates.push(normalizeNamedVisual(item, 'LOCATION', `${originPrefix}_LANDMARK`, timestamp, 82)));
  (observed.visibleLocationClues || []).forEach(item => candidates.push(normalizeNamedVisual(item, 'LOCATION', `${originPrefix}_LOCATION_CLUE`, timestamp, 72)));
  (observed.entities || []).forEach(item => {
    const name = typeof item === 'string' ? item : item?.name;
    if (!isImportantNamedEntity(name)) return;
    const type = PERSON_TITLE.test(name) || cleanEntityName(name).split(/\s+/).length <= 4 ? 'PERSON' : 'ORGANIZATION';
    candidates.push(normalizeNamedVisual(name, type, `${originPrefix}_NAMED_ENTITY`, timestamp, Number(item?.confidence || 72)));
  });
  return candidates.filter(Boolean);
}

function extractVisualEntityCandidates(mediaAnalysis = null) {
  if (!mediaAnalysis || typeof mediaAnalysis !== 'object') return [];
  const map = new Map();
  collectObservedEntityCandidates(mediaAnalysis.observed || {}).forEach(candidate => mergeCandidate(map, candidate));
  const frames = Array.isArray(mediaAnalysis.keyframes)
    ? mediaAnalysis.keyframes
    : (Array.isArray(mediaAnalysis.extractedFrames) ? mediaAnalysis.extractedFrames : []);
  frames.forEach(frame => collectObservedEntityCandidates(frame, Number(frame.timestamp || 0), 'VIDEO_FRAME').forEach(candidate => mergeCandidate(map, candidate)));
  return [...map.values()].sort((left, right) => Number(right.prominent) - Number(left.prominent) || Number(right.confidence) - Number(left.confidence));
}

function sourceText(source = {}) {
  return `${source.title || ''} ${source.snippet || ''} ${source.domain || ''}`.toLocaleLowerCase();
}

function sourceSupportsEntity(source, name) {
  const tokens = entityKey(name).split(' ').filter(token => token.length > 2);
  if (!tokens.length) return false;
  const haystack = sourceText(source);
  return tokens.every(token => haystack.includes(token));
}

function isAuthoritativeSource(source = {}) {
  const domain = String(source.domain || '').toLocaleLowerCase();
  return source.isWire === true || AUTHORITATIVE_DOMAINS.some(item => domain === item.replace(/^\./, '') || domain.endsWith(item));
}

function collectExistingEntityEvidence(entity, mediaAnalysis = {}) {
  const name = entity.normalizedName || entity.name;
  const lowerName = entityKey(name);
  const evidence = [];
  const provenance = mediaAnalysis.videoProvenance || mediaAnalysis.videoContextReport?.provenance || {};
  const provenanceCandidates = [provenance.originalCandidate, ...(provenance.sourceCandidates || [])].filter(Boolean);
  const reverseCandidates = [
    ...(mediaAnalysis.reverseSearch?.matches || []),
    ...(mediaAnalysis.imageSourceContextComparison?.source ? [mediaAnalysis.imageSourceContextComparison.source] : [])
  ];
  [...provenanceCandidates, ...reverseCandidates].forEach(candidate => {
    const text = entityKey(`${candidate.title || ''} ${candidate.snippet || ''} ${candidate.publisher || ''}`);
    if (!lowerName.split(' ').filter(token => token.length > 2).every(token => text.includes(token))) return;
    evidence.push({
      title: candidate.title || `Matched source for ${name}`,
      url: candidate.sourceUrl || candidate.url || null,
      domain: candidate.domain || null,
      snippet: candidate.snippet || null,
      evidenceType: 'MEDIA_SOURCE_CONTEXT',
      locallyVerified: candidate.exactMatch === true || candidate.resolverVerified === true || Number(candidate.similarity || 0) >= 0.86
    });
  });
  return evidence.filter(item => item.url);
}

function buildEntitySearchQuery(entity, context = {}) {
  const clues = [
    ...(context.logos || []).slice(0, 1),
    ...(context.landmarks || []).slice(0, 1),
    ...(context.locations || []).slice(0, 1),
    cleanEntityName(context.event)
  ].filter(Boolean);
  const intent = entity.type === 'PERSON' ? 'official appearance identity' : entity.type === 'LOCATION' ? 'location official news' : 'official organization news';
  return [`"${entity.normalizedName || entity.name}"`, ...clues.map(item => `"${cleanEntityName(item)}"`), intent].join(' ').slice(0, 280);
}

async function verifyVisualEntities(entities = [], mediaAnalysis = {}, text = '', options = {}) {
  const candidates = entities.filter(entity => entity.visuallyDetected && entity.prominent && Number(entity.visualConfidence || entity.confidence || 0) >= 70).slice(0, Number(options.maxEntitySearches || 6));
  const transcriptAndOcr = `${text || ''} ${mediaAnalysis.transcript || ''} ${mediaAnalysis.ocrText || ''}`.toLocaleLowerCase();
  const observed = mediaAnalysis.observed || {};
  const context = {
    logos: observed.logos || [],
    landmarks: observed.landmarks || [],
    locations: observed.visibleLocationClues || [],
    event: mediaAnalysis.inferred?.possibleEvent || ''
  };
  const apiKey = options.serperKey || process.env.SERPER_API_KEY;
  const injectedSearch = options.entitySearchProvider;
  const externalSearchAllowed = options.allowExternalEntitySearch === true;
  const searchedAt = new Date().toISOString();

  const verified = await Promise.all(candidates.map(async entity => {
    const query = buildEntitySearchQuery(entity, context);
    let searchResult = { status: 'UNAVAILABLE', matches: [], error: 'Entity search provider is not configured.' };
    try {
      if (!externalSearchAllowed) {
        searchResult = { status: 'WITHHELD', matches: [], error: 'External entity search was not permitted for this analysis.' };
      } else if (injectedSearch && typeof injectedSearch.search === 'function') {
        searchResult = await injectedSearch.search({ entity, query, context });
      } else if (isKeyValid(apiKey)) {
        searchResult = await querySerperSearch(query, apiKey, { intent: 'ENTITY_VERIFICATION' });
      }
    } catch (error) {
      searchResult = { status: 'ERROR', matches: [], error: error.message };
    }

    const searchedSources = (searchResult.matches || [])
      .filter(source => sourceSupportsEntity(source, entity.normalizedName || entity.name))
      .slice(0, 5)
      .map(source => ({
        title: source.title || source.domain || 'Entity evidence',
        url: source.sourceUrl || source.url || null,
        domain: source.domain || null,
        snippet: source.snippet || '',
        publishedAt: source.publishedDate || source.publishedAt || null,
        evidenceType: 'ENTITY_SEARCH_CORROBORATION',
        authoritative: isAuthoritativeSource(source)
      }))
      .filter(source => source.url);
    const existingEvidence = collectExistingEntityEvidence(entity, mediaAnalysis);
    const sources = [...existingEvidence, ...searchedSources].filter((source, index, list) => source.url && list.findIndex(item => item.url === source.url) === index).slice(0, 6);
    const authoritativeCount = sources.filter(source => source.authoritative || source.locallyVerified || isAuthoritativeSource(source)).length;
    const locallyVerifiedCount = sources.filter(source => source.locallyVerified).length;
    const nameTokens = entityKey(entity.normalizedName || entity.name).split(' ').filter(token => token.length > 2);
    const crossModalConfirmation = nameTokens.length > 0 && nameTokens.every(token => transcriptAndOcr.includes(token));
    const visualConfidence = Number(entity.visualConfidence || entity.confidence || 0);

    let verificationStatus = 'UNVERIFIED';
    if (visualConfidence < 75) verificationStatus = 'AMBIGUOUS';
    else if (locallyVerifiedCount > 0 || (crossModalConfirmation && authoritativeCount > 0 && visualConfidence >= 85)) verificationStatus = 'VERIFIED';
    else if (sources.length > 0) verificationStatus = 'PROBABLE';

    const verificationConfidence = verificationStatus === 'VERIFIED'
      ? Math.min(98, Math.round(visualConfidence * 0.55 + Math.min(100, 65 + authoritativeCount * 12) * 0.45))
      : verificationStatus === 'PROBABLE'
        ? Math.min(84, Math.round(visualConfidence * 0.7 + Math.min(75, 35 + sources.length * 10) * 0.3))
        : Math.min(69, visualConfidence);

    const finding = verificationStatus === 'VERIFIED'
      ? `Visible identity/context is corroborated by ${sources.length} source${sources.length === 1 ? '' : 's'}${crossModalConfirmation ? ' and matching transcript/OCR evidence' : ''}.`
      : verificationStatus === 'PROBABLE'
        ? `Search found relevant coverage, but the available evidence does not independently prove the visible identity.`
        : verificationStatus === 'AMBIGUOUS'
          ? 'Visual confidence is below the threshold for asserting this identity.'
          : 'No independent source was strong enough to verify the proposed visual identity.';

    return {
      ...entity,
      verificationStatus,
      status: verificationStatus,
      confidence: verificationConfidence,
      verificationConfidence,
      crossModalConfirmation,
      authoritativeSourceCount: authoritativeCount,
      sources,
      search: {
        status: searchResult.status || (sources.length ? 'AVAILABLE' : 'NO_MATCH'),
        provider: searchResult.provider || (!externalSearchAllowed ? 'WITHHELD' : (injectedSearch ? 'INJECTED_TEST_PROVIDER' : (isKeyValid(apiKey) ? 'SERPER_SEARCH' : 'UNAVAILABLE'))),
        query,
        resultCount: sources.length,
        error: searchResult.error || null,
        searchedAt
      },
      finding,
      limitations: verificationStatus === 'VERIFIED' ? [] : ['A visual resemblance or name search alone is not proof of identity.']
    };
  }));

  const byKey = new Map(entities.map(entity => [entityKey(entity.normalizedName || entity.name), entity]));
  verified.forEach(entity => byKey.set(entityKey(entity.normalizedName || entity.name), entity));
  const mergedEntities = [...byKey.values()];
  return {
    entities: mergedEntities,
    summary: {
      visuallyDetectedCount: mergedEntities.filter(entity => entity.visuallyDetected).length,
      evaluatedVisualCount: verified.length,
      searchedCount: verified.filter(entity => !['WITHHELD', 'UNAVAILABLE'].includes(entity.search?.status)).length,
      verifiedCount: verified.filter(entity => entity.verificationStatus === 'VERIFIED').length,
      probableCount: verified.filter(entity => entity.verificationStatus === 'PROBABLE').length,
      ambiguousCount: verified.filter(entity => entity.verificationStatus === 'AMBIGUOUS').length,
      unverifiedCount: verified.filter(entity => entity.verificationStatus === 'UNVERIFIED').length,
      providerStatus: !externalSearchAllowed ? 'WITHHELD' : (injectedSearch ? 'TEST_PROVIDER' : (isKeyValid(apiKey) ? 'AVAILABLE' : 'UNAVAILABLE')),
      searchedAt
    },
    evidenceSources: verified.flatMap(entity => entity.sources || []).filter((source, index, list) => list.findIndex(item => item.url === source.url) === index),
    searches: verified.map(entity => ({ entityName: entity.normalizedName || entity.name, ...entity.search }))
  };
}

module.exports = {
  cleanEntityName,
  entityKey,
  isImportantNamedEntity,
  extractVisualEntityCandidates,
  verifyVisualEntities,
  buildEntitySearchQuery
};
