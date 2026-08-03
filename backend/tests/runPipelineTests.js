const { processInputContent } = require('../src/services/inputReader');
const { extractClaims } = require('../src/services/claimExtractor');
const { verifyClaims } = require('../src/services/factVerifier');
const { generateReport } = require('../src/services/reportGenerator');
const { runVerificationPipeline } = require('../src/services/verificationPipeline');
const assert = require('assert');

async function testPipeline() {
  console.log('==============================================');
  console.log('🧪 Running ETRAI 4-Agent Pipeline Tests...');
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

  const sampleText = `
    Global tech spending reached $4.8 trillion in 2025, marking an 8.5% annual increase according to industry analytics.
    The market expansion was driven primarily by rapid investments in cloud computing, generative AI models, and cybersecurity infrastructure.
    Analysts report that over 65% of enterprise software vendors have integrated automated AI verification tools into their core SaaS offerings.
    Furthermore, quarterly revenue filings confirmed that digital trust and security platforms experienced a 24% boost in customer adoption.
    Despite market volatility, leading financial institutions project continued growth above 7% through the rest of the decade.
  `;

  // Test 1: Agent 1 - Content Reader
  await runTest('Agent 1 (Content Reader) cleans and validates text', async () => {
    const res = await processInputContent({ inputType: 'TEXT', text: sampleText });
    assert.ok(res.wordCount >= 35, 'Word count should meet minimum limit');
    assert.strictEqual(res.truncated, false);
    assert.ok(res.extractedText.includes('$4.8 trillion'));
  });

  // Test 2: Agent 2 - Claim Extractor (Max 25 Capping)
  await runTest('Agent 2 (Claim Extractor) extracts claims capped at 25', async () => {
    const claims = await extractClaims(sampleText);
    assert.ok(Array.isArray(claims), 'Claims should be an array');
    assert.ok(claims.length > 0 && claims.length <= 25, 'Claims count must be between 1 and 25');
    assert.ok(claims[0].id && claims[0].text && claims[0].category, 'Claims must have id, text, and category');
  });

  // Test 3: Agent 3 - Fact Verification Agent
  await runTest('Agent 3 (Fact Verifier) verifies claims with strict grounding', async () => {
    const claims = await extractClaims(sampleText);
    const verified = await verifyClaims(claims);
    assert.strictEqual(verified.length, claims.length);
    assert.ok(['Verified', 'Suspicious', 'False'].includes(verified[0].status), 'Status must be valid label');
    assert.ok(Array.isArray(verified[0].sources), 'Sources must be an array');
  });

  // Test 4: Agent 4 - Report Generator Multi-Category Scoring
  await runTest('Agent 4 (Report Generator) computes separate category scores', async () => {
    const claims = await extractClaims(sampleText);
    const verified = await verifyClaims(claims);
    const report = await generateReport({
      sourceTitle: 'Text: Tech Spending Report 2025',
      extractedText: sampleText,
      verifiedClaims: verified,
      selectedTypes: ['FACT_CHECKING', 'FAKE_NEWS_DETECTION', 'BUSINESS_REPORT'],
      truncated: false
    });

    assert.ok(report.scores.factCheckingScore !== undefined, 'Should calculate Fact Checking score');
    assert.ok(report.scores.fakeNewsScore !== undefined, 'Should calculate Fake News score');
    assert.ok(report.scores.businessReportScore !== undefined, 'Should calculate Business Report score');
    assert.ok(report.summary && report.recommendation, 'Report must contain summary and recommendation');
    assert.ok(Array.isArray(report.chartData) && report.chartData.length === 3, 'Chart data must have 3 status categories');
  });

  // Test 5: End-to-End Pipeline Execution
  await runTest('End-to-End 4-Agent Pipeline executes smoothly', async () => {
    const jobId = `test_job_${Date.now()}`;
    const report = await runVerificationPipeline({
      jobId,
      userId: 'usr_test_123',
      inputType: 'TEXT',
      text: sampleText,
      selectedTypes: ['FACT_CHECKING', 'BUSINESS_REPORT']
    });

    assert.ok(report.scores.factCheckingScore && report.scores.businessReportScore);
    assert.ok(report.claims.length > 0);
  });

  console.log('\n----------------------------------------------');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------\n');

  if (failed > 0) process.exit(1);
}

testPipeline();
