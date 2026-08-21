const assert = require('assert');
const {
  performNumericalFactAnalysis,
  extractNumericalFacts,
  verifyNumericalDiscrepancies,
  parseCleanNumber,
  SCALE_MULTIPLIERS
} = require('../src/services/numericalFactService');

async function runStage24NumericalFactAnalysisTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING STAGE 24: DEEP NUMERICAL FACT ANALYSIS TEST SUITE');
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

  // ----------------------------------------------------------------
  // Test 1: Extraction & Verbatim Preservation
  // ----------------------------------------------------------------
  await runTest('1. Extracts currency, percentages, weights, and counts with verbatim asPrinted preservation', async () => {
    const text = 'The Union Cabinet approved ₹12,000 Cr for the solar mission, targeting 2.5 GW capacity, a 15% increase in production, and 50,000 jobs.';
    const facts = extractNumericalFacts(text);

    assert.strictEqual(facts.length, 4);
    const curr = facts.find(f => f.metricType === 'CURRENCY');
    const gw = facts.find(f => f.metricType === 'WEIGHT_OR_MEASURE');
    const pct = facts.find(f => f.metricType === 'PERCENTAGE');
    const cnt = facts.find(f => f.metricType === 'COUNT');

    assert.ok(curr);
    assert.strictEqual(curr.asPrinted, '₹12,000 Cr');
    assert.ok(gw);
    assert.strictEqual(gw.asPrinted, '2.5 GW');
    assert.ok(pct);
    assert.strictEqual(pct.asPrinted, '15%');
    assert.ok(cnt);
    assert.strictEqual(cnt.asPrinted, '50,000 jobs');
  });

  // ----------------------------------------------------------------
  // Test 2: Scale Normalization across Indian & International Systems
  // ----------------------------------------------------------------
  await runTest('2. Normalizes Crore, Lakh, Billion, and Million scales into standard base units', async () => {
    const text = 'Budget estimates: ₹10,000 Cr domestic fund, $5 Billion foreign investment, and 50 Lakh metric tonnes reserve.';
    const facts = extractNumericalFacts(text);

    const crFact = facts.find(f => f.asPrinted.includes('₹10,000 Cr'));
    const bnFact = facts.find(f => f.asPrinted.includes('$5 Billion'));
    const lakhFact = facts.find(f => f.asPrinted.includes('50 Lakh'));

    assert.ok(crFact);
    assert.strictEqual(crFact.normalizedValue, 100000000000); // 10,000 * 10^7
    assert.strictEqual(crFact.standardBaseUnit, 'INR');

    assert.ok(bnFact);
    assert.strictEqual(bnFact.normalizedValue, 5000000000); // 5 * 10^9
    assert.strictEqual(bnFact.standardBaseUnit, 'USD');

    assert.ok(lakhFact);
    assert.strictEqual(lakhFact.normalizedValue, 5000000000000); // 50 * 10^5 * 10^6 kg
  });

  // ----------------------------------------------------------------
  // Test 3: Classification of Actionable vs Descriptive Numbers
  // ----------------------------------------------------------------
  await runTest('3. Distinguishes actionable policy/financial metrics from descriptive incidental numbers', async () => {
    const text = 'Ministry approved ₹50,000 Cr allocation for high-speed rail corridor.';
    const facts = extractNumericalFacts(text);

    assert.strictEqual(facts[0].classification, 'ACTIONABLE_METRIC');
    assert.ok(facts[0].refersTo.includes('Financial budget') || facts[0].refersTo.includes('allocation'));
  });

  // ----------------------------------------------------------------
  // Test 4: Detection of Scale Mismatches & Inflated Numbers
  // ----------------------------------------------------------------
  await runTest('4. Detects scale inflation and discrepancies against verified evidence', async () => {
    const facts = [
      {
        factId: 'num_1',
        asPrinted: '₹10,000 Cr',
        rawNumber: 10000,
        normalizedValue: 100000000000,
        standardBaseUnit: 'INR',
        actualFinding: 'Verbatim extraction'
      }
    ];

    const verifiedClaims = [
      {
        claimText: 'Government announced ₹10,000 Cr semiconductor package',
        verdict: 'FALSE',
        status: 'REFUTED',
        conflictType: 'SCALE_MISMATCH'
      }
    ];

    const audited = verifyNumericalDiscrepancies(facts, verifiedClaims);

    assert.strictEqual(audited[0].status, 'FABRICATED');
    assert.strictEqual(audited[0].discrepancyType, 'SCALE_MISMATCH');
    assert.strictEqual(audited[0].discrepancyRatio, 10.0);
  });

  // ----------------------------------------------------------------
  // Test 5: Detection of Misleading Comparisons
  // ----------------------------------------------------------------
  await runTest('5. Flags misleading comparisons with unadjusted baselines as SUSPICIOUS', async () => {
    const facts = [
      {
        factId: 'num_2',
        asPrinted: '8.2% growth',
        rawNumber: 8.2,
        normalizedValue: 0.082,
        standardBaseUnit: 'FRACTION_OF_1',
        actualFinding: 'Verbatim extraction'
      }
    ];

    const verifiedClaims = [
      {
        claimText: 'State achieved 8.2% growth compared to national target',
        verdict: 'PARTIALLY_VERIFIED',
        status: 'PARTIALLY_VERIFIED'
      }
    ];

    const audited = verifyNumericalDiscrepancies(facts, verifiedClaims);

    assert.strictEqual(audited[0].status, 'SUSPICIOUS');
    assert.strictEqual(audited[0].discrepancyType, 'MISLEADING_COMPARISON');
  });

  // ----------------------------------------------------------------
  // Test 6: Master Numerical Fact Analysis Pipeline
  // ----------------------------------------------------------------
  await runTest('6. performNumericalFactAnalysis computes scale audit and numerical integrity status', async () => {
    const article = 'The Cabinet cleared ₹15,000 Cr for port modernization and $2 Billion in maritime logistics loans.';
    const res = await performNumericalFactAnalysis(article, []);

    assert.strictEqual(res.factsCount, 2);
    assert.strictEqual(res.actionableFactsCount, 2);
    assert.strictEqual(res.discrepanciesCount, 0);
    assert.strictEqual(res.summary.numericalIntegrityStatus, 'NUMERICALLY_ACCURATE');
    assert.strictEqual(res.scaleAudit.totalMonetaryValueINR, 150000000000);
    assert.strictEqual(res.scaleAudit.totalMonetaryValueUSD, 2000000000);
  });

  console.log('\n================================================================');
  console.log(`🏆 STAGE 24 TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runStage24NumericalFactAnalysisTests();
