const assert = require('assert');
const { verifyClaims } = require('../src/services/factVerifier');
const { generateReport } = require('../src/services/reportGenerator');

async function runCanonicalScoringEngineTests() {
  console.log('==============================================');
  console.log('🧪 Running ETRAI Canonical Scoring Engine Tests...');
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
  const resetEnv = () => { process.env = { ...originalEnv }; };

  try {
    // ----------------------------------------------------
    // Test 1: Top verdict and score cannot contradict each other
    // ----------------------------------------------------
    await runTest('1. Top verdict and factual accuracy score are single-source aligned', async () => {
      const claims = [{
        id: 'c1',
        text: 'The solar plant reached full operational capacity.',
        category: 'Infrastructure',
        entities: ['Solar Plant']
      }];

      const mockSearchResults = [{
        index: 0,
        title: 'Solar Plant Reached Full Operational Capacity',
        snippet: 'Official release confirms solar plant reached full operational capacity.',
        url: 'https://news.example.local/solar',
        domain: 'news.example.local'
      }];

      const verifiedClaims = await verifyClaims(claims, { mockSearchResults });
      const report = await generateReport({
        sourceTitle: 'Solar Report',
        verifiedClaims,
        selectedTypes: ['FACT_CHECKING', 'FAKE_NEWS_DETECTION']
      });

      assert.strictEqual(report.articleVerdict, 'VERIFIED');
      assert.strictEqual(report.factualAccuracyScore, 100);
      assert.strictEqual(report.scores.factCheckingScore, 100);
    });

    // ----------------------------------------------------
    // Test 2: No evidence does not become false
    // ----------------------------------------------------
    await runTest('2. No evidence (zero search hits) yields UNVERIFIED, never FALSE', async () => {
      const claims = [{
        id: 'c_zero',
        text: 'An unverified private conversation occurred in a non-indexed venue.',
        category: 'Event Assertion',
        entities: ['Secret Meeting']
      }];

      const verifiedClaims = await verifyClaims(claims, { mockSearchResults: [] });
      const report = await generateReport({
        sourceTitle: 'Secret Meeting Article',
        verifiedClaims,
        selectedTypes: ['FACT_CHECKING']
      });

      assert.strictEqual(verifiedClaims[0].verdict, 'UNVERIFIED');
      assert.strictEqual(report.articleVerdict, 'UNVERIFIED');
      assert.notStrictEqual(report.articleVerdict, 'FALSE');
      assert.ok(report.factualAccuracyScore >= 40 && report.factualAccuracyScore <= 50);
    });

    // ----------------------------------------------------
    // Test 3: Strong contradiction becomes false
    // ----------------------------------------------------
    await runTest('3. Strong contradiction (refuting evidence) yields FALSE', async () => {
      const claims = [{
        id: 'c_refuted',
        text: 'City tax rate surged by 400% overnight.',
        category: 'Fiscal Claim',
        entities: ['City Tax']
      }];

      const mockSearchResults = [{
        index: 0,
        title: 'City Tax Surge Claim Debunked as False',
        snippet: 'Officials refuted allegations and confirmed city tax rates remained completely unchanged.',
        url: 'https://news.example.local/tax-debunk',
        domain: 'news.example.local'
      }];

      const verifiedClaims = await verifyClaims(claims, { mockSearchResults });
      const report = await generateReport({
        sourceTitle: 'Tax Claim Article',
        verifiedClaims,
        selectedTypes: ['FACT_CHECKING']
      });

      assert.strictEqual(verifiedClaims[0].verdict, 'FALSE');
      assert.strictEqual(report.articleVerdict, 'FALSE');
      assert.strictEqual(report.factualAccuracyScore, 0);
    });

    // ----------------------------------------------------
    // Test 4: Partial evidence becomes partially verified
    // ----------------------------------------------------
    await runTest('4. Mixed/partial evidence yields PARTIALLY_VERIFIED', async () => {
      const claims = [{
        id: 'c_mixed',
        text: 'Company quarterly revenue hit $100M with 50% profit margin.',
        category: 'Financial Claim',
        entities: ['Company Revenue']
      }];

      const mockSearchResults = [
        {
          index: 0,
          title: 'Company Quarterly Revenue Hit $100M',
          snippet: 'Official filings confirmed company quarterly revenue hit $100M.',
          url: 'https://financial.example.local/rev',
          domain: 'financial.example.local'
        },
        {
          index: 1,
          title: 'Company Revenue Profit Margin Claim Refuted as Incorrect',
          snippet: 'Auditors debunked 50% profit margin for company revenue, confirming actual margin was 12%.',
          url: 'https://financial.example.local/margin-debunk',
          domain: 'financial.example.local'
        }
      ];

      const verifiedClaims = await verifyClaims(claims, { mockSearchResults });
      const report = await generateReport({
        sourceTitle: 'Financial Article',
        verifiedClaims,
        selectedTypes: ['FACT_CHECKING']
      });

      assert.strictEqual(verifiedClaims[0].verdict, 'PARTIALLY_VERIFIED');
      assert.strictEqual(report.articleVerdict, 'PARTIALLY_VERIFIED');
    });

    // ----------------------------------------------------
    // Test 5: Source authority cannot independently prove a claim
    // ----------------------------------------------------
    await runTest('5. High publisher tier alone cannot verify a claim without supporting evidence', async () => {
      const claims = [{
        id: 'c_gov_unverified',
        text: 'Unrecorded regional regulation was passed by council.',
        category: 'Policy',
        entities: ['Regional Council']
      }];

      // Search returns 0 hits, but sourceTitle is a Tier 0 government domain (gov.in)
      const verifiedClaims = await verifyClaims(claims, { mockSearchResults: [] });
      const report = await generateReport({
        sourceTitle: 'https://archive.gov.in/report-123',
        verifiedClaims,
        selectedTypes: ['FACT_CHECKING']
      });

      assert.strictEqual(verifiedClaims[0].verdict, 'UNVERIFIED');
      assert.strictEqual(report.articleVerdict, 'UNVERIFIED');
      assert.notStrictEqual(report.articleVerdict, 'VERIFIED', 'High publisher tier domain alone MUST NOT verify unevidenced claim');
    });

    // ----------------------------------------------------
    // Test 6: Sentiment cannot turn a true claim false
    // ----------------------------------------------------
    await runTest('6. High emotional sentiment increases manipulationRisk, but CANNOT turn a true claim false', async () => {
      const claims = [{
        id: 'c_true_emotional',
        text: 'Central bank raised interest rates by 25 basis points.',
        category: 'Financial Claim',
        entities: ['Central Bank']
      }];

      const mockSearchResults = [{
        index: 0,
        title: 'Central Bank Raised Interest Rates by 25 Basis Points',
        snippet: 'Official monetary policy release confirmed Central Bank raised interest rates by 25 basis points.',
        url: 'https://news.example.local/rates',
        domain: 'news.example.local'
      }];

      const verifiedClaims = await verifyClaims(claims, { mockSearchResults });
      
      // Pass highly biased/emotional sentiment (intensity = 0.95)
      const report = await generateReport({
        sourceTitle: 'Sensational Rate Hike News',
        verifiedClaims,
        selectedTypes: ['FACT_CHECKING', 'FAKE_NEWS_DETECTION'],
        articleSentiment: { compound: -0.9, intensity: 0.95, sentimentStatus: 'SENSATIONAL' }
      });

      assert.strictEqual(report.articleVerdict, 'VERIFIED', 'Factual claim MUST remain VERIFIED despite high sentiment intensity');
      assert.strictEqual(report.factualAccuracyScore, 100);
      assert.ok(report.manipulationRisk === 'HIGH' || report.manipulationScore >= 45, 'High sentiment intensity MUST increase manipulationRisk score instead of reducing factual truth score');
    });

  } finally {
    resetEnv();
  }

  console.log('\n----------------------------------------------');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------\n');

  if (failed > 0) process.exit(1);
}

runCanonicalScoringEngineTests();
