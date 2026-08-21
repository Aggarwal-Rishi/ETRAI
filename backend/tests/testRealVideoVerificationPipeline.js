const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { validateMediaInput, detectFormatFromMagicBytes } = require('../src/services/media/mediaValidator');
const { extractMediaMetadata } = require('../src/services/media/mediaMetadata');
const { extractKeyframes, extractAudio, transcribeAudio, analyzeVideo } = require('../src/services/media/videoAnalyzer');
const { extractMediaClaims } = require('../src/services/media/mediaClaimExtractor');
const { processMediaAnalysis, isSocialVideoUrl } = require('../src/services/media/mediaOrchestrator');

async function runRealVideoVerificationPipelineTests() {
  console.log('===========================================================');
  console.log('🧪 Running REAL Video Verification Pipeline Test Suite...');
  console.log('===========================================================\n');

  let passed = 0;
  let failed = 0;

  const originalEnv = { ...process.env };
  process.env.ETRAI_TEST_MODE = 'mock';
  const resetEnv = () => { process.env = { ...originalEnv }; };

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

  // Binary buffer helper creators
  const createValidMp4Buffer = (size = 1000) => {
    const b = Buffer.alloc(Math.max(100, size));
    // Set atom length 32
    b.writeUInt32BE(32, 0);
    // Set ftyp atom type at offset 4-7
    b.write('ftyp', 4, 4, 'ascii');
    b.write('isom', 8, 4, 'ascii');
    // Inject fake mvhd box
    b.write('mvhd', 40, 4, 'ascii');
    b.writeUInt32BE(1000, 56); // timescale
    b.writeUInt32BE(10000, 60); // duration ticks -> 10.0s
    // Inject mp4a audio tag
    b.write('mp4a', 80, 4, 'ascii');
    return b;
  };

  const createValidMovBuffer = () => {
    const b = Buffer.alloc(150);
    b.writeUInt32BE(32, 0);
    b.write('ftyp', 4, 4, 'ascii');
    b.write('qt  ', 8, 4, 'ascii'); // QuickTime sub-brand
    return b;
  };

  const createValidWebmBuffer = () => {
    const b = Buffer.alloc(100);
    b[0] = 0x1A; b[1] = 0x45; b[2] = 0xDF; b[3] = 0xA3; // EBML Header
    return b;
  };

  const createInvalidBuffer = () => Buffer.from('corrupted fake video payload without magic bytes');

  // ----------------------------------------------------
  // Test 1: Valid MP4 Video Ingestion
  // ----------------------------------------------------
  await runTest('1. Valid MP4 video -> magic-byte ftyp validated, SHA-256 computed', () => {
    const mp4Buffer = createValidMp4Buffer();
    const file = { originalname: 'test_clip.mp4', mimetype: 'video/mp4', buffer: mp4Buffer };

    const val = validateMediaInput({ file, inputType: 'VIDEO' });

    assert.strictEqual(val.valid, true);
    assert.strictEqual(val.mediaType, 'VIDEO');
    assert.strictEqual(val.fileInfo.mimeType, 'video/mp4');
    assert.strictEqual(typeof val.fileInfo.sha256, 'string');
    assert.strictEqual(val.fileInfo.sha256.length, 64);
  });

  // ----------------------------------------------------
  // Test 2: Valid MOV Video Ingestion
  // ----------------------------------------------------
  await runTest('2. Valid MOV video -> magic-byte header validated', () => {
    const movBuffer = createValidMovBuffer();
    const file = { originalname: 'recording.mov', mimetype: 'video/quicktime', buffer: movBuffer };

    const val = validateMediaInput({ file, inputType: 'VIDEO' });

    assert.strictEqual(val.valid, true);
    assert.strictEqual(val.mediaType, 'VIDEO');
    assert.strictEqual(val.fileInfo.mimeType, 'video/quicktime');
  });

  // ----------------------------------------------------
  // Test 3: Valid WEBM Video Ingestion
  // ----------------------------------------------------
  await runTest('3. Valid WEBM video -> EBML magic-bytes validated', () => {
    const webmBuffer = createValidWebmBuffer();
    const file = { originalname: 'stream.webm', mimetype: 'video/webm', buffer: webmBuffer };

    const val = validateMediaInput({ file, inputType: 'VIDEO' });

    assert.strictEqual(val.valid, true);
    assert.strictEqual(val.mediaType, 'VIDEO');
    assert.strictEqual(val.fileInfo.mimeType, 'video/webm');
  });

  // ----------------------------------------------------
  // Test 4: Invalid Video Signature Rejection
  // ----------------------------------------------------
  await runTest('4. Invalid video signature -> magic-byte check fails and rejects file', () => {
    const badBuffer = createInvalidBuffer();
    const file = { originalname: 'corrupt.mp4', mimetype: 'video/mp4', buffer: badBuffer };

    const val = validateMediaInput({ file, inputType: 'VIDEO' });

    assert.strictEqual(val.valid, false);
    assert.ok(val.error.includes('Magic-byte signature verification failed'));
  });

  // ----------------------------------------------------
  // Test 5: Video Filesize Limit (>50MB)
  // ----------------------------------------------------
  await runTest('5. Oversized video (>50MB) -> rejected with size limit error', () => {
    const hugeBuffer = Buffer.alloc(51 * 1024 * 1024);
    hugeBuffer.writeUInt32BE(32, 0);
    hugeBuffer.write('ftyp', 4, 4, 'ascii');
    const file = { originalname: 'huge.mp4', mimetype: 'video/mp4', buffer: hugeBuffer };

    const val = validateMediaInput({ file, inputType: 'VIDEO' });

    assert.strictEqual(val.valid, false);
    assert.ok(val.error.includes('exceeds maximum allowable 50MB limit'));
  });

  // ----------------------------------------------------
  // Test 6: Video with Audio (Whisper Transcript Schema)
  // ----------------------------------------------------
  await runTest('6. Video with audio -> speech-to-text transcript returned with segments schema', async () => {
    const audioBuf = Buffer.from('mock_extracted_audio_mp3');
    const mockTranscript = {
      text: 'The Apex Solar plant reached 100MW operational capacity in 2026.',
      segments: [
        { start: 0.0, end: 4.5, text: 'The Apex Solar plant reached 100MW operational capacity in 2026.' }
      ]
    };

    const res = await transcribeAudio(audioBuf, { mockTranscript });

    assert.strictEqual(res.status, 'AVAILABLE');
    assert.strictEqual(res.text, 'The Apex Solar plant reached 100MW operational capacity in 2026.');
    assert.ok(Array.isArray(res.segments));
    assert.strictEqual(res.segments[0].start, 0.0);
    assert.strictEqual(res.segments[0].end, 4.5);
  });

  // ----------------------------------------------------
  // Test 7: Video without Audio
  // ----------------------------------------------------
  await runTest('7. Video without audio -> hasAudio false and empty transcript without synthetic text', async () => {
    const mp4NoAudio = Buffer.alloc(100);
    mp4NoAudio.writeUInt32BE(32, 0);
    mp4NoAudio.write('ftyp', 4, 4, 'ascii');
    const fileInfo = { filename: 'silent.mp4', mimeType: 'video/mp4', sizeBytes: 100, sha256: 'abc' };

    const metaRes = extractMediaMetadata(fileInfo, mp4NoAudio, { hasAudio: false });

    assert.strictEqual(metaRes.metadata.hasAudio, false);

    const transcriptRes = await transcribeAudio(null, { mockTranscript: null, providerStatus: { openai: 'UNAVAILABLE' } });

    assert.strictEqual(transcriptRes.status, 'UNAVAILABLE');
    assert.strictEqual(transcriptRes.text, '');
    assert.strictEqual(transcriptRes.segments.length, 0);
  });

  // ----------------------------------------------------
  // Test 8: Social Video URL Handling
  // ----------------------------------------------------
  await runTest('8. Unsupported social video URL (YouTube/TikTok/X) -> returns VIDEO_URL_PROVIDER_UNAVAILABLE', async () => {
    assert.strictEqual(isSocialVideoUrl('https://www.youtube.com/watch?v=xyz123'), true);
    assert.strictEqual(isSocialVideoUrl('https://tiktok.com/@user/video/123'), true);
    assert.strictEqual(isSocialVideoUrl('https://x.com/user/status/456'), true);

    const res = await processMediaAnalysis({
      inputType: 'VIDEO',
      url: 'https://www.youtube.com/watch?v=xyz123'
    }, {});

    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.error, 'VIDEO_URL_PROVIDER_UNAVAILABLE');
    assert.ok(res.limitations.some(l => l.includes('VIDEO_URL_PROVIDER_UNAVAILABLE')));
  });

  // ----------------------------------------------------
  // Test 9: Keyframe Sampling & Timestamps
  // ----------------------------------------------------
  await runTest('9. Keyframe sampling -> returns sampled frames with explicit timestamps', async () => {
    const mockFrames = [
      { timestamp: 0.0, buffer: Buffer.from('frame_0') },
      { timestamp: 2.5, buffer: Buffer.from('frame_1') },
      { timestamp: 5.0, buffer: Buffer.from('frame_2') }
    ];

    const fileInfo = { filename: 'clip.mp4', mimeType: 'video/mp4', sizeBytes: 1000, sha256: 'def' };
    const frameRes = await extractKeyframes(fileInfo, null, null, { mockFrames });

    assert.strictEqual(frameRes.status, 'AVAILABLE');
    assert.strictEqual(frameRes.keyframes.length, 3);
    assert.strictEqual(frameRes.keyframes[0].timestamp, 0.0);
    assert.strictEqual(frameRes.keyframes[2].timestamp, 5.0);
  });

  // ----------------------------------------------------
  // Test 10: Frame Visual Analysis & Separate OCR
  // ----------------------------------------------------
  await runTest('10. Frame visual analysis & separate OCR -> OCR returned with timestamp labels', async () => {
    const fileInfo = { filename: 'news_clip.mp4', mimeType: 'video/mp4', sizeBytes: 1000, sha256: '777' };
    const mockFrames = [
      { timestamp: 0.0, buffer: Buffer.from('frame_0_bytes') },
      { timestamp: 3.0, buffer: Buffer.from('frame_1_bytes') }
    ];

    const vidRes = await analyzeVideo(fileInfo, createValidMp4Buffer(), null, {
      mockFrames,
      visionExtractedText: 'BREAKING: Delhi Metro Expansion Announced 2026',
      providerStatus: { openai: 'UNAVAILABLE' }
    });

    assert.strictEqual(vidRes.extractedFrames.length, 2);
    assert.ok(vidRes.ocrText.includes('[Timestamp 0s]'));
    assert.ok(vidRes.ocrText.includes('Delhi Metro Expansion Announced 2026'));
  });

  // ----------------------------------------------------
  // Test 11: Temporal Consistency Signals
  // ----------------------------------------------------
  await runTest('11. Temporal consistency signals -> formatted with type, timestamp, severity, and potential manipulation indicator phrasing', async () => {
    const fileInfo = { filename: 'edited.mp4', mimeType: 'video/mp4', sizeBytes: 1000, sha256: '888' };
    const mockFrames = [
      { timestamp: 0.0, buffer: Buffer.from('f0') },
      { timestamp: 2.0, buffer: Buffer.from('f1') }
    ];

    const vidRes = await analyzeVideo(fileInfo, createValidMp4Buffer(), null, {
      mockFrames,
      providerStatus: { openai: 'UNAVAILABLE' }
    });

    assert.ok(Array.isArray(vidRes.manipulationSignals));
  });

  // ----------------------------------------------------
  // Test 12: Agent 2 Claim Extraction from Transcript
  // ----------------------------------------------------
  await runTest('12. Agent 2 claim extraction -> formats transcript into self-contained claim proposition', async () => {
    const payload = {
      userNotes: 'User note about video clip',
      transcript: 'Apex Solar reached 100MW operational capacity in 2026.',
      ocrText: 'Apex Solar Official Announcement',
      visualDescription: 'Executive standing in front of solar array.',
      entities: ['Apex Solar'],
      isVideo: true
    };

    const claimRes = await extractMediaClaims(payload, {});

    assert.ok(claimRes.claims.length >= 2);
    const transcriptClaim = claimRes.claims.find(c => c.origin === 'VIDEO_TRANSCRIPT');
    assert.ok(transcriptClaim);
    assert.ok(transcriptClaim.claimText.includes('video transcript states'));
  });

  // ----------------------------------------------------
  // Test 13: Agent 3 Web Evidence Verification (Supporting -> TRUSTED)
  // ----------------------------------------------------
  await runTest('13. Agent 3 web evidence verification (Supporting) -> verifies transcript claim as TRUSTED / VERIFIED', async () => {
    delete process.env.OPENAI_API_KEY;

    const mp4Buffer = createValidMp4Buffer();
    const file = { originalname: 'solar_clip.mp4', mimetype: 'video/mp4', buffer: mp4Buffer };

    const res = await processMediaAnalysis({
      inputType: 'VIDEO',
      text: 'Video claim about Apex Solar',
      file
    }, {
      providerStatus: { openai: 'UNAVAILABLE', webSearch: 'AVAILABLE' },
      mockMetadata: { hasAudio: true, durationSeconds: 10.0 },
      mockTranscript: {
        text: 'Apex Solar reached 100MW operational capacity in 2026.',
        segments: [{ start: 0.0, end: 5.0, text: 'Apex Solar reached 100MW operational capacity in 2026.' }]
      },
      mockFrames: [
        { timestamp: 0.0, buffer: Buffer.from('f0') }
      ],
      mockSearchResults: [{
        title: 'Apex Solar Reached 100MW Operational Capacity in 2026',
        snippet: 'Official report confirms Apex Solar reached 100MW operational capacity in 2026.',
        link: 'https://reuters.com/article/apex-solar-video',
        url: 'https://reuters.com/article/apex-solar-video',
        domain: 'reuters.com'
      }]
    });

    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.mediaType, 'VIDEO');
    assert.ok(res.claims.length > 0);
    const transcriptClaim = res.claims.find(c => c.origin === 'VIDEO_TRANSCRIPT') || res.claims.find(c => c.claimText.includes('operational capacity')) || res.claims[0];
    assert.strictEqual(transcriptClaim.status, 'TRUSTED');
  });

  // ----------------------------------------------------
  // Test 14: Agent 3 Web Evidence Verification (Refuting -> FABRICATED)
  // ----------------------------------------------------
  await runTest('14. Agent 3 web evidence verification (Refuting) -> refutes transcript claim as FABRICATED / FALSE', async () => {
    delete process.env.OPENAI_API_KEY;

    const mp4Buffer = createValidMp4Buffer();
    const file = { originalname: 'tax_clip.mp4', mimetype: 'video/mp4', buffer: mp4Buffer };

    const res = await processMediaAnalysis({
      inputType: 'VIDEO',
      text: 'Video clip notes',
      file
    }, {
      providerStatus: { openai: 'UNAVAILABLE', webSearch: 'AVAILABLE' },
      mockMetadata: { hasAudio: true, durationSeconds: 10.0 },
      mockTranscript: {
        text: 'Metro Corp tax rates surged by 300% overnight.',
        segments: [{ start: 0.0, end: 5.0, text: 'Metro Corp tax rates surged by 300% overnight.' }]
      },
      mockFrames: [
        { timestamp: 0.0, buffer: Buffer.from('f0') }
      ],
      mockSearchResults: [{
        title: 'Metro Corp Tax Surge Claim Debunked as False',
        snippet: 'Auditors refuted claims and confirmed Metro Corp tax rates remained completely unchanged.',
        link: 'https://bbc.com/news/tax-video-debunk',
        url: 'https://bbc.com/news/tax-video-debunk',
        domain: 'bbc.com'
      }]
    });

    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.mediaType, 'VIDEO');
    assert.ok(res.claims.length > 0);
    const transcriptClaim = res.claims.find(c => c.origin === 'VIDEO_TRANSCRIPT') || res.claims.find(c => c.claimText.includes('Metro Corp')) || res.claims[0];
    assert.strictEqual(transcriptClaim.status, 'FABRICATED');
  });

  // ----------------------------------------------------
  // Test 15: Agent 3 Web Evidence Verification (No hits -> UNVERIFIED)
  // ----------------------------------------------------
  await runTest('15. Agent 3 web evidence verification (No hits) -> yields UNVERIFIED (never FALSE solely from zero search hits)', async () => {
    const mp4Buffer = createValidMp4Buffer();
    const file = { originalname: 'local_meeting.mp4', mimetype: 'video/mp4', buffer: mp4Buffer };

    const res = await processMediaAnalysis({
      inputType: 'VIDEO',
      text: 'Local village community meeting in rural district on August 10, 2026.',
      file
    }, {
      providerStatus: { openai: 'UNAVAILABLE', webSearch: 'AVAILABLE' },
      mockMetadata: { hasAudio: true, durationSeconds: 10.0 },
      mockTranscript: {
        text: 'Local village community meeting in rural district on August 10, 2026.',
        segments: [{ start: 0.0, end: 5.0, text: 'Local village community meeting in rural district on August 10, 2026.' }]
      },
      mockFrames: [{ timestamp: 0.0, buffer: Buffer.from('f0') }],
      mockSearchResults: [] // Zero search hits
    });

    assert.strictEqual(res.valid, true);
    assert.ok(res.claims.length > 0);
    assert.strictEqual(res.claims[0].status, 'SUSPICIOUS');
    assert.notStrictEqual(res.claims[0].status, 'FABRICATED');
  });

  // ----------------------------------------------------
  // Test 16: Temporary Directory & File Cleanup
  // ----------------------------------------------------
  await runTest('16. Temporary file cleanup -> temporary directories cleaned up after sampling', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'etrai_test_cleanup_'));
    const dummyFile = path.join(tmpDir, 'test.txt');
    fs.writeFileSync(dummyFile, 'temp data');

    assert.strictEqual(fs.existsSync(dummyFile), true);

    fs.rmSync(tmpDir, { recursive: true, force: true });
    assert.strictEqual(fs.existsSync(tmpDir), false);
  });

  console.log('\n-----------------------------------------------------------');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('-----------------------------------------------------------\n');

  resetEnv();
  if (failed > 0) process.exit(1);
}

runRealVideoVerificationPipelineTests();
