const { dbService, prisma } = require('../utils/prisma');
const { compactReportMediaPayload } = require('../utils/reportMediaPayload');

const activeStreams = new Map(); // jobId -> Set of express res streams
const activeJobs = new Map(); // jobId -> process-local current state object (userId, status, progress, step, reportData, createdAt, updatedAt)

const MAX_JOB_STALL_MS = 180 * 1000; // 3 minutes timeout

// Periodic Watchdog: cleans stalled in-memory jobs and prevents permanent PROCESSING state
const watchdogTimer = setInterval(async () => {
  const now = Date.now();
  for (const [jobId, job] of activeJobs.entries()) {
    if (job.status === 'PROCESSING' || job.status === 'PENDING') {
      const createdTime = job.createdAt ? new Date(job.createdAt).getTime() : now;
      if (now - createdTime > MAX_JOB_STALL_MS) {
        console.warn(`[SSE Watchdog]: Job ${jobId} timed out after ${MAX_JOB_STALL_MS / 1000}s. Emitting FAILED state.`);
        
        emitProgress(jobId, {
          status: 'FAILED',
          progress: 100,
          step: 'Verification job timed out due to worker inactivity.',
          error: 'Verification analysis job exceeded maximum allowable execution time (180s).'
        });

        // Update database if record exists
        if (prisma && job.userId) {
          try {
            await prisma.analysis.updateMany({
              where: { id: jobId, userId: job.userId, status: 'PENDING' },
              data: {
                status: 'FAILED',
                errorMessage: 'Job timed out after 180 seconds.'
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
  activeJobs
};
