/**
 * ETRAI Pipeline Logger & Observability Collector
 * 
 * Instruments verification pipeline phases with timing, structured logging,
 * telemetry payload generation, and deep recursive secret redaction.
 */

const { redactSecrets, operationalIntelligence } = require('./operationalIntelligenceService');

class PipelineLogger {
  constructor(jobId) {
    this.jobId = jobId || `job_${Date.now()}`;
    this.startTime = Date.now();
    this.phases = {
      phase1_contentReader: { status: 'PENDING', durationMs: 0, events: [], inputs: {}, outputs: {}, warnings: [] },
      phase2_claimExtractor: { status: 'PENDING', durationMs: 0, events: [], inputs: {}, outputs: {}, warnings: [] },
      phase3_factVerifier: { status: 'PENDING', durationMs: 0, events: [], inputs: {}, outputs: {}, warnings: [] },
      phase4_reportGenerator: { status: 'PENDING', durationMs: 0, events: [], inputs: {}, outputs: {}, warnings: [] }
    };
    this.logs = [];
    this.metrics = {
      modelCalls: 0,
      serperCalls: 0,
      totalTokens: 0,
      costUsd: 0
    };
  }

  /**
   * Starts tracking a specific pipeline phase
   */
  startPhase(phaseKey, inputs = {}) {
    if (!this.phases[phaseKey]) {
      this.phases[phaseKey] = { status: 'IN_PROGRESS', durationMs: 0, events: [], inputs: {}, outputs: {}, warnings: [] };
    }
    const phase = this.phases[phaseKey];
    phase.status = 'IN_PROGRESS';
    phase.startTime = Date.now();
    phase.inputs = redactSecrets(inputs);
    
    this.log(phaseKey, 'INFO', `Started phase: ${phaseKey}`, phase.inputs);
  }

  /**
   * Logs a structured event within a phase
   */
  log(phaseKey, level, message, data = null) {
    const timestamp = new Date().toISOString();
    const safeData = redactSecrets(data);
    const entry = { timestamp, phaseKey, level, message, data: safeData };
    this.logs.push(entry);

    if (this.phases[phaseKey]) {
      this.phases[phaseKey].events.push(entry);
      if (level === 'WARN') {
        this.phases[phaseKey].warnings.push(message);
      }
    }

    console.log(`[Observability] [${phaseKey}] [${level}]: ${message}`);
  }

  /**
   * Record model invocation telemetry
   */
  recordModelCall(modelData = {}) {
    this.metrics.modelCalls++;
    if (modelData.totalTokens) this.metrics.totalTokens += modelData.totalTokens;
    operationalIntelligence.recordModelCall(this.jobId, modelData);
  }

  /**
   * Record external search API telemetry
   */
  recordSerperCall(serperData = {}) {
    this.metrics.serperCalls++;
    operationalIntelligence.recordSerperCall(this.jobId, serperData);
  }

  /**
   * Completes tracking for a phase
   */
  endPhase(phaseKey, outputs = {}, metadata = {}) {
    const phase = this.phases[phaseKey];
    if (!phase) return;

    const endTime = Date.now();
    phase.endTime = endTime;
    phase.durationMs = phase.startTime ? endTime - phase.startTime : 0;
    phase.status = 'COMPLETED';
    phase.outputs = redactSecrets(outputs);
    phase.metadata = redactSecrets(metadata);

    this.log(phaseKey, 'INFO', `Completed phase ${phaseKey} in ${phase.durationMs}ms`, metadata);
  }

  /**
   * Marks a phase as failed
   */
  failPhase(phaseKey, error) {
    const phase = this.phases[phaseKey];
    if (!phase) return;

    const endTime = Date.now();
    phase.endTime = endTime;
    phase.durationMs = phase.startTime ? endTime - phase.startTime : 0;
    phase.status = 'FAILED';
    phase.error = typeof error === 'string' ? error : error ? error.message : 'Unknown error';

    this.log(phaseKey, 'ERROR', `Failed phase ${phaseKey}: ${phase.error}`);
  }

  /**
   * Generates full telemetry payload for UI inspection and API reports
   */
  getTelemetryPayload() {
    const totalDurationMs = Date.now() - this.startTime;
    return redactSecrets({
      jobId: this.jobId,
      totalDurationMs,
      timestamp: new Date().toISOString(),
      summary: {
        phase1DurationMs: this.phases.phase1_contentReader?.durationMs || 0,
        phase2DurationMs: this.phases.phase2_claimExtractor?.durationMs || 0,
        phase3DurationMs: this.phases.phase3_factVerifier?.durationMs || 0,
        phase4DurationMs: this.phases.phase4_reportGenerator?.durationMs || 0
      },
      metrics: this.metrics,
      phases: this.phases,
      logs: this.logs
    });
  }
}

module.exports = PipelineLogger;
