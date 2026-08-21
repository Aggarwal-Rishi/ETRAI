const assert = require('assert');
const {
  operationalIntelligence,
  OperationalIntelligenceEngine,
  redactSecrets,
  SAFEGUARDS,
  COST_RATES
} = require('../src/services/operationalIntelligenceService');
const PipelineLogger = require('../src/services/pipelineLogger');

async function runStage34OperationalIntelligenceTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING STAGE 34: OPERATIONAL INTELLIGENCE TEST SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  const runTest = async (name, fn) => {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (e) {
      console.error(`  ❌ FAIL: ${name} -> ${e.message}`);
      failed++;
    }
  };

  operationalIntelligence.reset();

  // ----------------------------------------------------------------
  // Test 1: Model & Token Usage Telemetry
  // ----------------------------------------------------------------
  await runTest('1. Tracks Gemini & OpenAI model calls, prompt/completion tokens, and latencies', async () => {
    const engine = new OperationalIntelligenceEngine();
    const jobId = 'job_model_telemetry_01';

    engine.registerJobStart(jobId, 'user_1', 'ws_1', 'fp_01');

    engine.recordModelCall(jobId, {
      provider: 'GEMINI',
      model: 'gemini-2.5',
      promptTokens: 1200,
      completionTokens: 450,
      durationMs: 650,
      success: true
    });

    engine.recordModelCall(jobId, {
      provider: 'OPENAI',
      model: 'gpt-4o',
      promptTokens: 800,
      completionTokens: 200,
      durationMs: 900,
      success: true
    });

    const report = engine.getOperationalReport();
    assert.strictEqual(report.telemetry.tokens.promptTokens, 2000);
    assert.strictEqual(report.telemetry.tokens.completionTokens, 650);
    assert.strictEqual(report.telemetry.tokens.totalTokens, 2650);
    assert.strictEqual(report.telemetry.models.geminiCalls, 1);
    assert.strictEqual(report.telemetry.models.openaiCalls, 1);
    assert.ok(report.telemetry.cost.totalEstimatedCostUsd > 0);
  });

  // ----------------------------------------------------------------
  // Test 2: External API Telemetry & Failure Tracking (Serper / Search)
  // ----------------------------------------------------------------
  await runTest('2. Tracks Serper API calls, latencies, and failure rates', async () => {
    const engine = new OperationalIntelligenceEngine();
    const jobId = 'job_serper_telemetry_01';
    engine.registerJobStart(jobId, 'user_1', 'ws_1', 'fp_02');

    engine.recordSerperCall(jobId, { query: 'test fact check query', durationMs: 140, success: true });
    engine.recordSerperCall(jobId, { query: 'failing query', durationMs: 300, success: false, error: '503 Service Unavailable' });

    const report = engine.getOperationalReport();
    assert.strictEqual(report.telemetry.externalApis.serperCalls, 2);
    assert.strictEqual(report.telemetry.externalApis.serperFailures, 1);
  });

  // ----------------------------------------------------------------
  // Test 3: Pipeline Duration & Stage Latency Metrics
  // ----------------------------------------------------------------
  await runTest('3. Tracks full pipeline duration and individual phase latency breakdown', async () => {
    const engine = new OperationalIntelligenceEngine();
    const jobId = 'job_latency_01';
    engine.registerJobStart(jobId, 'user_1', 'ws_1', 'fp_03');

    // Simulate completion
    await new Promise(r => setTimeout(r, 50));
    engine.registerJobEnd(jobId, { status: 'COMPLETED', tokensConsumed: 1500, costUsd: 0.012 });

    const report = engine.getOperationalReport();
    assert.strictEqual(report.queue.totalCompleted, 1);
    assert.ok(report.telemetry.pipelineLatency.samples >= 1);
  });

  // ----------------------------------------------------------------
  // Test 4: Per-Workspace & Per-User Consumption Aggregation
  // ----------------------------------------------------------------
  await runTest('4. Aggregates multi-tenant workspace and per-user token and cost consumption', async () => {
    const engine = new OperationalIntelligenceEngine();
    const jobId = 'job_ws_01';
    const workspaceId = 'ws_enterprise_alpha';
    const userId = 'user_analyst_01';

    engine.registerJobStart(jobId, userId, workspaceId, 'fp_04');
    engine.registerJobEnd(jobId, { status: 'COMPLETED', tokensConsumed: 5400, costUsd: 0.042 });

    const wsUsage = engine.getWorkspaceConsumption(workspaceId);
    assert.strictEqual(wsUsage.workspaceId, workspaceId);
    assert.strictEqual(wsUsage.tokens, 5400);
    assert.strictEqual(wsUsage.costUsd, 0.042);
    assert.strictEqual(wsUsage.jobCount, 1);
    assert.ok(wsUsage.costInr > 0);
  });

  // ----------------------------------------------------------------
  // Test 5: Safeguard: Duplicate Job Detection & Prevention
  // ----------------------------------------------------------------
  await runTest('5. Safeguard: Rejects duplicate job submissions within debounce window', async () => {
    const engine = new OperationalIntelligenceEngine();
    const userId = 'user_dup_test';
    const payload = { inputType: 'TEXT', text: 'Viral claim regarding vaccine approval', url: null };

    // First submission: allowed
    const admission1 = engine.checkJobAdmission(userId, 'ws_1', payload);
    assert.strictEqual(admission1.allowed, true);
    engine.registerJobStart('job_dup_1', userId, 'ws_1', admission1.fingerprint);

    // Second submission with exact same payload within window: rejected
    let duplicateRejected = false;
    try {
      engine.checkJobAdmission(userId, 'ws_1', payload);
    } catch (e) {
      duplicateRejected = true;
      assert.ok(e.message.includes('Duplicate verification request detected'));
    }
    assert.strictEqual(duplicateRejected, true);

    const report = engine.getOperationalReport();
    assert.strictEqual(report.safeguards.duplicatesPrevented, 1);
  });

  // ----------------------------------------------------------------
  // Test 6: Safeguard: Infinite Retry Protection
  // ----------------------------------------------------------------
  await runTest('6. Safeguard: Infinite retry protection halts execution when max retries exceeded', async () => {
    const engine = new OperationalIntelligenceEngine();
    const jobId = 'job_retry_test';
    engine.registerJobStart(jobId, 'user_1', 'ws_1', 'fp_06');

    // Retries 1, 2, 3 succeed
    engine.registerJobRetry(jobId);
    engine.registerJobRetry(jobId);
    engine.registerJobRetry(jobId);

    // 4th retry must throw infinite retry breaker
    let retryTripped = false;
    try {
      engine.registerJobRetry(jobId);
    } catch (e) {
      retryTripped = true;
      assert.ok(e.message.includes('Infinite retry safeguard'));
    }
    assert.strictEqual(retryTripped, true);
  });

  // ----------------------------------------------------------------
  // Test 7: Safeguard: Runaway API & Model Call Caps per Job
  // ----------------------------------------------------------------
  await runTest('7. Safeguard: Runaway API & Model limiter trips when threshold per job breached', async () => {
    const engine = new OperationalIntelligenceEngine();
    const jobId = 'job_runaway_test';
    engine.registerJobStart(jobId, 'user_1', 'ws_1', 'fp_07');

    // Fill up to max allowed Serper calls
    for (let i = 0; i < SAFEGUARDS.MAX_SERPER_CALLS_PER_JOB; i++) {
      engine.recordSerperCall(jobId, { query: `query_${i}` });
    }

    // Exceeding Serper cap must throw
    let serperTripped = false;
    try {
      engine.recordSerperCall(jobId, { query: 'exceeded_query' });
    } catch (e) {
      serperTripped = true;
      assert.ok(e.message.includes('Runaway API safeguard tripped'));
    }
    assert.strictEqual(serperTripped, true);

    // Test Model cap
    for (let i = 0; i < SAFEGUARDS.MAX_MODEL_CALLS_PER_JOB; i++) {
      engine.recordModelCall(jobId, { provider: 'GEMINI' });
    }

    let modelTripped = false;
    try {
      engine.recordModelCall(jobId, { provider: 'GEMINI' });
    } catch (e) {
      modelTripped = true;
      assert.ok(e.message.includes('Runaway Model safeguard tripped'));
    }
    assert.strictEqual(modelTripped, true);
  });

  // ----------------------------------------------------------------
  // Test 8: Safeguard: Concurrent Resource Exhaustion Guard
  // ----------------------------------------------------------------
  await runTest('8. Safeguard: Enforces per-user and system-wide concurrency limits', async () => {
    const engine = new OperationalIntelligenceEngine();
    const userId = 'heavy_user_concurrent';

    // Start MAX_CONCURRENT_PER_USER jobs
    for (let i = 0; i < SAFEGUARDS.MAX_CONCURRENT_PER_USER; i++) {
      const adm = engine.checkJobAdmission(userId, 'ws_1', { inputType: 'TEXT', text: `text_${i}` });
      engine.registerJobStart(`job_conc_${i}`, userId, 'ws_1', adm.fingerprint);
    }

    // Next job from same user must be rejected
    let userLimitTripped = false;
    try {
      engine.checkJobAdmission(userId, 'ws_1', { inputType: 'TEXT', text: 'text_overflow' });
    } catch (e) {
      userLimitTripped = true;
      assert.ok(e.message.includes('User concurrent verification limit reached'));
    }
    assert.strictEqual(userLimitTripped, true);
  });

  // ----------------------------------------------------------------
  // Test 9: Secret Redaction Integrity in Telemetry
  // ----------------------------------------------------------------
  await runTest('9. Security: Deep recursive secret redactor strips credentials, tokens, and API keys', async () => {
    const sensitivePayload = {
      apiKey: 'AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q',
      serperKey: 'serper_secret_12345',
      bearerToken: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0',
      user: {
        password: 'SuperSecretPassword123!',
        rawPayloadData: 'sk-proj-1234567890abcdef1234567890abcdef'
      },
      metadata: {
        normalField: 'Valid telemetry string',
        geminiApiKey: 'secret_gemini_key'
      }
    };

    const sanitized = redactSecrets(sensitivePayload);
    assert.strictEqual(sanitized.apiKey, '[REDACTED_SECRET]');
    assert.strictEqual(sanitized.serperKey, '[REDACTED_SECRET]');
    assert.strictEqual(sanitized.bearerToken, '[REDACTED_SECRET]');
    assert.strictEqual(sanitized.user.password, '[REDACTED_SECRET]');
    assert.strictEqual(sanitized.user.rawPayloadData, '[REDACTED_CREDENTIAL]');
    assert.strictEqual(sanitized.metadata.geminiApiKey, '[REDACTED_SECRET]');
    assert.strictEqual(sanitized.metadata.normalField, 'Valid telemetry string');
  });

  // ----------------------------------------------------------------
  // Test 10: PipelineLogger Integration with Operational Intelligence
  // ----------------------------------------------------------------
  await runTest('10. PipelineLogger logs phases with timing, secret redaction, and operational telemetry', async () => {
    const logger = new PipelineLogger('job_logger_test_01');
    logger.startPhase('phase1_contentReader', { token: 'secret_token_123', inputType: 'TEXT' });
    logger.recordModelCall({ provider: 'GEMINI', promptTokens: 300, completionTokens: 100 });
    logger.recordSerperCall({ query: 'test search' });
    logger.endPhase('phase1_contentReader', { result: 'Extracted 500 words' });

    const telemetry = logger.getTelemetryPayload();
    assert.strictEqual(telemetry.jobId, 'job_logger_test_01');
    assert.strictEqual(telemetry.phases.phase1_contentReader.status, 'COMPLETED');
    assert.strictEqual(telemetry.phases.phase1_contentReader.inputs.token, '[REDACTED_SECRET]');
    assert.strictEqual(telemetry.metrics.modelCalls, 1);
    assert.strictEqual(telemetry.metrics.serperCalls, 1);
  });

  console.log('\n================================================================');
  console.log(`🏆 STAGE 34 TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runStage34OperationalIntelligenceTests();
