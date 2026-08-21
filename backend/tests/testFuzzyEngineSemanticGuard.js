const assert = require('assert');
const { evaluateFuzzyVerdict, determineEvidenceState } = require('../src/services/fuzzyEngine');

async function runFuzzyEngineSemanticGuardTests() {
  console.log('==============================================');
  console.log('🧪 Running Fuzzy Engine Semantic Guard Tests...');
  console.log('==============================================\n');

  let passed = 0;
  let failed = 0;

  const runTest = (name, fn) => {
    try {
      fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (e) {
      console.error(`  ❌ FAIL: ${name} -> ${e.message}`);
      failed++;
    }
  };

  // Test 1: Local claim with zero coverage
  runTest('1. Local claim with zero coverage -> evidenceState INSUFFICIENT, verdict SUSPICIOUS (not FABRICATED)', () => {
    const res = evaluateFuzzyVerdict({
      corroborationScore: 0,
      sourceCredibilityScore: 0.5,
      sentimentIntensity: 0.1,
      claimSignificance: 40,
      modelConfidence: 75,
      discourseVolume: 0,
      socialCorroborationScore: 0,
      communitySkepticismScore: 0,
      claimScope: 'Local',
      supportingCount: 0,
      refutingCount: 0,
      plausibilityFlag: false
    });

    assert.strictEqual(res.evidenceState, 'INSUFFICIENT');
    assert.strictEqual(res.verdict, 'SUSPICIOUS', `Zero-coverage local claim must evaluate to SUSPICIOUS, got ${res.verdict}`);
    assert.notStrictEqual(res.verdict, 'FABRICATED', 'Zero-coverage local claim must NEVER be FABRICATED');
    assert.ok(res.crispScore >= 35, 'Crisp score must be clamped >= 35');
  });

  // Test 2: National claim with zero coverage
  runTest('2. National claim with zero coverage -> evidenceState INSUFFICIENT, verdict SUSPICIOUS (not FABRICATED)', () => {
    const res = evaluateFuzzyVerdict({
      corroborationScore: 0,
      sourceCredibilityScore: 0.5,
      sentimentIntensity: 0.2,
      claimSignificance: 60,
      modelConfidence: 75,
      discourseVolume: 0,
      socialCorroborationScore: 0,
      communitySkepticismScore: 0,
      claimScope: 'National',
      supportingCount: 0,
      refutingCount: 0,
      plausibilityFlag: false
    });

    assert.strictEqual(res.evidenceState, 'INSUFFICIENT');
    assert.strictEqual(res.verdict, 'SUSPICIOUS', `Zero-coverage national claim must evaluate to SUSPICIOUS, got ${res.verdict}`);
    assert.notStrictEqual(res.verdict, 'FABRICATED');
  });

  // Test 3: International major claim with zero coverage
  runTest('3. International major claim with zero coverage -> evidenceState INSUFFICIENT, verdict SUSPICIOUS (not FABRICATED)', () => {
    const res = evaluateFuzzyVerdict({
      corroborationScore: 0,
      sourceCredibilityScore: 0.5,
      sentimentIntensity: 0.3,
      claimSignificance: 90,
      modelConfidence: 75,
      discourseVolume: 0,
      socialCorroborationScore: 0,
      communitySkepticismScore: 0,
      claimScope: 'International',
      supportingCount: 0,
      refutingCount: 0,
      plausibilityFlag: false
    });

    assert.strictEqual(res.evidenceState, 'INSUFFICIENT');
    assert.strictEqual(res.verdict, 'SUSPICIOUS', `Major International zero-coverage claim must evaluate to SUSPICIOUS, got ${res.verdict}`);
    assert.notStrictEqual(res.verdict, 'FABRICATED', 'Absence of evidence alone must NEVER produce FABRICATED even for major global claims');
  });

  // Test 4: Supported claim
  runTest('4. Supported claim -> evidenceState SUPPORTED, verdict TRUSTED', () => {
    const res = evaluateFuzzyVerdict({
      corroborationScore: 10.0,
      sourceCredibilityScore: 0.90,
      sentimentIntensity: 0.1,
      claimSignificance: 70,
      modelConfidence: 85,
      discourseVolume: 5,
      socialCorroborationScore: 0.8,
      communitySkepticismScore: 0,
      claimScope: 'National',
      supportingCount: 3,
      refutingCount: 0,
      plausibilityFlag: false
    });

    assert.strictEqual(res.evidenceState, 'SUPPORTED');
    assert.strictEqual(res.verdict, 'TRUSTED');
    assert.ok(res.crispScore >= 65);
  });

  // Test 5: Refuted claim
  runTest('5. Refuted claim -> evidenceState REFUTED, verdict FABRICATED', () => {
    const res = evaluateFuzzyVerdict({
      corroborationScore: 0,
      sourceCredibilityScore: 0.8,
      sentimentIntensity: 0.4,
      claimSignificance: 80,
      modelConfidence: 85,
      discourseVolume: 2,
      socialCorroborationScore: 0,
      communitySkepticismScore: 0.8,
      claimScope: 'National',
      supportingCount: 0,
      refutingCount: 2,
      plausibilityFlag: false
    });

    assert.strictEqual(res.evidenceState, 'REFUTED');
    assert.strictEqual(res.verdict, 'FABRICATED', `Refuted claim with refuting evidence must evaluate to FABRICATED, got ${res.verdict}`);
  });

  // Test 6: Mixed evidence
  runTest('6. Mixed evidence -> evidenceState MIXED, verdict SUSPICIOUS', () => {
    const res = evaluateFuzzyVerdict({
      corroborationScore: 3.3,
      sourceCredibilityScore: 0.6,
      sentimentIntensity: 0.3,
      claimSignificance: 70,
      modelConfidence: 75,
      discourseVolume: 2,
      socialCorroborationScore: 0.4,
      communitySkepticismScore: 0.4,
      claimScope: 'National',
      supportingCount: 1,
      refutingCount: 1,
      plausibilityFlag: false
    });

    assert.strictEqual(res.evidenceState, 'MIXED');
    assert.strictEqual(res.verdict, 'SUSPICIOUS', `Mixed evidence claim must evaluate to SUSPICIOUS, got ${res.verdict}`);
  });

  console.log('\n----------------------------------------------');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------\n');

  if (failed > 0) process.exit(1);
}

runFuzzyEngineSemanticGuardTests();
