const { processInputContent } = require('../src/services/inputReader');
const { extractClaims } = require('../src/services/claimExtractor');
const { verifyClaims, validateSourceUrl } = require('../src/services/factVerifier');
const { generateReport } = require('../src/services/reportGenerator');
const assert = require('assert');

async function runMandatorySelfTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING MANDATORY SELF-TEST SUITE (3 SCENARIOS)');
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
  // TEST 1: Fully Fabricated Story (Fictional Public Figure & Major Event)
  // ----------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('🔹 TEST 1: Fully Fabricated Story Test...');
  console.log('----------------------------------------------------------------');
  const fakeStoryText = `
    In an emergency press conference held in New Delhi, Indian Prime Minister Narendra Modi declared an immediate military operation against Russia.
    Foreign ministry officials confirmed that diplomatic ties with Moscow were completely severed earlier this morning following secret negotiations.
    President Biden issued a statement announcing conscription measures in response to the surprise announcement.
  `;

  await runTest('Test 1: Fully Fabricated Story — Dominant Verdict FALSE & Low Credibility Score', async () => {
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
    console.log(`   Top-Level Overall Trust Badge: ${report.manipulationAnalysis.verdict}`);
    console.log(`   Mathematical Scores:`);
    console.log(`     - Fact Checking Score: ${report.scores.factCheckingScore}% (Math: ${report.breakdown.verified}/${report.breakdown.totalClaims} * 100)`);
    console.log(`     - Source & Content Credibility: ${report.scores.fakeNewsScore}% (Math: (${report.breakdown.verified}*1.0 + ${report.breakdown.suspicious}*0.2)/${report.breakdown.totalClaims} * 100)`);

    for (const c of report.claims) {
      console.log(`\n   [Claim]: "${c.claimText}"`);
      console.log(`     Verdict: ${c.status} (${c.confidence}% confidence)`);
      console.log(`     Agent Reasoning: "${c.explanation}"`);
    }

    // Mathematical Consistency Checks
    assert.strictEqual(report.scores.factCheckingScore, 0, 'Fact checking score must be 0% when 0 claims verified');
    assert.ok(report.scores.fakeNewsScore <= 15, 'Credibility score must be near bottom for fabricated story');
    assert.strictEqual(report.manipulationAnalysis.verdict, 'LOW_TRUST', 'Top badge must be LOW_TRUST');
    assert.ok(report.breakdown.false > 0, 'Dominant/major claims MUST be marked False');
  });

  // ----------------------------------------------------------------
  // TEST 2: Real Verifiable Recent News Story
  // ----------------------------------------------------------------
  console.log('\n----------------------------------------------------------------');
  console.log('🔹 TEST 2: Real Verifiable Recent News Story Test...');
  console.log('----------------------------------------------------------------');
  const realStoryText = `
    Global cloud computing and AI infrastructure expenditure grew by over 20 percent across major tech vendors.
    Technology companies in North America increased software investments in cybersecurity and data protection tools.
    Quarterly financial reports confirmed enterprise cloud adoption continued to expand.
  `;

  await runTest('Test 2: Real Verifiable Story — Grounded Sources & High Trust', async () => {
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
    console.log(`   Top-Level Overall Trust Badge: ${report.manipulationAnalysis.verdict}`);
    console.log(`   Scores: FactChecking=${report.scores.factCheckingScore}%, Credibility=${report.scores.fakeNewsScore}%`);

    for (const c of report.claims) {
      console.log(`\n   [Claim]: "${c.claimText}"`);
      console.log(`     Verdict: ${c.status}`);
      console.log(`     Agent Reasoning: "${c.explanation}"`);
      for (const src of c.sources) {
        console.log(`     Verifying source link resolution: ${src.url}`);
        const isLive = await validateSourceUrl(src.url);
        assert.strictEqual(isLive, true, `Source URL must resolve: ${src.url}`);
      }
    }

    assert.ok(report.breakdown.verified > 0, 'Real story must contain Verified claims');
    assert.strictEqual(report.manipulationAnalysis.verdict, 'HIGH_TRUST', 'Real story must receive HIGH_TRUST badge');
  });

  // ----------------------------------------------------------------
  // TEST 3: Mixed Story Test (True Facts + Fabricated Details Blended)
  // ----------------------------------------------------------------
  console.log('\n----------------------------------------------------------------');
  console.log('🔹 TEST 3: Mixed Story Test (Blended True Facts + Fabricated Details)...');
  console.log('----------------------------------------------------------------');
  const mixedStoryText = `
    Global cloud computing and AI infrastructure expenditure grew by over 20 percent across major technology companies during recent fiscal quarters according to financial reporting.
    However, Indian Prime Minister Narendra Modi declared an immediate military operation against Russia during an emergency conference held in New Delhi earlier today.
  `;

  await runTest('Test 3: Mixed Story — Per-Claim Evidence Separation (Verified + False)', async () => {
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

    let verifiedFound = false;
    let falseFound = false;

    for (const c of report.claims) {
      console.log(`\n   [Claim]: "${c.claimText}"`);
      console.log(`     Verdict: ${c.status}`);
      console.log(`     Reasoning: "${c.explanation}"`);
      if (c.status === 'Verified') verifiedFound = true;
      if (c.status === 'False') falseFound = true;
    }

    assert.ok(verifiedFound, 'Mixed story must correctly label the true claim as Verified');
    assert.ok(falseFound, 'Mixed story must correctly label the fabricated claim as False');
    assert.strictEqual(
      report.scores.factCheckingScore,
      Math.round((report.breakdown.verified / report.breakdown.totalClaims) * 100),
      'Fact checking score must match exact mathematical percentage'
    );
  });

  console.log('\n================================================================');
  console.log(`Mandatory Self-Test Results: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runMandatorySelfTests().catch(err => {
  console.error('[Mandatory Self-Test Suite Error]:', err);
  process.exit(1);
});
