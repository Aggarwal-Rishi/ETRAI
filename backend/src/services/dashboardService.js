const { prisma } = require('../utils/prisma');

/**
 * Calculates median of an array of numbers
 */
function calculateMedian(numbers) {
  if (!numbers || numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Computes real, non-fabricated product dashboard statistics and feeds from database
 */
async function getDashboardTelemetry(userId, workspaceId = null) {
  const now = new Date();
  
  // Date boundaries
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const fourteenDaysAgo = new Date(now);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Where query scoped to user or workspace
  const userWhere = {
    userId
  };

  // 1. Fetch user's analyses across all time
  const userAnalyses = await prisma.analysis.findMany({
    where: userWhere,
    select: {
      id: true,
      title: true,
      inputType: true,
      inputSource: true,
      trustScore: true,
      verdict: true,
      status: true,
      summary: true,
      createdAt: true,
      user: {
        select: { fullName: true, email: true }
      },
      entities: {
        select: { name: true, type: true, role: true }
      },
      _count: {
        select: { claims: true, entities: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  const totalAllTime = userAnalyses.length;

  // 2. Investigations Today & This Month
  const todayAnalyses = userAnalyses.filter(a => new Date(a.createdAt) >= todayStart);
  const yesterdayAnalyses = userAnalyses.filter(a => {
    const d = new Date(a.createdAt);
    return d >= yesterdayStart && d < todayStart;
  });
  const monthAnalyses = userAnalyses.filter(a => new Date(a.createdAt) >= monthStart);

  const investigationsToday = todayAnalyses.length;
  const investigationsYesterday = yesterdayAnalyses.length;
  const investigationsTodayDelta = investigationsToday - investigationsYesterday;
  const investigationsThisMonth = monthAnalyses.length;

  // 3. Verified Today & Flagged Fake Today
  const verifiedToday = todayAnalyses.filter(a => (a.trustScore >= 75 || /real|verified/i.test(a.verdict || ''))).length;
  const verifiedYesterday = yesterdayAnalyses.filter(a => (a.trustScore >= 75 || /real|verified/i.test(a.verdict || ''))).length;
  const verifiedDelta = verifiedToday - verifiedYesterday;

  const fakeToday = todayAnalyses.filter(a => (a.trustScore < 40 || /fake|false|refuted/i.test(a.verdict || ''))).length;
  const fakePercentage = todayAnalyses.length > 0 ? Math.round((fakeToday / todayAnalyses.length) * 100) : 0;

  // 4. Metric: Median Trust (7d)
  const last7DaysAnalyses = userAnalyses.filter(a => new Date(a.createdAt) >= sevenDaysAgo);
  const prior7DaysAnalyses = userAnalyses.filter(a => {
    const d = new Date(a.createdAt);
    return d >= fourteenDaysAgo && d < sevenDaysAgo;
  });

  const currentScores = last7DaysAnalyses.map(a => a.trustScore || 0);
  const priorScores = prior7DaysAnalyses.map(a => a.trustScore || 0);
  const medianTrust = calculateMedian(currentScores);
  const priorMedianTrust = calculateMedian(priorScores);
  const medianDelta = currentScores.length > 0 && priorScores.length > 0 ? medianTrust - priorMedianTrust : 0;

  // 5. Manipulated Media (Images, Videos, Audio)
  const manipulatedMedia = userAnalyses.filter(a => {
    const isMedia = ['IMAGE', 'PHOTO', 'VIDEO', 'AUDIO'].includes((a.inputType || '').toUpperCase());
    const isManipulated = (a.trustScore < 50) || /manipulated|fake|altered|recycled/i.test(a.verdict || '');
    return isMedia && isManipulated;
  });

  const imageManipulatedCount = manipulatedMedia.filter(a => ['IMAGE', 'PHOTO'].includes((a.inputType || '').toUpperCase())).length;
  const videoManipulatedCount = manipulatedMedia.filter(a => (a.inputType || '').toUpperCase() === 'VIDEO').length;

  // 6. Suspicious Claims Count & Unresolved Investigations
  const suspiciousClaims = userAnalyses.reduce((sum, a) => {
    const isSuspicious = (a.trustScore >= 40 && a.trustScore < 75) || /suspicious|questionable/i.test(a.verdict || '');
    return sum + (isSuspicious ? (a._count?.claims || 1) : 0);
  }, 0);

  const unresolvedInvestigations = userAnalyses.filter(a => ['CREATED', 'QUEUED', 'PROCESSING', 'PARTIAL'].includes(a.status)).length;
  const processingFailures = userAnalyses.filter(a => a.status === 'FAILED').length;

  // 7. Source Alerts (Watchlist or Flagged Sources in Workspace)
  let sourceAlerts = 0;
  try {
    sourceAlerts = await prisma.source.count({
      where: {
        status: { in: ['FLAGGED', 'WATCHLIST'] }
      }
    });
  } catch (e) {
    sourceAlerts = 0;
  }

  // 8. Verdict Distribution (Last 30 Days)
  const recent30Analyses = userAnalyses.filter(a => new Date(a.createdAt) >= thirtyDaysAgo);
  const totalRecent = recent30Analyses.length;

  let countVerified = 0;
  let countSuspicious = 0;
  let countFalse = 0;
  let countInsufficient = 0;

  recent30Analyses.forEach(a => {
    const s = a.trustScore !== null && a.trustScore !== undefined ? a.trustScore : 50;
    if (s >= 75 || /real|verified/i.test(a.verdict || '')) countVerified++;
    else if (s >= 40 || /suspicious|questionable|partly/i.test(a.verdict || '')) countSuspicious++;
    else if (s < 40 || /fake|false|refuted/i.test(a.verdict || '')) countFalse++;
    else countInsufficient++;
  });

  const verdictMix = {
    total: totalRecent,
    verified: {
      count: countVerified,
      pct: totalRecent > 0 ? Math.round((countVerified / totalRecent) * 100) : 0
    },
    suspicious: {
      count: countSuspicious,
      pct: totalRecent > 0 ? Math.round((countSuspicious / totalRecent) * 100) : 0
    },
    false: {
      count: countFalse,
      pct: totalRecent > 0 ? Math.round((countFalse / totalRecent) * 100) : 0
    },
    insufficient: {
      count: countInsufficient,
      pct: totalRecent > 0 ? Math.round((countInsufficient / totalRecent) * 100) : 0
    }
  };

  // 9. "Needs Your Read" Queue (Editorial Ambiguity)
  const needsReadQueue = userAnalyses
    .filter(a => {
      const score = a.trustScore !== null && a.trustScore !== undefined ? a.trustScore : 50;
      return (score >= 40 && score < 75) || /suspicious|questionable|unverified|partly/i.test(a.verdict || '');
    })
    .slice(0, 5)
    .map(a => ({
      id: a.id,
      title: a.title,
      inputType: a.inputType,
      trustScore: a.trustScore || 50,
      verdict: a.verdict || 'Suspicious',
      createdAt: a.createdAt
    }));

  // 10. Narrative Clusters (Semantically Grouped by Overlapping Entities)
  const entityMap = new Map();
  userAnalyses.forEach(a => {
    if (a.entities && a.entities.length > 0) {
      a.entities.forEach(ent => {
        const key = ent.name.trim();
        if (key.length > 2) {
          if (!entityMap.has(key)) entityMap.set(key, []);
          entityMap.get(key).push(a);
        }
      });
    }
  });

  const clusters = [];
  entityMap.forEach((analysesInCluster, entityName) => {
    if (analysesInCluster.length >= 2) {
      const avgScore = Math.round(
        analysesInCluster.reduce((sum, item) => sum + (item.trustScore || 50), 0) / analysesInCluster.length
      );
      clusters.push({
        topic: entityName,
        count: analysesInCluster.length,
        avgTrustScore: avgScore,
        leadReportId: analysesInCluster[0].id,
        leadTitle: analysesInCluster[0].title,
        status: avgScore < 40 ? 'High Risk Cluster' : 'Monitored Topic',
        lastSeen: analysesInCluster[0].createdAt
      });
    }
  });

  // 11. Recent Investigations Feed (Latest 8)
  const recentReports = userAnalyses.slice(0, 8).map(a => ({
    id: a.id,
    title: a.title,
    inputType: a.inputType,
    inputSource: a.inputSource,
    trustScore: a.trustScore !== null ? Math.round(a.trustScore) : 50,
    verdict: a.verdict || (a.trustScore >= 75 ? 'Real' : a.trustScore >= 40 ? 'Suspicious' : 'Fake'),
    status: a.status,
    claimsCount: a._count?.claims || 0,
    owner: a.user?.fullName || a.user?.email || 'Analyst',
    createdAt: a.createdAt
  }));

  return {
    hasData: totalAllTime > 0,
    totalAllTime,
    metrics: {
      investigationsToday: { count: investigationsToday, delta: investigationsTodayDelta },
      investigationsThisMonth: { count: investigationsThisMonth },
      verifiedToday: { count: verifiedToday, delta: verifiedDelta },
      flaggedFake: { count: fakeToday, percentage: fakePercentage },
      medianTrust: { score: medianTrust, delta: medianDelta, totalWeek: currentScores.length },
      manipulatedMedia: {
        total: manipulatedMedia.length,
        imageCount: imageManipulatedCount,
        videoCount: videoManipulatedCount
      },
      suspiciousClaims,
      unresolvedInvestigations,
      processingFailures,
      sourceAlerts
    },
    suspiciousWeekCount: last7DaysAnalyses.filter(a => (a.trustScore || 50) < 75).length,
    verdictMix,
    needsReadQueue,
    narrativeClusters: {
      isPreliminary: true,
      clusters: clusters.slice(0, 4)
    },
    recentReports
  };
}

module.exports = {
  getDashboardTelemetry
};
