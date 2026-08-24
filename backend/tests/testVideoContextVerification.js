const assert = require('assert');
const { profileAudioWaveform, mergeShotCutsWithTemporalBoundaries } = require('../src/services/media/videoAudioForensics');
const {
  buildVideoSegments,
  deterministicVideoReport,
  synthesizeVideoReport,
  analyzeCrossSegmentContext,
  buildReproducibilityMetadata
} = require('../src/services/media/videoContextVerifier');
const { buildRepresentativeTimestamps, detectTemporalBoundaries } = require('../src/services/media/videoAnalyzer');

(async () => {
  const frames = [
    { timestamp: 0.08, description: 'A speaker at a rally', visibleText: 'Bharat Yatra', entities: ['Speaker A'], publicFigures: [{ name: 'Speaker A', attire: 'white shirt' }], vehicleMarkings: ['Yatra'], badges: ['press pass'], uniforms: ['dark security suit'], attire: ['white shirt'], securityDetails: ['two visible security staff'], locationClues: ['Delhi'], dateClues: [] },
    { timestamp: 10.08, description: 'A few moments later transition card', visibleText: 'A few moments later', entities: [], locationClues: [], dateClues: [] },
    { timestamp: 11.08, description: 'A red vehicle in a street procession', visibleText: 'Nyay Yatra', entities: [], locationClues: ['Assam'], dateClues: [] },
    { timestamp: 21.08, description: 'A different outdoor crowd', visibleText: '', entities: [], locationClues: [], dateClues: [] }
  ];
  const transcriptSegments = [
    { start: 0, end: 9.5, text: 'यह मूल वक्तव्य है', translatedText: 'This is the original statement', language: 'Hindi', audioType: 'SPEECH' },
    { start: 11, end: 20, text: 'This is the original five word statement today' }
  ];
  const segments = buildVideoSegments({
    durationSeconds: 30,
    temporalBoundaries: [{ timestampSec: 10, boundaryType: 'HARD_CUT', sceneScore: 0.88, confidence: 96 }, { timestampSec: 11 }, { timestampSec: 21 }],
    frames,
    transcriptSegments,
    forensics: { lipSync: { desyncSegments: [] } }
  });
  assert.strictEqual(segments.length, 4);
  assert.strictEqual(segments[0].timestamp_range, '00:00 - 00:10');
  assert.strictEqual(segments[1].is_transition_card, true);
  assert.strictEqual(segments[1].boundary_type, 'HARD_CUT');
  assert.strictEqual(segments[1].boundary_scene_score, 0.88);
  assert.strictEqual(segments[0].transcript_translation, 'This is the original statement');
  assert.strictEqual(segments[0].transcript_language, 'Hindi');
  assert.strictEqual(segments[0].vehicle_markings[0], 'Yatra');
  assert.strictEqual(segments[0].security_details[0], 'two visible security staff');

  const deterministic = deterministicVideoReport(segments, { audioProfile: { confirmedSplicesCount: 0 } });
  assert.strictEqual(deterministic.verdict, 'Meme Compilation');
  assert.strictEqual(deterministic.segments[0].omitted_context, null);

  const merged = mergeShotCutsWithTemporalBoundaries(
    { cuts: [{ timestamp: 10.2, confidence: 70 }], cutsCount: 1 },
    [{ timestampSec: 10, confidence: 90 }, { timestampSec: 21, confidence: 82 }],
    30
  );
  assert.strictEqual(merged.cutsCount, 2);
  assert.strictEqual(merged.cuts[0].timestamp, 10);

  const representative = buildRepresentativeTimestamps(30, [{ timestampSec: 10 }, { timestampSec: 21 }], 5);
  assert.ok(representative.some(value => Math.abs(value - 10.08) < 0.01));
  assert.ok(representative.some(value => Math.abs(value - 21.08) < 0.01));

  const injectedBoundaries = detectTemporalBoundaries({}, null, {
    mockTemporalBoundaries: [{ timestampSec: 3, sceneScore: 0.8 }, { timestampSec: 6, sceneScore: 0.4 }]
  });
  assert.strictEqual(injectedBoundaries.boundaries[0].boundaryType, 'HARD_CUT');
  assert.strictEqual(injectedBoundaries.boundaries[1].boundaryType, 'SCENE_TRANSITION');

  // Extreme square-wave audio contains thousands of adjacent jumps but no
  // before/after context change. It must not become thousands of proven edits.
  const squarePcm = Buffer.alloc(16000 * 2);
  for (let index = 0; index < 16000; index += 1) squarePcm.writeInt16LE(index % 2 ? 30000 : -30000, index * 2);
  const squareProfile = profileAudioWaveform(squarePcm, 1, { sampleFormat: 's16le' });
  assert.ok(squareProfile.rawDiscontinuitiesCount > 1000);
  assert.ok(squareProfile.splicesCount < 10);
  assert.strictEqual(squareProfile.confirmedSplicesCount, 0);

  const shiftedPcm = Buffer.alloc(16000 * 2);
  for (let index = 0; index < 16000; index += 1) shiftedPcm.writeInt16LE(index < 8000 ? 29000 : -29000, index * 2);
  const shiftedProfile = profileAudioWaveform(shiftedPcm, 1, { sampleFormat: 's16le' });
  assert.strictEqual(shiftedProfile.confirmedSplicesCount, 1);

  // Gemini output cannot create a truncation or omitted quotation without
  // corroborating source text.
  const attemptedFabrication = await synthesizeVideoReport([segments[0]], { audioProfile: { confirmedSplicesCount: 0 } }, {
    geminiClient: { models: { generateContent: async () => ({ text: JSON.stringify({
      verdict: 'Deceptive Context', authenticity_score: 0.2, summary: 'Claimed truncation',
      segments: [{ segment_index: 1, timestamp_range: '00:00 - 00:10', is_truncated: true, omitted_context: 'Words that were never recovered', original_intent: 'Invented intent' }],
      manipulation_techniques_detected: ['Context truncation'], full_truth_summary: 'Invented', evidence_limitations: []
    }) }) } }
  });
  assert.strictEqual(attemptedFabrication.segments[0].is_truncated, false);
  assert.strictEqual(attemptedFabrication.segments[0].omitted_context, null);
  assert.notStrictEqual(attemptedFabrication.verdict, 'Deceptive Context');

  const groundedSegment = {
    ...segments[0],
    source_evidence: {
      corroborative: true,
      source_text: 'The complete statement continued: there is no change to the policy under discussion.',
      source: { title: 'Full statement', url: 'https://example.com/full', domain: 'example.com' }
    }
  };
  const grounded = await synthesizeVideoReport([groundedSegment], { audioProfile: { confirmedSplicesCount: 0 } }, {
    geminiClient: { models: { generateContent: async () => ({ text: JSON.stringify({
      verdict: 'Deceptive Context', authenticity_score: 0.35, summary: 'Source-backed truncation',
      segments: [{ segment_index: 1, timestamp_range: '00:00 - 00:10', is_truncated: true, omitted_context: 'there is no change to the policy under discussion', original_intent: 'The speaker qualified the earlier statement.' }],
      manipulation_techniques_detected: ['Context truncation'], full_truth_summary: 'The complete statement contains a qualification.', evidence_limitations: []
    }) }) } }
  });
  assert.strictEqual(grounded.segments[0].is_truncated, true);
  assert.strictEqual(grounded.verdict, 'Deceptive Context');

  const eventSegments = [
    {
      segment_index: 1,
      original_event: { event_name: 'Event Alpha', date: '2024-01-01', location: 'Delhi' },
      source_evidence: { corroborative: true, decisive: true, url: 'https://example.com/a' }
    },
    {
      segment_index: 2,
      original_event: { event_name: 'Event Beta', date: '2025-02-02', location: 'Assam' },
      source_evidence: { corroborative: true, decisive: true, url: 'https://example.com/b' }
    }
  ];
  const noClaimStitching = analyzeCrossSegmentContext(eventSegments, '');
  assert.strictEqual(noClaimStitching.decisive, false);
  assert.strictEqual(noClaimStitching.status, 'MULTI_EVENT_COMPILATION');
  const claimedStitching = analyzeCrossSegmentContext(eventSegments, 'This video shows one continuous event in the same location');
  assert.strictEqual(claimedStitching.decisive, true);
  assert.strictEqual(claimedStitching.status, 'SOURCE_BACKED_MISATTRIBUTION');

  const rawEventSegments = eventSegments.map((segment, index) => ({
    ...segment,
    timestamp_range: index === 0 ? '00:00 - 00:10' : '00:10 - 00:20',
    boundary_in: index === 0 ? null : '00:10',
    visual_summary: `Event scene ${index + 1}`,
    transcript_original: '',
    transcript_translation: null,
    source_evidence: {
      corroborative: true,
      decisive: true,
      source_text: `Source for ${segment.original_event.event_name}`,
      source: { title: segment.original_event.event_name, publishedAt: segment.original_event.date, url: `https://example.com/${index + 1}`, domain: 'example.com' }
    }
  }));
  const exactMisattributionReport = await synthesizeVideoReport(rawEventSegments, { audioProfile: { confirmedSplicesCount: 0 } }, {
    userClaim: 'This video shows one continuous event in the same location',
    geminiClient: { models: { generateContent: async () => ({ text: JSON.stringify({
      verdict: 'Deceptive Context', authenticity_score: 0.3, summary: 'Different exact source events were linked.',
      segments: rawEventSegments.map(segment => ({ segment_index: segment.segment_index, timestamp_range: segment.timestamp_range, original_event: segment.original_event, is_truncated: false })),
      manipulation_techniques_detected: ['Temporal misattribution'], full_truth_summary: 'The segments originate from different events.', evidence_limitations: []
    }) }) } }
  });
  assert.strictEqual(exactMisattributionReport.verdict, 'Deceptive Context');
  assert.strictEqual(exactMisattributionReport.stitching_analysis.decisive, true);

  const textOnlySegments = eventSegments.map(segment => ({
    ...segment,
    source_evidence: { ...segment.source_evidence, decisive: false }
  }));
  const textOnlyStitching = analyzeCrossSegmentContext(textOnlySegments, 'This video shows one continuous event in the same location');
  assert.strictEqual(textOnlyStitching.status, 'POSSIBLE_MISATTRIBUTION');
  assert.strictEqual(textOnlyStitching.decisive, false);

  const reproducibility = buildReproducibilityMetadata({
    fileInfo: { filename: 'clip.mp4', mimeType: 'video/mp4', sizeBytes: 1234, sha256: 'abc123' },
    durationSeconds: 30,
    temporalBoundaries: [{ timestampSec: 10, boundaryType: 'HARD_CUT', sceneScore: 0.88 }],
    temporalBoundaryDetection: { status: 'AVAILABLE', method: 'FFMPEG_SCENE_SCORE', threshold: 0.32, hardCutThreshold: 0.65 },
    transcriptMetadata: { provider: 'GEMINI_AUDIO_TRANSCRIPTION', model: 'test-model', language: 'Hindi' },
    segments: [],
    forensics: { audioProfile: { confirmedSplicesCount: 0 } }
  }, { disableAi: true });
  assert.strictEqual(reproducibility.input.sha256, 'abc123');
  assert.strictEqual(reproducibility.temporal_boundary_detection.boundaries[0].type, 'HARD_CUT');
  assert.strictEqual(reproducibility.audio_splice_detection.config.confirmedConfidenceThreshold, 70);

  console.log('Video context verification tests passed (26/26).');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
