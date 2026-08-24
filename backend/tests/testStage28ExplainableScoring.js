const assert = require('assert');
const { computeExplainableTrustScore, DEFAULT_WEIGHTS } = require('../src/services/explainableScoringService');

async function runStage28ExplainableScoringTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING STAGE 28: FULLY EXPLAINABLE TRUST SCORING TESTS');
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
  // Test 1: Factor Scores & Transparent Weight Attribution
  // ----------------------------------------------------------------
  await runTest('1. Exposes factor scores, weights, raw inputs, and positive/negative drivers', async () => {
    const analysisData = {
      verifiedClaims: [
        {
          id: 'c1',
          claimText: 'Clean energy outlay reached ₹10,000 Cr',
          verdict: 'VERIFIED',
          sources: [
            { domain: 'pib.gov.in', authorityRank: 1, authorityScore: 95, stance: 'SUPPORTS' },
            { domain: 'thehindu.com', authorityRank: 2, authorityScore: 85, stance: 'SUPPORTS' }
          ]
        }
      ],
      provenance: { originConfidence: 'CONFIRMED' }
    };

    const res = computeExplainableTrustScore(analysisData);

    assert.ok(res.finalTrustScore >= 80);
    // A verified claim without an explicit confidence remains calibrated at 85,
    // rather than being promoted to absolute certainty.
    assert.ok(res.factorScores.claimTruthfulness.score === 85);
    assert.ok(res.factorScores.sourceAuthority.score === 90);
    assert.ok(res.factorScores.provenanceConfidence.score === 100);
    assert.ok(res.drivers.positiveDrivers.length >= 2);
    assert.strictEqual(res.appliedPenalties.length, 0);
  });

  // ----------------------------------------------------------------
  // Test 2: Monotonicity Guarantee (Evidence Addition Strictly Increases/Maintains Score)
  // ----------------------------------------------------------------
  await runTest('2. Monotonicity: Adding an authoritative supporting source strictly increases or maintains score', async () => {
    const baseData = {
      verifiedClaims: [
        {
          id: 'c1',
          claimText: 'Satellite launch scheduled for October',
          verdict: 'UNVERIFIED',
          sources: []
        }
      ]
    };
    const baseRes = computeExplainableTrustScore(baseData);

    const enrichedData = {
      verifiedClaims: [
        {
          id: 'c1',
          claimText: 'Satellite launch scheduled for October',
          verdict: 'VERIFIED',
          sources: [
            { domain: 'isro.gov.in', authorityRank: 1, authorityScore: 95, stance: 'SUPPORTS' }
          ]
        }
      ],
      provenance: { originConfidence: 'CONFIRMED' }
    };
    const enrichedRes = computeExplainableTrustScore(enrichedData);

    assert.ok(
      enrichedRes.finalTrustScore > baseRes.finalTrustScore,
      `Enriched score (${enrichedRes.finalTrustScore}) must exceed base score (${baseRes.finalTrustScore})`
    );
  });

  // ----------------------------------------------------------------
  // Test 3: Contradiction & Deception Penalties
  // ----------------------------------------------------------------
  await runTest('3. Explicit Penalties: Contradiction and deceptive redirects deduct points with transparent reasons', async () => {
    const penalizedData = {
      verifiedClaims: [
        {
          id: 'c1',
          claimText: 'Government announced immediate nationwide ban on currency',
          verdict: 'FALSE',
          sources: [
            { domain: 'rbi.org.in', authorityRank: 1, authorityScore: 95, stance: 'REFUTES' }
          ]
        }
      ],
      linkIntelligence: { hasDeceptiveRedirects: true },
      numericalAnalysis: { discrepanciesCount: 1 }
    };

    const res = computeExplainableTrustScore(penalizedData);

    assert.ok(res.appliedPenalties.length >= 3);
    assert.ok(res.finalTrustScore <= 20);
    assert.ok(res.drivers.negativeDrivers.some(d => d.includes('contradiction')));
    assert.ok(res.drivers.negativeDrivers.some(d => d.includes('Deceptive anchor')));
  });

  // ----------------------------------------------------------------
  // Test 4: Counterfactual Explanation
  // ----------------------------------------------------------------
  await runTest('4. Counterfactual: Explains what specific evidence changes would alter the score', async () => {
    const unverifiedData = {
      verifiedClaims: [
        {
          id: 'c1',
          claimText: 'Company will open 50 new tech parks',
          verdict: 'UNVERIFIED',
          sources: []
        }
      ]
    };

    const res = computeExplainableTrustScore(unverifiedData);

    assert.ok(res.counterfactualExplanation.includes('unverified claim'));
    assert.ok(res.counterfactualExplanation.includes('gazettes') || res.counterfactualExplanation.includes('regulatory'));
  });

  // ----------------------------------------------------------------
  // Test 5: Configurable Weights Override
  // ----------------------------------------------------------------
  await runTest('5. Custom weights allow workspaces to prioritize source authority and provenance', async () => {
    const testData = {
      verifiedClaims: [
        {
          id: 'c1',
          claimText: 'Policy update released',
          verdict: 'VERIFIED',
          sources: [{ domain: 'pib.gov.in', authorityScore: 100, stance: 'SUPPORTS' }]
        }
      ],
      provenance: { originConfidence: 'CONFIRMED' }
    };

    const customWeights = {
      sourceAuthority: 0.50,
      provenanceConfidence: 0.50,
      claimTruthfulness: 0.0,
      evidenceGrounding: 0.0,
      stanceAlignment: 0.0,
      sourceIndependence: 0.0,
      mediaIntegrity: 0.0
    };

    const res = computeExplainableTrustScore(testData, customWeights);

    assert.strictEqual(res.finalTrustScore, 100);
    assert.strictEqual(res.factorScores.sourceAuthority.weight, 0.5);
  });

  console.log('\n================================================================');
  console.log(`🏆 STAGE 28 TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runStage28ExplainableScoringTests();
