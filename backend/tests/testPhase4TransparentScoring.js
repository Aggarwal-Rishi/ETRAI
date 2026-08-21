/**
 * ETRAI Phase 4 Test Suite: Transparent Deterministic Scoring System & Versioning
 */

'use strict';

const assert = require('assert');
const {
  SCORING_VERSION,
  GLOBAL_SCORING_FACTORS,
  PENALTY_CATALOG,
  normalizeActiveWeights,
  computeExplainableTrustScore
} = require('../src/services/explainableScoringService');

async function runTests() {
  console.log('================================================================');
  console.log('🧪 ETRAI PHASE 4 TEST SUITE: TRANSPARENT SCORING & AUDITABILITY');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ FAIL: ${name}`);
      console.error(`   Error: ${err.message}`);
      if (err.stack) console.error(`   Stack: ${err.stack.split('\n')[1]}`);
      failed++;
    }
  }

  // ── SECTION 1: WEIGHT NORMALIZATION & DYNAMIC ACTIVATION ───────────────────
  console.log('--- [SECTION 1] Weight Normalization & Dynamic Factor Activation ---');

  await test('1.1 Plain text input deactivates media and document factors and normalizes weights to 1.0', async () => {
    const textAnalysis = {
      inputType: 'TEXT',
      verifiedClaims: [
        {
          verdict: 'SUPPORTED',
          sources: [{ domain: 'pib.gov.in', authorityScore: 98, stance: 'SUPPORTS' }]
        }
      ]
    };

    const res = computeExplainableTrustScore(textAnalysis);
    assert.strictEqual(res.scoringVersion, SCORING_VERSION);
    assert.strictEqual(res.activeFactorsCount, 8, 'Text-only analysis must only activate 8 non-media non-doc factors');

    const totalNormalizedWeight = res.factorBreakdown.reduce((sum, f) => sum + f.weight, 0);
    assert(Math.abs(totalNormalizedWeight - 100) < 0.2, `Weights must sum to ~100%, got ${totalNormalizedWeight}`);
  });

  await test('1.2 Media input activates Media Integrity factor without distorting normalization', async () => {
    const mediaAnalysis = {
      inputType: 'PHOTO',
      mediaAnalysis: {
        forensics: { c2pa: { hasC2paManifest: true } }
      },
      verifiedClaims: [
        {
          verdict: 'SUPPORTED',
          sources: [{ domain: 'reuters.com', authorityScore: 93, stance: 'SUPPORTS' }]
        }
      ]
    };

    const res = computeExplainableTrustScore(mediaAnalysis);
    assert.strictEqual(res.activeFactorsCount, 9, 'Photo analysis must activate 9 factors (including Media Integrity)');
    const mediaFactor = res.factorBreakdown.find(f => f.factorKey === 'mediaIntegrity');
    assert(mediaFactor, 'Must contain mediaIntegrity factor');
    assert.strictEqual(mediaFactor.rawScore, 100, 'Signed C2PA manifest must yield 100 media score');
  });

  // ── SECTION 2: DETERMINISTIC FACTOR SCORES & PENALTIES ─────────────────────
  console.log('\n--- [SECTION 2] Factor Derivations & Explicit Penalty Deductions ---');

  await test('2.1 Verified claims from authoritative independent sources generate high base score', async () => {
    const highTrustData = {
      inputType: 'TEXT',
      verifiedClaims: [
        {
          verdict: 'SUPPORTED',
          sources: [
            { domain: 'rbi.org.in', authorityScore: 99, stance: 'SUPPORTS', syndicationGroup: 'RBI_OFFICIAL' },
            { domain: 'reuters.com', authorityScore: 93, stance: 'SUPPORTS', syndicationGroup: 'REUTERS_GLOBAL' }
          ]
        },
        {
          verdict: 'SUPPORTED',
          sources: [
            { domain: 'thehindu.com', authorityScore: 89, stance: 'SUPPORTS', syndicationGroup: 'KASTURI_GROUP' }
          ]
        }
      ],
      provenance: { originConfidence: 'CONFIRMED' }
    };

    const res = computeExplainableTrustScore(highTrustData);
    assert(res.overallTrustScore >= 85, `Score should be >= 85 for verified official data, got ${res.overallTrustScore}`);
    assert.strictEqual(res.verdict, 'HIGHLY_SUPPORTED');
    assert.strictEqual(res.appliedPenalties.length, 0);
  });

  await test('2.2 Direct refutations apply exact penalty deductions and clamp final verdict', async () => {
    const refutedData = {
      inputType: 'TEXT',
      verifiedClaims: [
        {
          verdict: 'FALSE',
          sources: [
            { domain: 'snopes.com', authorityScore: 92, stance: 'REFUTES' }
          ]
        }
      ]
    };

    const res = computeExplainableTrustScore(refutedData);
    assert(res.totalPenalties >= 25, 'Direct refutation must deduct at least 25 points');
    assert.strictEqual(res.verdict, 'FALSE', 'Direct refutation must clamp verdict to FALSE');
    const refutationPenalty = res.appliedPenalties.find(p => p.code === 'DIRECT_REFUTATION');
    assert(refutationPenalty, 'Must identify DIRECT_REFUTATION penalty');
  });

  await test('2.3 Unresolved contradictory evidence between authorities triggers contradiction penalty and MIXED verdict', async () => {
    const conflictData = {
      inputType: 'TEXT',
      verifiedClaims: [
        {
          verdict: 'DISPUTED',
          sources: [
            { domain: 'pib.gov.in', authorityScore: 99, stance: 'SUPPORTS' },
            { domain: 'thehindu.com', authorityScore: 89, stance: 'REFUTES' }
          ]
        }
      ]
    };

    const res = computeExplainableTrustScore(conflictData);
    assert.strictEqual(res.verdict, 'MIXED', 'Conflicting authoritative evidence must yield MIXED verdict');
    const disputePenalty = res.appliedPenalties.find(p => p.code === 'UNRESOLVED_CONTRADICTION');
    assert(disputePenalty, 'Must apply UNRESOLVED_CONTRADICTION penalty');
  });

  // ── SECTION 3: EXPLANATIONS & COUNTER-FACTUALS ────────────────────────────
  console.log('\n--- [SECTION 3] Score Explanations & Dynamic Counter-Factuals ---');

  await test('3.1 Positive and negative drivers accurately explain score derivation', async () => {
    const data = {
      inputType: 'TEXT',
      verifiedClaims: [
        { verdict: 'SUPPORTED', sources: [{ domain: 'pib.gov.in', authorityScore: 99, stance: 'SUPPORTS' }] },
        { verdict: 'UNVERIFIED', sources: [] }
      ]
    };

    const res = computeExplainableTrustScore(data);
    assert(res.drivers.positiveDrivers.some(d => d.includes('Corroborated 1 factual proposition')), 'Must mention corroborated proposition');
    assert(res.drivers.negativeDrivers.some(d => d.includes('lack independent corroborating sources')), 'Must mention unverified assertion');
  });

  await test('3.2 Dynamic counter-factual conditions calculate real mathematical impact', async () => {
    const unverifiedData = {
      inputType: 'TEXT',
      verifiedClaims: [
        { verdict: 'UNVERIFIED', sources: [] },
        { verdict: 'UNVERIFIED', sources: [] }
      ]
    };

    const res = computeExplainableTrustScore(unverifiedData);
    assert(res.counterfactualConditions.length > 0);
    const unverifiedImpact = res.counterfactualConditions.find(c => c.condition.includes('unverified'));
    assert(unverifiedImpact, 'Must provide counter-factual for unverified claims');
    assert(unverifiedImpact.impactScore > 0, 'Impact score must be a positive mathematical number');
  });

  await test('3.3 Score reproducibility: Same inputs always yield identical score and breakdown', async () => {
    const testPayload = {
      inputType: 'TEXT',
      verifiedClaims: [
        { verdict: 'SUPPORTED', sources: [{ domain: 'bbc.com', authorityScore: 91, stance: 'SUPPORTS' }] }
      ]
    };

    const run1 = computeExplainableTrustScore(testPayload);
    const run2 = computeExplainableTrustScore(testPayload);

    assert.strictEqual(run1.overallTrustScore, run2.overallTrustScore);
    assert.strictEqual(run1.verdict, run2.verdict);
    assert.strictEqual(run1.weightedBaseScore, run2.weightedBaseScore);
    assert.deepStrictEqual(run1.factorBreakdown, run2.factorBreakdown);
  });

  console.log('\n================================================================');
  console.log(`🏆 PHASE 4 TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
