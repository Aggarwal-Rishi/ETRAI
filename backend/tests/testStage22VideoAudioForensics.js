const assert = require('assert');
const {
  performVideoAudioForensics,
  detectShotCuts,
  analyzeVideoContainer,
  profileAudioWaveform,
  analyzeLipSyncConsistency,
  analyzeFaceManipulation,
  analyzeVoiceCloneIndicators
} = require('../src/services/media/videoAudioForensics');
const { processMediaAnalysis } = require('../src/services/media/mediaOrchestrator');

async function runStage22VideoAudioForensicsTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING STAGE 22: REAL VIDEO & AUDIO FORENSICS TEST SUITE');
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
  // Test 1: Shot Boundary & Cut Transition Detection
  // ----------------------------------------------------------------
  await runTest('1. Detects hard cuts, scene transitions, and calculates average shot length', async () => {
    const mockKeyframes = [
      { timestamp: 0.0, entities: ['Spokesperson A'], description: 'Press room podium' },
      { timestamp: 2.5, entities: ['Spokesperson A'], description: 'Press room podium' },
      { timestamp: 5.0, entities: ['Audience Crowd'], description: 'Auditorium wide angle' },
      { timestamp: 7.5, entities: ['Spokesperson A'], description: 'Press room podium closeup' }
    ];

    const res = detectShotCuts(mockKeyframes, 10.0);

    assert.strictEqual(res.cutsCount, 2);
    assert.strictEqual(res.cuts[0].timestamp, 5.0);
    assert.strictEqual(res.cuts[1].timestamp, 7.5);
    assert.ok(res.averageShotLengthSec > 0);
  });

  // ----------------------------------------------------------------
  // Test 2: Container Stream Integrity & Moov Atom Placement
  // ----------------------------------------------------------------
  await runTest('2. Container integrity analysis detects remuxing and trailing moov atoms', async () => {
    // Construct buffer where 'moov' atom appears after 'mdat' atom (post-export remuxing indicator)
    const remuxBuffer = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70]), // ftyp
      Buffer.from('...mdat_media_data_payload_here...'),
      Buffer.from('...moov_movie_atom_header_here...')
    ]);

    const res = analyzeVideoContainer({ codec: 'h264', fps: 30, hasAudio: true }, remuxBuffer);

    assert.strictEqual(res.reEncodingStatus, 'RE_ENCODED_OR_EDITED');
    assert.ok(res.reEncodingLikelihood >= 40);
    assert.ok(res.anomalies[0].includes('Trailing moov atom'));
  });

  // ----------------------------------------------------------------
  // Test 3: Audio Waveform Profiling & Energy Slicing
  // ----------------------------------------------------------------
  await runTest('3. Audio waveform profiling generates temporal slices, peaks, and silence zones', async () => {
    const audioBuf = Buffer.alloc(1024, 128); // baseline center
    audioBuf[100] = 250; // peak
    audioBuf[500] = 129; // silence/ambient

    const res = profileAudioWaveform(audioBuf, 10.0);

    assert.strictEqual(res.status, 'AVAILABLE');
    assert.strictEqual(res.waveformSegments.length, 10);
    assert.ok(res.waveformSegments[0].energyState);
  });

  // ----------------------------------------------------------------
  // Test 4: Lip-Sync Consistency & Desynchronization Detection
  // ----------------------------------------------------------------
  await runTest('4. Lip-sync analysis detects mouth kinematic vs speech phoneme desynchronization', async () => {
    const transcriptSegments = [
      { start: 1.0, end: 3.0, text: 'We officially announce the project launch.' }
    ];
    const keyframes = [
      {
        timestamp: 2.0,
        visualSignals: [{ type: 'LIP_SYNC', explanation: 'Mouth closed during loud vowel utterance' }]
      }
    ];

    const res = analyzeLipSyncConsistency(transcriptSegments, keyframes);

    assert.strictEqual(res.status, 'AVAILABLE');
    assert.strictEqual(res.isDesynchronized, true);
    assert.strictEqual(res.syncOffsetMs, 380);
    assert.strictEqual(res.desyncSegments.length, 1);
  });

  // ----------------------------------------------------------------
  // Test 5: Honest Model State for Deepfake & Voice-Clone Detection
  // ----------------------------------------------------------------
  await runTest('5. Honest model state: Returns UNAVAILABLE when unconfigured and never fabricates scores', async () => {
    // Unconfigured state
    const faceRes = analyzeFaceManipulation([]);
    assert.strictEqual(faceRes.status, 'UNAVAILABLE');
    assert.strictEqual(faceRes.modelExecuted, false);
    assert.strictEqual(faceRes.manipulationScore, 0);

    const voiceRes = analyzeVoiceCloneIndicators(null, []);
    assert.strictEqual(voiceRes.status, 'UNAVAILABLE');
    assert.strictEqual(voiceRes.modelExecuted, false);
    assert.strictEqual(voiceRes.syntheticVoiceScore, 0);

    // Configured mock detector execution
    const mockFaceDetector = {
      analyze: () => ({
        status: 'AVAILABLE',
        modelName: 'FaceForensics++ Neural Classifier',
        manipulationScore: 92,
        isSyntheticFace: true,
        suspiciousFacesCount: 1,
        explanation: 'Deepfake face swap boundaries detected along jawline.'
      })
    };

    const activeFaceRes = analyzeFaceManipulation([], { deepfakeDetector: mockFaceDetector });
    assert.strictEqual(activeFaceRes.modelExecuted, true);
    assert.strictEqual(activeFaceRes.isSyntheticFace, true);
    assert.strictEqual(activeFaceRes.manipulationScore, 92);
  });

  // ----------------------------------------------------------------
  // Test 6: Timestamped Suspicious Segment Extraction & Media Analysis Integration
  // ----------------------------------------------------------------
  await runTest('6. Video forensics extracts timestamped suspicious segments and integrates into mediaAnalysis', async () => {
    const validMp4Header = Buffer.from('000000206674797069736f6d000002006d646174000000006d6f6f76', 'hex');
    const file = {
      originalname: 'investigative_leak.mp4',
      mimetype: 'video/mp4',
      buffer: validMp4Header,
      size: validMp4Header.length
    };

    const analysis = await processMediaAnalysis({
      inputType: 'VIDEO',
      file
    }, {
      mockMetadata: { durationSeconds: 8.0, codec: 'h264', fps: 30, hasAudio: true },
      mockFrames: [
        { timestamp: 0.0, description: 'Opening scene' },
        { timestamp: 4.0, description: 'Middle interview' },
        { timestamp: 8.0, description: 'Closing credits' }
      ],
      mockTranscript: {
        text: 'Cabinet briefing statement.',
        segments: [{ start: 0.0, end: 4.0, text: 'Cabinet briefing statement.' }]
      },
      mockClaims: [
        { claimId: 'c1', claimText: 'Cabinet held official briefing statement.', category: 'POLITICS', confidence: 90 }
      ],
      mockVerifiedClaims: [
        { claimId: 'c1', claimText: 'Cabinet held official briefing statement.', verdict: 'VERIFIED', score: 95 }
      ]
    });

    assert.ok(analysis.valid);
    assert.strictEqual(analysis.mediaType, 'VIDEO');
    assert.ok(analysis.forensics, 'Must attach video/audio forensics object');
    assert.strictEqual(analysis.forensics.shotAnalysis.cutsCount, 2);
    assert.ok(analysis.forensics.suspiciousSegments.length >= 1);
    assert.strictEqual(analysis.forensics.suspiciousSegments[0].anomalyType, 'CONTAINER_RE_ENCODING');
    assert.ok(analysis.forensics.evidenceTimestamps.length >= 1);
  });

  console.log('\n================================================================');
  console.log(`🏆 STAGE 22 TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runStage22VideoAudioForensicsTests();
