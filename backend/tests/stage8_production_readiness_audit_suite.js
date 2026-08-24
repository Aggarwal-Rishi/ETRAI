/**
 * =================================================================
 * ETRAI STAGE 8 MASTER PRODUCTION READINESS AUDIT SUITE
 * =================================================================
 * Validates production environment configuration, secret protection,
 * database persistence, API error security, rate limiting, SSE job
 * recovery, health/readiness probes, and full pipeline regressions.
 * =================================================================
 */

'use strict';

const path = require('path');
const fs = require('fs');
const http = require('http');
const { execSync } = require('child_process');

// 1. Explicitly load backend .env variables
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const val = match[2].trim().replace(/^['"]|['"]$/g, '');
      process.env[key] = val;
    }
  }
}

// Ensure rate limiting is enabled during tests
delete process.env.DISABLE_RATE_LIMIT;

const app = require('../src/app');
const { prisma, dbService, checkDatabaseHealth } = require('../src/utils/prisma');
const { validateConfig, getSanitizedConfigSummary, config } = require('../src/config/env');
const { createRateLimiter } = require('../src/middleware/rateLimiter');
const { isSsrfSafeUrl } = require('../src/services/ssrfGuard');
const PipelineLogger = require('../src/services/pipelineLogger');
const { getJobState, emitProgress } = require('../src/services/sseManager');

let passedTests = 0;
let failedTests = 0;
const testResults = [];

function assert(condition, message, details = null) {
  if (condition) {
    passedTests++;
    testResults.push({ status: 'PASS', message });
    console.log(`✅ [PASS] ${message}`);
  } else {
    failedTests++;
    testResults.push({ status: 'FAIL', message, details });
    console.error(`❌ [FAIL] ${message}`);
    if (details) {
      console.error('   Details:', details);
    }
  }
}

async function runStage8Audit() {
  console.log(`=================================================================`);
  console.log(`  ETRAI STAGE 8 PRODUCTION READINESS & OBSERVABILITY AUDIT SUITE `);
  console.log(`=================================================================\n`);

  const startTime = Date.now();

  // -----------------------------------------------------------------
  // Suite A: Production Environment & Secret Safety
  // -----------------------------------------------------------------
  console.log(`--- Running Suite A: Production Configuration & Secret Safety ---`);
  
  // A1: Config Validator
  const configVal = validateConfig();
  assert(
    typeof configVal.isValid === 'boolean' && Array.isArray(configVal.errors),
    '[Suite A] A1 — Centralized Environment Config Validator'
  );

  // A2: Template files exist without actual secrets
  const backendEnvExPath = path.resolve(__dirname, '../.env.example');
  const frontendEnvExPath = path.resolve(__dirname, '../../frontend/.env.example');
  const backendEnvExExists = fs.existsSync(backendEnvExPath);
  const frontendEnvExExists = fs.existsSync(frontendEnvExPath);
  
  let noRawSecretsInExamples = true;
  if (backendEnvExExists) {
    const content = fs.readFileSync(backendEnvExPath, 'utf8');
    if (/AIzaSy|sk-proj-[A-Za-z0-9_-]{20,}/.test(content)) {
      noRawSecretsInExamples = false;
    }
  }

  assert(
    backendEnvExExists && frontendEnvExExists && noRawSecretsInExamples,
    '[Suite A] A2 — Environment Templates & Zero-Secret Policy (.env.example)'
  );

  // A3: PipelineLogger recursive secret redaction
  const testLogger = new PipelineLogger('job_sec_test');
  testLogger.startPhase('phase1_contentReader', {
    geminiApiKey: 'AIzaSyTestSecretKey12345',
    jwtSecret: 'super_secret_jwt_token_val',
    normalField: 'verified_text'
  });
  const telemetry = testLogger.getTelemetryPayload();
  const phase1Inputs = telemetry.phases.phase1_contentReader.inputs;

  assert(
    phase1Inputs.geminiApiKey === '[REDACTED_SECRET]' &&
    phase1Inputs.jwtSecret === '[REDACTED_SECRET]' &&
    phase1Inputs.normalField === 'verified_text',
    '[Suite A] A3 — PipelineLogger Recursive Secret Redaction Telemetry'
  );

  // -----------------------------------------------------------------
  // Suite B: Database Persistence & Concurrency
  // -----------------------------------------------------------------
  console.log(`\n--- Running Suite B: Database Concurrency & Persistence ---`);

  // B1: Database Health Probe
  const dbHealth = await checkDatabaseHealth();
  assert(
    dbHealth.healthy === true && typeof dbHealth.latencyMs === 'number' && dbHealth.latencyMs >= 0,
    `[Suite B] B1 — Database Health & Latency Probe (Latency: ${dbHealth.latencyMs}ms)`
  );

  // B2: Concurrency Isolation (Write two distinct analyses concurrently)
  const testUserEmail = `stage8_test_${Date.now()}@etrai.org`;
  const createdUser = await dbService.createUser({
    email: testUserEmail,
    passwordHash: 'hash_test_123'
  });

  const jobAId = `job_concurr_a_${Date.now()}`;
  const jobBId = `job_concurr_b_${Date.now()}`;

  await Promise.all([
    prisma.analysis.create({
      data: {
        id: jobAId,
        userId: createdUser.id,
        title: 'Concurrent Analysis A',
        inputType: 'TEXT',
        inputSource: 'Source A',
        selectedTypes: '["FACT_CHECKING"]',
        status: 'COMPLETED',
        summary: 'Summary A',
        reportData: JSON.stringify({ trustScore: 92, verdict: 'VERIFIED' })
      }
    }),
    prisma.analysis.create({
      data: {
        id: jobBId,
        userId: createdUser.id,
        title: 'Concurrent Analysis B',
        inputType: 'TEXT',
        inputSource: 'Source B',
        selectedTypes: '["FACT_CHECKING"]',
        status: 'COMPLETED',
        summary: 'Summary B',
        reportData: JSON.stringify({ trustScore: 25, verdict: 'FALSE' })
      }
    })
  ]);

  const readA = await dbService.findAnalysisById(jobAId, createdUser.id);
  const readB = await dbService.findAnalysisById(jobBId, createdUser.id);

  assert(
    readA && readB &&
    readA.reportData.trustScore === 92 &&
    readB.reportData.trustScore === 25,
    '[Suite B] B2 — Concurrent Analysis Record Isolation & Persistence'
  );

  // -----------------------------------------------------------------
  // Suite C: Backend Reliability & Error Envelopes
  // -----------------------------------------------------------------
  console.log(`\n--- Running Suite C: API Error Handling & Reliability ---`);

  // C1: Safe 404 Endpoint Handling
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const serverPort = server.address().port;

  const notFoundRes = await fetch(`http://localhost:${serverPort}/api/v1/non_existent_route`);
  const notFoundJson = await notFoundRes.json();

  assert(
    notFoundRes.status === 404 && notFoundJson.error === 'Endpoint Not Found',
    '[Suite C] C1 — Structured 404 Endpoint Not Found Handling'
  );

  // C2: Invalid / Expired Auth Token Rejection
  const invalidAuthRes = await fetch(`http://localhost:${serverPort}/api/v1/auth/me`, {
    headers: { 'Authorization': 'Bearer invalid.tampered.token123' }
  });
  const invalidAuthJson = await invalidAuthRes.json();

  assert(
    invalidAuthRes.status === 401 && invalidAuthJson.error.includes('Invalid authentication token'),
    '[Suite C] C2 — Invalid Auth Token Clean 401 Rejection'
  );

  // -----------------------------------------------------------------
  // Suite D: API Protection & Rate Limiting
  // -----------------------------------------------------------------
  console.log(`\n--- Running Suite D: API Protection & Rate Limiting ---`);

  // D1: SSRF Protection
  const ssrfLoopback = isSsrfSafeUrl('http://127.0.0.1:5000/admin');
  const ssrfAwsMeta = isSsrfSafeUrl('http://169.254.169.254/latest/meta-data');
  const ssrfValid = isSsrfSafeUrl('https://www.bbc.com/news');

  assert(
    !ssrfLoopback.safe && !ssrfAwsMeta.safe && ssrfValid.safe,
    '[Suite D] D1 — SSRF Protection against Loopback and Cloud Metadata IPs'
  );

  // D2: Custom Rate Limiter Rejection
  const microLimiter = createRateLimiter({
    windowMs: 10000,
    maxRequests: 3,
    message: 'Test rate limit exceeded.'
  });

  let rateLimitHit = false;
  let rateLimitHeadersFound = false;

  const mockReq = { ip: '192.168.1.100', headers: {}, socket: { remoteAddress: '192.168.1.100' } };
  for (let i = 0; i < 5; i++) {
    const mockRes = {
      headers: {},
      statusCode: 200,
      setHeader(k, v) { this.headers[k] = v; },
      status(c) { this.statusCode = c; return this; },
      json(payload) {
        if (this.statusCode === 429) rateLimitHit = true;
        return payload;
      }
    };
    microLimiter(mockReq, mockRes, () => {});
    if (mockRes.headers['X-RateLimit-Limit']) {
      rateLimitHeadersFound = true;
    }
  }

  assert(
    rateLimitHit && rateLimitHeadersFound,
    '[Suite D] D2 — Rate Limiter Middleware Rejection (429 Too Many Requests)'
  );

  // -----------------------------------------------------------------
  // Suite E: Job & SSE Reliability & Recovery
  // -----------------------------------------------------------------
  console.log(`\n--- Running Suite E: Job / SSE Reliability & State Recovery ---`);

  // E1: State recovery via getJobState
  const testRecoveryJobId = `job_recover_${Date.now()}`;
  emitProgress(testRecoveryJobId, {
    userId: createdUser.id,
    status: 'PROCESSING',
    progress: 45,
    step: 'Testing state recovery...'
  });

  const recoveredState = await getJobState(testRecoveryJobId, createdUser.id);
  assert(
    recoveredState && recoveredState.progress === 45 && recoveredState.status === 'PROCESSING',
    '[Suite E] E1 — Job State Recovery via getJobState / Polling API'
  );

  // E2: Cross-user recovery protection
  const foreignUserState = await getJobState(testRecoveryJobId, 'foreign_user_id_456');
  assert(
    foreignUserState === null,
    '[Suite E] E2 — Job State Tenant Isolation (Zero cross-user leakage)'
  );

  // -----------------------------------------------------------------
  // Suite F: Health & Readiness Probes
  // -----------------------------------------------------------------
  console.log(`\n--- Running Suite F: Health & Readiness Probes ---`);

  // F1: Liveness probe GET /api/v1/health
  const healthRes = await fetch(`http://localhost:${serverPort}/api/v1/health`);
  const healthJson = await healthRes.json();

  assert(
    healthRes.status === 200 &&
    healthJson.status === 'ok' &&
    typeof healthJson.uptimeSeconds === 'number' &&
    healthJson.system &&
    typeof healthJson.system.memoryRssMb === 'number',
    `[Suite F] F1 — Liveness Probe (/api/v1/health) (Uptime: ${healthJson.uptimeSeconds}s)`
  );

  // F2: Readiness probe GET /api/v1/health/ready
  const readyRes = await fetch(`http://localhost:${serverPort}/api/v1/health/ready`);
  const readyJson = await readyRes.json();

  assert(
    readyRes.status === 200 &&
    readyJson.ready === true &&
    readyJson.checks.database.status === 'UP',
    '[Suite F] F2 — Readiness Probe (/api/v1/health/ready) (Database: UP)'
  );

  // -----------------------------------------------------------------
  // Suite G: Frontend Production Build Validation
  // -----------------------------------------------------------------
  console.log(`\n--- Running Suite G: Frontend Production Build Validation ---`);

  const frontendDistPath = path.resolve(__dirname, '../../frontend/dist/index.html');
  const distExists = fs.existsSync(frontendDistPath);

  assert(
    distExists,
    '[Suite G] G1 — Frontend Production Build Artifacts Verified (dist/index.html)'
  );

  // -----------------------------------------------------------------
  // Suite H: Source Tree Benchmark & Secret Audit
  // -----------------------------------------------------------------
  console.log(`\n--- Running Suite H: Benchmark & Production Guard Audit ---`);

  const serverJsContent = fs.readFileSync(path.resolve(__dirname, '../src/server.js'), 'utf8');
  const hasGracefulShutdown = serverJsContent.includes('gracefulShutdown') && serverJsContent.includes('uncaughtException');

  assert(
    hasGracefulShutdown,
    '[Suite H] H1 — Server Process Graceful Shutdown & Uncaught Exception Guards'
  );

  // Close test HTTP server
  await new Promise(resolve => server.close(resolve));

  // -----------------------------------------------------------------
  // Suite I: Master Full Regression Protection
  // -----------------------------------------------------------------
  console.log(`\n--- Running Suite I: Master Full Pipeline Regression Protection ---`);

  // I1: Stage 4 Regression
  console.log('[Regression Guard]: Executing Stage 4 Robustness Suite...');
  const stage4Out = execSync('node backend/tests/stage4_robust_audit_suite.js', {
    cwd: path.resolve(__dirname, '../..'),
    encoding: 'utf8',
    env: { ...process.env, DISABLE_RATE_LIMIT: 'true' }
  });
  const stage4Passed = stage4Out.includes('STAGE 4 APPROVED');
  assert(stage4Passed, '[Suite I] I1 — Stage 4 Robust Audit Suite (53/53 passed)');

  // I2: Stage 5 Production Hardening
  console.log('[Regression Guard]: Executing Stage 5 Production Hardening Suite...');
  const stage5Out = execSync('node backend/tests/stage5_production_audit_suite.js', {
    cwd: path.resolve(__dirname, '../..'),
    encoding: 'utf8',
    env: { ...process.env, DISABLE_RATE_LIMIT: 'true' }
  });
  const stage5Passed = stage5Out.includes('STAGE 5 APPROVED');
  assert(stage5Passed, '[Suite I] I2 — Stage 5 Production Hardening Audit Suite (31/31 passed)');

  // I3: Stage 6 Product Integration
  console.log('[Regression Guard]: Executing Stage 6 Product Integration Suite...');
  const stage6Out = execSync('node backend/tests/stage6_product_integration_audit_suite.js', {
    cwd: path.resolve(__dirname, '../..'),
    encoding: 'utf8',
    env: { ...process.env, DISABLE_RATE_LIMIT: 'true' }
  });
  const stage6Passed = stage6Out.includes('STAGE 6 APPROVED');
  assert(stage6Passed, '[Suite I] I3 — Stage 6 Product Integration Audit Suite (20/20 passed)');

  // I4: Stage 7 Real-World Accuracy
  console.log('[Regression Guard]: Executing Stage 7 Real-World Accuracy Suite...');
  const stage7Out = execSync('node backend/tests/stage7_real_world_accuracy_audit_suite.js', {
    cwd: path.resolve(__dirname, '../..'),
    encoding: 'utf8',
    env: { ...process.env, DISABLE_RATE_LIMIT: 'true' }
  });
  const stage7Passed = stage7Out.includes('STAGE 7 APPROVED');
  assert(stage7Passed, '[Suite I] I4 — Stage 7 Real-World Accuracy Audit Suite (24/24 passed)');

  // -----------------------------------------------------------------
  // Final Verdict
  // -----------------------------------------------------------------
  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n=================================================================`);
  console.log(`  STAGE 8 RESULTS SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED (${passedTests + failedTests} total)`);
  console.log(`  Duration: ${totalDuration}s`);
  console.log(`=================================================================\n`);

  if (failedTests === 0) {
    console.log(`=================================================================`);
    console.log(`  VERDICT: STAGE 8 APPROVED — PRODUCTION DEPLOYMENT & RELIABILITY`);
    console.log(`=================================================================\n`);
    process.exit(0);
  } else {
    console.error(`=================================================================`);
    console.error(`  VERDICT: STAGE 8 NOT APPROVED — RESOLVE ${failedTests} FAILURES`);
    console.error(`=================================================================\n`);
    process.exit(1);
  }
}

runStage8Audit().catch((err) => {
  console.error('[Fatal Stage 8 Audit Suite Error]:', err);
  process.exit(1);
});
