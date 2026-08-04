const { processInputContent } = require('../src/services/inputReader');
const { extractClaims } = require('../src/services/claimExtractor');
const { verifyClaims } = require('../src/services/factVerifier');
const { generateReport, calculateCategoryScores } = require('../src/services/reportGenerator');
const assert = require('assert');

async function runRound2Tests() {
  console.log('================================================================');
  console.log('🧪 RUNNING ROUND 2 VERIFICATION TESTS (SCORES, FALSE PATH, MIXED)');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  const runTest = async (name, fn) => {
    try {
      await fn();
      console.log(`\n  ✅ PASS: ${name}`);
      passed++;
    } catch (e) {
      console.error(`\n  ❌ FAIL: ${name} -> ${e.message}`);
      failed++;
    }
  };

  // ----------------------------------------------------------------
  // TEST 1: Fabricated Fake News Story (PM Modi military action)
  // ----------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('🔹 TEST 1: Fabricated Major Event News Story...');
  console.log('----------------------------------------------------------------');
  const fakeStoryText = `
    In a dramatic press conference held in New Delhi, Indian Prime Minister Narendra Modi declared an immediate military operation against Russia.
    Military commanders confirmed Indian troops crossed Eastern European borders following secret negotiations.
    Foreign ministry officials stated that diplomatic ties with Moscow were completely severed earlier this morning.
  `;

  await runTest('Test 1: Fabricated Story — Decisive False Verdicts & Zero Score Contradiction', async () => {
    const inputRes = await processInputContent({ inputType: 'TEXT', text: fakeStoryText });
    const claims = await extractClaims(inputRes.extractedText);
    const verified = await verifyClaims(claims);
    const report = await generateReport({
      sourceTitle: inputRes.sourceTitle,
      extractedText: inputRes.extractedText,
      verifiedClaims: verified,
      selectedTypes: ['FACT_CHECKING', 'FAKE_NEWS_DETECTION', 'BUSINESS_REPORT'],
      truncated: false
    });

    console.log(`\n   Claims Breakdown: Total=${report.breakdown.totalClaims}, Verified=${report.breakdown.verified}, Suspicious=${report.breakdown.suspicious}, False=${report.breakdown.false}`);
    console.log(`   Mathematical Scores Calculated:`);
    console.log(`     - Fact Checking Score: ${report.scores.factCheckingScore}% (Math: ${report.breakdown.verified}/${report.breakdown.totalClaims} * 100)`);
    console.log(`     - Source & Content Credibility Score: ${report.scores.fakeNewsScore}% (Math: (${report.breakdown.verified}*1.0 + ${report.breakdown.suspicious}*0.2)/${report.breakdown.totalClaims} * 100)`);
    console.log(`     - Business Metric Precision: ${report.scores.businessReportScore}%`);

    for (const c of report.claims) {
      console.log(`\n   [Claim]: "${c.claimText}"`);
      console.log(`     Verdict: ${c.status} (${c.confidence}% confidence)`);
      console.log(`     Agent Reasoning: "${c.explanation}"`);
    }

    // Mathematical Consistency Checks
    const expectedFactScore = Math.round((report.breakdown.verified / report.breakdown.totalClaims) * 100);
    assert.strictEqual(report.scores.factCheckingScore, expectedFactScore, 'Fact Checking score must match mathematical ratio');
    assert.strictEqual(report.scores.factCheckingScore, 0, 'Fact checking score must be 0% when 0 claims are verified');
    assert.ok(report.scores.fakeNewsScore <= 20, 'Fake news credibility score must be very low for fabricated story');

    // Decisive False Verdict Check: At least one claim MUST be marked False due to absence of major event coverage
    assert.ok(report.breakdown.false > 0, 'At least 1 claim from the fabricated major national event story MUST be marked False');
  });

  // ----------------------------------------------------------------
  // TEST 2: Real Verifiable Event Test
  // ----------------------------------------------------------------
  console.log('\n----------------------------------------------------------------');
  console.log('🔹 TEST 2: Real Verifiable Recent News Story...');
  console.log('----------------------------------------------------------------');
  const realStoryText = `
    Global cloud computing and AI infrastructure expenditure grew by over 20 percent according to major tech industry evaluations.
    Technology companies across Europe and North America increased investments in data security and automated compliance tools.
    Industry reports confirm enterprise software adoption continued to expand throughout recent fiscal quarters.
  `;

  await runTest('Test 2: Real Story — Grounded Sourcing & Consistent Scores', async () => {
    const inputRes = await processInputContent({ inputType: 'TEXT', text: realStoryText });
    const claims = await extractClaims(inputRes.extractedText);
    const verified = await verifyClaims(claims);
    const report = await generateReport({
      sourceTitle: inputRes.sourceTitle,
      extractedText: inputRes.extractedText,
      verifiedClaims: verified,
      selectedTypes: ['FACT_CHECKING', 'FAKE_NEWS_DETECTION'],
      truncated: false
    });

    console.log(`\n   Claims Breakdown: Total=${report.breakdown.totalClaims}, Verified=${report.breakdown.verified}, Suspicious=${report.breakdown.suspicious}, False=${report.breakdown.false}`);
    console.log(`   Scores: FactChecking=${report.scores.factCheckingScore}%, Credibility=${report.scores.fakeNewsScore}%`);

    for (const c of report.claims) {
      console.log(`\n   [Claim]: "${c.claimText}"`);
      console.log(`     Verdict: ${c.status}`);
      console.log(`     Agent Reasoning: "${c.explanation}"`);
    }

    const expectedFactScore = Math.round((report.breakdown.verified / report.breakdown.totalClaims) * 100);
    assert.strictEqual(report.scores.factCheckingScore, expectedFactScore, 'Fact Checking score must match mathematical formula');
  });

  // ----------------------------------------------------------------
  // TEST 3: Mixed Story Test (Blended True Facts + Fabricated Details)
  // ----------------------------------------------------------------
  console.log('\n----------------------------------------------------------------');
  console.log('🔹 TEST 3: Mixed Story Test (True Facts + Fabricated Details)...');
  console.log('----------------------------------------------------------------');
  const mixedStoryText = `
    Cloud computing infrastructure usage grew across global markets as enterprise investments expanded.
    However, Indian Prime Minister Narendra Modi declared an immediate military operation against Russia during an emergency conference.
    Furthermore, tech vendors reported increased subscription revenue for automated security systems.
  `;

  await runTest('Test 3: Mixed Story — Correct Separation of True vs False Claims', async () => {
    const inputRes = await processInputContent({ inputType: 'TEXT', text: mixedStoryText });
    const claims = await extractClaims(inputRes.extractedText);
    const verified = await verifyClaims(claims);
    const report = await generateReport({
      sourceTitle: inputRes.sourceTitle,
      extractedText: inputRes.extractedText,
      verifiedClaims: verified,
      selectedTypes: ['FACT_CHECKING', 'FAKE_NEWS_DETECTION'],
      truncated: false
    });

    console.log(`\n   Claims Breakdown: Total=${report.breakdown.totalClaims}, Verified=${report.breakdown.verified}, Suspicious=${report.breakdown.suspicious}, False=${report.breakdown.false}`);
    console.log(`   Scores: FactChecking=${report.scores.factCheckingScore}%, Credibility=${report.scores.fakeNewsScore}%`);

    let foundFalse = false;
    for (const c of report.claims) {
      console.log(`\n   [Claim]: "${c.claimText}"`);
      console.log(`     Verdict: ${c.status}`);
      console.log(`     Reasoning: "${c.explanation}"`);
      if (c.status === 'False') foundFalse = true;
    }

    assert.ok(foundFalse, 'The fabricated claim in the mixed story MUST be flagged as False');
    assert.strictEqual(
      report.scores.factCheckingScore,
      Math.round((report.breakdown.verified / report.breakdown.totalClaims) * 100),
      'Score must match exact mathematical percentage'
    );
  });

  console.log('\n================================================================');
  console.log(`Round 2 Verification Results: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runRound2Tests().catch(err => {
  console.error('[Round 2 Test Suite Error]:', err);
  process.exit(1);
});
