/**
 * ETRAI URL Canonicalization, Content Hashing & Duplicate Detection Utility
 * Standardizes URLs, detects syndicated copies, computes content/media hashes,
 * and clusters duplicates so they do NOT count as independent corroboration.
 */

'use strict';

const crypto = require('crypto');

// Tracking query parameters to strip during canonicalization
const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'utm_id', 'utm_reader', 'fbclid', 'gclid', 'gclsrc', 'dclid',
  'msclkid', 'twclid', 'yclid', '_hsenc', '_hsmi', 'mkt_tok',
  'ref', 'source', 'src', 'feature', 'ncid', 'cmpid', 'at_medium',
  'at_campaign', 'at_custom1', 'at_custom2', 'at_custom3', 'at_custom4'
]);

/**
 * Normalizes and canonicalizes a URL string.
 * Strips tracking query parameters, normalizes protocol, host, port, and trailing slashes.
 */
function canonicalizeUrl(rawUrl = '') {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';

  try {
    const urlObj = new URL(trimmed);

    // Normalize protocol and host
    urlObj.protocol = (urlObj.protocol || 'https:').toLowerCase();
    urlObj.hostname = urlObj.hostname.toLowerCase().replace(/^www\./, '');

    // Remove default ports
    if ((urlObj.protocol === 'http:' && urlObj.port === '80') ||
        (urlObj.protocol === 'https:' && urlObj.port === '443')) {
      urlObj.port = '';
    }

    // Strip tracking parameters
    const searchParams = new URLSearchParams(urlObj.search);
    const keysToDelete = [];
    for (const key of searchParams.keys()) {
      if (TRACKING_PARAMS.has(key.toLowerCase()) || key.toLowerCase().startsWith('utm_')) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(k => searchParams.delete(k));

    // Sort remaining query parameters for deterministic equivalence
    searchParams.sort();
    urlObj.search = searchParams.toString() ? `?${searchParams.toString()}` : '';

    // Strip hash fragment
    urlObj.hash = '';

    // Normalize trailing slash in pathname
    let pathname = urlObj.pathname.replace(/\/+$/, '');
    if (!pathname) pathname = '/';
    urlObj.pathname = pathname;

    return urlObj.toString();
  } catch (_) {
    // If URL parsing fails, perform regex-based normalization fallback
    return trimmed
      .toLowerCase()
      .replace(/^https?:\/\/(www\.)?/, 'https://')
      .replace(/\?.*$/, '')
      .replace(/\/+$/, '');
  }
}

/**
 * Computes deterministic SHA-256 content hash of normalized text
 */
function computeContentHash(text = '') {
  if (!text || typeof text !== 'string') return null;
  const normalized = text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return null;
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/**
 * Computes deterministic media hash (SHA-256 of media buffer or metadata string)
 */
function computeMediaHash(mediaData) {
  if (!mediaData) return null;
  if (typeof mediaData === 'string') {
    return crypto.createHash('sha256').update(mediaData).digest('hex');
  }
  if (Buffer.isBuffer(mediaData)) {
    return crypto.createHash('sha256').update(mediaData).digest('hex');
  }
  if (typeof mediaData === 'object' && mediaData.sha256) {
    return mediaData.sha256;
  }
  return null;
}

/**
 * Computes Jaccard Similarity between two texts using word n-grams (default 3-grams)
 */
function computeJaccardSimilarity(textA = '', textB = '', nGramSize = 3) {
  if (!textA || !textB) return 0;

  const getNGrams = (text) => {
    const tokens = text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(t => t.length > 0);
    
    if (tokens.length < nGramSize) {
      return new Set(tokens);
    }
    const ngrams = new Set();
    for (let i = 0; i <= tokens.length - nGramSize; i++) {
      ngrams.add(tokens.slice(i, i + nGramSize).join(' '));
    }
    return ngrams;
  };

  const setA = getNGrams(textA);
  const setB = getNGrams(textB);

  if (setA.size === 0 || setB.size === 0) return 0;

  let intersectionCount = 0;
  for (const item of setA) {
    if (setB.has(item)) intersectionCount++;
  }

  const unionCount = setA.size + setB.size - intersectionCount;
  return unionCount === 0 ? 0 : intersectionCount / unionCount;
}

/**
 * Computes token-level cosine similarity between two texts
 */
function computeCosineSimilarity(textA = '', textB = '') {
  if (!textA || !textB) return 0;

  const tokenize = (text) => {
    const counts = new Map();
    const words = text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 1);
    for (const w of words) {
      counts.set(w, (counts.get(w) || 0) + 1);
    }
    return counts;
  };

  const vecA = tokenize(textA);
  const vecB = tokenize(textB);

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const count of vecA.values()) normA += count * count;
  for (const count of vecB.values()) normB += count * count;

  for (const [word, countA] of vecA.entries()) {
    if (vecB.has(word)) {
      dotProduct += countA * vecB.get(word);
    }
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Detects whether source item B is a syndicated copy or near-duplicate of source item A.
 * Evaluates canonical URL equality, text similarity, media hash match, and quoted wire credit.
 */
function evaluateDuplicateLikelihood(sourceA, sourceB) {
  if (!sourceA || !sourceB) return { isDuplicate: false, similarity: 0, reason: 'Invalid input' };

  // 1. Exact Canonical URL match
  const canonA = canonicalizeUrl(sourceA.url || '');
  const canonB = canonicalizeUrl(sourceB.url || '');
  if (canonA && canonB && canonA === canonB) {
    return { isDuplicate: true, similarity: 1.0, reason: 'EXACT_CANONICAL_URL_MATCH' };
  }

  // 2. Media Hash match
  const mediaHashA = sourceA.mediaHash || (sourceA.file?.sha256);
  const mediaHashB = sourceB.mediaHash || (sourceB.file?.sha256);
  if (mediaHashA && mediaHashB && mediaHashA === mediaHashB) {
    return { isDuplicate: true, similarity: 1.0, reason: 'EXACT_MEDIA_HASH_MATCH' };
  }

  // 3. Textual Content & Snippet Similarity
  const textA = `${sourceA.title || ''} ${sourceA.snippet || ''} ${sourceA.content || ''}`;
  const textB = `${sourceB.title || ''} ${sourceB.snippet || ''} ${sourceB.content || ''}`;

  const jaccard = computeJaccardSimilarity(textA, textB, 3);
  const cosine = computeCosineSimilarity(textA, textB);
  const compositeSimilarity = (jaccard * 0.4) + (cosine * 0.6);

  // Exact content hash match
  const hashA = computeContentHash(textA);
  const hashB = computeContentHash(textB);
  if (hashA && hashB && hashA === hashB) {
    return { isDuplicate: true, similarity: 1.0, reason: 'EXACT_CONTENT_HASH_MATCH' };
  }

  // High similarity threshold for syndicated text (e.g. syndicated wire articles with altered headlines)
  if (compositeSimilarity >= 0.72) {
    return { isDuplicate: true, similarity: compositeSimilarity, reason: 'HIGH_TEXTUAL_OVERLAP_SYNDICATION' };
  }

  // 4. Quoted-Source Wire Relationship
  const wirePhrases = ['reuters', 'press trust of india', 'pti', 'associated press', 'ap', 'ani', 'afp', 'bloomberg'];
  const hasWireCreditA = wirePhrases.some(w => textA.toLowerCase().includes(`(via ${w})`) || textA.toLowerCase().includes(`reported by ${w}`) || textA.toLowerCase().includes(`according to ${w}`));
  const hasWireCreditB = wirePhrases.some(w => textB.toLowerCase().includes(`(via ${w})`) || textB.toLowerCase().includes(`reported by ${w}`) || textB.toLowerCase().includes(`according to ${w}`));

  if (hasWireCreditA && hasWireCreditB && compositeSimilarity >= 0.50) {
    return { isDuplicate: true, similarity: compositeSimilarity, reason: 'COMMON_WIRE_AGENCY_SYNDICATION' };
  }

  return { isDuplicate: false, similarity: compositeSimilarity, reason: 'INDEPENDENT_REPORTING' };
}

/**
 * Groups an array of evidence items into independent clusters and syndicated duplicates.
 * Guarantees that duplicate sources share an `independenceGroup` and are marked with `isSyndicatedDuplicate = true`,
 * so they do NOT count as independent corroboration.
 */
function clusterAndTagDuplicates(sources = []) {
  if (!Array.isArray(sources) || sources.length === 0) return [];

  const clusters = [];
  const processedSources = sources.map((s, originalIndex) => ({
    ...s,
    canonicalUrl: canonicalizeUrl(s.url || ''),
    contentHash: s.contentHash || computeContentHash(`${s.title || ''} ${s.snippet || ''} ${s.content || ''}`),
    mediaHash: s.mediaHash || computeMediaHash(s.mediaData || s.file),
    originalIndex
  }));

  for (const src of processedSources) {
    let matchedCluster = null;

    if (src.isSyndicatedDuplicate === true) {
      if (clusters.length > 0) {
        matchedCluster = clusters[0];
        matchedCluster.duplicates.push({
          source: src,
          similarity: 1.0,
          reason: 'PRE_FLAGGED_SYNDICATED_DUPLICATE'
        });
      }
    } else {
      for (const cluster of clusters) {
        const primary = cluster.primarySource;
        const dupEval = evaluateDuplicateLikelihood(primary, src);

        if (dupEval.isDuplicate) {
          matchedCluster = cluster;
          matchedCluster.duplicates.push({
            source: src,
            similarity: dupEval.similarity,
            reason: dupEval.reason
          });
          break;
        }
      }
    }

    if (matchedCluster) {
      // Mark as syndicated duplicate
      src.isIndependent = false;
      src.isSyndicatedDuplicate = true;
      src.independenceGroup = matchedCluster.groupId;
      src.duplicateReason = matchedCluster.duplicates[matchedCluster.duplicates.length - 1].reason;
    } else {
      // Create new independent cluster
      const groupId = `indep_grp_${clusters.length + 1}_${src.domain || 'src'}`;
      src.isIndependent = true;
      src.isSyndicatedDuplicate = false;
      src.independenceGroup = groupId;

      clusters.push({
        groupId,
        primarySource: src,
        duplicates: []
      });
    }
  }

  return {
    sources: processedSources,
    clusters,
    independentCount: clusters.length,
    duplicateCount: processedSources.filter(s => s.isSyndicatedDuplicate).length
  };
}

module.exports = {
  canonicalizeUrl,
  computeContentHash,
  computeMediaHash,
  computeJaccardSimilarity,
  computeCosineSimilarity,
  evaluateDuplicateLikelihood,
  clusterAndTagDuplicates,
  TRACKING_PARAMS
};
