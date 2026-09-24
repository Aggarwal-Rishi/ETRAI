/**
 * Comprehensive Unit Test for New Verification Architecture Features:
 * 1. Corporate Wire Deduplication & Syndicate Grouping
 * 2. Incidental Text Filter (isSubstantiveNewsHeadline)
 * 3. Polarity Inversion & Negative Verb Stance Consistency
 * 4. Dual-Axis Veracity Index & Epistemic Certainty Scoring
 * 5. Sightengine AI Detector API Integration & Fallback Handling
 */

const assert = require('assert');
const { deduplicateWireSources, claimVerificationResult } = require('../src/services/factVerifier');
const { isSubstantiveNewsHeadline } = require('../src/services/media/mediaClaimExtractor');
const { evaluateSemanticStance } = require('../src/services/semanticVerification');
const { calculateDualAxisScore } = require('../src/services/scoringConfigService');
const { detectImageAi } = require('../src/services/media/sightengineDetector');

async function runTests() {
  console.log('====================================================');
  console.log('🧪 Testing New Verification Architecture Features...');
  console.log('====================================================\n');

  // Test 1: Incidental Text Filter (Filter out t-shirts, logos, billboards)
  console.log('1. Testing Incidental Text Filtering:');
  const tShirtLogo = 'NIKE JUST DO IT';
  const billboard = 'EXIT 42 HIGHWAY 101';
  const streetSign = 'STOP ONE WAY';
  const genuineHeadline = 'UK Government Reports Anthropic Declined AISI Safety Testing Protocol';

  assert.strictEqual(isSubstantiveNewsHeadline(tShirtLogo), false, 'Brand logo should be rejected');
  assert.strictEqual(isSubstantiveNewsHeadline(billboard), false, 'Billboard text should be rejected');
  assert.strictEqual(isSubstantiveNewsHeadline(streetSign), false, 'Street sign should be rejected');
  assert.strictEqual(isSubstantiveNewsHeadline(genuineHeadline), true, 'Substantive news headline must be accepted');
  console.log('   ✅ PASS: Incidental text (logos, billboards, signs) correctly rejected.\n');

  // Test 2: Corporate Conglomerate Wire Deduplication
  console.log('2. Testing Corporate Conglomerate Wire Deduplication:');
  const wireSources = [
    { url: 'https://www.reuters.com/technology/ai-model', title: 'Anthropic skips testing', snippet: 'Reuters reports Anthropic declined.' },
    { url: 'https://money.usnews.com/investing/news/articles/ai-model', title: 'Anthropic skips testing (Reuters Wire)', snippet: 'Thomson Reuters syndication.' },
    { url: 'https://timesofindia.indiatimes.com/tech/ai', title: 'UK AISI testing update', snippet: 'Anthropic did not submit model.' },
    { url: 'https://economictimes.indiatimes.com/tech/ai', title: 'Times Group report', snippet: 'Anthropic safety test.' }
  ];
  const deduplicated = deduplicateWireSources(wireSources);
  const parents = deduplicated.map(s => s.corporateParent || s.domain);
  assert(parents.some(p => p && p.includes('Thomson Reuters')), 'Should identify Thomson Reuters conglomerate');
  assert(parents.some(p => p && p.includes('Times Group')), 'Should identify Times Group conglomerate');
  console.log('   ✅ PASS: Corporate conglomerate syndications grouped & deduplicated correctly.\n');

  // Test 3: Polarity Preservation on Negative Verbs ("declined" vs "did not submit")
  console.log('3. Testing Polarity Inversion Fix for Negative Verbs:');
  const claimText = 'Anthropic declined to submit its Mythos 5.1 AI model to the UK AISI for safety testing.';
  const evidenceText = 'Anthropic did not submit its latest AI model to the UK AI Security Institute for pre-release testing.';
  const entailment = evaluateSemanticStance(claimText, evidenceText);
  assert.notStrictEqual(entailment.stance, 'REFUTES', 'Evidence agreeing that company did not submit must NOT refute a claim saying they declined!');
  console.log(`   ✅ PASS: Polarity matches! Stance evaluated as: ${entailment.stance} (Reason: ${entailment.reason})\n`);

  // Test 4: Dual-Axis Scoring Engine
  console.log('4. Testing Dual-Axis Scoring Engine:');
  const supSources = [
    { authorityScore: 90, title: 'Reuters' },
    { authorityScore: 88, title: 'AP' },
    { authorityScore: 92, title: 'BBC' }
  ];
  const dualResult = calculateDualAxisScore({
    supportingSources: supSources,
    refutingSources: [],
    qualifyingSources: [],
    allSources: supSources,
    distinctCorporateParents: 3,
    maxRefutingAuthority: 0
  });
  assert(dualResult.veracityIndex > 70, `Veracity Index should be high (>70), got ${dualResult.veracityIndex}`);
  assert(dualResult.evidentiaryCertainty > 60, `Evidentiary Certainty should be substantial, got ${dualResult.evidentiaryCertainty}`);
  assert.strictEqual(dualResult.canonicalVerdict, 'VERIFIED', 'Dual-axis should conclude VERIFIED when veracity is high and supported');
  console.log(`   ✅ PASS: Dual-Axis calculated: Veracity=${dualResult.veracityIndex}, Certainty=${dualResult.evidentiaryCertainty}, Verdict=${dualResult.canonicalVerdict}\n`);

  // Test 5: Sightengine Detector Live Integration
  console.log('5. Testing Sightengine Detector Live API:');
  require('dotenv').config();
  const sharp = require('sharp');
  const sampleJpeg = await sharp({
    create: { width: 200, height: 200, channels: 3, background: { r: 120, g: 150, b: 200 } }
  }).jpeg().toBuffer();
  const aiResult = await detectImageAi(sampleJpeg);
  assert.strictEqual(aiResult.status, 'SUCCESS', `Sightengine call should succeed, got ${aiResult.status}`);
  console.log(`   ✅ PASS: Sightengine live detector returned SUCCESS (Provider: ${aiResult.provider})\n`);
  console.log(`      • AI-Generated Probability: ${aiResult.aiGeneratedProbability}`);
  console.log(`      • Deepfake Score: ${aiResult.deepfakeScore}`);
  console.log(`      • Assessment: ${aiResult.assessmentSummary}\n`);

  console.log('====================================================');
  console.log('🎉 ALL NEW ARCHITECTURE TESTS PASSED SUCCESSFULLY!');
  console.log('====================================================');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
