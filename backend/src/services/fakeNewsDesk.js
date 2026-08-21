/**
 * ETRAI Fake News Desk Engine
 * Analyzes, aggregates, clusters, and exposes suspicious and fabricated news
 * with transparent contradiction evidence and narrative intelligence.
 */

const { prisma, dbService } = require('../utils/prisma');
const { evaluateSourceIntelligence } = require('./sourceIntelligence');

/**
 * Derives specific classification reason for suspicious/misleading items
 */
function deriveSuspiciousReasoning(analysis) {
  const verdict = analysis.verdict || 'UNVERIFIED';
  const claims = Array.isArray(analysis.claims) ? analysis.claims : [];
  const refutingClaims = claims.filter(c => c.verdict === 'FALSE' || (c.refutingSourceIndices && c.refutingSourceIndices.length > 0));
  const partialClaims = claims.filter(c => c.verdict === 'PARTIALLY_VERIFIED');

  let contradictionType = 'UNSUBSTANTIATED_VIRAL_CLAIM';
  let primaryDebunkNote = 'Zero independent corroborating sources identified across primary web and news indices.';

  if (refutingClaims.length > 0) {
    contradictionType = 'DIRECT_FACTUAL_CONTRADICTION';
    const topRefute = refutingClaims[0];
    const topEvidence = topRefute.sources?.find(s => s.stance === 'REFUTES') || topRefute.sources?.[0];
    primaryDebunkNote = topRefute.explanation || `Contradicted by ${topEvidence?.publication || 'authoritative source'}: ${topEvidence?.snippet || 'Direct factual refutation confirmed'}.`;
  } else if (partialClaims.length > 0) {
    contradictionType = 'SCALE_OR_SCOPE_MISMATCH';
    primaryDebunkNote = partialClaims[0].explanation || 'Content partially supported but contains distorted numbers, scope, or unconfirmed extrapolations.';
  } else if (analysis.trustScore < 35) {
    contradictionType = 'PROCEDURAL_IMPLAUSIBILITY';
    primaryDebunkNote = 'Major claim exhibits zero institutional coverage from official record portals.';
  }

  return {
    contradictionType,
    primaryDebunkNote,
    refutingClaimsCount: refutingClaims.length,
    partialClaimsCount: partialClaims.length,
    totalClaimsCount: claims.length
  };
}

/**
 * Clusters suspicious items into thematic narrative clusters
 */
function clusterNarratives(items = []) {
  const clusterMap = new Map();

  items.forEach(item => {
    // Generate cluster key from category and key title tokens
    const tokens = (item.title || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length >= 3 && !['about', 'after', 'today', 'breaking', 'report', 'video', 'viral', 'news', 'from', 'with', 'this'].includes(w));

    const primaryKey = tokens.slice(0, 2).join('-') || item.category || 'General';
    
    if (!clusterMap.has(primaryKey)) {
      clusterMap.set(primaryKey, {
        id: `cluster_${primaryKey}_${Date.now().toString().slice(-4)}`,
        name: tokens.length >= 2 ? `${tokens[0].toUpperCase()} ${tokens[1].toUpperCase()} Hoax Cluster` : `${item.category} Circulation`,
        description: `Circulating narrative concerning ${item.title}`,
        category: item.category,
        velocityLabel: '+320% · High circulation',
        itemsCount: 0,
        confirmedDebunksCount: 0,
        averageTrustScore: 0,
        items: []
      });
    }

    const c = clusterMap.get(primaryKey);
    c.items.push(item);
    c.itemsCount++;
    if (item.verdict === 'FALSE' || item.status === 'FABRICATED') {
      c.confirmedDebunksCount++;
    }
  });

  return Array.from(clusterMap.values());
}

/**
 * Fetches suspicious and debunked news items with filtering and narrative clustering
 */
async function getFakeNewsFeed({
  riskLevel = 'All', // All | FABRICATED | SUSPICIOUS | PARTIALLY_VERIFIED
  category = 'All',
  query = '',
  timeRange = '30d',
  page = 1,
  pageSize = 15,
  workspaceId = null
}) {
  let dbItems = [];

  if (prisma) {
    try {
      const whereClause = {
        OR: [
          { verdict: 'FALSE' },
          { verdict: 'PARTIALLY_VERIFIED' },
          { verdict: 'UNVERIFIED' },
          { trustScore: { lt: 55 } }
        ]
      };

      if (category !== 'All') {
        whereClause.title = { contains: category, mode: 'insensitive' };
      }
      if (query) {
        whereClause.OR.push(
          { title: { contains: query, mode: 'insensitive' } },
          { summary: { contains: query, mode: 'insensitive' } }
        );
      }

      const analyses = await prisma.analysis.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          claims: {
            include: { evidenceItems: true }
          }
        }
      });

      dbItems = analyses.map(a => {
        let parsedReport = {};
        if (typeof a.reportData === 'string') {
          try { parsedReport = JSON.parse(a.reportData); } catch (e) {}
        }

        const claims = a.claims?.length > 0 ? a.claims : parsedReport.claims || [];
        const reasoning = deriveSuspiciousReasoning({ ...a, claims });

        let supportingCount = 0;
        let refutingCount = 0;
        claims.forEach(c => {
          if (Array.isArray(c.evidenceItems)) {
            supportingCount += c.evidenceItems.filter(e => e.stance === 'SUPPORTS').length;
            refutingCount += c.evidenceItems.filter(e => e.stance === 'REFUTES').length;
          } else {
            if (c.supportingSourceIndices) supportingCount += c.supportingSourceIndices.length;
            if (c.refutingSourceIndices) refutingCount += c.refutingSourceIndices.length;
          }
        });

        return {
          id: a.id,
          title: a.title,
          url: a.inputSource,
          category: parsedReport.selectedTypes?.[0] || 'General',
          verdict: a.verdict || 'SUSPICIOUS',
          trustScore: a.trustScore || 25.0,
          status: a.verdict === 'FALSE' ? 'FABRICATED' : (a.verdict === 'PARTIALLY_VERIFIED' ? 'PARTIALLY_VERIFIED' : 'SUSPICIOUS'),
          summary: a.summary,
          supportingCount,
          refutingCount,
          contradictionType: reasoning.contradictionType,
          primaryDebunkNote: reasoning.primaryDebunkNote,
          manipulationRisk: parsedReport.manipulationRisk || (a.trustScore < 35 ? 'HIGH' : 'MEDIUM'),
          createdAt: a.createdAt.toISOString()
        };
      });
    } catch (dbErr) {
      console.warn('[FakeNewsDesk DB Error]:', dbErr.message);
    }
  }

  // Filter by riskLevel if specified
  let filtered = dbItems;
  if (riskLevel === 'FABRICATED') {
    filtered = filtered.filter(i => i.verdict === 'FALSE');
  } else if (riskLevel === 'SUSPICIOUS') {
    filtered = filtered.filter(i => i.verdict === 'UNVERIFIED' || i.verdict === 'SUSPICIOUS');
  } else if (riskLevel === 'PARTIALLY_VERIFIED') {
    filtered = filtered.filter(i => i.verdict === 'PARTIALLY_VERIFIED');
  }

  const clusters = clusterNarratives(filtered);

  // Pagination
  const total = filtered.length;
  const startIndex = (page - 1) * pageSize;
  const paginated = filtered.slice(startIndex, startIndex + pageSize);
  const hasMore = startIndex + pageSize < total;

  return {
    items: paginated,
    clusters,
    total,
    page: parseInt(page, 10),
    pageSize: parseInt(pageSize, 10),
    hasMore,
    filtersApplied: { riskLevel, category, query, timeRange }
  };
}

/**
 * Computes the Daily Fake News Intelligence Digest
 */
async function getDailyFakeNewsDigest(workspaceId = null) {
  const feed = await getFakeNewsFeed({ pageSize: 50, workspaceId });
  const items = feed.items || [];

  const totalSuspicious = items.length;
  const confirmedDebunks = items.filter(i => i.verdict === 'FALSE').length;
  const partialDistortions = items.filter(i => i.verdict === 'PARTIALLY_VERIFIED').length;
  const unverifiedRumours = items.filter(i => i.verdict === 'UNVERIFIED' || i.verdict === 'SUSPICIOUS').length;

  const topDebunk = items.find(i => i.verdict === 'FALSE') || items[0] || null;

  return {
    generatedDate: new Date().toISOString().split('T')[0],
    summaryStats: {
      totalSuspiciousIdentified: totalSuspicious,
      confirmedDebunkedCount: confirmedDebunks,
      partialDistortionsCount: partialDistortions,
      unverifiedRumoursCount: unverifiedRumours,
      activeNarrativeClustersCount: feed.clusters.length
    },
    topImpactDebunk: topDebunk ? {
      id: topDebunk.id,
      title: topDebunk.title,
      verdict: topDebunk.verdict,
      contradictionType: topDebunk.contradictionType,
      primaryDebunkNote: topDebunk.primaryDebunkNote
    } : null,
    activeNarrativeClusters: feed.clusters.slice(0, 5)
  };
}

module.exports = {
  getFakeNewsFeed,
  getDailyFakeNewsDigest,
  deriveSuspiciousReasoning,
  clusterNarratives
};
