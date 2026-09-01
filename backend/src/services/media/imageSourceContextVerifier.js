const fetch = require('node-fetch');
const { isSsrfSafeUrl } = require('../ssrfGuard');
const { createGeminiClient } = require('../providerManager');

const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const MAX_SOURCE_TEXT_CHARS = 7000;
const SOURCE_FETCH_TIMEOUT_MS = 10000;

const STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'among', 'and', 'are', 'been', 'before', 'being',
  'but', 'can', 'could', 'does', 'for', 'from', 'had', 'has', 'have', 'her', 'here',
  'his', 'into', 'its', 'more', 'most', 'not', 'of', 'off', 'on', 'only', 'or',
  'other', 'our', 'over', 'said', 'she', 'some', 'such', 'than', 'that', 'the',
  'their', 'them', 'then', 'there', 'these', 'they', 'this', 'through', 'under',
  'was', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'with', 'would',
  'image', 'photo', 'photograph', 'picture', 'shows', 'showing', 'depicts', 'visible'
]);

function normalizeText(value = '') {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function meaningfulTokens(value = '') {
  return Array.from(new Set(
    normalizeText(value)
      .split(' ')
      .filter(token => token.length >= 3 && !STOP_WORDS.has(token))
  ));
}

function sourceDomain(url = '') {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (_) {
    return '';
  }
}

function normalizeConfidence(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const percentage = numeric > 0 && numeric <= 1 ? numeric * 100 : numeric;
  return Math.max(0, Math.min(100, Math.round(percentage)));
}

async function fetchWithSafeRedirects(url, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  let currentUrl = url;

  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    const safety = isSsrfSafeUrl(currentUrl);
    if (!safety.safe) throw new Error(`Source page URL rejected: ${safety.reason}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || SOURCE_FETCH_TIMEOUT_MS);
    let response;
    try {
      response = await fetchImpl(currentUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ETRAI-ImageContextVerifier/1.0',
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5'
        },
        redirect: 'manual',
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location || redirectCount === 3) throw new Error('Source page redirected too many times');
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    return { response, finalUrl: currentUrl };
  }

  throw new Error('Source page redirect limit exceeded');
}

async function fetchImageSourceContext(sourceUrl, options = {}) {
  if (!sourceUrl) {
    return { status: 'UNAVAILABLE', error: 'No reverse-image source page URL was returned.' };
  }

  if (options.sourcePageHtml) {
    return extractSourcePageContext(options.sourcePageHtml, sourceUrl);
  }

  try {
    const { response, finalUrl } = await fetchWithSafeRedirects(sourceUrl, options);
    if (!response.ok) {
      return { status: 'UNAVAILABLE', url: finalUrl, error: `Source page returned HTTP ${response.status}.` };
    }

    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (contentType && !contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      return { status: 'UNAVAILABLE', url: finalUrl, error: `Source page is not HTML (${contentType}).` };
    }

    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > MAX_SOURCE_BYTES) {
      return { status: 'UNAVAILABLE', url: finalUrl, error: 'Source page is too large to inspect safely.' };
    }

    const html = await response.text();
    if (Buffer.byteLength(html, 'utf8') > MAX_SOURCE_BYTES) {
      return { status: 'UNAVAILABLE', url: finalUrl, error: 'Source page exceeded the safe extraction limit.' };
    }
    return extractSourcePageContext(html, finalUrl);
  } catch (error) {
    return {
      status: 'UNAVAILABLE',
      url: sourceUrl,
      domain: sourceDomain(sourceUrl),
      error: error.name === 'AbortError' ? 'Source page request timed out.' : error.message
    };
  }
}

function extractSourcePageContext(html = '', url = '') {
  // Lazy loading avoids a module cycle because inputReader also loads the
  // media orchestrator that invokes this verifier.
  const { cleanHtml, extractHtmlAssetsAndMetadata } = require('../inputReader');
  const extracted = extractHtmlAssetsAndMetadata(html, url);
  const metadata = extracted.metadata || {};
  const articleText = cleanHtml(html).slice(0, MAX_SOURCE_TEXT_CHARS);
  const evidenceText = [metadata.title, metadata.description, metadata.videoTranscript, articleText].filter(Boolean).join(' ').trim();

  if (!evidenceText) {
    return {
      status: 'UNAVAILABLE',
      url,
      domain: sourceDomain(url),
      error: 'The matched source page did not expose readable title, description, or article text.'
    };
  }

  return {
    status: 'AVAILABLE',
    url: metadata.canonicalUrl || url,
    requestedUrl: url,
    domain: sourceDomain(metadata.canonicalUrl || url),
    title: metadata.title || null,
    description: metadata.description || null,
    publisher: metadata.publisher || null,
    author: metadata.author || null,
    publishedAt: metadata.publishedAt || null,
    videoDurationSeconds: metadata.videoDurationSeconds || null,
    videoTranscript: metadata.videoTranscript || null,
    videoContentUrl: metadata.videoContentUrl || null,
    videoEmbedUrl: metadata.videoEmbedUrl || null,
    articleText,
    evidenceText
  };
}

function buildDeterministicComparison({ visualSummary = '', ocrText = '', entities = [], sourceContext = {} }) {
  const visualEvidence = [visualSummary, ocrText, ...(entities || [])].filter(Boolean).join(' ');
  const sourceEvidence = sourceContext.evidenceText || [sourceContext.title, sourceContext.description, sourceContext.articleText].filter(Boolean).join(' ');
  const visualTokens = meaningfulTokens(visualEvidence);
  const sourceTokens = new Set(meaningfulTokens(sourceEvidence));
  const sharedTokens = visualTokens.filter(token => sourceTokens.has(token));
  const coverage = visualTokens.length ? sharedTokens.length / visualTokens.length : 0;

  const normalizedSource = normalizeText(sourceEvidence);
  const matchedEntities = (entities || [])
    .map(entity => String(entity || '').trim())
    .filter(entity => entity.length >= 3 && normalizedSource.includes(normalizeText(entity)));
  const ocrPhrases = String(ocrText || '')
    .split(/[\n.!?]+/)
    .map(value => value.trim())
    .filter(value => meaningfulTokens(value).length >= 2);
  const matchedOcrPhrases = ocrPhrases.filter(phrase => normalizedSource.includes(normalizeText(phrase))).slice(0, 5);

  const strongMatch = matchedEntities.length > 0 || matchedOcrPhrases.length > 0 || (sharedTokens.length >= 5 && coverage >= 0.28);
  return {
    status: strongMatch ? 'MATCHED' : 'INCONCLUSIVE',
    contextualVerdict: strongMatch ? 'CONTEXT_SUPPORTED' : 'INSUFFICIENT_EVIDENCE',
    confidence: strongMatch ? Math.min(88, Math.round(62 + coverage * 45 + matchedEntities.length * 4)) : Math.min(55, Math.round(25 + coverage * 50)),
    sourceSummary: sourceContext.description || sourceContext.title || sourceContext.articleText?.slice(0, 500) || '',
    rationale: strongMatch
      ? 'The matched source page contains independently extracted terms, entities, or visible-text phrases that agree with the AI visual summary.'
      : 'The source page was recovered, but its readable text does not contain enough specific overlap to confirm or contradict the AI visual summary.',
    matchingDetails: [
      ...matchedEntities.map(entity => `Entity appears in both image analysis and source page: ${entity}`),
      ...matchedOcrPhrases.map(phrase => `Visible text also appears on the source page: ${phrase}`),
      ...(sharedTokens.length ? [`Shared contextual terms: ${sharedTokens.slice(0, 12).join(', ')}`] : [])
    ].slice(0, 8),
    contradictions: [],
    metrics: {
      visualTokenCount: visualTokens.length,
      sharedTokenCount: sharedTokens.length,
      tokenCoverage: Number(coverage.toFixed(3)),
      matchedEntityCount: matchedEntities.length,
      matchedOcrPhraseCount: matchedOcrPhrases.length
    },
    provider: 'DETERMINISTIC_CONTEXT_OVERLAP'
  };
}

async function compareImageSummaryToSource(input, options = {}) {
  const fallback = buildDeterministicComparison(input);
  if (options.disableAi === true) return fallback;
  const ai = options.geminiClient || createGeminiClient(options.geminiKey);
  if (!ai) return fallback;

  try {
    const source = input.sourceContext || {};
    const prompt = `Compare an AI-generated description of an uploaded image with text extracted from the web page that contains a locally verified matching image.

Rules:
- Use only the supplied text. Never invent identities, dates, locations, or events.
- MATCHED means the source page explicitly supports the same people, event, place, or scene context.
- CONTRADICTED means the source page explicitly identifies a materially different person, event, place, date, or meaning. Mere missing detail is not contradiction.
- INCONCLUSIVE means there is not enough readable source context.
- This evaluates contextual/caption accuracy, not whether the source publisher is universally trustworthy.

AI visual summary: ${input.visualSummary || 'Not available'}
Visible image text (OCR): ${input.ocrText || 'Not available'}
Visually identified entities: ${JSON.stringify(input.entities || [])}
Source title: ${source.title || 'Not available'}
Source description: ${source.description || 'Not available'}
Source article text: ${(source.articleText || '').slice(0, MAX_SOURCE_TEXT_CHARS)}

Return JSON only:
{
  "status": "MATCHED|CONTRADICTED|INCONCLUSIVE",
  "confidence": 0,
  "sourceSummary": "concise summary of what the source says about this image",
  "rationale": "why the source supports, contradicts, or cannot establish the AI visual summary",
  "matchingDetails": ["specific agreement"],
  "contradictions": ["specific contradiction"]
}`;

    const response = await ai.models.generateContent({
      model: (process.env.GEMINI_MODEL || 'gemini-flash-lite-latest').trim(),
      contents: prompt,
      config: { responseMimeType: 'application/json', temperature: 0.05 }
    });
    let raw = typeof response.text === 'function' ? response.text() : response.text;
    if (!raw && response.candidates?.[0]?.content?.parts) {
      raw = response.candidates[0].content.parts.map(part => part.text || '').join('');
    }
    const parsed = JSON.parse(String(raw || '{}').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim());
    const status = ['MATCHED', 'CONTRADICTED', 'INCONCLUSIVE'].includes(parsed.status) ? parsed.status : fallback.status;
    return {
      ...fallback,
      status,
      contextualVerdict: status === 'MATCHED'
        ? 'CONTEXT_SUPPORTED'
        : status === 'CONTRADICTED' ? 'CONTEXT_MISREPRESENTED' : 'INSUFFICIENT_EVIDENCE',
      confidence: normalizeConfidence(parsed.confidence, fallback.confidence),
      sourceSummary: String(parsed.sourceSummary || fallback.sourceSummary).slice(0, 1200),
      rationale: String(parsed.rationale || fallback.rationale).slice(0, 1600),
      matchingDetails: Array.isArray(parsed.matchingDetails) ? parsed.matchingDetails.map(String).slice(0, 8) : fallback.matchingDetails,
      contradictions: Array.isArray(parsed.contradictions) ? parsed.contradictions.map(String).slice(0, 8) : [],
      provider: 'GEMINI_SOURCE_CONTEXT_COMPARISON'
    };
  } catch (error) {
    return { ...fallback, aiError: error.message };
  }
}

async function verifyImageSourceContext({ imageReportItem, reverseSearch, visualSummary, ocrText, entities }, options = {}) {
  const sourceUrl = imageReportItem?.originalPageUrl || reverseSearch?.sourceArticleUrl || null;
  const matchStatus = imageReportItem?.originalFoundStatus || 'UNVERIFIED';
  const localVisualMatchVerified = matchStatus === 'FOUND';

  if (!sourceUrl || !['FOUND', 'CANDIDATE'].includes(matchStatus)) {
    return {
      status: 'UNAVAILABLE',
      contextualVerdict: 'INSUFFICIENT_EVIDENCE',
      confidence: 0,
      decisive: false,
      source: sourceUrl ? { url: sourceUrl, domain: sourceDomain(sourceUrl) } : null,
      rationale: 'No locally comparable reverse-image source page was recovered.'
    };
  }

  const sourceContext = await fetchImageSourceContext(sourceUrl, options);
  if (sourceContext.status !== 'AVAILABLE') {
    return {
      status: 'INCONCLUSIVE',
      contextualVerdict: 'INSUFFICIENT_EVIDENCE',
      confidence: 0,
      decisive: false,
      source: {
        url: sourceUrl,
        domain: sourceContext.domain || sourceDomain(sourceUrl),
        title: reverseSearch?.sourceTitle || null,
        publishedAt: reverseSearch?.publishedDate || null
      },
      visualSummary: visualSummary || '',
      sourceSummary: reverseSearch?.sourceTitle || '',
      rationale: sourceContext.error || 'The matched image source page could not be read.',
      matchingDetails: [],
      contradictions: [],
      provider: 'SOURCE_PAGE_FETCH'
    };
  }

  const comparison = await compareImageSummaryToSource({
    visualSummary,
    ocrText,
    entities,
    sourceContext
  }, options);

  return {
    ...comparison,
    decisive: localVisualMatchVerified && ['MATCHED', 'CONTRADICTED'].includes(comparison.status),
    localVisualMatchVerified,
    matchStatus,
    visualSummary: visualSummary || '',
    source: {
      url: sourceContext.url,
      domain: sourceContext.domain,
      title: sourceContext.title || reverseSearch?.sourceTitle || null,
      description: sourceContext.description || null,
      publisher: sourceContext.publisher || null,
      author: sourceContext.author || null,
      publishedAt: sourceContext.publishedAt || reverseSearch?.publishedDate || null
    }
  };
}

module.exports = {
  extractSourcePageContext,
  fetchImageSourceContext,
  buildDeterministicComparison,
  compareImageSummaryToSource,
  verifyImageSourceContext,
  meaningfulTokens
};
