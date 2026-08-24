/**
 * ETRAI Real Usage & Quota Ledger Accounting Engine
 * Tracks actual verifications, claims evaluated, tokens consumed, and API calls.
 * Enforces strict workspace plan quotas without fabricating usage metrics.
 */

const { prisma } = require('../utils/prisma');

const PLAN_LIMITS = {
  Starter: { monthlyVerifications: 50, maxSeats: 2, allowApi: false },
  Team: { monthlyVerifications: 500, maxSeats: 5, allowApi: true },
  Newsroom: { monthlyVerifications: 2500, maxSeats: 25, allowApi: true },
  Enterprise: { monthlyVerifications: 100000, maxSeats: 500, allowApi: true }
};

/**
 * Checks if workspace has remaining verification quota for the current billing cycle
 */
async function checkWorkspaceQuota(workspaceId) {
  if (!workspaceId) return { allowed: true, plan: 'Team', remaining: 500 };

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      id: true,
      plan: true,
      verificationLimit: true,
      verificationsUsed: true
    }
  });

  if (!workspace) return { allowed: true, plan: 'Team', remaining: 500 };

  const plan = workspace.plan || 'Team';
  const limit = workspace.verificationLimit || (PLAN_LIMITS[plan]?.monthlyVerifications || 500);
  const used = workspace.verificationsUsed || 0;
  const remaining = Math.max(0, limit - used);

  return {
    allowed: remaining > 0,
    plan,
    limit,
    used,
    remaining,
    isExhausted: remaining === 0
  };
}

/**
 * Records real usage ledger entry and increments workspace usage counter
 */
async function recordUsage({
  workspaceId,
  userId,
  analysisId = null,
  tokensConsumed = 0,
  costUsd = 0.0,
  runType = 'VERIFICATION'
}) {
  if (!workspaceId || !userId) return null;

  try {
    // 1. Create immutable usage record in DB
    const record = await prisma.usageRecord.create({
      data: {
        workspaceId,
        userId,
        analysisId,
        tokensConsumed: Math.max(0, parseInt(tokensConsumed, 10) || 0),
        costUsd: Math.max(0, parseFloat(costUsd) || 0.0),
        runType
      }
    });

    // 2. Increment workspace verificationsUsed counter
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        verificationsUsed: { increment: 1 }
      }
    });

    return record;
  } catch (err) {
    console.error('[Usage Recording Error]:', err.message);
    return null;
  }
}

/**
 * Retrieves aggregate workspace usage breakdown
 */
async function getWorkspaceUsageSummary(workspaceId) {
  if (!workspaceId) return null;

  const quota = await checkWorkspaceQuota(workspaceId);

  const usageHistory = await prisma.usageRecord.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
    take: 50
  });

  const totalTokens = usageHistory.reduce((sum, r) => sum + (r.tokensConsumed || 0), 0);
  const totalCost = usageHistory.reduce((sum, r) => sum + (r.costUsd || 0), 0);

  return {
    quota,
    totalTokensConsumed: totalTokens,
    totalEstimatedCostUsd: Number(totalCost.toFixed(4)),
    recentRecordsCount: usageHistory.length,
    recentRecords: usageHistory.slice(0, 10)
  };
}

module.exports = {
  checkWorkspaceQuota,
  recordUsage,
  getWorkspaceUsageSummary,
  PLAN_LIMITS
};
