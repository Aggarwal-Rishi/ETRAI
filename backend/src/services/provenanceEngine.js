/**
 * ETRAI Provenance & Spread Intelligence Engine
 * Constructs deterministic Provenance Graphs (ORIGINAL -> SOURCE -> REPOST -> ARTICLE -> SOCIAL POST -> CURRENT INPUT),
 * determines First-Known Appearance vs Confirmed Origin vs Provenance Insufficient,
 * detects duplicate syndication copies, and calculates Spread/Amplification patterns with calibrated confidence.
 */

'use strict';

const { derivePublicationName, KNOWN_PUBLICATIONS } = require('./sourceIntelligence');
const { canonicalizeUrl, computeContentHash, computeMediaHash, clusterAndTagDuplicates } = require('./canonicalizer');

/**
 * Parses timestamp string or extracts date hints from text
 */
function extractTimestamp(item) {
  if (!item) return null;
  if (item.publishedAt) {
    const d = new Date(item.publishedAt);
    if (!isNaN(d.getTime())) return d;
  }
  if (item.date) {
    const d = new Date(item.date);
    if (!isNaN(d.getTime())) return d;
  }
  if (item.timestamp) {
    const d = new Date(item.timestamp);
    if (!isNaN(d.getTime())) return d;
  }

  // Regex date extraction from snippet / title / passage
  const text = `${item.title || ''} ${item.snippet || ''} ${item.passage || ''} ${item.content || ''}`;
  const isoMatch = text.match(/\b(20\d{2})[-/](0[1-9]|1[0-2])[-/](0[1-9]|[12]\d|3[01])\b/);
  if (isoMatch) {
    const d = new Date(isoMatch[0]);
    if (!isNaN(d.getTime())) return d;
  }

  const writtenDateMatch = text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+([1-9]|[12]\d|3[01]),?\s+(20\d{2})\b/i);
  if (writtenDateMatch) {
    const d = new Date(writtenDateMatch[0]);
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
      modifications.push('Headline altered during syndication copy');
    }
  }

  return modifications;
}

/**
 * Maps source properties to conceptual provenance node type
 * ORIGINAL | SOURCE | REPOST | ARTICLE | SOCIAL_POST | CURRENT_INPUT
 */
function mapNodeType(source, isFirst = false, isLast = false) {
  if (source.isCurrentInput) return 'CURRENT_INPUT';
  if (source.isOfficial && source.stance === 'SUPPORTS') return 'ORIGINAL';
  if (source.sourceType === 'SOCIAL_MEDIA' || source.isSocial) return 'SOCIAL_POST';
  if (source.isSyndicatedDuplicate) return 'REPOST';
  if (source.isWire) return 'SOURCE';
  if (isFirst) return 'SOURCE';
  return 'ARTICLE';
}

/**
 * Main Provenance Investigation Engine
 * Builds deterministic provenance graph, analyzes first-known appearance,
 * detects duplicates, and derives spread patterns.
 */
function analyzeContentProvenance({
  claims = [],
  sources = [],
  mediaAnalysis = null,
  inputSource = '',
  inputType = 'TEXT',
  extractedText = ''
}) {
  const rawSources = Array.isArray(sources) ? [...sources] : [];

  // If zero sources provided, explicitly return PROVENANCE INSUFFICIENT
  if (rawSources.length === 0) {
    const inputNodeId = 'prov_node_input_current';
    const inputContentHash = computeContentHash(extractedText || inputSource);
    const inputMediaHash = mediaAnalysis?.file?.sha256 || null;

    const fallbackInputNode = {
      id: inputNodeId,
      url: canonicalizeUrl(inputSource.startsWith('http') ? inputSource : ''),
      domain: inputSource.startsWith('http') ? (new URL(inputSource).hostname.replace(/^www\./, '')) : 'current-submission',
      timestamp: new Date().toISOString(),
      discoveredAt: new Date().toISOString(),
      contentHash: inputContentHash,
      mediaHash: inputMediaHash,
      sourceRelationship: 'CURRENT_INPUT',
      nodeType: 'CURRENT_INPUT',
      confidence: 100,
      isFirstKnownAppearance: false,
      sequenceOrder: 1,
      title: inputSource || 'Current Input Payload',
      publisher: 'Current Input'
    };

    return {
      originAnalysis: {
        originStatus: 'PROVENANCE_INSUFFICIENT',
        originConfidence: 0,
        originPublisher: 'Unknown',
        originDomain: null,
        originUrl: null,
        originTimestamp: null,
        rationale: 'PROVENANCE INSUFFICIENT: No discoverable timestamped origin evidence or external publication records could be identified.'
      },
      firstKnownAppearance: null,
      timeline: [],
      graph: {
        nodes: [fallbackInputNode],
        edges: [],
        lineagePath: ['CURRENT_INPUT']
      },
      duplicateClusters: [],
      spreadAnalysis: {
        repostCount: 0,
        distinctDomainsCount: 0,
        domainsInvolved: [],
        chronologicalPropagation: [],
        velocityScore: 'NONE',
        amplificationPattern: 'LIMITED_CIRCULATION',
        coordinationAssessment: {
          pattern: 'UNSUPPORTED',
          confidence: 0,
          rationale: 'Insufficient propagation evidence to assess coordination or amplification.'
        }
      },
      propagationMetrics: {
        totalDiscoveredVenues: 0,
        syndicatedCopyCount: 0,
        modifiedCopyCount: 0,
        velocityTrend: 'ISOLATED_DISTRIBUTION'
      }
    };
  }

  // 1. Tag duplicates and group into independent clusters
  const clusterRes = clusterAndTagDuplicates(rawSources);
  const taggedSources = clusterRes.sources;

  // 2. Enrich sources with timestamps, domains, platforms, and metadata
  const enrichedSources = taggedSources.map((s, idx) => {
    const timestamp = extractTimestamp(s);
    const domain = (s.domain || '').toLowerCase().replace(/^www\./, '');
    const publication = s.publication || derivePublicationName(domain);
    const isOfficial = s.authorityRank === 1 || /\.(gov|edu)(\.[a-z]{2})?$/i.test(domain) || KNOWN_PUBLICATIONS[domain]?.rank === 1;
    const isSocial = s.sourceType === 'SOCIAL_MEDIA' || domain.includes('x.com') || domain.includes('telegram') || domain.includes('facebook') || domain.includes('whatsapp') || domain.includes('tiktok');
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

  // 3. Chronological sorting: known timestamp earliest first, then by authority rank
  enrichedSources.sort((a, b) => {
    if (a.timestamp && b.timestamp) return a.timestamp - b.timestamp;
    if (a.timestamp && !b.timestamp) return -1;
    if (!a.timestamp && b.timestamp) return 1;
    return (a.authorityRank || 3) - (b.authorityRank || 3);
  });

  // 4. Identify First-Known Appearance vs Confirmed Origin
  const officialSource = enrichedSources.find(s => s.isOfficial && s.stance === 'SUPPORTS');
  const earliestDiscoveredSource = enrichedSources[0] || null;

  let originStatus = 'PROVENANCE_INSUFFICIENT';
  let originConfidence = 20;
  let originPublisher = 'Unknown';
  let originDomain = null;
  let originUrl = null;
  let originRationale = 'PROVENANCE INSUFFICIENT: Unable to establish conclusive lineage from available web evidence.';
  let isFirstKnownAppearanceDetermined = false;

  if (officialSource) {
    originStatus = 'CONFIRMED_ORIGIN';
    originConfidence = 95;
    originPublisher = officialSource.publication;
    originDomain = officialSource.domain;
    originUrl = officialSource.url;
    originRationale = `Confirmed first-party statutory origin: ${officialSource.publication} (${officialSource.domain}) is the official authoritative issuing body.`;
  } else if (earliestDiscoveredSource && earliestDiscoveredSource.authorityRank <= 2) {
    originStatus = 'FIRST_KNOWN_APPEARANCE';
    originConfidence = 80;
    originPublisher = earliestDiscoveredSource.publication;
    originDomain = earliestDiscoveredSource.domain;
    originUrl = earliestDiscoveredSource.url;
    originRationale = `FIRST KNOWN APPEARANCE: Earliest documented report discovered on ${earliestDiscoveredSource.domain} (${earliestDiscoveredSource.publication}). System designates this as earliest known appearance based on available indexed records without claiming absolute first creator.`;
    isFirstKnownAppearanceDetermined = true;
  } else if (earliestDiscoveredSource) {
    originStatus = 'FIRST_KNOWN_APPEARANCE';
    originConfidence = 55;
    originPublisher = earliestDiscoveredSource.publication;
    originDomain = earliestDiscoveredSource.domain;
    originUrl = earliestDiscoveredSource.url;
    originRationale = `FIRST KNOWN APPEARANCE: Surfaced on ${earliestDiscoveredSource.domain}, representing the earliest known entry point in current index. Certainty is limited.`;
    isFirstKnownAppearanceDetermined = true;
  }

  // 5. Build Graph Nodes & Edges
  const nodes = [];
  const edges = [];
  const timeline = [];

  enrichedSources.forEach((src, idx) => {
    const isFirst = idx === 0;
    const prevSrc = idx > 0 ? enrichedSources[idx - 1] : null;
    const modifications = detectModifications(src, prevSrc);
    const nodeId = `prov_node_${idx + 1}_${src.domain.replace(/[^a-z0-9]/gi, '_')}`;
    const nodeType = mapNodeType(src, isFirst, false);
    const isNodeFirstKnown = isFirst && (originStatus === 'FIRST_KNOWN_APPEARANCE' || originStatus === 'CONFIRMED_ORIGIN');

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
      description = `Authoritative statutory origin published by ${src.publication}.`;
    } else if (eventType === 'FIRST_DISCOVERED_APPEARANCE') {
      description = `FIRST KNOWN APPEARANCE surfaced via ${src.platform} (${src.publication}).`;
    } else if (eventType === 'OFFICIAL_DEBUNK') {
      description = `Official statutory debunk issued by ${src.publication}: ${src.snippet || 'Factual contradiction confirmed'}.`;
    } else if (eventType === 'VIRAL_PROPAGATION') {
      description = `Unverified claim recirculated across ${src.platform}.`;
    }

    const nodeObj = {
      id: nodeId,
      url: src.canonicalUrl || canonicalizeUrl(src.url || ''),
      domain: src.domain,
      timestamp: src.timestamp ? src.timestamp.toISOString() : null,
      discoveredAt: new Date().toISOString(),
      contentHash: src.contentHash || computeContentHash(`${src.title || ''} ${src.snippet || ''}`),
      mediaHash: src.mediaHash || null,
      sourceRelationship: eventType,
      nodeType,
      confidence: src.authorityScore || (src.isOfficial ? 95 : (src.authorityRank === 2 ? 80 : 60)),
      isFirstKnownAppearance: isNodeFirstKnown,
      sequenceOrder: idx + 1,
      title: src.title || `${src.publication} Report`,
      publisher: src.publication,
      isSyndicatedDuplicate: Boolean(src.isSyndicatedDuplicate),
      independenceGroup: src.independenceGroup || 'indep_default'
    };
    nodes.push(nodeObj);

    // Create edge from previous node
    if (prevSrc && nodes[idx - 1]) {
      const prevNode = nodes[idx - 1];
      let timeDeltaHours = null;
      if (src.timestamp && prevSrc.timestamp) {
        timeDeltaHours = Math.max(0, Math.round(((src.timestamp - prevSrc.timestamp) / (1000 * 60 * 60)) * 10) / 10);
      }

      let relType = 'PROPAGATION';
      if (src.isSyndicatedDuplicate) relType = 'SYNDICATION';
      else if (src.isSocial) relType = 'AMPLIFICATION';
      else if (modifications.length > 0) relType = 'MODIFICATION';
      else if (src.isWire) relType = 'QUOTE_ATTRIBUTION';

      edges.push({
        id: `prov_edge_${idx}`,
        fromNodeId: prevNode.id,
        toNodeId: nodeId,
        relationshipType: relType,
        timeDeltaHours,
        confidence: 85,
        notes: modifications.length > 0 ? modifications.join('; ') : `Lineage hop from ${prevNode.publisher} to ${src.publication}`
      });
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
      isFirstKnownAppearance: isNodeFirstKnown,
      hasModifications: modifications.length > 0,
      modifications
    });
  });

  // Append Current Input node at the tail of graph
  const inputNodeId = 'prov_node_current_input';
  const lastSourceNode = nodes[nodes.length - 1];
  const inputNode = {
    id: inputNodeId,
    url: canonicalizeUrl(inputSource.startsWith('http') ? inputSource : ''),
    domain: inputSource.startsWith('http') ? (new URL(inputSource).hostname.replace(/^www\./, '')) : 'current-user-input',
    timestamp: new Date().toISOString(),
    discoveredAt: new Date().toISOString(),
    contentHash: computeContentHash(extractedText || inputSource),
    mediaHash: mediaAnalysis?.file?.sha256 || null,
    sourceRelationship: 'CURRENT_INPUT',
    nodeType: 'CURRENT_INPUT',
    confidence: 100,
    isFirstKnownAppearance: false,
    sequenceOrder: nodes.length + 1,
    title: inputSource || 'Current Input Payload',
    publisher: 'Submitted Payload'
  };
  nodes.push(inputNode);

  if (lastSourceNode) {
    edges.push({
      id: `prov_edge_to_input`,
      fromNodeId: lastSourceNode.id,
      toNodeId: inputNodeId,
      relationshipType: 'DERIVATIVE',
      timeDeltaHours: null,
      confidence: 90,
      notes: 'Lineage termination at currently verified submission payload'
    });
  }

  // 6. Spread & Amplification Analysis
  const distinctDomains = Array.from(new Set(enrichedSources.map(s => s.domain).filter(Boolean)));
  const syndicatedCount = enrichedSources.filter(s => s.isSyndicatedDuplicate).length;
  const modifiedCount = timeline.filter(t => t.hasModifications).length;

  // Chronological spread breakdown (time bins)
  const timestampsWithValidDates = enrichedSources.filter(s => s.timestamp).map(s => s.timestamp);
  let propagationSpanHours = 0;
  if (timestampsWithValidDates.length >= 2) {
    const minTime = Math.min(...timestampsWithValidDates.map(d => d.getTime()));
    const maxTime = Math.max(...timestampsWithValidDates.map(d => d.getTime()));
    propagationSpanHours = Math.max(0.1, (maxTime - minTime) / (1000 * 60 * 60));
  }

  // Coordinated Reposting Detection Heuristics (Rule: Avoid unsubstantiated "coordinated campaign" labels)
  const rapidRepublishSources = enrichedSources.filter((s, idx) => {
    if (idx === 0) return false;
    const prev = enrichedSources[idx - 1];
    if (s.timestamp && prev.timestamp) {
      const diffMinutes = (s.timestamp - prev.timestamp) / (1000 * 60);
      return diffMinutes <= 30 && s.authorityRank >= 3 && prev.authorityRank >= 3;
    }
    return false;
  });

  let coordinationPattern = 'UNSUPPORTED';
  let coordinationConfidence = 15;
  let coordinationRationale = 'Observed diffusion timeline is consistent with standard organic press syndication or decentralized web reporting.';

  if (rapidRepublishSources.length >= 4 && distinctDomains.length >= 5 && syndicatedCount >= 3) {
    coordinationPattern = 'MEDIUM';
    coordinationConfidence = 65;
    coordinationRationale = `High-velocity synchronized republication observed across ${rapidRepublishSources.length} low-authority domains within a tight temporal window, suggesting potential coordinated amplification.`;
  } else if (rapidRepublishSources.length >= 2) {
    coordinationPattern = 'LOW';
    coordinationConfidence = 35;
    coordinationRationale = 'Minor rapid republishing detected across a small number of domains; evidence is insufficient to conclude coordinated campaign activity.';
  }

  // Amplification Pattern
  let amplificationPattern = 'LIMITED_CIRCULATION';
  if (distinctDomains.length >= 6) {
    amplificationPattern = coordinationPattern === 'MEDIUM' ? 'COORDINATED_AMPLIFICATION_SUSPECTED' : 'VIRAL_ACCELERATION';
  } else if (distinctDomains.length >= 3) {
    amplificationPattern = 'ORGANIC_DIFFUSION';
  }

  const spreadAnalysis = {
    repostCount: syndicatedCount,
    distinctDomainsCount: distinctDomains.length,
    domainsInvolved: distinctDomains,
    chronologicalPropagation: timeline.map(t => ({
      sequenceIndex: t.sequenceIndex,
      timeLabel: t.timeLabel,
      domain: t.domain,
      platform: t.platform,
      eventType: t.eventType
    })),
    propagationSpanHours: Math.round(propagationSpanHours * 10) / 10,
    amplificationPattern,
    coordinationAssessment: {
      pattern: coordinationPattern,
      confidence: coordinationConfidence,
      rationale: coordinationRationale
    }
  };

  const firstKnownAppearancePayload = isFirstKnownAppearanceDetermined ? {
    publisher: originPublisher,
    domain: originDomain,
    url: originUrl,
    timestamp: timeline[0]?.timestamp || null,
    confidence: originConfidence,
    status: 'FIRST_KNOWN_APPEARANCE',
    terminologyNote: 'FIRST KNOWN APPEARANCE denotes the earliest discoverable entry point in available indexing records. It does not imply certified original creator status.'
  } : null;

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
    firstKnownAppearance: firstKnownAppearancePayload,
    timeline,
    graph: {
      nodes,
      edges,
      lineagePath: nodes.map(n => n.nodeType)
    },
    duplicateClusters: clusterRes.clusters,
    spreadAnalysis,
    propagationMetrics: {
      totalDiscoveredVenues: distinctDomains.length,
      syndicatedCopyCount: syndicatedCount,
      modifiedCopyCount: modifiedCount,
      velocityTrend: distinctDomains.length > 3 ? 'RAPID_VIRAL' : 'ISOLATED_DISTRIBUTION'
    }
  };
}

module.exports = {
  analyzeContentProvenance,
  extractTimestamp,
  formatTimeLabel,
  detectModifications,
  mapNodeType
};
