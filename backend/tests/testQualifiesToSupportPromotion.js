const assert = require('assert');
const {
  evaluateSemanticStance,
  classifyStanceFromDimensions
} = require('../src/services/semanticVerification');
const {
  calculateDualAxisScore
} = require('../src/services/scoringConfigService');

(async () => {
  console.log('🧪 Starting QUALIFIES -> SUPPORTS Promotion Test Suite...\n');

  // =========================================================================
  // TEST 1: Semantic Stance Promotion (Location, Temporal, Numerical)
  // =========================================================================
  console.log('Test 1: Semantic Stance Promotion on Secondary Detail Variances');

  // Case 1A: Location variance with matching core event
  const locationClaim = {
    text: 'Apple inaugurated its new regional semiconductor research laboratory in Berlin yesterday.'
  };
  const locationEvidence = {
    title: 'Apple opens European chip research center in Munich',
    snippet: 'Apple inaugurated its major new regional semiconductor research laboratory in Munich yesterday.'
  };

  const locEval = evaluateSemanticStance(locationClaim, locationEvidence);
  assert.strictEqual(locEval.stance, 'SUPPORTS', 'Location difference on corroborated core event must return SUPPORTS');
  assert.ok(locEval.reason.toLowerCase().includes('corroborated'), 'Reason must indicate corroboration');
  assert.ok(locEval.reason.toLowerCase().includes('geographic') || locEval.reason.toLowerCase().includes('jurisdiction'), 'Reason must note location/jurisdiction variance');
  console.log('  ✅ Location qualification correctly promoted to SUPPORTS with informative rationale.');

  // Case 1B: Temporal / Date variance with matching core event
  const temporalClaim = {
    text: 'NASA successfully launched the Artemis lunar satellite on November 15.'
  };
  const temporalEvidence = {
    title: 'Artemis lunar mission lift-off confirmed',
    snippet: 'NASA successfully launched the Artemis lunar satellite on November 16 following weather delays.'
  };

  const tempEval = evaluateSemanticStance(temporalClaim, temporalEvidence);
  assert.strictEqual(tempEval.stance, 'SUPPORTS', 'Date difference on corroborated core event must return SUPPORTS');
  assert.ok(tempEval.reason.toLowerCase().includes('corroborated'), 'Reason must indicate corroboration');
  assert.ok(tempEval.reason.toLowerCase().includes('temporal') || tempEval.reason.toLowerCase().includes('date'), 'Reason must note temporal variance');
  console.log('  ✅ Temporal qualification correctly promoted to SUPPORTS with informative rationale.');

  // Case 1C: Numerical scale variance with matching core event
  const numberClaim = {
    text: 'Tesla delivered 485,000 electric vehicles during the fourth quarter.'
  };
  const numberEvidence = {
    title: 'Tesla fourth quarter deliveries update',
    snippet: 'Tesla delivered 484,500 electric vehicles during the fourth quarter according to official company filings.'
  };

  const numEval = evaluateSemanticStance(numberClaim, numberEvidence);
  assert.strictEqual(numEval.stance, 'SUPPORTS', 'Numerical difference on corroborated core event must return SUPPORTS');
  assert.ok(numEval.reason.toLowerCase().includes('corroborated'), 'Reason must indicate corroboration');
  assert.ok(numEval.reason.toLowerCase().includes('numerical') || numEval.reason.toLowerCase().includes('metric'), 'Reason must note numerical variance');
  console.log('  ✅ Numerical qualification correctly promoted to SUPPORTS with informative rationale.\n');

  // =========================================================================
  // TEST 2: Dual-Axis Scoring & Verdict Determination
  // =========================================================================
  console.log('Test 2: Dual-Axis Scoring & Verdict Determination');

  // Case 2A: Supporting + Qualifying sources with 0 refuting sources
  // MUST achieve VERIFIED verdict (not demoted to PARTIALLY_VERIFIED)
  const singleDirectionScore = calculateDualAxisScore({
    supportingSources: [
      { authorityScore: 90, stance: 'SUPPORTS' },
      { authorityScore: 85, stance: 'SUPPORTS' }
    ],
    refutingSources: [],
    qualifyingSources: [
      { authorityScore: 88, stance: 'QUALIFIES' }
    ],
    neutralSources: [],
    allSources: [
      { authorityScore: 90 },
      { authorityScore: 85 },
      { authorityScore: 88 }
    ],
    distinctCorporateParents: 3,
    maxRefutingAuthority: 0
  });

  assert.strictEqual(singleDirectionScore.canonicalVerdict, 'VERIFIED', 'Corroborating reporting must achieve VERIFIED verdict');
  assert.strictEqual(singleDirectionScore.evidenceState, 'SUPPORTED');
  assert.ok(singleDirectionScore.veracityIndex >= 85, 'Veracity index must remain high with qualifying sources treated as full support');
  console.log('  ✅ Single-direction corroboration achieves VERIFIED verdict with high veracity.');

  // Case 2B: Genuine MIXED reporting (supporting vs refuting sources)
  // MUST achieve PARTIALLY_VERIFIED verdict
  const mixedDirectionScore = calculateDualAxisScore({
    supportingSources: [
      { authorityScore: 85, stance: 'SUPPORTS' }
    ],
    refutingSources: [
      { authorityScore: 85, stance: 'REFUTES' }
    ],
    qualifyingSources: [],
    neutralSources: [],
    allSources: [
      { authorityScore: 85 },
      { authorityScore: 85 }
    ],
    distinctCorporateParents: 2,
    maxRefutingAuthority: 85
  });

  assert.strictEqual(mixedDirectionScore.canonicalVerdict, 'PARTIALLY_VERIFIED', 'Conflicting supporting vs refuting must achieve PARTIALLY_VERIFIED');
  assert.strictEqual(mixedDirectionScore.evidenceState, 'MIXED');
  console.log('  ✅ Conflicting reporting properly reserved for PARTIALLY_VERIFIED verdict.\n');

  console.log('🎉 ALL QUALIFIES -> SUPPORTS PROMOTION TESTS PASSED SUCCESSFULLY!');
})().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
