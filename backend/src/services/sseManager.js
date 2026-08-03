/**
 * SSE Progress Manager for ETRAI Analysis Pipeline
 */

const activeStreams = new Map(); // jobId -> Set of express res streams
const activeJobs = new Map(); // jobId -> current state object

/**
 * Register an SSE client connection for a jobId
 */
function registerStream(jobId, res, req) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable proxy buffering

  if (!activeStreams.has(jobId)) {
    activeStreams.set(jobId, new Set());
  }
  activeStreams.get(jobId).add(res);

  // Send current state immediately if available
  const currentState = activeJobs.get(jobId);
  if (currentState) {
    res.write(`data: ${JSON.stringify(currentState)}\n\n`);
  } else {
    res.write(`data: ${JSON.stringify({ status: 'PENDING', progress: 5, step: 'Initializing verification engine...' })}\n\n`);
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
  const currentState = activeJobs.get(jobId) || {};
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
 * Clear completed job from active state memory
 */
function clearJobState(jobId) {
  activeJobs.delete(jobId);
  activeStreams.delete(jobId);
}

module.exports = {
  registerStream,
  emitProgress,
  clearJobState,
  activeJobs
};
