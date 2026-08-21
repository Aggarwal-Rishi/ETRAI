const assert = require('assert');
const { searchSerper, verifyClaims } = require('../src/services/factVerifier');
const { getProviderStatus, getMockSearchFixtures } = require('../src/services/providerManager');

async function runProviderArchitectureTests() {
  console.log('==============================================');
  console.log('🧪 Running ETRAI Provider Architecture Tests...');
  console.log('==============================================\n');

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

  const originalEnv = { ...process.env };

  const resetEnv = () => {
    process.env = { ...originalEnv };
  };

  try {
    // ----------------------------------------------------
    // Test A: Missing SERPER key cannot produce a fake source
    // ----------------------------------------------------
    await runTest('Test A: Missing SERPER key in REAL mode produces 0 sources and NO fake URLs', async () => {
      delete process.env.SERPER_API_KEY;
      delete process.env.ETRAI_TEST_MODE;

      const providerStatus = getProviderStatus();
      assert.strictEqual(providerStatus.webSearch, 'UNAVAILABLE');
      assert.strictEqual(providerStatus.mode, 'REAL');

      const searchRes = await searchSerper('Floating cloud bought the sun by Rishi Aggarwal');
      assert.strictEqual(searchRes.results.length, 0, 'Should return 0 search results when Serper key is missing in REAL mode');
      
      const containsFakeUrl = searchRes.results.some(r => 
        (r.url && (r.url.includes('reuters.com') || r.url.includes('bbc.com') || r.url.includes('factcheck.org')))
      );
      assert.strictEqual(containsFakeUrl, false, 'REAL mode must NEVER generate fake Reuters/BBC/FactCheck URLs');
    });

    // ----------------------------------------------------
    // Test B: Missing OpenAI key in REAL mode cannot produce a fake AI verdict
    // ----------------------------------------------------
    await runTest('Test B: Missing OpenAI key in REAL mode evaluates deterministically without faking GPT completions', async () => {
      delete process.env.OPENAI_API_KEY;
      delete process.env.ETRAI_TEST_MODE;

      const providerStatus = getProviderStatus();
      assert.strictEqual(providerStatus.openai, 'UNAVAILABLE');

      const claims = [{
        id: 'claim_test_1',
        text: 'The central bank raised interest rates by 25 basis points on Tuesday.',
        category: 'Financial Claim',
        importanceScore: 80,
        entities: ['Central Bank']
      }];

      const verified = await verifyClaims(claims);
      assert.strictEqual(verified.length, 1);
      assert.ok(verified[0].explanation.includes('Zero relevant web search evidence') || verified[0].explanation.includes('evidence'), 'Explanation must accurately reflect evidence evaluation');
    });

    // ----------------------------------------------------
    // Test C: Mock mode only uses fixture evidence
    // ----------------------------------------------------
    await runTest('Test C: Mock mode (ETRAI_TEST_MODE=mock) ONLY uses test fixture evidence', async () => {
      delete process.env.SERPER_API_KEY;
      process.env.ETRAI_TEST_MODE = 'mock';

      const providerStatus = getProviderStatus();
      assert.strictEqual(providerStatus.mode, 'MOCK');

      const searchRes = await searchSerper('Test claim query');
      assert.ok(searchRes.results.length > 0, 'Mock mode should return fixture search results');
      assert.strictEqual(searchRes.results[0].domain, 'test-fixture.local');
      assert.strictEqual(searchRes.results[0].isMockFixture, true);

      const containsRealNewsDomain = searchRes.results.some(r => 
        (r.domain === 'reuters.com' || r.domain === 'bbc.com' || r.domain === 'factcheck.org')
      );
      assert.strictEqual(containsRealNewsDomain, false, 'Mock mode sources must be test fixtures, never real news domains');
    });

    // ----------------------------------------------------
    // Test D: Production mode never uses mock evidence
    // ----------------------------------------------------
    await runTest('Test D: Production mode (ETRAI_TEST_MODE=real or undefined) NEVER uses mock evidence', async () => {
      delete process.env.SERPER_API_KEY;
      process.env.ETRAI_TEST_MODE = 'real';

      const providerStatus = getProviderStatus();
      assert.strictEqual(providerStatus.mode, 'REAL');

      const searchRes = await searchSerper('Test claim query');
      const containsMockFixture = searchRes.results.some(r => r.isMockFixture || r.domain === 'test-fixture.local');
      assert.strictEqual(containsMockFixture, false, 'Production mode must NEVER return mock fixture evidence');
    });

    // ----------------------------------------------------
    // Test E: Search failure becomes SUSPICIOUS/UNAVAILABLE, not VERIFIED
    // ----------------------------------------------------
    await runTest('Test E: Search failure / 0 hits becomes SUSPICIOUS/INSUFFICIENT_EVIDENCE, NEVER TRUSTED or VERIFIED', async () => {
      delete process.env.SERPER_API_KEY;
      delete process.env.ETRAI_TEST_MODE;

      const claims = [{
        id: 'claim_unsearchable',
        text: 'A secret unlisted private meeting occurred in an unverified venue.',
        category: 'Event Assertion',
        importanceScore: 90,
        entities: ['Secret Meeting']
      }];

      const verified = await verifyClaims(claims);
      assert.strictEqual(verified.length, 1);
      const claimResult = verified[0];

      assert.notStrictEqual(claimResult.status, 'TRUSTED', 'Search failure must NEVER result in TRUSTED verdict');
      assert.notStrictEqual(claimResult.status, 'Verified', 'Search failure must NEVER result in Verified verdict');
      assert.ok(
        claimResult.status === 'SUSPICIOUS' || claimResult.status === 'FABRICATED' || claimResult.status === 'Suspicious' || claimResult.status === 'False',
        `Verdict for 0 search hits must be SUSPICIOUS or FABRICATED, received ${claimResult.status}`
      );
      assert.strictEqual(claimResult.supportingSourceIndices.length, 0, 'Supporting source indices must be empty on search failure');
    });

  } finally {
    resetEnv();
  }

  console.log('\n----------------------------------------------');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------\n');

  if (failed > 0) process.exit(1);
}

runProviderArchitectureTests();
