const assert = require('assert');
const {
  buildClaimResearchUpdate,
  rebuildReportScoring
} = require('../src/controllers/verifyController');
const {
  cleanOcrText,
  substantiallyDuplicates
} = require('../src/services/media/mediaClaimExtractor');

async function run() {
  const priorClaim = {
    claimText: 'The image displays the phrase Viksit Bharat 2047',
    status: 'UNVERIFIED',
    verdict: 'UNVERIFIED',
    confidence: 42,
    sources: []
  };
  const neutralResearch = {
    updatedStatus: 'TRUSTED',
    updatedConfidence: 91,
    reasoning: 'Search results mentioned similar words but did not verify the submitted claim.',
    evaluatedSources: [{
      url: 'https://example.com/background',
      domain: 'example.com',
      title: 'Background result',
      stance: 'NEUTRAL',
      relevanceScore: 88,
      authorityScore: 99
    }]
  };
  const updated = buildClaimResearchUpdate(priorClaim, neutralResearch, {
    hasCorrection: false,
    correctedClaim: null,
    correctionBasis: null,
    partiallyAccurate: false
  });
  assert.strictEqual(updated.verdict, 'UNVERIFIED');
  assert.strictEqual(updated.confidence, 42);
  assert.strictEqual(updated.sources.length, 0);
  assert.strictEqual(updated.deepResearch.evaluatedSources.length, 1);

  const rescored = rebuildReportScoring({
    inputType: 'PHOTO',
    selectedTypes: ['PHOTO'],
    mediaAnalysis: {
      forensicVerdict: 'NO_MANIPULATION_SIGNAL_FOUND',
      forensics: { verdict: 'NO_MANIPULATION_SIGNAL_FOUND', integrity: { isValid: true } }
    },
    extractedText: 'Viksit Bharat 2047',
    textAnalysis: { summary: { wordCount: 3 } }
  }, [updated]);
  assert.strictEqual(rescored.sources.length, 0);
  assert.strictEqual(rescored.explainableScoring.rawInputs.totalEvidenceCount, 0);
  assert.strictEqual(rescored.explainableScoring.factorScores.sourceAuthority.score, 0);
  assert.strictEqual(rescored.explainableScoring.factorScores.mediaIntegrity.score, 90);

  assert.strictEqual(cleanOcrText('[model-extracted text]:  Viksit   Bharat @ 2047'), 'Viksit Bharat @ 2047');
  assert.strictEqual(
    substantiallyDuplicates('Viksit Bharat 2047 appears on the banner', 'The banner displays Viksit Bharat 2047'),
    true
  );

  console.log('Image pipeline regression tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
