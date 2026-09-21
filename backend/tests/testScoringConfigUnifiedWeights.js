const assert = require('assert');
const {
  DEFAULT_GLOBAL_WEIGHTS,
  getGlobalScoringWeights,
  updateGlobalScoringWeights,
  resetGlobalScoringWeights,
  calculateClaimScore,
  normalizeWeights
} = require('../src/services/scoringConfigService');

console.log('🧪 Running Unit Tests: Global Scoring Weights Service & Unified Formula...');

// Test 1: Defaults sum to 1.0
const defaults = getGlobalScoringWeights();
const sumDefaults = Number((defaults.evidenceQuality + defaults.sourceAuthority + defaults.sourceAgreement + defaults.sourceIndependence).toFixed(4));
assert.strictEqual(sumDefaults, 1.0, `Default weights should sum to 1.0, got ${sumDefaults}`);
console.log('✅ Test 1 Passed: Default weights sum to 1.0 (100%)');

// Test 2: Normalization of custom raw weights
const normalized = normalizeWeights({
  evidenceQuality: 40,
  sourceAuthority: 20,
  sourceAgreement: 20,
  sourceIndependence: 20
});
assert.strictEqual(normalized.evidenceQuality, 0.4);
assert.strictEqual(normalized.sourceAuthority, 0.2);
assert.strictEqual(normalized.sourceAgreement, 0.2);
assert.strictEqual(normalized.sourceIndependence, 0.2);
console.log('✅ Test 2 Passed: Custom raw weights normalized accurately to 1.0');

// Test 3: Deterministic Claim Score Calculation
// If factors are all 100, score should be 100
const maxScore = calculateClaimScore({
  evidenceQuality: 100,
  sourceAuthority: 100,
  sourceAgreement: 100,
  sourceIndependence: 100
});
assert.strictEqual(maxScore, 100, `Max score should be 100, got ${maxScore}`);

// If factors are all 0, score should be 0
const zeroScore = calculateClaimScore({
  evidenceQuality: 0,
  sourceAuthority: 0,
  sourceAgreement: 0,
  sourceIndependence: 0
});
assert.strictEqual(zeroScore, 0, `Zero score should be 0, got ${zeroScore}`);

// Specific factor mix with defaults (30% EQ, 25% SA, 25% SAG, 20% SI)
// 80*0.3 + 90*0.25 + 100*0.25 + 50*0.20 = 24 + 22.5 + 25 + 10 = 81.5 -> 82
const expectedScore = Math.round(80 * 0.30 + 90 * 0.25 + 100 * 0.25 + 50 * 0.20);
const calcScore = calculateClaimScore({
  evidenceQuality: 80,
  sourceAuthority: 90,
  sourceAgreement: 100,
  sourceIndependence: 50
}, DEFAULT_GLOBAL_WEIGHTS);
assert.strictEqual(calcScore, expectedScore, `Expected ${expectedScore}, got ${calcScore}`);
console.log('✅ Test 3 Passed: Deterministic claim score calculation matches exact formula');

// Test 4: Update and Reset Global Weights
updateGlobalScoringWeights({
  evidenceQuality: 0.50,
  sourceAuthority: 0.20,
  sourceAgreement: 0.20,
  sourceIndependence: 0.10
});
const updated = getGlobalScoringWeights();
assert.strictEqual(updated.evidenceQuality, 0.50);

resetGlobalScoringWeights();
const reset = getGlobalScoringWeights();
assert.strictEqual(reset.evidenceQuality, 0.30);
console.log('✅ Test 4 Passed: Update and Reset global weights persist and restore defaults');

console.log('🎉 All Scoring Config Unit Tests Passed Successfully!');
