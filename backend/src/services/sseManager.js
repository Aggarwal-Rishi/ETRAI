const { dbService, prisma } = require('../utils/prisma');
const { compactReportMediaPayload } = require('../utils/reportMediaPayload');

const activeStreams = new Map(); // jobId -> Set of express res streams
const activeJobs = new Map(); // jobId -> process-local current state object (userId, status, progress, step, reportData, createdAt, updatedAt)
const persistenceInFlight = new Set();

function parseDurationMs(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

const MAX_JOB_STALL_MS = parseDurationMs(process.env.JOB_STALL_TIMEOUT_MS, 4 * 60 * 1000, 60 * 1000, 30 * 60 * 1000);
const MAX_JOB_LIFETIME_MS = parseDurationMs(process.env.JOB_MAX_LIFETIME_MS, 15 * 60 * 1000, 2 * 60 * 1000, 60 * 60 * 1000);

function getJobTimeoutReason(job, now = Date.now(), stallMs = MAX_JOB_STALL_MS, lifetimeLimitMs = MAX_JOB_LIFETIME_MS) {
  const parsedCreatedAt = job?.createdAt ? new Date(job.createdAt).getTime() : now;
  const createdAt = Number.isFinite(parsedCreatedAt) ? parsedCreatedAt : now;
  const parsedUpdatedAt = job?.updatedAt ? new Date(job.updatedAt).getTime() : createdAt;
  const updatedAt = Number.isFinite(parsedUpdatedAt) ? parsedUpdatedAt : createdAt;
  const idleMs = Math.max(0, now - updatedAt);
  const lifetimeMs = Math.max(0, now - createdAt);
  if (idleMs > stallMs) return `no progress update for ${Math.round(idleMs / 1000)} seconds`;
  if (lifetimeMs > lifetimeLimitMs) {
    return `the ${Math.round(lifetimeLimitMs / 60000)}-minute absolute safety limit was reached`;
  }
  return null;
}

function buildCoreAnalysisData(jobId, job) {
  const rawReport = job?.reportData;
  let report = rawReport;
  if (typeof report === 'string') {
    try { report = JSON.parse(report); } catch (_) { report = null; }
  }
  if (!report || typeof report !== 'object' || !job?.userId) return null;
  const score = Number(report.scores?.overallTrustScore ?? report.explainableScoring?.finalTrustScore ?? report.factualAccuracyScore);
  const trustScore = Number.isFinite(score) ? score : 50;
  const inputType = String(report.inputType || report.mediaAnalysis?.mediaType || 'TEXT');
  return {
    id: jobId,
    userId: job.userId,
    title: report.sourceTitle || report.title || `Verification report ${jobId}`,
    inputType,
    inputSource: report.inputSource || report.sourceUrl || report.sourceTitle || 'Submitted content',
    selectedTypes: JSON.stringify(report.selectedTypes || ['FACT_CHECKING']),
    status: 'COMPLETED',
    summary: report.summary || 'Verification completed successfully.',
    overallMetrics: JSON.stringify(report.scores || {}),
    reportData: JSON.stringify(report),
    truncated: Boolean(report.truncated),
    runVersion: 1,
    tokensConsumed: Number(report.observability?.totalTokens || 0),
    costUsd: Number(report.observability?.estimatedCostUsd || 0),
    trustScore,
    verdict: report.verdict || (trustScore >= 75 ? 'Real' : trustScore >= 40 ? 'Suspicious' : 'Fake')
  };
}

async function ensureCompletedJobPersisted(jobId, job, database = prisma, options = {}) {
  if (!database || job?.status !== 'COMPLETED' || !job?.reportData || !job?.userId) return false;
  if (persistenceInFlight.has(jobId)) return false;
  const coreData = buildCoreAnalysisData(jobId, job);
  if (!coreData) return false;
  const attempts = Math.max(1, Math.min(Number(options.attempts || 3), 5));
  const retryDelays = Array.isArray(options.retryDelays) ? options.retryDelays : [0, 1500, 4000];
  persistenceInFlight.add(jobId);
  try {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const existing = await database.analysis.findUnique({ where: { id: jobId }, select: { id: true } });
        if (existing) return true;
        await database.analysis.create({ data: coreData });
        return true;
      } catch (error) {
        if (error?.code === 'P2002') return true;
        if (attempt === attempts - 1) {
          console.error(`[SSE Persistence Recovery]: Could not preserve completed job ${jobId}: ${error.message}`);
          return false;
        }
        const delay = Number(retryDelays[attempt + 1] ?? 1000);
        if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    return false;
  } finally {
    persistenceInFlight.delete(jobId);
  }
}

// Periodic Watchdog: cleans stalled in-memory jobs and prevents permanent PROCESSING state
const watchdogTimer = setInterval(async () => {
  const now = Date.now();
  for (const [jobId, job] of activeJobs.entries()) {
    if (job.status === 'PROCESSING' || job.status === 'PENDING') {
      const reason = getJobTimeoutReason(job, now);
      if (reason) {
        console.warn(`[SSE Watchdog]: Job ${jobId} stopped because ${reason}. Emitting FAILED state.`);
        
        emitProgress(jobId, {
          status: 'FAILED',
          progress: 100,
          step: 'Verification job stopped because no safe completion signal was received.',
          error: `Verification analysis stopped because ${reason}.`
        });

        // Update database if record exists
        if (prisma && job.userId) {
          try {
            await prisma.analysis.updateMany({
              where: { id: jobId, userId: job.userId, status: 'PENDING' },
              data: {
                status: 'FAILED',
                errorMessage: `Verification analysis stopped because ${reason}.`
              }
            });
          } catch (e) {}
        }
      }
    }
  }
}, 30000);

if (watchdogTimer.unref) watchdogTimer.unref();

/**
 * Register an SSE client connection for a jobId
 * Verifies that requested job/analysis belongs to the authenticated user.
 */
async function registerStream(jobId, res, req, requestingUserId) {
  // 1. Check in-memory activeJobs first
  const memoryJob = activeJobs.get(jobId);

  if (memoryJob) {
    if (memoryJob.userId && requestingUserId && memoryJob.userId !== requestingUserId) {
      return res.status(403).json({ error: 'Access denied. You are not authorized to access this analysis stream.' });
    }
    if (memoryJob.status === 'COMPLETED') {
      void ensureCompletedJobPersisted(jobId, memoryJob);
    }
  } else {
    // 2. Database Fallback: Attempt DB recovery for completed/failed jobs
    try {
      const dbRecord = await dbService.findAnalysisById(jobId, requestingUserId);
      if (!dbRecord) {
        return res.status(403).json({ error: 'Analysis job not found or access denied.' });
      }
      
      // Found in DB for authorized user -> send immediate completed/failed event payload over SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      const payload = {
        jobId,
        userId: requestingUserId,
        status: dbRecord.status === 'COMPLETED' ? 'COMPLETED' : 'FAILED',
        progress: 100,
        step: dbRecord.status === 'COMPLETED' ? 'Analysis report complete' : 'Analysis pipeline execution failed',
        reportData: compactReportMediaPayload(dbRecord.reportData || null),
        error: dbRecord.errorMessage || null
      };

      res.write(`data: ${JSON.stringify(payload)}\n\n`);
      res.end();
      return;
    } catch (e) {
      return res.status(403).json({ error: 'Analysis job not found or access denied.' });
    }
  }

  // 3. Authorized active in-memory job stream connection setup
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  if (!activeStreams.has(jobId)) {
    activeStreams.set(jobId, new Set());
  }
  activeStreams.get(jobId).add(res);

  if (memoryJob) {
    res.write(`data: ${JSON.stringify(memoryJob)}\n\n`);
  } else {
    res.write(`data: ${JSON.stringify({ jobId, userId: requestingUserId, status: 'PENDING', progress: 5, step: 'Initializing verification engine...' })}\n\n`);
  }

  // Setup heartbeat timer every 15 seconds
  const heartbeatInterval = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch (e) {
      clearInterval(heartbeatInterval);
    }
  }, 15000);

  // Clean up on client disconnection
  req.on('close', () => {
    clearInterval(heartbeatInterval);
    const streams = activeStreams.get(jobId);
    if (streams) {
      streams.delete(res);
      if (streams.size === 0) {
        activeStreams.delete(jobId);
      }
    }
  });
}

/**
 * Emit progress update to all clients listening to a jobId
 */
function emitProgress(jobId, update) {
  const currentState = activeJobs.get(jobId) || {
    jobId,
    createdAt: new Date().toISOString()
  };
  const newState = {
    ...currentState,
    ...update,
    updatedAt: new Date().toISOString()
  };
  activeJobs.set(jobId, newState);
  if (newState.status === 'COMPLETED') {
    void ensureCompletedJobPersisted(jobId, newState);
  }

  const streams = activeStreams.get(jobId);
  if (streams) {
    const payload = `data: ${JSON.stringify(newState)}\n\n`;
    for (const res of streams) {
      try {
        res.write(payload);
      } catch (err) {
        streams.delete(res);
      }
    }
  }
}

/**
 * Retrieve current job state (in-memory or DB fallback) for polling recovery
 */
async function getJobState(jobId, requestingUserId) {
  const memoryJob = activeJobs.get(jobId);
  if (memoryJob) {
    if (memoryJob.userId && requestingUserId && memoryJob.userId !== requestingUserId) {
      return null;
    }
    if (memoryJob.status === 'COMPLETED') {
      void ensureCompletedJobPersisted(jobId, memoryJob);
    }
    return memoryJob;
  }

  // Database fallback
  try {
    const dbRecord = await dbService.findAnalysisById(jobId, requestingUserId);
    if (!dbRecord) return null;

    return {
      jobId,
      userId: requestingUserId,
      status: dbRecord.status,
      progress: 100,
      step: dbRecord.status === 'COMPLETED' ? 'Analysis report complete' : 'Analysis pipeline execution failed',
      reportData: compactReportMediaPayload(dbRecord.reportData || null),
      error: dbRecord.errorMessage || null,
      createdAt: dbRecord.createdAt,
      updatedAt: dbRecord.updatedAt
    };
  } catch (e) {
    return null;
  }
}

/**
 * Clear completed job from active state memory
 */
function clearJobState(jobId) {
  activeJobs.delete(jobId);
  activeStreams.delete(jobId);
}

module.exports = {
  registerStream,
  emitProgress,
  getJobState,
  clearJobState,
  getJobTimeoutReason,
  buildCoreAnalysisData,
  ensureCompletedJobPersisted,
  activeJobs
};
