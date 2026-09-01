const assert = require('assert');
const {
  normalizePublicFigure,
  collectRecognizedFigures,
  selectImportantFrames,
  buildFigureAssistedQuery,
  buildTranscriptSearchQueries,
  collectTranscriptSearchEvidence,
  collectVideoProvenanceEvidence
} = require('../src/services/media/videoProvenanceVerifier');
const { buildVideoCompletenessAssessment, buildTranscriptContextWindow } = require('../src/services/media/videoContextVerifier');
const { analyzeVideo } = require('../src/services/media/videoAnalyzer');
const { extractHtmlAssetsAndMetadata } = require('../src/services/inputReader');

(async () => {
  const frames = [
    {
      frameIndex: 0,
      timestamp: 0,
      buffer: Buffer.from('frame-0'),
      dHash: '0001',
      description: 'A public briefing podium',
      visibleText: 'National Press Briefing',
      publicFigures: [{ name: 'Minister Example', confidence: 92, basis: 'Face, podium nameplate, and visible caption agree' }],
      logos: ['Public broadcaster'],
      landmarks: [],
      entities: ['briefing']
    },
    {
      frameIndex: 1,
      timestamp: 10,
      buffer: Buffer.from('frame-1'),
      dHash: '0002',
      description: 'A generic audience shot',
      visibleText: '',
      publicFigures: [{ name: 'Uncertain Person', confidence: 42, basis: 'Low-resolution resemblance only' }],
      entities: []
    },
    {
      frameIndex: 2,
      timestamp: 20,
      buffer: Buffer.from('frame-2'),
      dHash: '0003',
      description: 'The speaker leaves the podium',
      visibleText: 'End of briefing',
      publicFigures: [],
      entities: ['podium']
    }
  ];

  assert.strictEqual(normalizePublicFigure(frames[0].publicFigures[0]).searchUsed, true);
  assert.strictEqual(normalizePublicFigure(frames[1].publicFigures[0]).searchUsed, false);
  const figures = collectRecognizedFigures(frames);
  assert.strictEqual(figures.length, 2);
  assert.deepStrictEqual(figures.filter(figure => figure.searchUsed).map(figure => figure.name), ['Minister Example']);

  const selected = selectImportantFrames(frames, 2);
  assert.strictEqual(selected.length, 2);
  assert.ok(selected.some(frame => frame.frameIndex === 0), 'The public-figure/OCR frame must be selected');
  const query = buildFigureAssistedQuery(frames[0], 'There is no change to the policy');
  assert.ok(query.includes('"Minister Example"'));
  assert.ok(query.includes('original full video'));
  assert.ok(!query.includes('Uncertain Person'));

  const transcriptSegments = [{
    start: 0,
    end: 20,
    language: 'en',
    text: 'During the national press briefing, Minister Example said there would be no immediate change to the fuel subsidy policy.'
  }];
  const transcriptQueries = buildTranscriptSearchQueries(transcriptSegments, figures);
  assert.strictEqual(transcriptQueries.length, 1);
  assert.ok(transcriptQueries[0].query.includes('"Minister Example"'));
  assert.ok(transcriptQueries[0].query.includes('news original full video'));

  const transcriptConsentRequired = await collectTranscriptSearchEvidence(transcriptSegments, figures, {});
  assert.strictEqual(transcriptConsentRequired.status, 'CONSENT_REQUIRED');
  assert.strictEqual(transcriptConsentRequired.executedQueryCount, 0);
  assert.ok(!Object.prototype.hasOwnProperty.call(transcriptConsentRequired.queries[0], 'query'));

  const transcriptMatchedSource = {
    sourceUrl: 'https://www.youtube.com/watch?v=full-briefing',
    title: 'Full national press briefing',
    domain: 'youtube.com',
    publisher: 'Example Public Broadcaster',
    publishedAt: '2026-08-01T10:00:00Z',
    sourceDurationSeconds: 125,
    sourceTranscript: 'The minister opens the briefing and reviews recent changes. During the national press briefing, Minister Example said there would be no immediate change to the fuel subsidy policy. Reporters then ask questions about implementation dates.'
  };
  const transcriptDiscovery = await collectTranscriptSearchEvidence(transcriptSegments, figures, {
    allowExternalTranscriptSearch: true,
    mockTranscriptSearches: [{ queryIndex: 0, status: 'AVAILABLE', provider: 'TEST_TRANSCRIPT_SEARCH', matches: [transcriptMatchedSource] }]
  });
  assert.strictEqual(transcriptDiscovery.status, 'MATCH_FOUND');
  assert.strictEqual(transcriptDiscovery.executedQueryCount, 1);
  assert.strictEqual(transcriptDiscovery.topMatch.strongTranscriptMatch, true);
  assert.strictEqual(transcriptDiscovery.topMatch.sourceTranscriptAvailable, true);
  assert.strictEqual(transcriptDiscovery.topMatch.transcriptMatchType, 'SOURCE_VIDEO_TRANSCRIPT_EXACT_QUOTE');
  assert.ok(transcriptDiscovery.topMatch.contextWindow.before.includes('opens the briefing'));
  assert.ok(transcriptDiscovery.topMatch.contextWindow.after.includes('Reporters'));

  const transcriptOnlyProvenance = await collectVideoProvenanceEvidence(frames, transcriptSegments, {
    enableReverseSearch: false,
    allowExternalTranscriptSearch: true,
    mockTranscriptSearches: [{ queryIndex: 0, status: 'AVAILABLE', provider: 'TEST_TRANSCRIPT_SEARCH', matches: [transcriptMatchedSource] }]
  });
  assert.strictEqual(transcriptOnlyProvenance.status, 'TRANSCRIPT_SOURCE_MATCH_FOUND');
  assert.strictEqual(transcriptOnlyProvenance.originalCandidate.confidence, 'STRONG_TRANSCRIPT_ORIGINAL_CANDIDATE');
  assert.strictEqual(transcriptOnlyProvenance.transcriptSearch.matchedSourceCount, 1);

  const transcriptIntegrated = await analyzeVideo(
    { filename: 'spoken-news-clip.mp4', mimeType: 'video/mp4', sizeBytes: 100, sha256: 'spoken-news-test-hash' },
    Buffer.from('mock-video'),
    null,
    {
      geminiKey: 'YOUR_GEMINI_API_KEY_HERE',
      mockMetadata: { durationSeconds: 20, duration: 20, hasAudio: false, codec: 'h264' },
      mockTemporalBoundaries: [],
      mockFrames: frames,
      mockAudioBuffer: Buffer.from([128, 129, 127, 128]),
      mockTranscript: { text: transcriptSegments[0].text, language: 'en', segments: transcriptSegments },
      enableReverseSearch: false,
      allowExternalTranscriptSearch: true,
      mockTranscriptSearches: [{ queryIndex: 0, status: 'AVAILABLE', provider: 'TEST_TRANSCRIPT_SEARCH', matches: [transcriptMatchedSource] }],
      disableAi: true
    }
  );
  assert.strictEqual(transcriptIntegrated.videoProvenance.status, 'TRANSCRIPT_SOURCE_MATCH_FOUND');
  assert.strictEqual(transcriptIntegrated.videoProvenance.transcriptSearch.status, 'MATCH_FOUND');
  assert.strictEqual(transcriptIntegrated.videoContextReport.completeness.verdict, 'PARTIAL_CLIP_CONTEXT_UNVERIFIED');

  const transcriptPartial = buildVideoCompletenessAssessment({
    durationSeconds: 20,
    report: { verdict: 'Inconclusive', summary: 'Adjacent source context requires review.', segments: [] },
    provenanceEvidence: transcriptOnlyProvenance
  });
  assert.strictEqual(transcriptPartial.verdict, 'PARTIAL_CLIP_CONTEXT_UNVERIFIED');
  assert.strictEqual(transcriptPartial.source.transcriptEvidenceScore >= 78, true);
  assert.strictEqual(transcriptPartial.contextIntegrity.verdict, 'CONTEXT_REVIEW_REQUIRED');

  const videoObjectPage = extractHtmlAssetsAndMetadata(`
    <html><head><script type="application/ld+json">{
      "@context":"https://schema.org","@type":"VideoObject","name":"Full policy briefing",
      "duration":"PT2M5S","uploadDate":"2026-08-01T10:00:00Z",
      "transcript":"The minister introduces the review. There is no change to the policy. The minister answers follow-up questions."
    }</script></head><body></body></html>
  `, 'https://video.example/full-briefing');
  assert.strictEqual(videoObjectPage.metadata.videoDurationSeconds, 125);
  assert.ok(videoObjectPage.metadata.videoTranscript.includes('no change to the policy'));
  const recoveredWindow = buildTranscriptContextWindow(videoObjectPage.metadata.videoTranscript, 'There is no change to the policy.');
  assert.ok(recoveredWindow.before.includes('introduces'));
  assert.ok(recoveredWindow.after.includes('follow-up'));

  const matchedSource = {
    sourceUrl: 'https://video.example/full-briefing',
    title: 'Full national press briefing video',
    domain: 'video.example',
    publisher: 'Example Public Broadcaster',
    publishedAt: '2026-08-01T10:00:00Z',
    similarity: 0.96,
    matchType: 'LENS_EXACT_MATCH_CANDIDATE',
    sourceDurationSeconds: 120,
    sourceStartSec: 30,
    sourceEndSec: 50,
    contextualVerdict: 'CONTEXT_SUPPORTED',
    contextWindow: {
      before: 'The minister introduces the policy review.',
      matched: 'The submitted twenty-second excerpt appears here.',
      after: 'The minister clarifies that there is no change to the policy.'
    }
  };
  const provenance = await collectVideoProvenanceEvidence(frames, [{ start: 0, end: 20, text: 'There is no change to the policy' }], {
    maxVideoReverseSearchFrames: 3,
    mockVideoFrameSearches: [
      { frameIndex: 0, status: 'AVAILABLE', provider: 'SERPAPI_GOOGLE_LENS_LOCAL_VERIFIED', matches: [matchedSource] },
      { frameIndex: 1, status: 'NO_MATCH', provider: 'SERPAPI_GOOGLE_LENS', matches: [] },
      { frameIndex: 2, status: 'AVAILABLE', provider: 'SERPAPI_GOOGLE_LENS_LOCAL_VERIFIED', matches: [{ ...matchedSource, similarity: 0.94 }] }
    ],
    mockOriginalVideoCandidates: [{ ...matchedSource, resolverVerified: true, exactMatch: true, provider: 'TEST_ORIGINAL_VIDEO_RESOLVER' }]
  });
  assert.strictEqual(provenance.status, 'ORIGINAL_VERIFIED');
  assert.strictEqual(provenance.exactMatchedFrameCount, 2);
  assert.strictEqual(provenance.originalCandidate.confidence, 'VERIFIED_ORIGINAL');
  assert.deepStrictEqual(provenance.searchFigures, ['Minister Example']);

  const integrated = await analyzeVideo(
    { filename: 'submitted-clip.mp4', mimeType: 'video/mp4', sizeBytes: 100, sha256: 'test-hash' },
    Buffer.from('mock-video'),
    null,
    {
      geminiKey: 'YOUR_GEMINI_API_KEY_HERE',
      mockMetadata: { durationSeconds: 20, duration: 20, hasAudio: false, codec: 'h264' },
      mockTemporalBoundaries: [],
      mockFrames: frames,
      mockVideoFrameSearches: [
        { frameIndex: 0, status: 'AVAILABLE', provider: 'SERPAPI_GOOGLE_LENS_LOCAL_VERIFIED', matches: [matchedSource] },
        { frameIndex: 1, status: 'NO_MATCH', provider: 'SERPAPI_GOOGLE_LENS', matches: [] },
        { frameIndex: 2, status: 'AVAILABLE', provider: 'SERPAPI_GOOGLE_LENS_LOCAL_VERIFIED', matches: [{ ...matchedSource, similarity: 0.94 }] }
      ],
      mockOriginalVideoCandidates: [{ ...matchedSource, resolverVerified: true, exactMatch: true }],
      disableAi: true
    }
  );
  assert.strictEqual(integrated.videoContextReport.completeness.verdict, 'FAITHFUL_EXCERPT');
  assert.strictEqual(integrated.videoProvenance.status, 'ORIGINAL_VERIFIED');
  assert.ok(integrated.extractedFrames.some(frame => frame.reverseSearch?.exactMatch));
  assert.ok(integrated.extractedFrames.every(frame => !Object.prototype.hasOwnProperty.call(frame, 'buffer')), 'Raw frame buffers must not be returned');

  const faithful = buildVideoCompletenessAssessment({
    durationSeconds: 20,
    report: { verdict: 'Inconclusive', summary: 'No deceptive truncation was established.', segments: [] },
    provenanceEvidence: provenance
  });
  assert.strictEqual(faithful.verdict, 'FAITHFUL_EXCERPT');
  assert.strictEqual(faithful.isExcerpt, true);
  assert.strictEqual(faithful.originalDurationSeconds, 120);
  assert.strictEqual(faithful.matchTimeline.sourceStartSec, 30);
  assert.strictEqual(faithful.contextIntegrity.verdict, 'CONTEXT_SUPPORTED');

  const misleading = buildVideoCompletenessAssessment({
    durationSeconds: 20,
    report: { verdict: 'Deceptive Context', summary: 'The recovered qualification changes the claim.', segments: [{ is_truncated: true }] },
    provenanceEvidence: provenance
  });
  assert.strictEqual(misleading.verdict, 'MISLEADING_OUT_OF_CONTEXT');

  const completeCandidate = {
    ...provenance.originalCandidate,
    sourceDurationSeconds: 20,
    sourceStartSec: 0,
    sourceEndSec: 20,
    contextualVerdict: 'CONTEXT_SUPPORTED'
  };
  const complete = buildVideoCompletenessAssessment({
    durationSeconds: 20,
    report: { verdict: 'Inconclusive', segments: [] },
    provenanceEvidence: { originalCandidate: completeCandidate }
  });
  assert.strictEqual(complete.verdict, 'COMPLETE_ORIGINAL_VIDEO');
  assert.strictEqual(complete.isComplete, true);

  const missing = buildVideoCompletenessAssessment({ durationSeconds: 20, report: {}, provenanceEvidence: {} });
  assert.strictEqual(missing.verdict, 'ORIGINAL_NOT_FOUND');

  const consentRequired = await collectVideoProvenanceEvidence([frames[0]], [], { enableReverseSearch: true });
  assert.strictEqual(consentRequired.status, 'UNAVAILABLE');
  assert.strictEqual(consentRequired.reverseSearchedFrameCount, 0);
  assert.strictEqual(consentRequired.frameSearches[0].provider, 'CONSENT_REQUIRED');

  console.log('Video provenance verification tests passed.');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
