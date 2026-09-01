const { performReverseImageSearch, isUsefulOcrText, querySerperSearch } = require('./reverseImageSearch');
const { fetchImageSourceContext } = require('./imageSourceContextVerifier');
const { isKeyValid } = require('../providerManager');

const EXACT_VISUAL_MATCH_THRESHOLD = 0.86;
const PUBLIC_FIGURE_SEARCH_CONFIDENCE = 75;
const STRONG_TRANSCRIPT_MATCH_THRESHOLD = 78;
const MAX_TRANSCRIPT_SEARCH_QUERIES = 3;

const TRANSCRIPT_STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'and', 'are', 'because', 'been', 'before', 'being',
  'but', 'can', 'could', 'did', 'does', 'for', 'from', 'had', 'has', 'have', 'here',
  'into', 'its', 'may', 'more', 'most', 'not', 'now', 'only', 'our', 'said', 'say',
  'says', 'some', 'such', 'than', 'that', 'the', 'their', 'them', 'then', 'there',
  'these', 'they', 'this', 'those', 'through', 'under', 'very', 'was', 'were', 'what',
  'when', 'where', 'which', 'while', 'who', 'with', 'would', 'you', 'your'
]);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function normalizePublicFigure(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const name = value.trim();
    return name ? { name, confidence: null, basis: null, searchUsed: false } : null;
  }
  const name = String(value.name || '').trim();
  if (!name) return null;
  const rawConfidence = Number(value.confidence);
  const confidence = Number.isFinite(rawConfidence)
    ? clamp(rawConfidence <= 1 ? rawConfidence * 100 : rawConfidence, 0, 100)
    : null;
  const basis = value.basis ? String(value.basis).trim().slice(0, 500) : null;
  return {
    name,
    confidence,
    basis,
    visibleAppearance: value.visibleAppearance ? String(value.visibleAppearance).slice(0, 500) : null,
    attire: value.attire ? String(value.attire).slice(0, 300) : null,
    searchUsed: confidence !== null && confidence >= PUBLIC_FIGURE_SEARCH_CONFIDENCE && Boolean(basis)
  };
}

function collectRecognizedFigures(frames = []) {
  const byName = new Map();
  frames.forEach(frame => {
    (frame.publicFigures || []).map(normalizePublicFigure).filter(Boolean).forEach(figure => {
      const key = figure.name.toLocaleLowerCase();
      const previous = byName.get(key);
      if (!previous || Number(figure.confidence || 0) > Number(previous.confidence || 0)) {
        byName.set(key, { ...figure, frameTimestamps: [Number(frame.timestamp || 0)] });
      } else if (!previous.frameTimestamps.includes(Number(frame.timestamp || 0))) {
        previous.frameTimestamps.push(Number(frame.timestamp || 0));
      }
    });
  });
  return [...byName.values()];
}

function scoreFrameForReverseSearch(frame = {}, index = 0, total = 1) {
  const figures = (frame.publicFigures || []).map(normalizePublicFigure).filter(Boolean);
  const searchableFigures = figures.filter(figure => figure.searchUsed);
  let score = searchableFigures.length * 55;
  score += isUsefulOcrText(frame.visibleText || '') ? 28 : 0;
  score += Math.min(20, (frame.logos || []).length * 8);
  score += Math.min(20, (frame.landmarks || []).length * 10);
  score += Math.min(14, (frame.signs || []).length * 7);
  score += Math.min(12, (frame.entities || []).length * 4);
  if (index === 0 || index === total - 1) score += 12;
  if (frame.dHash) score += 2;
  return score;
}

function selectImportantFrames(frames = [], maxFrames = 3) {
  const limit = clamp(maxFrames, 1, 6);
  const unique = [];
  const hashes = new Set();
  frames.forEach((frame, index) => {
    const hash = frame.dHash ? String(frame.dHash) : null;
    if (hash && hashes.has(hash)) return;
    if (hash) hashes.add(hash);
    unique.push({ ...frame, _sourceIndex: index });
  });
  if (unique.length <= limit) return unique;

  const ranked = unique
    .map((frame, index) => ({ frame, score: scoreFrameForReverseSearch(frame, index, unique.length) }))
    .sort((left, right) => right.score - left.score || Number(left.frame.timestamp || 0) - Number(right.frame.timestamp || 0));
  const selected = [];
  const add = frame => {
    if (frame && !selected.some(item => item._sourceIndex === frame._sourceIndex) && selected.length < limit) selected.push(frame);
  };
  add(ranked[0]?.frame);
  add(unique[0]);
  add(unique[unique.length - 1]);
  ranked.forEach(item => add(item.frame));
  return selected.sort((left, right) => Number(left.timestamp || 0) - Number(right.timestamp || 0));
}

function buildFigureAssistedQuery(frame = {}, transcript = '') {
  const figures = (frame.publicFigures || [])
    .map(normalizePublicFigure)
    .filter(figure => figure?.searchUsed)
    .map(figure => `"${figure.name}"`)
    .slice(0, 2);
  const ocr = isUsefulOcrText(frame.visibleText || '') ? `"${String(frame.visibleText).slice(0, 100)}"` : '';
  return [
    ...figures,
    ocr,
    ...(frame.logos || []).slice(0, 2),
    ...(frame.landmarks || []).slice(0, 2),
    ...(frame.locationClues || []).slice(0, 2),
    transcript ? `"${String(transcript).slice(0, 100)}"` : '',
    'original full video'
  ].filter(Boolean).join(' ').slice(0, 360);
}

function normalizeTranscriptText(value = '') {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function transcriptTokens(value = '') {
  return Array.from(new Set(normalizeTranscriptText(value)
    .split(' ')
    .filter(token => token.length >= 3 && !TRANSCRIPT_STOP_WORDS.has(token))));
}

function directionalTokenCoverage(needle = '', haystack = '') {
  const expected = transcriptTokens(needle);
  if (!expected.length) return 0;
  const available = new Set(transcriptTokens(haystack));
  return expected.filter(token => available.has(token)).length / expected.length;
}

function splitTranscriptPhrases(value = '') {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?।！？])\s+|[\n\r]+/u)
    .map(phrase => phrase.trim())
    .filter(Boolean);
}

function scoreTranscriptPhrase(phrase = '') {
  const tokens = transcriptTokens(phrase);
  if (tokens.length < 5) return -1;
  const lengthScore = Math.min(40, tokens.length * 3);
  const numberScore = /\d/.test(phrase) ? 10 : 0;
  const properNameScore = (String(phrase).match(/\b[A-Z][\p{L}'’-]{2,}/gu) || []).length * 4;
  const specificityScore = tokens.filter(token => token.length >= 7).length * 2;
  return lengthScore + numberScore + properNameScore + specificityScore;
}

function buildTranscriptSearchQueries(transcriptSegments = [], recognizedFigures = [], maxQueries = MAX_TRANSCRIPT_SEARCH_QUERIES) {
  const figureTerms = recognizedFigures
    .filter(figure => figure?.searchUsed)
    .map(figure => figure.name)
    .filter(Boolean)
    .slice(0, 2);
  const candidates = [];
  transcriptSegments.forEach((segment, index) => {
    [
      { text: segment.text, translated: false, language: segment.language || null },
      { text: segment.translatedText, translated: true, language: 'en' }
    ].forEach(variant => splitTranscriptPhrases(variant.text).forEach(phrase => {
      const clipped = phrase.slice(0, 190).trim();
      const score = scoreTranscriptPhrase(clipped);
      if (clipped.length >= 24 && score >= 0) {
        candidates.push({
          phrase: clipped,
          score,
          translated: variant.translated,
          language: variant.language,
          segmentIndex: index,
          startSec: Number.isFinite(Number(segment.start)) ? Number(segment.start) : null,
          endSec: Number.isFinite(Number(segment.end)) ? Number(segment.end) : null
        });
      }
    }));
  });

  const combined = transcriptSegments.map(segment => segment.translatedText || segment.text).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  if (!candidates.length && transcriptTokens(combined).length >= 5) {
    candidates.push({ phrase: combined.slice(0, 190), score: scoreTranscriptPhrase(combined), translated: false, language: null, segmentIndex: null, startSec: null, endSec: null });
  }

  const selected = [];
  const seen = new Set();
  candidates.sort((left, right) => right.score - left.score || Number(left.segmentIndex || 0) - Number(right.segmentIndex || 0)).forEach(candidate => {
    const key = normalizeTranscriptText(candidate.phrase);
    if (!key || seen.has(key) || selected.length >= Math.max(1, Math.min(5, Number(maxQueries) || MAX_TRANSCRIPT_SEARCH_QUERIES))) return;
    if (selected.some(item => directionalTokenCoverage(candidate.phrase, item.phrase) >= 0.82 && directionalTokenCoverage(item.phrase, candidate.phrase) >= 0.82)) return;
    seen.add(key);
    const escapedPhrase = candidate.phrase.replace(/["“”]/g, '').trim();
    const query = [`"${escapedPhrase}"`, ...figureTerms.map(name => `"${String(name).replace(/["“”]/g, '')}"`), 'news original full video'].join(' ').slice(0, 420);
    selected.push({ ...candidate, id: `transcript-query-${selected.length + 1}`, query });
  });
  return selected;
}

function buildTranscriptContextWindow(sourceText = '', clipText = '') {
  const source = String(sourceText || '').replace(/\s+/g, ' ').trim();
  const clip = String(clipText || '').replace(/\s+/g, ' ').trim();
  if (source.length < 20 || clip.length < 8) return null;
  const normalizedSource = normalizeTranscriptText(source);
  const normalizedClip = normalizeTranscriptText(clip);
  if (normalizedSource.includes(normalizedClip)) {
    const anchor = clip.split(/\s+/).slice(0, 5).join(' ');
    const sourceIndex = source.toLocaleLowerCase().indexOf(anchor.toLocaleLowerCase());
    const start = sourceIndex >= 0 ? sourceIndex : 0;
    const matchedEnd = Math.min(source.length, start + clip.length);
    return {
      before: source.slice(Math.max(0, start - 500), start).trim() || null,
      matched: source.slice(start, matchedEnd).trim() || clip,
      after: source.slice(matchedEnd, Math.min(source.length, matchedEnd + 500)).trim() || null
    };
  }
  const sentences = splitTranscriptPhrases(source);
  const ranked = sentences.map((sentence, index) => ({ sentence, index, coverage: directionalTokenCoverage(clip, sentence) }))
    .sort((left, right) => right.coverage - left.coverage);
  const best = ranked[0];
  if (!best || best.coverage < 0.5) return null;
  return {
    before: sentences.slice(Math.max(0, best.index - 2), best.index).join(' ') || null,
    matched: best.sentence,
    after: sentences.slice(best.index + 1, best.index + 3).join(' ') || null
  };
}

function scoreTranscriptSource({ clipTranscript = '', queryEvidence = [], match = {}, page = {} }) {
  const sourceTranscript = String(match.sourceTranscript || page.videoTranscript || '');
  const articleText = String(match.articleText || page.articleText || '');
  const snippetText = [match.title, match.snippet, page.title, page.description].filter(Boolean).join(' ');
  const sourceText = [sourceTranscript, articleText, snippetText].filter(Boolean).join(' ');
  const normalizedSource = normalizeTranscriptText(sourceText);
  const exactPhrases = queryEvidence.filter(item => {
    const phrase = normalizeTranscriptText(item.phrase);
    return phrase.length >= 20 && normalizedSource.includes(phrase);
  });
  const phraseCoverage = Math.max(0, ...queryEvidence.map(item => directionalTokenCoverage(item.phrase, sourceText)));
  const clipCoverage = directionalTokenCoverage(clipTranscript, sourceText);
  const transcriptCoverage = sourceTranscript ? directionalTokenCoverage(clipTranscript, sourceTranscript) : 0;
  const exactQuote = exactPhrases.length > 0;
  const sourceTranscriptAvailable = transcriptTokens(sourceTranscript).length >= 5;
  const likelyVideo = isLikelyVideoSource({ sourceUrl: match.sourceUrl || page.url, title: match.title || page.title }) || Boolean(page.videoContentUrl || page.videoEmbedUrl || sourceTranscriptAvailable);
  let evidenceScore = (exactQuote ? 48 : phraseCoverage * 35) + clipCoverage * 22 + transcriptCoverage * 18;
  if (sourceTranscriptAvailable) evidenceScore += 8;
  if (likelyVideo) evidenceScore += 5;
  if (match.isWire) evidenceScore += 3;
  evidenceScore = Math.round(Math.min(100, evidenceScore));
  const bestPhrase = exactPhrases[0]?.phrase || [...queryEvidence].sort((left, right) => directionalTokenCoverage(right.phrase, sourceText) - directionalTokenCoverage(left.phrase, sourceText))[0]?.phrase || clipTranscript;
  const contextWindow = buildTranscriptContextWindow(sourceTranscript || articleText, bestPhrase);
  const matchType = sourceTranscriptAvailable && exactQuote
    ? 'SOURCE_VIDEO_TRANSCRIPT_EXACT_QUOTE'
    : exactQuote
      ? 'NEWS_ARTICLE_EXACT_QUOTE'
      : sourceTranscriptAvailable && transcriptCoverage >= 0.5
        ? 'SOURCE_VIDEO_TRANSCRIPT_MATCH'
        : 'NEWS_REPORT_TRANSCRIPT_CLUE';
  return {
    transcriptEvidenceScore: evidenceScore,
    transcriptClipCoverage: Number(clipCoverage.toFixed(3)),
    sourceTranscriptCoverage: Number(transcriptCoverage.toFixed(3)),
    matchedTranscriptPhrases: exactPhrases.map(item => item.phrase).slice(0, 4),
    sourceTranscriptAvailable,
    strongTranscriptMatch: evidenceScore >= STRONG_TRANSCRIPT_MATCH_THRESHOLD && (exactQuote || transcriptCoverage >= 0.55),
    transcriptMatchType: matchType,
    sourceKind: likelyVideo ? 'VIDEO_SOURCE' : 'NEWS_REPORT',
    contextWindow,
    contextualVerdict: contextWindow ? 'CONTEXT_REVIEW_REQUIRED' : null
  };
}

async function collectTranscriptSearchEvidence(transcriptSegments = [], recognizedFigures = [], options = {}) {
  const queries = buildTranscriptSearchQueries(transcriptSegments, recognizedFigures, options.maxTranscriptSearchQueries || MAX_TRANSCRIPT_SEARCH_QUERIES);
  if (!queries.length) {
    return { status: 'NO_TRANSCRIPT', provider: null, queryCount: 0, executedQueryCount: 0, queries: [], matches: [], limitations: ['No sufficiently distinctive spoken phrase was available for original-news search.'] };
  }
  if (options.allowExternalTranscriptSearch !== true) {
    return {
      status: 'CONSENT_REQUIRED',
      provider: 'CONSENT_REQUIRED',
      queryCount: queries.length,
      executedQueryCount: 0,
      queries: queries.map(({ id, segmentIndex, startSec, endSec, phrase }) => ({ id, segmentIndex, startSec, endSec, phrasePreview: `${phrase.slice(0, 60)}${phrase.length > 60 ? '…' : ''}` })),
      matches: [],
      limitations: ['Transcript-based original-news search requires explicit per-analysis consent before short spoken excerpts or public-figure names are sent to Serper.']
    };
  }
  if (options.enableTranscriptSearch === false) {
    return { status: 'DISABLED', provider: 'DISABLED', queryCount: queries.length, executedQueryCount: 0, queries: [], matches: [], limitations: ['Transcript-based original-news search was disabled for this analysis.'] };
  }

  const mockSearches = Array.isArray(options.mockTranscriptSearches) ? options.mockTranscriptSearches : null;
  const apiKey = options.serperKey || process.env.SERPER_API_KEY;
  if (!mockSearches && !isKeyValid(apiKey)) {
    return { status: 'UNAVAILABLE', provider: 'SERPER_SEARCH', queryCount: queries.length, executedQueryCount: 0, queries: [], matches: [], limitations: ['Transcript search requires a configured SERPER_API_KEY.'] };
  }

  const searchResults = await Promise.all(queries.map(async (queryInfo, index) => {
    let result;
    if (mockSearches) result = mockSearches.find(item => item.id === queryInfo.id || Number(item.queryIndex) === index) || mockSearches[index] || { status: 'NO_MATCH', matches: [] };
    else result = await querySerperSearch(queryInfo.query, apiKey, { intent: 'VIDEO_ORIGINAL' });
    return {
      ...queryInfo,
      status: result.status || (result.matches?.length ? 'AVAILABLE' : 'NO_MATCH'),
      provider: result.provider || (mockSearches ? 'TEST_TRANSCRIPT_SEARCH' : 'SERPER_SEARCH'),
      error: result.error || null,
      rawMatches: Array.isArray(result.matches) ? result.matches : []
    };
  }));

  const byUrl = new Map();
  searchResults.forEach(search => search.rawMatches.forEach(match => {
    const sourceUrl = match.sourceUrl || match.url;
    if (!sourceUrl) return;
    const key = sourceUrl.replace(/[?#].*$/, '').replace(/\/$/, '').toLocaleLowerCase();
    const current = byUrl.get(key) || { match: { ...match, sourceUrl }, queryEvidence: [], providers: [] };
    current.queryEvidence.push({ id: search.id, phrase: search.phrase, query: search.query, segmentIndex: search.segmentIndex, startSec: search.startSec, endSec: search.endSec });
    if (!current.providers.includes(search.provider)) current.providers.push(search.provider);
    byUrl.set(key, current);
  }));

  const clipTranscript = transcriptSegments.map(segment => segment.translatedText || segment.text).filter(Boolean).join(' ');
  const candidatesToInspect = [...byUrl.values()]
    .sort((left, right) => right.queryEvidence.length - left.queryEvidence.length || Number(right.match.similarity || 0) - Number(left.match.similarity || 0))
    .slice(0, Math.max(1, Math.min(8, Number(options.maxTranscriptSourcePages || 5))));
  const limitations = searchResults.filter(item => item.error).map(item => `Transcript query failed: ${item.error}`);
  const matches = await Promise.all(candidatesToInspect.map(async candidate => {
    let page = candidate.match.sourcePage || null;
    if (!page && (candidate.match.sourceTranscript || candidate.match.articleText)) page = { status: 'AVAILABLE' };
    if (!page) {
      try { page = await fetchImageSourceContext(candidate.match.sourceUrl, options); }
      catch (error) { page = { status: 'UNAVAILABLE', error: error.message }; }
    }
    const score = scoreTranscriptSource({ clipTranscript, queryEvidence: candidate.queryEvidence, match: candidate.match, page: page || {} });
    return {
      sourceUrl: page?.url || candidate.match.sourceUrl,
      title: page?.title || candidate.match.title || null,
      domain: page?.domain || candidate.match.domain || null,
      publisher: page?.publisher || candidate.match.publisher || null,
      publishedAt: page?.publishedAt || candidate.match.publishedAt || candidate.match.publishedDate || null,
      snippet: page?.description || candidate.match.snippet || null,
      sourceDurationSeconds: Number(candidate.match.sourceDurationSeconds || page?.videoDurationSeconds || 0) || null,
      sourceStartSec: Number.isFinite(Number(candidate.match.sourceStartSec)) ? Number(candidate.match.sourceStartSec) : null,
      sourceEndSec: Number.isFinite(Number(candidate.match.sourceEndSec)) ? Number(candidate.match.sourceEndSec) : null,
      isWire: candidate.match.isWire === true,
      provider: candidate.providers.join('+'),
      searchQueries: candidate.queryEvidence.map(item => item.query),
      ...score
    };
  }));
  matches.sort((left, right) => right.transcriptEvidenceScore - left.transcriptEvidenceScore || String(left.publishedAt || '9999').localeCompare(String(right.publishedAt || '9999')));
  const matched = matches.filter(item => item.transcriptEvidenceScore >= 45);
  const status = matched.some(item => item.strongTranscriptMatch)
    ? 'MATCH_FOUND'
    : matched.length
      ? 'CANDIDATES_ONLY'
      : matches.length
        ? 'NO_MATCH'
        : searchResults.some(item => item.status === 'ERROR')
          ? 'ERROR'
          : 'NO_MATCH';
  if (!matches.length) limitations.push('Transcript searches returned no inspectable news or video source pages.');
  return {
    status,
    provider: Array.from(new Set(searchResults.map(item => item.provider).filter(Boolean))).join('+') || null,
    queryCount: queries.length,
    executedQueryCount: searchResults.length,
    queries: searchResults.map(({ rawMatches, ...item }) => ({ ...item, resultCount: rawMatches.length })),
    matchedSourceCount: matched.length,
    matches: matches.slice(0, 8),
    topMatch: matched[0] || matches[0] || null,
    limitations: Array.from(new Set(limitations)).slice(0, 12)
  };
}

function sanitizeMatch(match = {}) {
  const sourceUrl = match.sourceUrl || match.url || null;
  if (!sourceUrl) return null;
  return {
    sourceUrl,
    title: match.title || null,
    snippet: match.snippet || null,
    domain: match.domain || null,
    publisher: match.publisher || null,
    publishedAt: match.publishedAt || match.publishedDate || null,
    originalImageUrl: match.originalImageUrl || null,
    thumbnailUrl: match.thumbnailUrl || null,
    similarity: Number.isFinite(Number(match.similarity)) ? Number(match.similarity) : null,
    matchType: match.matchType || null,
    isWire: match.isWire === true,
    sourceDurationSeconds: Number(match.sourceDurationSeconds || match.durationSeconds || 0) || null,
    sourceStartSec: Number.isFinite(Number(match.sourceStartSec)) ? Number(match.sourceStartSec) : null,
    sourceEndSec: Number.isFinite(Number(match.sourceEndSec)) ? Number(match.sourceEndSec) : null,
    contextWindow: match.contextWindow || null,
    contextualVerdict: match.contextualVerdict || null,
    resolverVerified: match.resolverVerified === true,
    transcriptEvidenceScore: Number.isFinite(Number(match.transcriptEvidenceScore)) ? Number(match.transcriptEvidenceScore) : 0,
    transcriptClipCoverage: Number.isFinite(Number(match.transcriptClipCoverage)) ? Number(match.transcriptClipCoverage) : 0,
    sourceTranscriptCoverage: Number.isFinite(Number(match.sourceTranscriptCoverage)) ? Number(match.sourceTranscriptCoverage) : 0,
    matchedTranscriptPhrases: Array.isArray(match.matchedTranscriptPhrases) ? match.matchedTranscriptPhrases.map(String).slice(0, 4) : [],
    sourceTranscriptAvailable: match.sourceTranscriptAvailable === true,
    strongTranscriptMatch: match.strongTranscriptMatch === true,
    transcriptMatchType: match.transcriptMatchType || null,
    sourceKind: match.sourceKind || null,
    searchQueries: Array.isArray(match.searchQueries) ? match.searchQueries.map(String).slice(0, 5) : []
  };
}

function resultHasVerifiedVisualMatch(result = {}) {
  if (result.status !== 'AVAILABLE') return false;
  if (/LOCAL_VERIFIED/.test(String(result.provider || ''))) return true;
  return (result.matches || []).some(match => Number(match.similarity) >= EXACT_VISUAL_MATCH_THRESHOLD);
}

function normalizeFrameSearch(frame, result, query) {
  const exactMatch = resultHasVerifiedVisualMatch(result);
  const rawMatches = exactMatch ? (result.matches || []) : (result.candidateMatches || result.matches || []);
  return {
    frameIndex: Number(frame.frameIndex ?? frame._sourceIndex ?? 0),
    timestamp: Number(frame.timestamp || 0),
    importanceScore: scoreFrameForReverseSearch(frame),
    status: result.status || 'UNAVAILABLE',
    provider: result.provider || 'UNAVAILABLE',
    query: result.query || query,
    exactMatch,
    matches: rawMatches.map(sanitizeMatch).filter(Boolean).slice(0, 6),
    limitations: Array.isArray(result.limitations) ? result.limitations.map(String).slice(0, 8) : []
  };
}

function isLikelyVideoSource(candidate = {}) {
  const value = `${candidate.sourceUrl || ''} ${candidate.title || ''}`;
  return /(?:youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com|facebook\.com\/watch|instagram\.com\/(?:reel|tv)|tiktok\.com|\.mp4(?:\?|$)|\bfull\s+(?:video|interview|speech|briefing)\b)/i.test(value);
}

function aggregateSourceCandidates(frameSearches = [], injectedCandidates = [], transcriptMatches = []) {
  const candidates = new Map();
  const addMatch = (match, search, injected = false) => {
    const normalized = sanitizeMatch(match);
    if (!normalized) return;
    const key = normalized.sourceUrl.replace(/[?#].*$/, '').replace(/\/$/, '').toLocaleLowerCase();
    const current = candidates.get(key) || {
      ...normalized,
      matchedFrameTimestamps: [],
      exactFrameMatches: 0,
      candidateFrameMatches: 0,
      transcriptQueryMatches: 0,
      providers: [],
      injected: false
    };
    const timestamp = Number(search?.timestamp ?? match.timestamp ?? 0);
    if (!current.matchedFrameTimestamps.includes(timestamp)) current.matchedFrameTimestamps.push(timestamp);
    const transcriptEvidence = search?.searchType === 'TRANSCRIPT' || normalized.transcriptEvidenceScore > 0;
    if (transcriptEvidence) current.transcriptQueryMatches += 1;
    else if (search?.exactMatch || normalized.resolverVerified) current.exactFrameMatches += 1;
    else current.candidateFrameMatches += 1;
    if (search?.provider && !current.providers.includes(search.provider)) current.providers.push(search.provider);
    Object.entries(normalized).forEach(([field, value]) => {
      if (value !== null && value !== undefined && value !== '') current[field] = value;
    });
    current.injected = current.injected || injected;
    current.isVideoSource = isLikelyVideoSource(current);
    candidates.set(key, current);
  };

  frameSearches.forEach(search => search.matches.forEach(match => addMatch(match, search)));
  injectedCandidates.forEach(candidate => addMatch(candidate, {
    timestamp: candidate.sourceStartSec || 0,
    exactMatch: candidate.exactMatch === true || candidate.resolverVerified === true,
    provider: candidate.provider || 'ORIGINAL_VIDEO_RESOLVER'
  }, true));
  transcriptMatches.forEach(candidate => addMatch(candidate, {
    timestamp: candidate.sourceStartSec || 0,
    exactMatch: false,
    searchType: 'TRANSCRIPT',
    provider: candidate.provider || 'TRANSCRIPT_SEARCH'
  }));

  return [...candidates.values()].map(candidate => {
    const dateValue = candidate.publishedAt ? Date.parse(candidate.publishedAt) : Number.NaN;
    const chronologicalBonus = Number.isFinite(dateValue) ? Math.max(0, 8 - Math.floor(dateValue / 315576000000)) : 0;
    return {
      ...candidate,
      matchedFrameTimestamps: candidate.matchedFrameTimestamps.sort((a, b) => a - b),
      evidenceScore: candidate.exactFrameMatches * 100 +
        candidate.candidateFrameMatches * 16 +
        candidate.transcriptQueryMatches * 18 +
        Number(candidate.transcriptEvidenceScore || 0) +
        (candidate.isVideoSource ? 25 : 0) +
        (candidate.isWire ? 8 : 0) +
        chronologicalBonus
    };
  }).sort((left, right) => right.evidenceScore - left.evidenceScore || String(left.publishedAt || '9999').localeCompare(String(right.publishedAt || '9999')));
}

function chooseOriginalCandidate(candidates = []) {
  const resolved = candidates.find(candidate => candidate.resolverVerified);
  if (resolved) return { ...resolved, confidence: 'VERIFIED_ORIGINAL' };
  const sequence = candidates.find(candidate => candidate.exactFrameMatches >= 2 && candidate.isVideoSource);
  if (sequence) return { ...sequence, confidence: 'STRONG_ORIGINAL_CANDIDATE' };
  const transcriptVideo = candidates.find(candidate => candidate.strongTranscriptMatch && candidate.isVideoSource && candidate.sourceTranscriptAvailable);
  if (transcriptVideo) return { ...transcriptVideo, confidence: 'STRONG_TRANSCRIPT_ORIGINAL_CANDIDATE' };
  const frame = candidates.find(candidate => candidate.exactFrameMatches >= 1);
  if (frame) return { ...frame, confidence: frame.isVideoSource ? 'VISUALLY_MATCHED_VIDEO_CANDIDATE' : 'VISUALLY_MATCHED_SOURCE_PAGE' };
  const transcriptNews = candidates.find(candidate => Number(candidate.transcriptEvidenceScore || 0) >= 45);
  if (transcriptNews) return { ...transcriptNews, confidence: transcriptNews.strongTranscriptMatch ? 'STRONG_TRANSCRIPT_NEWS_MATCH' : 'TRANSCRIPT_MATCHED_NEWS_CANDIDATE' };
  const candidate = candidates[0];
  return candidate ? { ...candidate, confidence: 'UNVERIFIED_CANDIDATE' } : null;
}

async function collectVideoProvenanceEvidence(frames = [], transcriptSegments = [], options = {}) {
  const recognizedFigures = collectRecognizedFigures(frames);
  const transcriptSearchPromise = collectTranscriptSearchEvidence(transcriptSegments, recognizedFigures, options);
  const selected = selectImportantFrames(frames, Number(options.maxVideoReverseSearchFrames || 3));
  const frameSearches = [];
  const limitations = [];
  const transcript = transcriptSegments.map(segment => segment.text).filter(Boolean).join(' ');

  for (const frame of selected) {
    const query = buildFigureAssistedQuery(frame, transcript);
    let result = null;
    const injected = Array.isArray(options.mockVideoFrameSearches)
      ? options.mockVideoFrameSearches.find(item => Number(item.frameIndex ?? -1) === Number(frame.frameIndex ?? frame._sourceIndex ?? 0) || Math.abs(Number(item.timestamp) - Number(frame.timestamp)) < 0.05)
      : null;
    try {
      if (injected) result = injected.result || injected;
      else if (options.enableReverseSearch === false) result = { status: 'UNAVAILABLE', provider: 'DISABLED', matches: [], limitations: ['Video keyframe reverse search was disabled for this analysis.'] };
      else if (options.allowExternalVisualSearch !== true) result = {
        status: 'UNAVAILABLE',
        provider: 'CONSENT_REQUIRED',
        matches: [],
        limitations: ['External keyframe reverse search requires explicit per-analysis consent before selected frames may be uploaded to the configured Google Lens, Google Vision, or Serper provider.']
      };
      else if (!Buffer.isBuffer(frame.buffer)) result = { status: 'UNAVAILABLE', provider: 'UNAVAILABLE', matches: [], limitations: ['The selected keyframe buffer was unavailable for reverse-image search.'] };
      else {
        const searchableFigureNames = (frame.publicFigures || []).map(normalizePublicFigure).filter(figure => figure?.searchUsed).map(figure => figure.name);
        result = await performReverseImageSearch({
          fileInfo: { filename: `video_frame_${frame.frameIndex ?? frame._sourceIndex ?? 0}.jpg`, mimeType: 'image/jpeg', sizeBytes: frame.buffer.length },
          buffer: frame.buffer
        }, {
          ...options,
          visualDescription: frame.description || '',
          ocrText: frame.visibleText || '',
          entities: [...searchableFigureNames, ...(frame.entities || [])],
          visionObserved: {
            visibleText: frame.visibleText || '',
            entities: [...searchableFigureNames, ...(frame.entities || [])],
            publicFigures: frame.publicFigures || [],
            logos: frame.logos || [],
            signs: frame.signs || [],
            landmarks: frame.landmarks || [],
            objects: frame.objects || [],
            visibleLocationClues: frame.locationClues || []
          }
        });
      }
    } catch (error) {
      result = { status: 'ERROR', provider: 'ERROR', matches: [], limitations: [`Keyframe reverse search failed: ${error.message}`] };
    }
    const normalized = normalizeFrameSearch(frame, result || {}, query);
    frameSearches.push(normalized);
    limitations.push(...normalized.limitations);
  }

  const transcriptSearch = await transcriptSearchPromise;
  limitations.push(...(transcriptSearch.limitations || []));

  let resolvedCandidates = Array.isArray(options.mockOriginalVideoCandidates) ? options.mockOriginalVideoCandidates : [];
  let candidates = aggregateSourceCandidates(frameSearches, resolvedCandidates, transcriptSearch.matches || []);
  const resolver = typeof options.originalVideoResolver === 'function'
    ? options.originalVideoResolver
    : options.originalVideoResolver?.resolve;
  if (resolver && candidates.length > 0) {
    try {
      const resolution = await resolver({ candidates: candidates.slice(0, 6), frames: selected.map(({ buffer, ...frame }) => frame), transcriptSegments });
      const returned = Array.isArray(resolution) ? resolution : (resolution ? [resolution] : []);
      candidates = aggregateSourceCandidates(frameSearches, [...resolvedCandidates, ...returned], transcriptSearch.matches || []);
    } catch (error) {
      limitations.push(`Original-video resolver failed: ${error.message}`);
    }
  }

  const originalCandidate = chooseOriginalCandidate(candidates);
  const exactSearches = frameSearches.filter(search => search.exactMatch).length;
  const externalSearchPerformedCount = frameSearches.filter(search => !['CONSENT_REQUIRED', 'DISABLED', 'UNAVAILABLE', 'ERROR'].includes(search.provider)).length;
  const status = originalCandidate?.confidence === 'VERIFIED_ORIGINAL'
    ? 'ORIGINAL_VERIFIED'
    : exactSearches > 0
      ? 'VISUAL_SOURCE_MATCH_FOUND'
      : transcriptSearch.status === 'MATCH_FOUND'
        ? 'TRANSCRIPT_SOURCE_MATCH_FOUND'
      : candidates.length > 0
        ? 'CANDIDATES_ONLY'
        : frameSearches.some(search => search.status === 'UNAVAILABLE')
          ? 'UNAVAILABLE'
          : 'NO_MATCH';

  return {
    status,
    methodology: 'ETRAI_VIDEO_PROVENANCE_V1',
    selectedFrameCount: selected.length,
    reverseSearchedFrameCount: externalSearchPerformedCount,
    exactMatchedFrameCount: exactSearches,
    recognizedFigures,
    searchFigures: recognizedFigures.filter(figure => figure.searchUsed).map(figure => figure.name),
    frameSearches,
    transcriptSearch,
    sourceCandidates: candidates.slice(0, 10),
    originalCandidate,
    limitations: Array.from(new Set(limitations)).slice(0, 20)
  };
}

module.exports = {
  EXACT_VISUAL_MATCH_THRESHOLD,
  PUBLIC_FIGURE_SEARCH_CONFIDENCE,
  STRONG_TRANSCRIPT_MATCH_THRESHOLD,
  normalizePublicFigure,
  collectRecognizedFigures,
  scoreFrameForReverseSearch,
  selectImportantFrames,
  buildFigureAssistedQuery,
  normalizeTranscriptText,
  directionalTokenCoverage,
  buildTranscriptSearchQueries,
  buildTranscriptContextWindow,
  scoreTranscriptSource,
  collectTranscriptSearchEvidence,
  resultHasVerifiedVisualMatch,
  aggregateSourceCandidates,
  chooseOriginalCandidate,
  collectVideoProvenanceEvidence
};
