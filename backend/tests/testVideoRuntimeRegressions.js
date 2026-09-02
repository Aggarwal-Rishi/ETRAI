const assert = require('assert');

const { collectVideoProvenanceEvidence } = require('../src/services/media/videoProvenanceVerifier');
const { performVideoAndAudioForensics } = require('../src/services/media/videoAudioForensics');
const { computeExplainableTrustScore } = require('../src/services/explainableScoringService');
const { buildProviderReadiness } = require('../src/controllers/healthController');

(async () => {
  const provenance = await collectVideoProvenanceEvidence([
    {
      frameIndex: 0,
      timestamp: 0,
      buffer: Buffer.from('test-frame-bytes'),
      description: 'A minister speaking at a news briefing',
      visibleText: 'National briefing',
      entities: ['Minister Example'],
      publicFigures: []
    }
  ], [], {
    enableReverseSearch: true,
    allowExternalVisualSearch: true,
    providerStatus: {
      webSearch: 'AVAILABLE',
      googleVision: 'UNAVAILABLE',
      googleLens: 'UNAVAILABLE'
    },
    reverseSearchProvider: {
      search: async () => ({
        status: 'AVAILABLE',
        provider: 'TEST_TWO_ARGUMENT_PROVIDER',
        matches: [{
          sourceUrl: 'https://example.com/full-video',
          title: 'Full news briefing',
          domain: 'example.com',
          similarity: 0.97,
          matchType: 'FULL_MATCH'
        }]
      })
    }
  });

  assert.strictEqual(provenance.frameSearches.length, 1);
  assert.strictEqual(provenance.frameSearches[0].status, 'AVAILABLE');
  assert.strictEqual(provenance.frameSearches[0].provider, 'TEST_TWO_ARGUMENT_PROVIDER');
  assert.ok(!provenance.limitations.some(item => item.includes("reading 'providerStatus'")));

  const limitedForensics = await performVideoAndAudioForensics(
    { filename: 'clip.mp4', mimeType: 'video/mp4', sizeBytes: 256 },
    Buffer.alloc(256),
    { duration: 3, metadata: { codec: 'h264', fps: 30, hasAudio: false }, keyframes: [] }
  );
  assert.strictEqual(limitedForensics.faceManipulation.status, 'UNAVAILABLE');
  assert.strictEqual(limitedForensics.voiceClone.status, 'UNAVAILABLE');
  assert.strictEqual(limitedForensics.verdict, 'INCONCLUSIVE_LIMITED_ANALYSIS');
  assert.ok(limitedForensics.confidence < 50);
  assert.ok(limitedForensics.rationale.includes('inconclusive'));

  const limitedScore = computeExplainableTrustScore({
    inputType: 'VIDEO',
    verifiedClaims: [{ verdict: 'UNVERIFIED', status: 'SUSPICIOUS', confidence: 50, sources: [] }],
    mediaAnalysis: {
      mediaType: 'VIDEO',
      forensics: limitedForensics,
      forensicVerdict: limitedForensics.verdict
    }
  });
  const limitedMediaFactor = limitedScore.factorBreakdown.find(item => item.factorKey === 'mediaIntegrity');
  assert.ok(limitedMediaFactor);
  assert.strictEqual(limitedMediaFactor.rawScore, 50);
  assert.ok(!limitedScore.appliedPenalties.some(item => item.code === 'VERIFIED_MANIPULATION'));

  const readyProviders = buildProviderReadiness({ gemini: 'AVAILABLE', webSearch: 'AVAILABLE' });
  assert.strictEqual(readyProviders.geminiProvider.configured, true);
  assert.strictEqual(readyProviders.serperProvider.configured, true);
  const unavailableProviders = buildProviderReadiness({ gemini: 'UNAVAILABLE', webSearch: 'UNAVAILABLE' });
  assert.strictEqual(unavailableProviders.geminiProvider.configured, false);
  assert.strictEqual(unavailableProviders.serperProvider.configured, false);

  console.log('Video runtime regression tests passed.');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
