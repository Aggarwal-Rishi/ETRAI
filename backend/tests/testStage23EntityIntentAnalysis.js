const assert = require('assert');
const {
  performEntityAndIntentAnalysis,
  extractEntitiesDeterministic,
  extractQuotesAndAttributions,
  inferPotentialIntent
} = require('../src/services/entityIntentService');

async function runStage23EntityIntentAnalysisTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING STAGE 23: ENTITY AND INTENT ANALYSIS TEST SUITE');
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
  // Test 1: Named Entity Extraction & Normalization
  // ----------------------------------------------------------------
  await runTest('1. Extracts and normalizes Governments, Companies, People, and Locations', async () => {
    const text = 'The Ministry of Finance and RBI issued joint guidelines in Mumbai regarding Tata Motors credit facility allocations.';
    const entities = extractEntitiesDeterministic(text);

    assert.ok(entities.length >= 3);
    const mof = entities.find(e => e.normalizedName === 'Ministry of Finance');
    const rbi = entities.find(e => e.normalizedName === 'Reserve Bank of India (RBI)');
    const tata = entities.find(e => e.normalizedName === 'Tata Motors Limited');

    assert.ok(mof, 'Must resolve Ministry of Finance');
    assert.strictEqual(mof.type, 'GOVERNMENT_BODY');
    assert.ok(rbi, 'Must resolve RBI');
    assert.strictEqual(rbi.type, 'GOVERNMENT_BODY');
    assert.ok(tata, 'Must resolve Tata Motors');
    assert.strictEqual(tata.type, 'COMPANY');
  });

  // ----------------------------------------------------------------
  // Test 2: Quote & Speaker Attribution Extraction
  // ----------------------------------------------------------------
  await runTest('2. Extracts direct quotes, identifies attributed speakers, and marks unattributed claims', async () => {
    const text = 'Governor Shaktikanta Das stated "Inflation remains under the 4% target band for the third consecutive quarter." Meanwhile, an anonymous blog claimed "Banks will freeze accounts next week."';
    const quotes = extractQuotesAndAttributions(text);

    assert.strictEqual(quotes.length, 2);
    const attributed = quotes.find(q => q.hasAttributedSpeaker);
    assert.ok(attributed);
    assert.ok(attributed.attributedSpeaker.includes('Governor Shaktikanta Das'));
    assert.strictEqual(attributed.verificationStatus, 'ATTRIBUTED_STATEMENT');

    const unattributed = quotes.find(q => !q.hasAttributedSpeaker || q.quoteText.includes('Banks will freeze'));
    assert.ok(unattributed);
  });

  // ----------------------------------------------------------------
  // Test 3: Intent Classification - Fearmongering & Public Panic
  // ----------------------------------------------------------------
  await runTest('3. Classifies fearmongering/panic intent with analytical inference flag and reasoning', async () => {
    const alarmistText = 'URGENT: Immediate nationwide blackout and severe food shortage warning issued as toxic chemical water contamination collapses regional supply chains!';
    const intent = inferPotentialIntent(alarmistText);

    assert.strictEqual(intent.primaryIntent, 'FEARMONGERING_OR_PANIC');
    assert.strictEqual(intent.isAnalyticalInference, true, 'Intent MUST be marked as analytical inference');
    assert.ok(intent.confidence >= 60);
    assert.ok(intent.reasoning.includes('alarmist') || intent.reasoning.includes('panic'));
    assert.strictEqual(intent.misinformationTargeting.potentialHarmVector, 'PUBLIC_PANIC_RISK');
  });

  // ----------------------------------------------------------------
  // Test 4: Intent Classification - Financial Market Manipulation
  // ----------------------------------------------------------------
  await runTest('4. Classifies financial market manipulation and speculative pump cues', async () => {
    const financialText = 'Insiders confirm massive rally incoming: Stock target price expected to soar 500% after secret billion profit government contract clears tomorrow. Buy now!';
    const intent = inferPotentialIntent(financialText);

    assert.strictEqual(intent.primaryIntent, 'FINANCIAL_MARKET_MANIPULATION');
    assert.strictEqual(intent.isAnalyticalInference, true);
    assert.ok(intent.confidence >= 60);
    assert.strictEqual(intent.misinformationTargeting.potentialHarmVector, 'MARKET_DISTORTION_RISK');
  });

  // ----------------------------------------------------------------
  // Test 5: Intent Rule - Never presents intent as unquestionable fact
  // ----------------------------------------------------------------
  await runTest('5. Intent Rule: Standard informational text defaults to INFORMATIONAL with moderate confidence', async () => {
    const neutralText = 'The meteorological department recorded 45mm of rainfall across the coastal district during the 24-hour observation period ending at 8:30 AM.';
    const intent = inferPotentialIntent(neutralText);

    assert.strictEqual(intent.primaryIntent, 'INFORMATIONAL');
    assert.strictEqual(intent.isAnalyticalInference, true);
    assert.strictEqual(intent.misinformationTargeting.potentialHarmVector, 'MINIMAL_RISK');
  });

  // ----------------------------------------------------------------
  // Test 6: Full Entity & Intent Analysis Integration
  // ----------------------------------------------------------------
  await runTest('6. performEntityAndIntentAnalysis aggregates entities, quotes, geographic relevance, and intent', async () => {
    const fullText = 'Ministry of Commerce and DGFT announced in New Delhi: "Non-basmati white rice export quotas have been maintained without revision."';
    const res = await performEntityAndIntentAnalysis(fullText);

    assert.ok(res.entitiesCount >= 2);
    assert.strictEqual(res.quotesCount, 1);
    assert.strictEqual(res.geographicRelevance.primaryJurisdiction, 'National');
    assert.strictEqual(res.summary.primaryIntent, 'INFORMATIONAL');
    assert.strictEqual(res.summary.isAnalyticalInference, true);
  });

  console.log('\n================================================================');
  console.log(`🏆 STAGE 23 TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runStage23EntityIntentAnalysisTests();
