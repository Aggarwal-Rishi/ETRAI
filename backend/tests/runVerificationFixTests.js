const { processInputContent } = require('../src/services/inputReader');
const { extractClaims } = require('../src/services/claimExtractor');
const { verifyClaims, validateSourceUrl } = require('../src/services/factVerifier');
const { generateReport } = require('../src/services/reportGenerator');
const fetch = require('node-fetch');
const assert = require('assert');

async function runVerificationTests() {
  console.log('====================================================');
  console.log('🧪 RUNNING CRITICAL GROUNDING & VERIFICATION TESTS');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  // Helper tester
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
  // TEST 1: Fabricated Fake News Story (No Fabricated URLs & Suspicious Default)
  // ----------------------------------------------------------------
  console.log('🔹 TEST 1: Fabricated Fake News Story Test...');
  const fakeStoryText = `
    In a dramatic turn of global events, Prime Minister Narendra Modi convened a emergency press conference in New Delhi today 
    to announce an immediate military operation against Russia. Analysts claim that diplomatic ties were formally severed 
    following secret negotiations, and Indian forces have already crossed Eastern European borders to seize strategic assets.
  `;

  await runTest('Fake News Story — Zero Fabricated URLs & No False Verifications', async () => {
    const inputRes = await processInputContent({ inputType: 'TEXT', text: fakeStoryText });
    const claims = await extractClaims(inputRes.extractedText);
    const verified = await verifyClaims(claims);
    const report = await generateReport({
      sourceTitle: inputRes.sourceTitle,
      extractedText: inputRes.extractedText,
      verifiedClaims: verified,
      selectedTypes: ['FACT_CHECKING', 'FAKE_NEWS_DETECTION'],
      truncated: false
    });

    console.log(`   Processed ${report.claims.length} claims for Fake News Story.`);

    for (const c of report.claims) {
      console.log(`   Claim: "${c.claimText.substring(0, 60)}..."`);
      console.log(`     Status: ${c.status} (Confidence: ${c.confidence}%)`);
      console.log(`     Explanation: ${c.explanation}`);
      console.log(`     Sources Count: ${c.sources.length}`);

      // Rule 1: No claim from the fake story should be marked "Verified"
      assert.notStrictEqual(c.status, 'Verified', `Fake claim should NEVER be marked Verified: "${c.claimText}"`);

      // Rule 2: Every source link MUST be a real live URL returning HTTP 200/reachable status
      for (const src of c.sources) {
        console.log(`     Verifying URL HTTP status for source: ${src.url}`);
        const isLive = await validateSourceUrl(src.url);
        assert.strictEqual(isLive, true, `Source URL must be a real live reachable webpage: ${src.url}`);
      }
    }

    assert.strictEqual(report.breakdown.verified, 0, 'Zero claims should be verified for fabricated fake news.');
  });

  // ----------------------------------------------------------------
  // TEST 2: Verifiable Real News / Scientific Event (Grounded Real Sources)
  // ----------------------------------------------------------------
  console.log('\n🔹 TEST 2: Verifiable Real Event Test...');
  const realStoryText = `
    Global tech expenditure and cloud model adoption expanded significantly in recent years.
    According to official market reports, international tech companies have invested heavily in artificial intelligence infrastructure,
    while regulatory standards across Europe require data privacy compliance for automated processing.
  `;

  await runTest('Real Event — Grounded Sourcing & URL Resolution Check', async () => {
    const inputRes = await processInputContent({ inputType: 'TEXT', text: realStoryText });
    const claims = await extractClaims(inputRes.extractedText);
    const verified = await verifyClaims(claims);
    const report = await generateReport({
      sourceTitle: inputRes.sourceTitle,
      extractedText: inputRes.extractedText,
      verifiedClaims: verified,
      selectedTypes: ['FACT_CHECKING'],
      truncated: false
    });

    console.log(`   Processed ${report.claims.length} claims for Real Story.`);

    for (const c of report.claims) {
      console.log(`   Claim: "${c.claimText.substring(0, 60)}..."`);
      console.log(`     Status: ${c.status}`);
      console.log(`     Explanation: ${c.explanation}`);

      // Verify every displayed URL actually resolves
      for (const src of c.sources) {
        console.log(`     Testing live resolution for URL: ${src.url}`);
        const isLive = await validateSourceUrl(src.url);
        assert.strictEqual(isLive, true, `Source URL must resolve: ${src.url}`);
      }
    }
  });

  console.log('\n----------------------------------------------------');
  console.log(`Verification Results: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------\n');

  if (failed > 0) process.exit(1);
}

runVerificationTests().catch(err => {
  console.error('[Verification Test Suite Error]:', err);
  process.exit(1);
});
