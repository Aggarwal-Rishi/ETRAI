'use strict';

const assert = require('assert');
const { computeExplainableTrustScore } = require('../src/services/explainableScoringService');
const { generateReport } = require('../src/services/reportGenerator');

async function testScoreDerivationRealWiring() {
  console.log('\n================================================================');
  console.log('🧪 AUDITING SCORE DERIVATION & REAL FACTOR WIRING');
  console.log('================================================================\n');

  // --------------------------------------------------------------------------
  // TEST 1: Clean, Highly Supported Text Analysis (Soumitra Dutta Cornell Dean)
  // --------------------------------------------------------------------------
  console.log('▶ Test 1: Highly Supported Text Analysis (Real Data Consistency)');
  
  const textAnalysisData = {
    sourceTitle: 'Soumitra Dutta Dean Appointment Fact Check',
    extractedText: 'Soumitra Dutta was a professor of management and founding dean of the SC Johnson College of Business at Cornell University.',
    verifiedClaims: [
      {
        claim: 'Soumitra Dutta was a professor of management and the founding dean of the SC Johnson College of Business at Cornell University.',
        claimText: 'Soumitra Dutta was a professor of management and the founding dean of the SC Johnson College of Business at Cornell University.',
        verdict: 'VERIFIED',
        status: 'TRUSTED',
        confidence: 94.5,
        sources: [
          { domain: 'cornell.edu', authorityScore: 95, stance: 'SUPPORTS', relationship: 'SUPPORTS' },
          { domain: 'reuters.com', authorityScore: 92, stance: 'SUPPORTS', relationship: 'SUPPORTS' },
          { domain: 'ox.ac.uk', authorityScore: 96, stance: 'SUPPORTS', relationship: 'SUPPORTS' }
        ]
      }
    ],
    sources: [
      { domain: 'cornell.edu', authorityScore: 95, stance: 'SUPPORTS' },
      { domain: 'reuters.com', authorityScore: 92, stance: 'SUPPORTS' },
      { domain: 'ox.ac.uk', authorityScore: 96, stance: 'SUPPORTS' }
    ],
    provenance: { originConfidence: 'CONFIRMED' },
    mediaAnalysis: null, // Pure text analysis
    inputType: 'TEXT'
  };

  const textScoring = computeExplainableTrustScore(textAnalysisData);
  
  console.log(`  - Computed Final Trust Score: ${textScoring.finalTrustScore}/100`);
  console.log(`  - Active Factors Count: ${textScoring.activeFactorsCount}`);
  console.log(`  - Factor Breakdown:`);
  textScoring.factorBreakdown.forEach(f => {
    console.log(`    • ${f.n} (${f.w}%): Raw ${f.raw}/100 -> +${f.weightedContribution} pts`);
  });
  console.log(`  - Direct Penalties: ${JSON.stringify(textScoring.appliedPenalties)}`);

  // Assertions for Test 1
  assert.ok(textScoring.finalTrustScore >= 90, `Expected high trust score for supported claim, got ${textScoring.finalTrustScore}`);
  
  // Check factor scores are high (not placeholder 24, 12, 30)
  const evidenceFactor = textScoring.factorBreakdown.find(f => f.k === 'claimEvidenceMatch');
  const authFactor = textScoring.factorBreakdown.find(f => f.k === 'sourceAuthority');
  const corrobFactor = textScoring.factorBreakdown.find(f => f.k === 'independentCorroboration');
  
  assert.ok(evidenceFactor && evidenceFactor.raw >= 90, `Claim-evidence match should be >= 90, got ${evidenceFactor?.raw}`);
  assert.ok(authFactor && authFactor.raw >= 90, `Source authority should be >= 90, got ${authFactor?.raw}`);
  assert.ok(corrobFactor && corrobFactor.raw >= 90, `Independent corroboration should be >= 90, got ${corrobFactor?.raw}`);
  
  // Assert NO media penalties applied to text-only analysis
  assert.strictEqual(textScoring.appliedPenalties.length, 0, 'Text analysis should have 0 penalties applied');
  assert.strictEqual(textScoring.totalPenalties, 0, 'Penalty total should be 0');
  
  // Check mediaIntegrity factor is NOT present in text-only active factors
  const mediaFactor = textScoring.factorBreakdown.find(f => f.k === 'mediaIntegrity');
  assert.strictEqual(mediaFactor, undefined, 'Media integrity should NOT be an active factor for text-only input');

  // Verify generateReport synchronizes scores with explainableScoring
  const textReport = await generateReport(textAnalysisData);
  assert.strictEqual(textReport.trustScore, textReport.explainableScoring.finalTrustScore, 'report.trustScore must equal report.explainableScoring.finalTrustScore');
  assert.strictEqual(textReport.scores.overallTrustScore, textReport.trustScore, 'report.scores.overallTrustScore must equal trustScore');
  assert.strictEqual(textReport.scores.confidenceRating, textReport.trustScore, 'report.scores.confidenceRating must match trustScore');
  console.log(`  - Report Synchronized Canonical Trust Score: ${textReport.trustScore}/100`);
  console.log('  ✓ [PASS] Text analysis scoring is fully consistent, high-confidence, and penalty-free!\n');

  // --------------------------------------------------------------------------
  // TEST 2: Genuine Media Analysis with Detected Image Manipulation
  // --------------------------------------------------------------------------
  console.log('▶ Test 2: Media Analysis with Detected Pixel-Level Manipulation');
  
  const mediaAnalysisData = {
    sourceTitle: 'Doctored Press Photo Analysis',
    extractedText: 'Photo claiming official summit meeting.',
    verifiedClaims: [
      {
        claim: 'Official summit meeting took place at Geneva headquarters.',
        verdict: 'FALSE',
        status: 'FABRICATED',
        confidence: 90,
        sources: [
          { domain: 'afp.com', authorityScore: 92, stance: 'REFUTES', relationship: 'REFUTES' }
        ]
      }
    ],
    mediaAnalysis: {
      mediaType: 'PHOTO',
      forensicVerdict: 'MANIPULATION_DETECTED',
      ela: { isManipulatedLikely: true },
      manipulationSignals: [{ type: 'ELA_ANOMALY', severity: 'HIGH' }]
    },
    inputType: 'PHOTO'
  };

  const mediaScoring = computeExplainableTrustScore(mediaAnalysisData);
  
  console.log(`  - Computed Final Trust Score: ${mediaScoring.finalTrustScore}/100`);
  console.log(`  - Active Factors Count: ${mediaScoring.activeFactorsCount}`);
  console.log(`  - Direct Penalties:`);
  mediaScoring.appliedPenalties.forEach(p => {
    console.log(`    • ${p.label || p.reason}: -${p.pointsDeducted} pts`);
  });

  // Check mediaIntegrity factor IS present
  const mediaIntegrityFactor = mediaScoring.factorBreakdown.find(f => f.k === 'mediaIntegrity');
  assert.ok(mediaIntegrityFactor, 'Media integrity factor must be present for media input');
  assert.ok(mediaIntegrityFactor.raw <= 30, `Media integrity score should be low, got ${mediaIntegrityFactor.raw}`);

  // Check VERIFIED_MANIPULATION penalty IS applied
  const manipulationPenalty = mediaScoring.appliedPenalties.find(p => p.code === 'VERIFIED_MANIPULATION');
  assert.ok(manipulationPenalty, 'VERIFIED_MANIPULATION penalty must be applied for manipulated media');
  assert.strictEqual(manipulationPenalty.pointsDeducted, 30, 'Manipulation deduction should be 30 pts');
  console.log('  ✓ [PASS] Media manipulation penalty correctly applied conditionally only to media input!\n');

  // --------------------------------------------------------------------------
  // TEST 3: Mathematical Derivation Single Source of Truth
  // --------------------------------------------------------------------------
  console.log('▶ Test 3: Mathematical Derivation Single Source of Truth');
  const calculatedSum = textScoring.factorBreakdown.reduce((sum, f) => sum + (f.raw * f.w) / 100, 0);
  const derivedScore = Math.max(0, Math.min(100, Math.round(calculatedSum - textScoring.totalPenalties)));
  console.log(`  - Σ (factor_raw × weight%) = ${calculatedSum.toFixed(1)}`);
  console.log(`  - Total Penalties = -${textScoring.totalPenalties.toFixed(1)}`);
  console.log(`  - Mathematical Result = ${derivedScore}/100`);
  console.log(`  - Canonical Final Trust Score = ${textScoring.finalTrustScore}/100`);
  assert.strictEqual(derivedScore, textScoring.finalTrustScore, 'Mathematical derivation must exactly equal finalTrustScore');
  console.log('  ✓ [PASS] Arithmetic and canonical single-source-of-truth verified!\n');

  console.log('================================================================');
  console.log('🏁 ALL SCORE DERIVATION REAL WIRING TESTS PASSED!');
  console.log('================================================================\n');
}

testScoreDerivationRealWiring().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
