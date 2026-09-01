const fetch = require('node-fetch');
const FormData = require('form-data');
const sharp = require('sharp');
const { getProviderStatus, isKeyValid } = require('../providerManager');
const { isSsrfSafeUrl } = require('../ssrfGuard');
const { fetchRemoteMediaBuffer } = require('./remoteMediaFetcher');

// A keyword image result is not provenance evidence by itself. Keep weak
// perceptual lookalikes out of the report entirely; otherwise images with a
// similar colour palette or broad scene layout can be misrepresented as the
// uploaded image's source.
const VERIFIED_VISUAL_MATCH_THRESHOLD = 0.86;
const PRESENTABLE_VISUAL_CANDIDATE_THRESHOLD = 0.72;
const SERPAPI_IMAGE_UPLOAD_LIMIT_BYTES = 500 * 1024;
const SERPAPI_IMAGE_UPLOAD_TARGET_BYTES = 480 * 1024;

function isPresentableVisualCandidate(similarity) {
  return Number.isFinite(similarity) && similarity >= PRESENTABLE_VISUAL_CANDIDATE_THRESHOLD;
}

async function prepareSerpApiUploadImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('A non-empty image buffer is required for Google Lens upload');
  }

  const attempts = [
    { maxDimension: 1600, quality: 86 },
    { maxDimension: 1400, quality: 78 },
    { maxDimension: 1200, quality: 72 },
    { maxDimension: 1000, quality: 66 },
    { maxDimension: 800, quality: 60 }
  ];

  let smallest = null;
  for (const attempt of attempts) {
    const output = await sharp(buffer)
      .rotate()
      .resize(attempt.maxDimension, attempt.maxDimension, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: attempt.quality, mozjpeg: true })
      .toBuffer();
    if (!smallest || output.length < smallest.length) smallest = output;
    if (output.length <= SERPAPI_IMAGE_UPLOAD_TARGET_BYTES) {
      return { buffer: output, mimeType: 'image/jpeg', filename: 'etrai-lens-query.jpg' };
    }
  }

  if (smallest && smallest.length <= SERPAPI_IMAGE_UPLOAD_LIMIT_BYTES) {
    return { buffer: smallest, mimeType: 'image/jpeg', filename: 'etrai-lens-query.jpg' };
  }
  throw new Error('Unable to compress image below the SerpApi 500 KB upload limit');
}

function normalizeSerpApiLensMatches(data = {}) {
  const exactMatches = Array.isArray(data.exact_matches) ? data.exact_matches : [];
  const seen = new Set();
  return exactMatches.map(item => {
    const sourceUrl = item.link || '';
    const imageUrl = item.image || item.thumbnail || '';
    if (!sourceUrl || !imageUrl || !isSsrfSafeUrl(sourceUrl).safe || !isSsrfSafeUrl(imageUrl).safe) return null;
    const key = `${sourceUrl}|${imageUrl}`;
    if (seen.has(key)) return null;
    seen.add(key);
    let domain = item.source || 'external-source';
    try { domain = new URL(sourceUrl).hostname.replace(/^www\./, ''); } catch (_) {}
    return {
      title: item.title || 'Google Lens exact-match result',
      sourceUrl,
      domain,
      thumbnailUrl: item.thumbnail || imageUrl,
      originalImageUrl: imageUrl,
      publishedDate: item.date || null,
      similarity: null,
      matchType: 'LENS_EXACT_MATCH_CANDIDATE',
      isWire: ['pib.gov.in', 'reuters.com', 'apnews.com', 'afp.com', 'gettyimages.com', 'epa.eu', 'bloomberg.com', 'pti.in', 'ani.in'].some(d => domain.includes(d))
    };
  }).filter(Boolean).slice(0, 16);
}

async function searchSerpApiGoogleLens(buffer, apiKey = process.env.SERPAPI_API_KEY) {
  if (!Buffer.isBuffer(buffer) || !isKeyValid(apiKey)) return null;

  try {
    const prepared = await prepareSerpApiUploadImage(buffer);
    const form = new FormData();
    form.append('image', prepared.buffer, {
      filename: prepared.filename,
      contentType: prepared.mimeType,
      knownLength: prepared.buffer.length
    });
    form.append('api_key', apiKey);

    const uploadResponse = await fetch('https://serpapi.com/image', {
      method: 'POST',
      headers: form.getHeaders(),
      body: form,
      timeout: 15000
    });
    const uploadData = await uploadResponse.json().catch(() => ({}));
    if (!uploadResponse.ok || !uploadData.image_id) {
      const safeStatus = uploadData.error ? String(uploadData.error).slice(0, 180) : `HTTP_${uploadResponse.status}`;
      console.warn(`[SerpApi Image Upload Warning]: ${safeStatus}`);
      return null;
    }

    const params = new URLSearchParams({
      engine: 'google_lens',
      type: 'exact_matches',
      image_id: uploadData.image_id,
      country: 'in',
      hl: 'en',
      safe: 'active',
      api_key: apiKey,
      output: 'json'
    });
    const lensResponse = await fetch(`https://serpapi.com/search.json?${params.toString()}`, {
      timeout: 30000
    });
    const lensData = await lensResponse.json().catch(() => ({}));
    if (!lensResponse.ok || lensData.error) {
      const safeStatus = lensData.error ? String(lensData.error).slice(0, 180) : `HTTP_${lensResponse.status}`;
      console.warn(`[SerpApi Google Lens Warning]: ${safeStatus}`);
      return null;
    }

    const matches = normalizeSerpApiLensMatches(lensData);
    return {
      status: matches.length ? 'AVAILABLE' : 'NO_MATCH',
      provider: 'SERPAPI_GOOGLE_LENS',
      query: 'Google Lens exact matches from a transient uploaded image',
      matches,
      matchCount: matches.length,
      limitations: matches.length
        ? ['Google Lens results are downloaded and compared locally before any candidate is presented.']
        : ['Google Lens returned no exact matches for the uploaded image.']
    };
  } catch (error) {
    console.warn('[SerpApi Google Lens Warning]:', error.message);
    return null;
  }
}

function isUsefulOcrText(value = '') {
  const text = String(value).replace(/\[model-extracted text\]\s*:\s*/gi, '').replace(/\s+/g, ' ').trim();
  if (text.length < 3 || /([^\p{L}\p{N}\s])\1{5,}/u.test(text)) return false;
  const compact = text.replace(/\s/g, '');
  const readableCount = (compact.match(/[\p{L}\p{N}]/gu) || []).length;
  return compact.length > 0 && readableCount / compact.length >= 0.65;
}

/**
 * Searches Serper.dev Google Search for matching visual articles and indexed images
 */
async function querySerperSearch(query, apiKey, options = {}) {
  if (!query || !apiKey || !isKeyValid(apiKey)) {
    return { success: false, status: 'UNAVAILABLE', matches: [], error: 'Missing or invalid Serper API key or query' };
  }

  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        q: options.intent === 'VIDEO_ORIGINAL'
          ? `${query} ("full video" OR interview OR speech OR briefing OR original)`
          : `${query} news OR photo OR wire`,
        num: options.intent === 'VIDEO_ORIGINAL' ? 8 : 6
      }),
      timeout: 8000
    });

    if (res.ok) {
      const data = await res.json();
      const organic = data.organic || [];
      const matches = organic.map(item => {
        const url = item.link || '';
        if (!url || !isSsrfSafeUrl(url).safe) return null;
        let domain = 'external-source';
        try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch (e) {}

        const isWire = ['pib.gov.in', 'reuters.com', 'apnews.com', 'afp.com', 'gettyimages.com', 'epa.eu', 'bloomberg.com', 'pti.in', 'ani.in'].some(d => domain.includes(d));

        return {
          title: item.title || 'Indexed Visual Match',
          snippet: item.snippet || '',
          sourceUrl: url,
          domain,
          thumbnailUrl: item.imageUrl || '',
          originalImageUrl: item.imageUrl || null,
          publishedDate: item.date || null,
          similarity: isWire ? 0.98 : 0.88,
          isWire
        };
      }).filter(Boolean);

      if (matches.length > 0) {
        return {
          status: 'AVAILABLE',
          provider: 'SERPER_SEARCH',
          originalImageUrl: matches[0].originalImageUrl,
          sourceArticleUrl: matches[0].sourceUrl,
          sourceTitle: matches[0].title,
          domain: matches[0].domain,
          publishedDate: matches[0].publishedDate,
          matchCount: matches.length,
          matches
        };
      }
    } else {
      const errBody = await res.text().catch(() => '');
      if (res.status === 400 && errBody.includes('Not enough credits')) {
        console.warn('[Serper API Warning]: Serper API credits exhausted (400 Not enough credits). Engaging multimodal visual fallback.');
      }
      return { success: false, status: 'ERROR', matches: [], error: `Serper Search returned ${res.status}` };
    }
  } catch (err) {
    console.warn('[Serper Search Warning]:', err.message);
    return { success: false, status: 'ERROR', matches: [], error: err.message };
  }
  return { success: false, status: 'NO_MATCH', matches: [], error: 'No matching web results returned' };
}

/**
 * Searches Serper's Google Images index. Normal web results rarely expose an
 * imageUrl, so they cannot power a provided-vs-original comparison by themselves.
 */
async function querySerperImages(query, apiKey) {
  if (!query || !apiKey || !isKeyValid(apiKey)) return null;

  try {
    const res = await fetch('https://google.serper.dev/images', {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ q: query, num: 12 }),
      timeout: 10000
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.warn(`[Serper Images Warning]: ${res.status} ${errBody.slice(0, 160)}`);
      return null;
    }

    const data = await res.json();
    const seen = new Set();
    const matches = (data.images || []).map(item => {
      const imageUrl = item.imageUrl || item.thumbnailUrl || '';
      const sourceUrl = item.link || item.googleUrl || imageUrl;
      if (!imageUrl || seen.has(imageUrl) || !isSsrfSafeUrl(sourceUrl).safe) return null;
      seen.add(imageUrl);
      let domain = item.domain || 'external-source';
      try { domain = new URL(sourceUrl).hostname.replace(/^www\./, ''); } catch (e) {}
      const isWire = ['pib.gov.in', 'reuters.com', 'apnews.com', 'afp.com', 'gettyimages.com', 'epa.eu', 'bloomberg.com', 'pti.in', 'ani.in'].some(d => domain.includes(d));
      return {
        title: item.title || 'Indexed Image Match',
        sourceUrl,
        domain,
        thumbnailUrl: item.thumbnailUrl || imageUrl,
        originalImageUrl: imageUrl,
        publishedDate: null,
        similarity: null,
        matchType: 'VISUAL_SEARCH_CANDIDATE',
        isWire
      };
    }).filter(Boolean).slice(0, 10);

    if (!matches.length) return null;
    return {
      status: 'AVAILABLE',
      provider: 'SERPER_IMAGES',
      query,
      originalImageUrl: matches[0].originalImageUrl,
      sourceArticleUrl: matches[0].sourceUrl,
      sourceTitle: matches[0].title,
      domain: matches[0].domain,
      publishedDate: null,
      matchCount: matches.length,
      matches,
      limitations: ['Visual candidates require provenance confirmation; ranking alone does not prove the original creator.']
    };
  } catch (err) {
    console.warn('[Serper Images Warning]:', err.message);
    return null;
  }
}

async function createDifferenceHash(buffer, fit = 'fill') {
  const pixels = await sharp(buffer)
    .rotate()
    .resize(9, 8, { fit, position: 'centre' })
    .greyscale()
    .raw()
    .toBuffer();
  let hash = '';
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const offset = row * 9 + col;
      hash += pixels[offset] > pixels[offset + 1] ? '1' : '0';
    }
  }
  return hash;
}

function hashSimilarity(left, right) {
  if (!left || !right || left.length !== right.length) return 0;
  let distance = 0;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) distance += 1;
  }
  return 1 - (distance / left.length);
}

async function createRegionalHashes(buffer) {
  const width = 36;
  const height = 24;
  const pixels = await sharp(buffer).rotate().resize(width, height, { fit: 'fill' }).greyscale().raw().toBuffer();
  const hashes = [];
  const regionWidth = 12;
  const regionHeight = 8;
  for (let regionY = 0; regionY < 3; regionY += 1) {
    for (let regionX = 0; regionX < 3; regionX += 1) {
      let hash = '';
      const startX = regionX * regionWidth;
      const startY = regionY * regionHeight;
      for (let y = 0; y < regionHeight; y += 1) {
        for (let x = 0; x < regionWidth - 1; x += 1) {
          const offset = (startY + y) * width + startX + x;
          hash += pixels[offset] > pixels[offset + 1] ? '1' : '0';
        }
      }
      hashes.push(hash);
    }
  }
  return hashes;
}

function regionalHashSimilarity(left = [], right = []) {
  if (left.length !== right.length || left.length === 0) return 0;
  const scores = left.map((hash, index) => hashSimilarity(hash, right[index])).sort((a, b) => b - a);
  // Ignore the three least-similar regions so a face replacement, caption, or
  // local crop does not hide an otherwise matching background and composition.
  const retained = scores.slice(0, Math.max(1, scores.length - 3));
  return retained.reduce((sum, score) => sum + score, 0) / retained.length;
}

/**
 * Downloads semantic candidates and compares them locally. This prevents a
 * same-person/different-photo result from being presented as the original.
 */
async function verifyVisualCandidatesLocally(buffer, matches) {
  if (!buffer || !Buffer.isBuffer(buffer) || !Array.isArray(matches) || !matches.length) {
    return { verifiedMatch: null, checked: 0, reason: 'MISSING_REFERENCE_OR_CANDIDATES' };
  }

  let referenceFill;
  let referenceCrop;
  let referenceRegions;
  try {
    [referenceFill, referenceCrop, referenceRegions] = await Promise.all([
      createDifferenceHash(buffer, 'fill'),
      createDifferenceHash(buffer, 'cover'),
      createRegionalHashes(buffer)
    ]);
  } catch (error) {
    return { verifiedMatch: null, checked: 0, reason: `REFERENCE_DECODE_FAILED: ${error.message}` };
  }

  const checked = (await Promise.all(matches.slice(0, 10).map(async (match) => {
    const candidateUrl = match.originalImageUrl || match.thumbnailUrl;
    if (!candidateUrl || !isSsrfSafeUrl(candidateUrl).safe) return null;
    try {
      const remote = await fetchRemoteMediaBuffer(candidateUrl, {
        expectedKind: 'image',
        timeoutMs: 7000,
        maxBytes: 6 * 1024 * 1024,
        maxRedirects: 3
      });
      const candidateBuffer = remote.buffer;
      const [candidateFill, candidateCrop, candidateRegions] = await Promise.all([
        createDifferenceHash(candidateBuffer, 'fill'),
        createDifferenceHash(candidateBuffer, 'cover'),
        createRegionalHashes(candidateBuffer)
      ]);
      const similarity = Math.max(
        hashSimilarity(referenceFill, candidateFill),
        hashSimilarity(referenceCrop, candidateCrop),
        regionalHashSimilarity(referenceRegions, candidateRegions)
      );
      return { match, similarity };
    } catch (_) {
      return null;
    }
  }))).filter(Boolean).sort((a, b) => b.similarity - a.similarity);

  const best = checked[0] || null;
  if (!best || best.similarity < VERIFIED_VISUAL_MATCH_THRESHOLD) {
    const presentableCandidate = isPresentableVisualCandidate(best?.similarity) ? best : null;
    return {
      verifiedMatch: null,
      bestCandidate: presentableCandidate ? {
        ...presentableCandidate.match,
        similarity: presentableCandidate.similarity,
        matchType: 'UNVERIFIED_VISUAL_CANDIDATE'
      } : null,
      checked: checked.length,
      reason: presentableCandidate ? 'NO_VERIFIED_PERCEPTUAL_MATCH' : 'WEAK_LOOKALIKE_REJECTED',
      bestSimilarity: best?.similarity || 0
    };
  }

  return {
    verifiedMatch: {
      ...best.match,
      similarity: best.similarity,
      matchType: 'LOCAL_PERCEPTUAL_MATCH'
    },
    checked: checked.length,
    reason: 'VERIFIED',
    bestSimilarity: best.similarity
  };
}

/**
 * Searches Google Cloud Vision Web Detection on raw image bytes if configured
 */
async function searchGoogleCloudVision(buffer) {
  const visionApiKey = process.env.GOOGLE_VISION_API_KEY || process.env.GOOGLE_API_KEY;
  if (!visionApiKey || !isKeyValid(visionApiKey)) return null;

  try {
    const payload = {
      requests: [
        {
          image: {
            content: buffer.toString('base64')
          },
          features: [
            {
              type: 'WEB_DETECTION',
              maxResults: 10
            }
          ]
        }
      ]
    };

    const res = await fetch('https://vision.googleapis.com/v1/images:annotate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': visionApiKey
      },
      body: JSON.stringify(payload),
      timeout: 10000
    });

    if (res.ok) {
      const data = await res.json();
      const webDetection = data.responses?.[0]?.webDetection;
      if (!webDetection) return null;

      const pagesWithMatching = (webDetection.pagesWithMatchingImages || []).map(p => {
        const url = p.url;
        if (!url || !isSsrfSafeUrl(url).safe) return null;
        let domain = 'external-source';
        try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch (e) {}

        const fullImageUrl = p.fullMatchingImages?.[0]?.url || '';
        const partialImageUrl = p.partialMatchingImages?.[0]?.url || '';
        const originalImg = fullImageUrl || partialImageUrl;
        if (!originalImg || !isSsrfSafeUrl(originalImg).safe) return null;
        const matchType = fullImageUrl ? 'FULL_MATCH' : 'PARTIAL_MATCH';
        const isWire = ['pib.gov.in', 'reuters.com', 'apnews.com', 'afp.com', 'gettyimages.com', 'epa.eu'].some(d => domain.includes(d));

        return {
          title: p.pageTitle || 'Matching Web Page',
          sourceUrl: url,
          domain,
          thumbnailUrl: originalImg,
          originalImageUrl: originalImg,
          publishedDate: null,
          similarity: matchType === 'FULL_MATCH' ? 0.99 : 0.82,
          matchType,
          isWire
        };
      }).filter(Boolean);

      const fullMatching = (webDetection.fullMatchingImages || []).map(img => {
        const url = img.url;
        if (!url || !isSsrfSafeUrl(url).safe) return null;
        let domain = 'external-source';
        try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch (e) {}

        return {
          title: 'Full Image Match',
          sourceUrl: url,
          domain,
          thumbnailUrl: url,
          originalImageUrl: url,
          publishedDate: null,
          similarity: 0.99,
          matchType: 'FULL_MATCH',
          isWire: false
        };
      }).filter(Boolean);

      const seen = new Set();
      const combined = [...pagesWithMatching, ...fullMatching].filter(match => {
        const key = `${match.sourceUrl}|${match.originalImageUrl}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).sort((a, b) => (b.matchType === 'FULL_MATCH') - (a.matchType === 'FULL_MATCH'));
      if (combined.length > 0) {
        const topMatch = combined[0];
        return {
          status: topMatch.matchType === 'FULL_MATCH' ? 'AVAILABLE' : 'CANDIDATES_ONLY',
          provider: 'GOOGLE_VISION_WEB_DETECTION',
          originalImageUrl: topMatch.originalImageUrl,
          sourceArticleUrl: topMatch.sourceUrl,
          sourceTitle: topMatch.title,
          domain: topMatch.domain,
          publishedDate: topMatch.publishedDate,
          matchCount: combined.length,
          matches: combined.slice(0, 8),
          limitations: topMatch.matchType === 'FULL_MATCH'
            ? []
            : ['Google Vision returned a partial image match; it is presented as a candidate, not a verified original.']
        };
      }
    } else {
      const errorPayload = await res.json().catch(() => null);
      const safeCode = errorPayload?.error?.status || `HTTP_${res.status}`;
      console.warn(`[Google Vision Web Detection Warning]: ${safeCode}`);
    }
  } catch (err) {
    console.error('[Google Vision Web Detection Error]:', err.message);
  }
  return null;
}

/**
 * Reverse Image Search Service
 */
async function performReverseImageSearch(arg1, arg2 = null, arg3 = null, arg4 = {}) {
  let fileInfo = {};
  let buffer = null;
  let imageUrl = null;
  let options = {};

  if (Buffer.isBuffer(arg1)) {
    buffer = arg1;
    options = (typeof arg2 === 'object' && !Buffer.isBuffer(arg2)) ? (arg2 || {}) : (arg4 || {});
    imageUrl = typeof arg2 === 'string' ? arg2 : (typeof arg3 === 'string' ? arg3 : options.imageUrl || null);
    fileInfo = options.fileInfo || { mimeType: options.mimeType || 'image/jpeg', sizeBytes: buffer.length };
  } else if (arg1 && typeof arg1 === 'object') {
    fileInfo = arg1.fileInfo || arg1.file || arg1;
    buffer = arg1.buffer || (Buffer.isBuffer(arg2) ? arg2 : null);
    imageUrl = arg1.imageUrl || arg1.url || (typeof arg3 === 'string' ? arg3 : (typeof arg2 === 'string' ? arg2 : null));
    options = typeof arg4 === 'object' && Object.keys(arg4).length > 0 ? arg4 : (typeof arg3 === 'object' ? arg3 : (typeof arg2 === 'object' && !Buffer.isBuffer(arg2) ? arg2 : options));
  } else if (typeof arg1 === 'string') {
    imageUrl = arg1;
    options = arg2 || {};
  }

  // Provider Availability Check
  const effectiveProviderStatus = options.providerStatus || getProviderStatus();
  if (effectiveProviderStatus.webSearch === 'UNAVAILABLE' && effectiveProviderStatus.googleVision === 'UNAVAILABLE' && effectiveProviderStatus.googleLens === 'UNAVAILABLE') {
    return {
      status: 'UNAVAILABLE',
      provider: 'UNAVAILABLE',
      originalImageUrl: null,
      sourceArticleUrl: null,
      sourceTitle: null,
      domain: null,
      publishedDate: null,
      matchCount: 0,
      matches: [],
      limitations: ['Reverse-image providers are unavailable (SERPAPI_API_KEY, GOOGLE_VISION_API_KEY, and SERPER_API_KEY are missing)']
    };
  }

  // Option 0: Mock provider for unit tests
  if (options.reverseSearchProvider && typeof options.reverseSearchProvider.search === 'function') {
    try {
      const res = await options.reverseSearchProvider.search(fileInfo, buffer, imageUrl);
      const matches = Array.isArray(res.matches) ? res.matches : [];
      return {
        status: res.status || 'AVAILABLE',
        provider: res.provider || 'MOCK_PROVIDER',
        originalImageUrl: res.originalImageUrl || matches[0]?.originalImageUrl || matches[0]?.thumbnailUrl || null,
        sourceArticleUrl: res.sourceArticleUrl || matches[0]?.sourceUrl || null,
        sourceTitle: res.sourceTitle || matches[0]?.title || null,
        domain: res.domain || matches[0]?.domain || null,
        publishedDate: res.publishedDate || matches[0]?.publishedDate || null,
        matchCount: matches.length,
        matches,
        limitations: res.limitations || []
      };
    } catch (e) {
      return {
        status: 'ERROR',
        matches: [],
        limitations: [`Reverse search provider error: ${e.message}`]
      };
    }
  }

  // 1. Direct image upload to SerpApi Google Lens Exact Matches. The returned
  // candidates still have to pass our local perceptual verification gate.
  if (buffer && Buffer.isBuffer(buffer)) {
    const lensResults = await searchSerpApiGoogleLens(buffer, options.serpApiKey || process.env.SERPAPI_API_KEY);
    if (lensResults?.matches?.length) {
      const verification = await verifyVisualCandidatesLocally(buffer, lensResults.matches);
      if (verification.verifiedMatch) {
        const verified = verification.verifiedMatch;
        return {
          ...lensResults,
          status: 'AVAILABLE',
          provider: 'SERPAPI_GOOGLE_LENS_LOCAL_VERIFIED',
          originalImageUrl: verified.originalImageUrl,
          sourceArticleUrl: verified.sourceUrl,
          sourceTitle: verified.title,
          domain: verified.domain,
          matches: [verified],
          matchCount: 1,
          limitations: [
            ...(lensResults.limitations || []),
            `Local perceptual comparison confirmed the Google Lens result with ${Math.round(verified.similarity * 100)}% similarity.`
          ]
        };
      }
      if (verification.bestCandidate) {
        return {
          ...lensResults,
          status: 'CANDIDATES_ONLY',
          provider: 'SERPAPI_GOOGLE_LENS_LOCAL_VERIFIED',
          originalImageUrl: null,
          sourceArticleUrl: null,
          sourceTitle: null,
          domain: null,
          matches: [],
          matchCount: 0,
          bestCandidate: verification.bestCandidate,
          candidateMatches: [verification.bestCandidate],
          candidateCount: 1,
          limitations: [
            ...(lensResults.limitations || []),
            `The closest Google Lens exact-match result reached ${Math.round(verification.bestSimilarity * 100)}% local similarity and remains a candidate, not a verified original.`
          ]
        };
      }
    }
  }

  // 2. Direct Buffer via Google Vision Web Detection
  if (buffer && Buffer.isBuffer(buffer)) {
    const visionResults = await searchGoogleCloudVision(buffer);
    if (visionResults && visionResults.matches && visionResults.matches.length > 0) {
      return visionResults;
    }
  }

  // 3. Multimodal Visual Feature Grounding (Entities, OCR text, Visual Description)
  const visualDescription = options.visualDescription || options.visionObserved?.visualDescription || '';
  const ocrText = options.ocrText || options.visionObserved?.visibleText || '';
  const entities = options.entities || options.visionObserved?.entities || [];

  const normalizedOcrText = ocrText
    .replace(/\[model-extracted text\]\s*:\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  const cleanOcrText = isUsefulOcrText(normalizedOcrText) ? normalizedOcrText : '';
  const observedTerms = [
    ...(options.visionObserved?.logos || []),
    ...(options.visionObserved?.signs || []),
    ...(options.visionObserved?.landmarks || []),
    ...(options.visionObserved?.objects || [])
  ].filter(Boolean).slice(0, 8);
  const searchKeywords = [
    cleanOcrText.slice(0, 100),
    ...entities.slice(0, 4),
    ...observedTerms,
    visualDescription.slice(0, 180)
  ].filter(Boolean).join(' ').trim();

  // Start with literal scene evidence instead of a long generated description.
  // Exact banner/sign text plus landmarks and objects produces substantially
  // better image-index results for edited photos where the inserted person's
  // identity would otherwise steer the search away from the original scene.
  const focusedSearchKeywords = [
    cleanOcrText.slice(0, 120),
    ...(options.visionObserved?.landmarks || []).slice(0, 2),
    ...(options.visionObserved?.visibleLocationClues || []).slice(0, 2),
    ...(options.visionObserved?.objects || []).slice(0, 4),
    'event photo'
  ].filter(Boolean).join(' ').trim();

  const serperKey = options.serperKey || process.env.SERPER_API_KEY;
  if (searchKeywords.length > 5 && isKeyValid(serperKey)) {
    const primaryQuery = focusedSearchKeywords.length > 12 ? focusedSearchKeywords : searchKeywords;
    const imageRes = await querySerperImages(primaryQuery, serperKey);
    if (imageRes && imageRes.matches?.length > 0) {
      let combinedMatches = imageRes.matches;
      let verification = await verifyVisualCandidatesLocally(buffer, combinedMatches);

      const shortQuery = primaryQuery === searchKeywords
        ? [cleanOcrText.slice(0, 100), ...entities.slice(0, 3)].filter(Boolean).join(' ').trim()
        : searchKeywords;
      if (!verification.verifiedMatch && shortQuery.length > 5 && shortQuery !== primaryQuery) {
        const alternate = await querySerperImages(shortQuery, serperKey);
        if (alternate?.matches?.length) {
          const seen = new Set();
          combinedMatches = [...imageRes.matches, ...alternate.matches].filter(match => {
            const key = match.originalImageUrl || match.sourceUrl;
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
          }).slice(0, 16);
          verification = await verifyVisualCandidatesLocally(buffer, combinedMatches);
        }
      }

      if (verification.verifiedMatch) {
        const verified = verification.verifiedMatch;
        const reordered = [verified, ...combinedMatches.filter(match => match.originalImageUrl !== verified.originalImageUrl)];
        return {
          ...imageRes,
          provider: 'SERPER_IMAGES_LOCAL_VERIFIED',
          originalImageUrl: verified.originalImageUrl,
          sourceArticleUrl: verified.sourceUrl,
          sourceTitle: verified.title,
          domain: verified.domain,
          matches: reordered,
          matchCount: reordered.length,
          limitations: [
            ...(imageRes.limitations || []),
            `Local perceptual comparison confirmed a same-image candidate with ${Math.round(verified.similarity * 100)}% similarity.`
          ]
        };
      }

      const hasPresentableCandidate = Boolean(verification.bestCandidate);
      return {
        status: hasPresentableCandidate ? 'CANDIDATES_ONLY' : 'NO_MATCH',
        provider: 'SERPER_IMAGES_LOCAL_VERIFIED',
        query: primaryQuery,
        originalImageUrl: null,
        sourceArticleUrl: null,
        sourceTitle: null,
        domain: null,
        publishedDate: null,
        matchCount: 0,
        matches: [],
        bestCandidate: verification.bestCandidate || null,
        candidateMatches: hasPresentableCandidate
          ? [
            verification.bestCandidate,
            ...combinedMatches.filter(match => match.originalImageUrl !== verification.bestCandidate.originalImageUrl)
          ]
          : [],
        candidateCount: hasPresentableCandidate ? combinedMatches.length : 0,
        limitations: [
          ...(imageRes.limitations || []),
          `Rejected semantic candidates after local perceptual comparison (${verification.checked} images checked; best similarity ${Math.round((verification.bestSimilarity || 0) * 100)}%; minimum candidate threshold ${Math.round(PRESENTABLE_VISUAL_CANDIDATE_THRESHOLD * 100)}%).`
        ]
      };
    }
    // Do not convert ordinary keyword-result pages into reverse-image matches.
    // They may be useful for a separate claim search, but they contain no
    // locally comparable image and therefore are not provenance evidence.
  }

  // 3. Inconclusive fallback. An empty index response is not proof that an
  // image has never appeared online.
  return {
    status: 'NO_MATCH',
    provider: isKeyValid(process.env.SERPAPI_API_KEY)
      ? 'SERPAPI_GOOGLE_LENS'
      : isKeyValid(process.env.GOOGLE_VISION_API_KEY || process.env.GOOGLE_API_KEY)
        ? 'GOOGLE_VISION_WEB_DETECTION'
      : isKeyValid(serperKey) ? 'SERPER_IMAGES' : 'UNAVAILABLE',
    originalImageUrl: null,
    sourceArticleUrl: null,
    sourceTitle: null,
    domain: null,
    publishedDate: null,
    matchCount: 0,
    matches: [],
    limitations: [isKeyValid(process.env.SERPAPI_API_KEY)
      ? 'Google Lens returned no locally verified exact match; this is not proof that no earlier instance exists.'
      : isKeyValid(process.env.GOOGLE_VISION_API_KEY || process.env.GOOGLE_API_KEY)
        ? 'Google Vision Web Detection returned no matching web image; this is not proof that no earlier instance exists.'
      : isKeyValid(serperKey)
        ? 'No indexed visual candidate was returned for the generated recognition query; this is not proof that no earlier instance exists.'
        : 'Reverse-image providers are unavailable because SERPAPI_API_KEY, GOOGLE_VISION_API_KEY, and SERPER_API_KEY are missing or invalid.']
  };
}

module.exports = {
  performReverseImageSearch,
  searchReverseImage: performReverseImageSearch,
  querySerperSearch,
  querySerperImages,
  verifyVisualCandidatesLocally,
  createDifferenceHash,
  createRegionalHashes,
  hashSimilarity,
  regionalHashSimilarity,
  isPresentableVisualCandidate,
  isUsefulOcrText,
  searchGoogleCloudVision,
  searchSerpApiGoogleLens,
  prepareSerpApiUploadImage,
  normalizeSerpApiLensMatches
};
