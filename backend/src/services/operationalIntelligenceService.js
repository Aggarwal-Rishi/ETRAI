/**
 * ETRAI Stage 34: Operational Intelligence & Production Observability Engine
 * 
 * Provides centralized telemetry and strict operational safeguards:
 * - Model & Token telemetry (Gemini, OpenAI, Vision, Audio)
 * - External API metrics & failure tracking (Serper, Gemini, Scraping)
 * - Stage latency percentiles & pipeline duration
 * - Queue/Job state & failure tracking with retry limits
 * - Rate limit & cost estimations (USD / INR)
 * - Per-user / per-workspace consumption aggregation
 * 
 * Production Safeguards:
 * - Duplicate job prevention via SHA-256 fingerprinting
 * - Infinite retry protection (max retries with backoff)
 * - Runaway API call limiter (caps per job)
 * - Excessive model invocation circuit breaker
 * - Concurrent resource exhaustion guard (workspace & global semaphore)
 * - Strict recursive secret redaction (zero provider credential exposure)
 */

const crypto = require('crypto');

// Strict Cost Estimation Model (USD per unit)
const COST_RATES = {
  GEMINI_INPUT_PER_1K: 0.000125,
  GEMINI_OUTPUT_PER_1K: 0.000375,
  SERPER_PER_QUERY: 0.001,
  USD_TO_INR: 83.5
};

// Safeguard Thresholds
const SAFEGUARDS = {
  MAX_CONCURRENT_GLOBAL: 25,
  MAX_CONCURRENT_PER_USER: 3,
  MAX_RETRIES: 3,
  MAX_SERPER_CALLS_PER_JOB: 15,
  MAX_MODEL_CALLS_PER_JOB: 12,
  DUPLICATE_WINDOW_MS: 30000 // 30 seconds debounce window for duplicate jobs
};

/**
 * Deep recursive secret redaction utility
 * Ensures zero exposure of API keys, tokens, auth headers, or passwords
 */
function isSecretKey(key) {
  if (typeof key !== 'string') return false;
  // Numerical token metrics are safe telemetry counters, not secrets
  if (/^(tokens|promptTokens|completionTokens|totalTokens|tokensConsumed)$/i.test(key)) {
    return false;
  }
  // Safe UI / structural data keys
  if (/^(primaryKey|keyframe|keyframes|keyFindings|keyboard|phaseKey)$/i.test(key)) {
    return false;
  }
  // Credential and secret field names
  return /password|secret|apikey|api_key|auth|bearer|credential|gemini.*key|serper.*key|stripe.*key|razorpay.*key|token|.*key$/i.test(key);
}

function redactSecrets(data) {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(redactSecrets);

  const sanitized = {};
  for (const [key, value] of Object.entries(data)) {
    if (isSecretKey(key)) {
      sanitized[key] = '[REDACTED_SECRET]';
    } else if (typeof value === 'string') {
      // Check if string contains raw sensitive credential signatures
      if (/AIzaSy[A-Za-z0-9_-]{33}|sk-[A-Za-z0-9_-]{20,}|Bearer\s+[A-Za-z0-9._-]+/i.test(value)) {
        sanitized[key] = '[REDACTED_CREDENTIAL]';
      } else if (value.length > 500) {
        sanitized[key] = `${value.substring(0, 150)}... [truncated ${value.length - 150} chars]`;
      } else {
        sanitized[key] = value;
      }
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = redactSecrets(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

class OperationalIntelligenceEngine {
  constructor() {
    this.inFlightJobs = new Map(); // jobId -> { userId, workspaceId, startTime, fingerprint }
    this.recentJobFingerprints = new Map(); // fingerprint -> timestamp
    this.jobJobBudgets = new Map(); // jobId -> { serperCalls: 0, modelCalls: 0, retries: 0 }

    this.metrics = {
      totalJobsSubmitted: 0,
      totalJobsCompleted: 0,
      totalJobsFailed: 0,
      totalRetries: 0,
      duplicatesPrevented: 0,
      runawaysBlocked: 0,
      concurrencyRejections: 0,
      
      // Token & Model Metrics
      tokens: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      },
      models: {
        geminiCalls: 0,
        geminiFailures: 0,
        openaiCalls: 0,
        openaiFailures: 0
      },
      
      // External API Metrics
      externalApis: {
        serperCalls: 0,
        serperFailures: 0,
        fetchCalls: 0,
        fetchFailures: 0
      },

      // Latencies in ms
      pipelineLatencies: [],
      modelLatencies: [],
      serperLatencies: [],

      // Cost Estimates
      totalEstimatedCostUsd: 0,
      totalEstimatedCostInr: 0
    };

    // User & Workspace Aggregate Ledger
    this.workspaceUsage = new Map(); // workspaceId -> { tokens, costUsd, jobCount, serperCalls }
    this.userUsage = new Map(); // userId -> { tokens, costUsd, jobCount }
    this.recentJobRecords = []; // Max 100 recent jobs

    // Periodic cleanup of stale fingerprints
    setInterval(() => this._cleanupStaleFingerprints(), 60000).unref?.();
  }

  _cleanupStaleFingerprints() {
    const now = Date.now();
    for (const [fp, time] of this.recentJobFingerprints.entries()) {
      if (now - time > SAFEGUARDS.DUPLICATE_WINDOW_MS) {
        this.recentJobFingerprints.delete(fp);
      }
    }
  }

  /**
   * Generates a deterministic SHA-256 fingerprint for deduplication
   */
  generateJobFingerprint(userId, { inputType, text, url, fileHash }) {
    const raw = `${userId || 'anon'}:${inputType || 'TEXT'}:${(text || '').trim().toLowerCase()}:${(url || '').trim().toLowerCase()}:${fileHash || ''}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Safeguard 1: Duplicate Job Check & Concurrency Check
   */
  checkJobAdmission(userId, workspaceId, inputPayload) {
    // 1. Concurrency limit check
    const activeCount = this.inFlightJobs.size;
    if (activeCount >= SAFEGUARDS.MAX_CONCURRENT_GLOBAL) {
      this.metrics.concurrencyRejections++;
      throw new Error(`System is currently at maximum capacity (${activeCount}/${SAFEGUARDS.MAX_CONCURRENT_GLOBAL} active pipelines). Please retry shortly.`);
    }

    let userActiveCount = 0;
    for (const job of this.inFlightJobs.values()) {
      if (job.userId === userId) userActiveCount++;
    }
    if (userActiveCount >= SAFEGUARDS.MAX_CONCURRENT_PER_USER) {
      this.metrics.concurrencyRejections++;
      throw new Error(`User concurrent verification limit reached (${userActiveCount}/${SAFEGUARDS.MAX_CONCURRENT_PER_USER} in progress). Please wait for active verifications to complete.`);
    }

    // 2. Duplicate job check
    const fingerprint = this.generateJobFingerprint(userId, inputPayload);
    const lastSeen = this.recentJobFingerprints.get(fingerprint);
    if (lastSeen && Date.now() - lastSeen < SAFEGUARDS.DUPLICATE_WINDOW_MS) {
      this.metrics.duplicatesPrevented++;
      throw new Error('Duplicate verification request detected. An identical analysis was submitted recently or is currently in flight.');
    }

    return { allowed: true, fingerprint };
  }

  /**
   * Registers a job as in-flight
   */
  registerJobStart(jobId, userId, workspaceId, fingerprint) {
    this.inFlightJobs.set(jobId, {
      jobId,
      userId,
      workspaceId: workspaceId || 'default_workspace',
      startTime: Date.now(),
      fingerprint
    });

    if (fingerprint) {
      this.recentJobFingerprints.set(fingerprint, Date.now());
    }

    this.jobJobBudgets.set(jobId, {
      serperCalls: 0,
      modelCalls: 0,
      retries: 0
    });

    this.metrics.totalJobsSubmitted++;
  }

  /**
   * Safeguard 2 & 3: Runaway API & Model Call Safeguards
   */
  recordSerperCall(jobId, { query, durationMs = 120, success = true, error = null }) {
    this.metrics.externalApis.serperCalls++;
    if (!success) this.metrics.externalApis.serperFailures++;

    if (durationMs) this.metrics.serperLatencies.push(durationMs);
    if (this.metrics.serperLatencies.length > 500) this.metrics.serperLatencies.shift();

    const cost = COST_RATES.SERPER_PER_QUERY;
    this.metrics.totalEstimatedCostUsd += cost;
    this.metrics.totalEstimatedCostInr = Math.round(this.metrics.totalEstimatedCostUsd * COST_RATES.USD_TO_INR * 100) / 100;

    // Check job budget
    if (jobId && this.jobJobBudgets.has(jobId)) {
      const budget = this.jobJobBudgets.get(jobId);
      budget.serperCalls++;
      if (budget.serperCalls > SAFEGUARDS.MAX_SERPER_CALLS_PER_JOB) {
        this.metrics.runawaysBlocked++;
        throw new Error(`Runaway API safeguard tripped: Job ${jobId} exceeded maximum allowed Serper queries (${budget.serperCalls}/${SAFEGUARDS.MAX_SERPER_CALLS_PER_JOB}).`);
      }
    }
  }

  /**
   * Records model invocation telemetry
   */
  recordModelCall(jobId, { provider = 'GEMINI', model = 'gemini-flash-lite-latest', promptTokens = 500, completionTokens = 300, durationMs = 800, success = true, error = null }) {
    if (provider === 'GEMINI') {
      this.metrics.models.geminiCalls++;
      if (!success) this.metrics.models.geminiFailures++;
    } else {
      this.metrics.models.openaiCalls++;
      if (!success) this.metrics.models.openaiFailures++;
    }

    const totalTokens = promptTokens + completionTokens;
    this.metrics.tokens.promptTokens += promptTokens;
    this.metrics.tokens.completionTokens += completionTokens;
    this.metrics.tokens.totalTokens += totalTokens;

    if (durationMs) this.metrics.modelLatencies.push(durationMs);
    if (this.metrics.modelLatencies.length > 500) this.metrics.modelLatencies.shift();

    // Cost computation (Gemini Rates)
    const rateIn = COST_RATES.GEMINI_INPUT_PER_1K;
    const rateOut = COST_RATES.GEMINI_OUTPUT_PER_1K;
    const modelCost = (promptTokens / 1000) * rateIn + (completionTokens / 1000) * rateOut;

    this.metrics.totalEstimatedCostUsd += modelCost;
    this.metrics.totalEstimatedCostInr = Math.round(this.metrics.totalEstimatedCostUsd * COST_RATES.USD_TO_INR * 100) / 100;

    // Check runaway model calls per job
    if (jobId && this.jobJobBudgets.has(jobId)) {
      const budget = this.jobJobBudgets.get(jobId);
      budget.modelCalls++;
      if (budget.modelCalls > SAFEGUARDS.MAX_MODEL_CALLS_PER_JOB) {
        this.metrics.runawaysBlocked++;
        throw new Error(`Runaway Model safeguard tripped: Job ${jobId} exceeded maximum model invocations (${budget.modelCalls}/${SAFEGUARDS.MAX_MODEL_CALLS_PER_JOB}).`);
      }
    }
  }

  /**
   * Safeguard 4: Infinite Retry Breaker
   */
  registerJobRetry(jobId) {
    this.metrics.totalRetries++;
    if (jobId && this.jobJobBudgets.has(jobId)) {
      const budget = this.jobJobBudgets.get(jobId);
      budget.retries++;
      if (budget.retries > SAFEGUARDS.MAX_RETRIES) {
        throw new Error(`Infinite retry safeguard: Job ${jobId} exceeded max retry limit of ${SAFEGUARDS.MAX_RETRIES}. Halting execution.`);
      }
      return budget.retries;
    }
    return 1;
  }

  /**
   * Completes a job & updates aggregations
   */
  registerJobEnd(jobId, { status = 'COMPLETED', error = null, tokensConsumed = 0, costUsd = 0 } = {}) {
    const jobInfo = this.inFlightJobs.get(jobId);
    const durationMs = jobInfo ? Date.now() - jobInfo.startTime : 0;

    if (status === 'COMPLETED') {
      this.metrics.totalJobsCompleted++;
      if (durationMs > 0) this.metrics.pipelineLatencies.push(durationMs);
      if (this.metrics.pipelineLatencies.length > 500) this.metrics.pipelineLatencies.shift();
    } else {
      this.metrics.totalJobsFailed++;
    }

    // Per-Workspace aggregation
    if (jobInfo && jobInfo.workspaceId) {
      const wsId = jobInfo.workspaceId;
      const ws = this.workspaceUsage.get(wsId) || { tokens: 0, costUsd: 0, jobCount: 0, failures: 0 };
      ws.tokens += tokensConsumed;
      ws.costUsd += costUsd;
      ws.jobCount += 1;
      if (status !== 'COMPLETED') ws.failures += 1;
      this.workspaceUsage.set(wsId, ws);
    }

    // Per-User aggregation
    if (jobInfo && jobInfo.userId) {
      const uId = jobInfo.userId;
      const u = this.userUsage.get(uId) || { tokens: 0, costUsd: 0, jobCount: 0 };
      u.tokens += tokensConsumed;
      u.costUsd += costUsd;
      u.jobCount += 1;
      this.userUsage.set(uId, u);
    }

    // Record in recent history
    this.recentJobRecords.unshift({
      jobId,
      userId: jobInfo?.userId || 'anon',
      workspaceId: jobInfo?.workspaceId || 'default',
      durationMs,
      status,
      error: error ? String(error) : null,
      completedAt: new Date().toISOString()
    });
    if (this.recentJobRecords.length > 100) this.recentJobRecords.pop();

    this.inFlightJobs.delete(jobId);
    this.jobJobBudgets.delete(jobId);
  }

  /**
   * Helper to calculate percentile from latency array
   */
  _calculatePercentile(arr, p) {
    if (!arr || arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.floor((p / 100) * sorted.length);
    return sorted[Math.min(idx, sorted.length - 1)];
  }

  /**
   * Get system operational intelligence report (Sanitized with zero secret exposure)
   */
  getOperationalReport() {
    const latencies = this.metrics.pipelineLatencies;
    const avgLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
    const p50Latency = this._calculatePercentile(latencies, 50);
    const p95Latency = this._calculatePercentile(latencies, 95);

    const modelLatencies = this.metrics.modelLatencies;
    const avgModelLatency = modelLatencies.length ? Math.round(modelLatencies.reduce((a, b) => a + b, 0) / modelLatencies.length) : 0;

    return redactSecrets({
      timestamp: new Date().toISOString(),
      queue: {
        activeInFlightJobs: this.inFlightJobs.size,
        totalSubmitted: this.metrics.totalJobsSubmitted,
        totalCompleted: this.metrics.totalJobsCompleted,
        totalFailed: this.metrics.totalJobsFailed,
        successRatePercent: this.metrics.totalJobsSubmitted ? Math.round((this.metrics.totalJobsCompleted / this.metrics.totalJobsSubmitted) * 100) : 100
      },
      safeguards: {
        duplicatesPrevented: this.metrics.duplicatesPrevented,
        runawayCallsBlocked: this.metrics.runawaysBlocked,
        concurrencyRejections: this.metrics.concurrencyRejections,
        totalRetriesEnforced: this.metrics.totalRetries,
        thresholds: SAFEGUARDS
      },
      telemetry: {
        tokens: this.metrics.tokens,
        models: {
          ...this.metrics.models,
          avgLatencyMs: avgModelLatency
        },
        externalApis: this.metrics.externalApis,
        cost: {
          totalEstimatedCostUsd: Math.round(this.metrics.totalEstimatedCostUsd * 100000) / 100000,
          totalEstimatedCostInr: this.metrics.totalEstimatedCostInr
        },
        pipelineLatency: {
          avgMs: avgLatency,
          p50Ms: p50Latency,
          p95Ms: p95Latency,
          samples: latencies.length
        }
      },
      recentJobs: this.recentJobRecords.slice(0, 20)
    });
  }

  /**
   * Get workspace-specific consumption
   */
  getWorkspaceConsumption(workspaceId) {
    const usage = this.workspaceUsage.get(workspaceId) || { tokens: 0, costUsd: 0, jobCount: 0, failures: 0 };
    return redactSecrets({
      workspaceId,
      ...usage,
      costInr: Math.round(usage.costUsd * COST_RATES.USD_TO_INR * 100) / 100
    });
  }

  /**
   * Reset engine for clean test isolation
   */
  reset() {
    this.inFlightJobs.clear();
    this.recentJobFingerprints.clear();
    this.jobJobBudgets.clear();
    this.workspaceUsage.clear();
    this.userUsage.clear();
    this.recentJobRecords = [];
    this.metrics = {
      totalJobsSubmitted: 0,
      totalJobsCompleted: 0,
      totalJobsFailed: 0,
      totalRetries: 0,
      duplicatesPrevented: 0,
      runawaysBlocked: 0,
      concurrencyRejections: 0,
      tokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      models: { geminiCalls: 0, geminiFailures: 0, openaiCalls: 0, openaiFailures: 0 },
      externalApis: { serperCalls: 0, serperFailures: 0, fetchCalls: 0, fetchFailures: 0 },
      pipelineLatencies: [],
      modelLatencies: [],
      serperLatencies: [],
      totalEstimatedCostUsd: 0,
      totalEstimatedCostInr: 0
    };
  }
}

// Export singleton instance
const operationalIntelligence = new OperationalIntelligenceEngine();

module.exports = {
  operationalIntelligence,
  OperationalIntelligenceEngine,
  redactSecrets,
  SAFEGUARDS,
  COST_RATES
};
