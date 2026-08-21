const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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
 * Computes real dashboard statistics and feeds from database
 */
async function getDashboardTelemetry(userId) {
  const now = new Date();
  
  // Date boundaries
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const fourteenDaysAgo = new Date(now);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // 1. Fetch user's analyses across all time/recent windows
  const userAnalyses = await prisma.analysis.findMany({
    where: {
      userId,
      status: 'COMPLETED'
    },
    select: {
      id: true,
      title: true,
      inputType: true,
      inputSource: true,
      trustScore: true,
      verdict: true,
      createdAt: true,
      entities: {
        select: { name: true, category: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  // 2. Metric: Verified Today & Delta
  const todayAnalyses = userAnalyses.filter(a => new Date(a.createdAt) >= todayStart);
  const yesterdayAnalyses = userAnalyses.filter(a => {
    const d = new Date(a.createdAt);
    return d >= yesterdayStart && d < todayStart;
  });

  const verifiedToday = todayAnalyses.filter(a => (a.trustScore >= 75 || /real|verified/i.test(a.verdict || ''))).length;
  const verifiedYesterday = yesterdayAnalyses.filter(a => (a.trustScore >= 75 || /real|verified/i.test(a.verdict || ''))).length;
  const verifiedDelta = verifiedToday - verifiedYesterday;

  // 3. Metric: Flagged Fake Today
  const fakeToday = todayAnalyses.filter(a => (a.trustScore < 40 || /fake|false|refuted/i.test(a.verdict || ''))).length;
  const fakePercentage = todayAnalyses.length > 0 ? Math.round((fakeToday / todayAnalyses.length) * 100) : 0;

  // 4. Metric: Median Trust (Last 7 Days vs Prior 7 Days)
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

  // 5. Metric: Manipulated Media (Images & Videos)
  const manipulatedMedia = userAnalyses.filter(a => {
    const isMedia = ['IMAGE', 'VIDEO'].includes((a.inputType || '').toUpperCase());
    const isManipulated = (a.trustScore < 50) || /manipulated|fake|altered|recycled/i.test(a.verdict || '');
    return isMedia && isManipulated;
  });

  const imageManipulatedCount = manipulatedMedia.filter(a => (a.inputType || '').toUpperCase() === 'IMAGE').length;
  const videoManipulatedCount = manipulatedMedia.filter(a => (a.inputType || '').toUpperCase() === 'VIDEO').length;

  // 6. Suspicious in last 7 days (Contextual greeting)
  const suspiciousWeekCount = last7DaysAnalyses.filter(a => {
    const score = a.trustScore || 0;
    return (score >= 40 && score < 75) || /suspicious|questionable|partly/i.test(a.verdict || '');
  }).length;

  // 7. Verdict Mix (Distribution over last 30 days)
  const recent30Analyses = userAnalyses.filter(a => new Date(a.createdAt) >= thirtyDaysAgo);
  const totalRecent = recent30Analyses.length;

  let countVerified = 0;
  let countSuspicious = 0;
  let countFalse = 0;
  let countInsufficient = 0;

  recent30Analyses.forEach(a => {
    const s = a.trustScore !== null && a.trustScore !== undefined ? a.trustScore : 50;
    if (s >= 75) countVerified++;
    else if (s >= 40) countSuspicious++;
    else if (s < 40) countFalse++;
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

  // 8. "Needs Your Read" Queue (Suspicious / Ambiguous Cases)
  const needsReadQueue = userAnalyses
    .filter(a => {
      const score = a.trustScore !== null && a.trustScore !== undefined ? a.trustScore : 50;
      return (score >= 40 && score < 75) || /suspicious|questionable|unverified|partly/i.test(a.verdict || '');
    })
    .slice(0, 4)
    .map(a => ({
      id: a.id,
      title: a.title,
      inputType: a.inputType,
      trustScore: a.trustScore || 50,
      verdict: a.verdict || 'Suspicious',
      createdAt: a.createdAt
    }));

  // 9. Narrative Clusters (Grouped by common entity names / shared keywords)
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

  // 10. Recent Reports Feed (Latest 6)
  const recentReports = userAnalyses.slice(0, 6).map(a => ({
    id: a.id,
    title: a.title,
    inputType: a.inputType,
    inputSource: a.inputSource,
    trustScore: a.trustScore !== null ? Math.round(a.trustScore) : 50,
    verdict: a.verdict || (a.trustScore >= 75 ? 'Real' : a.trustScore >= 40 ? 'Suspicious' : 'Fake'),
    createdAt: a.createdAt
  }));

  return {
    metrics: {
      verifiedToday: { count: verifiedToday, delta: verifiedDelta },
      flaggedFake: { count: fakeToday, percentage: fakePercentage },
      medianTrust: { score: medianTrust, delta: medianDelta, totalWeek: currentScores.length },
      manipulatedMedia: {
        total: manipulatedMedia.length,
        imageCount: imageManipulatedCount,
        videoCount: videoManipulatedCount
      }
    },
    suspiciousWeekCount,
    verdictMix,
    needsReadQueue,
    narrativeClusters: {
      isPreliminary: true, // Clearly tagged as basic entity grouping
      clusters: clusters.slice(0, 4)
    },
    recentReports
  };
}

module.exports = {
  getDashboardTelemetry
};
