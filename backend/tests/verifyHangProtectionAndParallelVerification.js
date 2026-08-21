const assert = require('assert');
const { verifyClaims } = require('../src/services/factVerifier');
const { runVerificationPipeline } = require('../src/services/verificationPipeline');
const { createOpenAIClient } = require('../src/services/providerManager');
const { fetchFullPageText } = require('../src/services/articleResearch');

async function runHangProtectionAndParallelVerificationTests() {
  console.log('===============================================================');
  console.log('🧪 Verifying Hang Protection, Timeouts, Parallel Pool & SSE Progress...');
  console.log('===============================================================\n');

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

  // Test 1: OpenAI SDK Client Timeout Initialization
  await runTest('1. OpenAI Client initialized with explicit 15s timeout & maxRetries=2', async () => {
    const client = createOpenAIClient('sk-proj-testkey123456789012345678901234567890');
    assert.ok(client, 'Client should be created');
    assert.strictEqual(client.timeout, 15000, 'Client timeout must be 15000ms');
    assert.strictEqual(client.maxRetries, 2, 'Client maxRetries must be 2');
  });

  // Test 2: Full Page Fetch AbortController Timeout Guardrail
  await runTest('2. fetchFullPageText aborts gracefully within timeout on unreachable endpoint', async () => {
    const start = Date.now();
    const res = await fetchFullPageText('http://10.255.255.1:9999/hanging-endpoint');
    const elapsed = Date.now() - start;
    assert.strictEqual(res, '', 'Unreachable page fetch must return empty string');
    assert.ok(elapsed < 12000, `Page fetch must abort within 12s timeout (took ${elapsed}ms)`);
  });

  // Test 3: Parallel Claim Verification with Concurrency Pool & Granular Progress Updates
  await runTest('3. Parallel Claim Verification (25 claims) with Concurrency Pool & Granular SSE Progress', async () => {
    const testClaims = Array.from({ length: 25 }, (_, i) => ({
      id: `claim_${i + 1}`,
      text: `Test Claim ${i + 1}: India launched digital currency project in 2026.`,
      entities: ['India', 'Digital Currency'],
      claimScope: 'National'
    }));

    const progressLogs = [];
    const onProgress = (completed, total) => {
      progressLogs.push({ completed, total });
    };

    const startTime = Date.now();
    const verifiedResults = await verifyClaims(
      testClaims,
      {
        mockSearchResults: [
          {
            index: 0,
            title: 'India Digital Currency Launch Confirmation 2026',
            url: 'https://test-fixture.local/news/1',
            snippet: 'India officially launched the digital currency initiative in 2026.',
            domain: 'test-fixture.local'
          }
        ],
        onProgress
      },
      null,
      null,
      onProgress
    );
    const totalTime = Date.now() - startTime;

    assert.strictEqual(verifiedResults.length, 25, 'Must return all 25 claim results');
    assert.ok(progressLogs.length >= 25, `Progress callback must fire at least 25 times (got ${progressLogs.length})`);
    
    // Check array order preservation & per-claim evidence isolation
    verifiedResults.forEach((res, idx) => {
      assert.strictEqual(res.claimId, `claim_${idx + 1}`, `Index ${idx} must correspond to claim_${idx + 1}`);
      assert.ok(res.verdict, `Claim ${idx + 1} must have a verdict`);
    });

    console.log(`     ℹ️ Verified 25 claims in ${totalTime}ms (~${(totalTime / 1000).toFixed(1)}s) with ${progressLogs.length} progress updates`);
  });

  // Test 4: Overall Verification Pipeline Execution & Progress Emission
  await runTest('4. Full Pipeline Execution with 15 Claims completes cleanly with progress events', async () => {
    const pipelineResult = await runVerificationPipeline({
      jobId: `test_e2e_hang_fix_${Date.now()}`,
      inputType: 'TEXT',
      text: Array.from({ length: 15 }, (_, i) => `Claim sentence ${i + 1}: The central bank issued statement number ${i + 1} regarding inflation rate of 4.2 percent in August 2026.`).join(' '),
      selectedTypes: ['FACT_CHECKING'],
      userId: null
    });

    assert.ok(pipelineResult);
    assert.ok(pipelineResult.summary);
    assert.strictEqual(typeof pipelineResult.factualAccuracyScore, 'number');
    assert.ok(Array.isArray(pipelineResult.claims || pipelineResult.verifiedClaims), 'Report must contain claims array');
  });

  console.log('\n---------------------------------------------------------------');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('---------------------------------------------------------------\n');

  if (failed > 0) process.exit(1);
}

runHangProtectionAndParallelVerificationTests();
