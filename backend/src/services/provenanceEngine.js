/**
 * ETRAI Content Provenance Intelligence Engine
 * Investigates earliest discoverable appearance, original publisher, reposts,
 * syndicated copies, modification timeline, propagation sequence, and origin confidence.
 */

const { derivePublicationName, KNOWN_PUBLICATIONS } = require('./sourceIntelligence');

/**
 * Parses timestamp string or extracts date hints from text
 */
function extractTimestamp(item) {
  if (item.publishedAt) {
    const d = new Date(item.publishedAt);
    if (!isNaN(d.getTime())) return d;
  }
  if (item.date) {
    const d = new Date(item.date);
    if (!isNaN(d.getTime())) return d;
  }
  
  // Regex date extraction from snippet / title (e.g. "August 19, 2026", "2026-08-19", "Tuesday 04:12 IST")
  const text = `${item.title || ''} ${item.snippet || ''} ${item.passage || ''}`;
  const isoMatch = text.match(/\b(20\d{2})[-/](0[1-9]|1[0-2])[-/](0[1-9]|[12]\d|3[01])\b/);
  if (isoMatch) {
    const d = new Date(isoMatch[0]);
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}

/**
 * Formats a Date object into human-readable timeline label
 */
function formatTimeLabel(date, fallbackIndex = 0) {
  if (date instanceof Date && !isNaN(date.getTime())) {
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const mins = String(date.getUTCMinutes()).padStart(2, '0');
    const day = date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    return `${hours}:${mins} UTC · ${day}`;
  }
  return `Phase ${fallbackIndex + 1}`;
}

/**
 * Detects modifications and alterations across propagation sequence
 */
function detectModifications(source, prevSource) {
  const modifications = [];
  const text = `${source.title || ''} ${source.snippet || ''}`.toLowerCase();

  if (/\b(overlay|edited|watermark|burned-in|altered text|manipulated image|deepfake)\b/i.test(text)) {
    modifications.push('Burned-in visual overlay or altered text detected in circulating copy');
  }
  if (/\b(out of context|misleading headline|clickbait title|sensationalized)\b/i.test(text)) {
    modifications.push('Sensationalized re-framing from original publisher headline');
  }
  if (prevSource && source.title && prevSource.title && source.title !== prevSource.title) {
    const isSlight = source.title.toLowerCase().includes(prevSource.title.toLowerCase().slice(0, 20));
    if (!isSlight && !source.isIndependent) {
      modifications.push(`Headline altered during syndication copy`);
    }
  }

  return modifications;
}

/**
 * Main Provenance Investigation Engine
 * Analyzes claims, sources, media metadata, and social discourse.
 */
function analyzeContentProvenance({ claims = [], sources = [], mediaAnalysis = null, inputSource = '', inputType = 'TEXT' }) {
  const discoveredItems = Array.isArray(sources) ? [...sources] : [];

  // Group and sort sources chronologically
  const enrichedSources = discoveredItems.map((s, idx) => {
    const timestamp = extractTimestamp(s);
    const domain = (s.domain || '').toLowerCase().replace(/^www\./, '');
    const publication = s.publication || derivePublicationName(domain);
    const isOfficial = s.authorityRank === 1 || /\.(gov|edu)(\.[a-z]{2})?$/i.test(domain) || KNOWN_PUBLICATIONS[domain]?.rank === 1;
    const isSocial = s.sourceType === 'SOCIAL_MEDIA' || domain.includes('x.com') || domain.includes('telegram') || domain.includes('facebook') || domain.includes('whatsapp');
    const isWire = s.sourceType === 'GLOBAL_WIRE' || KNOWN_PUBLICATIONS[domain]?.type === 'GLOBAL_WIRE';

    let platform = 'Web Article';
    if (isOfficial) platform = 'Official Gazette / Portal';
    else if (isWire) platform = 'Wire Agency Feed';
    else if (isSocial) platform = 'Social Discourse / Channel';
    else if (s.sourceType === 'PRIMARY_NEWSROOM') platform = 'Newsroom Broadcast';

    return {
      ...s,
      timestamp,
      domain,
      publication,
      platform,
      isOfficial,
      isSocial,
      isWire,
      originalIndex: idx
    };
  });

  // Sort: Known timestamp earliest first, then by authority rank ascending
  enrichedSources.sort((a, b) => {
    if (a.timestamp && b.timestamp) return a.timestamp - b.timestamp;
    if (a.timestamp && !b.timestamp) return -1;
    if (!a.timestamp && b.timestamp) return 1;
    return (a.authorityRank || 3) - (b.authorityRank || 3);
  });

  // Determine Provenance Timeline Events
  const timeline = [];
  let confirmedOriginSource = null;
  let earliestDiscoveredSource = enrichedSources[0] || null;

  // Check if official primary publisher exists
  const officialSource = enrichedSources.find(s => s.isOfficial && s.stance === 'SUPPORTS');
  const officialDebunkSource = enrichedSources.find(s => s.isOfficial && s.stance === 'REFUTES');

  if (officialSource) {
    confirmedOriginSource = officialSource;
  }

  // Build sequential timeline events
  enrichedSources.forEach((src, idx) => {
    const isFirst = idx === 0;
    const prevSrc = idx > 0 ? enrichedSources[idx - 1] : null;
    const modifications = detectModifications(src, prevSrc);

    let eventType = 'NEWS_SYNDICATION';
    let status = src.stance === 'SUPPORTS' ? 'VERIFIED' : (src.stance === 'REFUTES' ? 'FABRICATED' : 'UNVERIFIED');

    if (isFirst) {
      eventType = src.isOfficial ? 'ORIGINAL_CREATION' : 'FIRST_DISCOVERED_APPEARANCE';
    } else if (src.isOfficial && src.stance === 'REFUTES') {
      eventType = 'OFFICIAL_DEBUNK';
      status = 'VERIFIED';
    } else if (src.isSocial) {
      eventType = 'VIRAL_PROPAGATION';
      status = src.stance === 'REFUTES' ? 'FABRICATED' : (src.stance === 'SUPPORTS' ? 'SUSPICIOUS' : 'UNVERIFIED');
    } else if (modifications.length > 0) {
      eventType = 'MODIFIED_REPOST';
    } else if (src.isWire) {
      eventType = 'NEWS_SYNDICATION';
    } else {
      eventType = 'MEDIA_BROADCAST';
    }

    const timeLabel = formatTimeLabel(src.timestamp, idx);
    let description = `${src.publication} (${src.domain}) published report regarding claim.`;
    if (eventType === 'ORIGINAL_CREATION') {
      description = `Earliest authoritative origin published by ${src.publication}.`;
    } else if (eventType === 'FIRST_DISCOVERED_APPEARANCE') {
      description = `Earliest discoverable instance surfaced via ${src.platform} (${src.publication}).`;
    } else if (eventType === 'OFFICIAL_DEBUNK') {
      description = `Official statutory denial issued by ${src.publication}: ${src.snippet || 'Factual contradiction confirmed'}.`;
    } else if (eventType === 'VIRAL_PROPAGATION') {
      description = `Unverified claim recirculated across ${src.platform} with high velocity.`;
    }

    timeline.push({
      sequenceIndex: idx + 1,
      timeLabel,
      timestamp: src.timestamp ? src.timestamp.toISOString() : null,
      platform: src.platform,
      domain: src.domain,
      publisher: src.publication,
      eventType,
      description,
      status,
      isOriginal: isFirst && (src.isOfficial || !src.isSyndicatedDuplicate),
      hasModifications: modifications.length > 0,
      modifications
    });
  });

  // Determine Origin Status & Confidence
  let originStatus = 'UNKNOWN_ORIGIN';
  let originConfidence = 30;
  let originPublisher = 'Unknown';
  let originDomain = null;
  let originUrl = null;
  let originRationale = 'No discoverable timestamped origin evidence could be conclusively identified.';

  if (confirmedOriginSource) {
    originStatus = 'CONFIRMED_ORIGIN';
    originConfidence = 95;
    originPublisher = confirmedOriginSource.publication;
    originDomain = confirmedOriginSource.domain;
    originUrl = confirmedOriginSource.url;
    originRationale = `Confirmed first-party statutory origin: ${confirmedOriginSource.publication} (${confirmedOriginSource.domain}) is the official record authority.`;
  } else if (earliestDiscoveredSource && earliestDiscoveredSource.authorityRank <= 2) {
    originStatus = 'PROBABLE_ORIGIN';
    originConfidence = 80;
    originPublisher = earliestDiscoveredSource.publication;
    originDomain = earliestDiscoveredSource.domain;
    originUrl = earliestDiscoveredSource.url;
    originRationale = `Probable authoritative origin: ${earliestDiscoveredSource.publication} represents the earliest discovered primary newsroom reporting.`;
  } else if (earliestDiscoveredSource) {
    originStatus = 'EARLIEST_DISCOVERED_SOURCE';
    originConfidence = 55;
    originPublisher = earliestDiscoveredSource.publication;
    originDomain = earliestDiscoveredSource.domain;
    originUrl = earliestDiscoveredSource.url;
    originRationale = `Earliest discoverable instance: Surfaced on ${earliestDiscoveredSource.domain}, though first-party origin may predate online index.`;
  }

  // Aggregate Propagation Metrics
  const distinctDomains = new Set(enrichedSources.map(s => s.domain)).size;
  const syndicatedCount = enrichedSources.filter(s => s.isSyndicatedDuplicate).length;
  const modifiedCount = timeline.filter(t => t.hasModifications).length;

  return {
    originAnalysis: {
      originStatus,
      originConfidence,
      originPublisher,
      originDomain,
      originUrl,
      originTimestamp: timeline[0]?.timestamp || null,
      rationale: originRationale
    },
    timeline,
    propagationMetrics: {
      totalDiscoveredVenues: distinctDomains,
      syndicatedCopyCount: syndicatedCount,
      modifiedCopyCount: modifiedCount,
      velocityTrend: distinctDomains > 3 ? 'RAPID_VIRAL' : 'ISOLATED_DISTRIBUTION'
    }
  };
}

module.exports = {
  analyzeContentProvenance,
  extractTimestamp,
  formatTimeLabel,
  detectModifications
};
