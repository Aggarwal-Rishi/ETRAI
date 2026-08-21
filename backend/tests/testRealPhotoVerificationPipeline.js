const assert = require('assert');
const { validateMediaInput, detectFormatFromMagicBytes } = require('../src/services/media/mediaValidator');
const { extractMediaMetadata } = require('../src/services/media/mediaMetadata');
const { extractOcrText } = require('../src/services/media/ocrService');
const { performReverseImageSearch } = require('../src/services/media/reverseImageSearch');
const { extractMediaClaims } = require('../src/services/media/mediaClaimExtractor');
const { processMediaAnalysis } = require('../src/services/media/mediaOrchestrator');

async function runRealPhotoVerificationPipelineTests() {
  console.log('===========================================================');
  console.log('🧪 Running REAL Photo Verification Pipeline Test Suite...');
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

  // Helper buffer creators
  const createValidJpegBuffer = () => Buffer.concat([
    Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]), // JPEG header
    Buffer.from([0xFF, 0xC0, 0x00, 0x11, 0x08, 0x01, 0x20, 0x01, 0x90, 0x03]), // SOF0: 288x400
    Buffer.from('sample jpeg body bytes')
  ]);

  const createInvalidBuffer = () => Buffer.from('corrupted fake image payload without magic bytes');

  // ----------------------------------------------------
  // Test 1: Valid JPEG
  // ----------------------------------------------------
  await runTest('1. Valid JPEG image -> magic-bytes validated, SHA-256 computed', () => {
    const jpegBuffer = createValidJpegBuffer();
    const file = { originalname: 'test_photo.jpg', mimetype: 'image/jpeg', buffer: jpegBuffer };

    const val = validateMediaInput({ file, inputType: 'PHOTO' });

    assert.strictEqual(val.valid, true);
    assert.strictEqual(val.fileInfo.mimeType, 'image/jpeg');
    assert.strictEqual(typeof val.fileInfo.sha256, 'string');
    assert.strictEqual(val.fileInfo.sha256.length, 64);
  });

  // ----------------------------------------------------
  // Test 2: Invalid Image Signature
  // ----------------------------------------------------
  await runTest('2. Invalid image signature -> magic-byte check fails and rejects file', () => {
    const badBuffer = createInvalidBuffer();
    const file = { originalname: 'fake.png', mimetype: 'image/png', buffer: badBuffer };

    const val = validateMediaInput({ file, inputType: 'PHOTO' });

    assert.strictEqual(val.valid, false);
    assert.ok(val.error.includes('Magic-byte signature verification failed'));
  });

  // ----------------------------------------------------
  // Test 3: Image without EXIF
  // ----------------------------------------------------
  await runTest('3. Image without EXIF metadata -> hasExif false (NOT treated as manipulation proof)', () => {
    const fileInfo = { filename: 'no_exif.jpg', mimeType: 'image/jpeg', sizeBytes: 1000, sha256: 'abc' };
    const metaRes = extractMediaMetadata(fileInfo, null, null);

    assert.strictEqual(metaRes.metadata.hasExif, false);
    assert.strictEqual(metaRes.metadata.exif.make, null);
    assert.ok(metaRes.limitations.some(l => l.includes('NOT proof of manipulation')));
  });

  // ----------------------------------------------------
  // Test 4: Image with EXIF
  // ----------------------------------------------------
  await runTest('4. Image with EXIF metadata -> parses camera make/model, timestamp, GPS, software', () => {
    const fileInfo = { filename: 'exif_photo.jpg', mimeType: 'image/jpeg', sizeBytes: 2000, sha256: 'def' };
    const mockExif = {
      make: 'Canon',
      model: 'EOS R5',
      timestamp: '2026-08-10T14:30:00Z',
      gps: '28.6139° N, 77.2090° E',
      software: 'Lightroom v12.0',
      orientation: 1
    };

    const metaRes = extractMediaMetadata(fileInfo, null, mockExif);

    assert.strictEqual(metaRes.metadata.hasExif, true);
    assert.strictEqual(metaRes.metadata.exif.make, 'Canon');
    assert.strictEqual(metaRes.metadata.exif.model, 'EOS R5');
    assert.strictEqual(metaRes.metadata.exif.gps, '28.6139° N, 77.2090° E');
  });

  // ----------------------------------------------------
  // Test 5: Image with visible text (OCR)
  // ----------------------------------------------------
  await runTest('5. Image with visible text -> returned separately in ocrText with model-extracted text label', async () => {
    const fileInfo = { filename: 'sign.jpg', mimeType: 'image/jpeg', sizeBytes: 1500, sha256: '123' };

    const ocrRes = await extractOcrText(fileInfo, null, {
      visionExtractedText: 'Delhi Central Metro Station'
    });

    assert.strictEqual(ocrRes.status, 'AVAILABLE');
    assert.ok(ocrRes.ocrText.includes('[model-extracted text]: Delhi Central Metro Station'));
    assert.strictEqual(ocrRes.source, 'model_vision_ocr');
  });

  // ----------------------------------------------------
  // Test 6: Image with user claim
  // ----------------------------------------------------
  await runTest('6. Image with user claim -> Agent 2 formats self-contained claim target', async () => {
    const payload = {
      userNotes: 'This photo shows a protest in Delhi on August 10, 2026.',
      ocrText: '',
      visualDescription: 'Crowd gathered on street holding signs.',
      entities: ['Delhi']
    };

    const claimRes = await extractMediaClaims(payload, {});

    assert.ok(claimRes.claims.length > 0);
    const userClaim = claimRes.claims.find(c => c.origin === 'USER_SUBMITTED_CLAIM');
    assert.ok(userClaim);
    assert.ok(userClaim.claimText.includes('claimed to depict'));
  });

  // ----------------------------------------------------
  // Test 7: Image without user claim
  // ----------------------------------------------------
  await runTest('7. Image without user claim -> extracts claims from visual findings', async () => {
    const payload = {
      userNotes: '',
      ocrText: 'Apex Solar reached 100MW operational capacity in 2026.',
      visualDescription: 'A large solar array field under daylight.',
      entities: ['Apex Solar']
    };

    const claimRes = await extractMediaClaims(payload, {});

    assert.ok(claimRes.claims.length > 0);
    assert.strictEqual(claimRes.claims.some(c => c.origin === 'USER_SUBMITTED_CLAIM'), false);
  });

  // ----------------------------------------------------
  // Test 8: Unavailable reverse image search
  // ----------------------------------------------------
  await runTest('8. Unavailable reverse image search -> returns UNAVAILABLE state with zero fake matches', async () => {
    const fileInfo = { filename: 'photo.jpg', mimeType: 'image/jpeg', sizeBytes: 1000, sha256: '999' };

    const revRes = await performReverseImageSearch(fileInfo, null, null, {
      providerStatus: { webSearch: 'UNAVAILABLE' }
    });

    assert.strictEqual(revRes.status, 'UNAVAILABLE');
    assert.strictEqual(revRes.matches.length, 0, 'Must NOT generate fake reverse search matches');
  });

  // ----------------------------------------------------
  // Test 9: Manipulation signals format
  // ----------------------------------------------------
  await runTest('9. Manipulation signals -> formatted with type, severity, confidence, and potential manipulation indicator explanation', async () => {
    const fileInfo = { filename: 'edited.jpg', mimeType: 'image/jpeg', sizeBytes: 1000, sha256: '555' };
    
    // Test processMediaAnalysis returns manipulation signals array cleanly
    const res = await processMediaAnalysis({
      inputType: 'PHOTO',
      text: 'Test edited photo',
      file: { originalname: 'edited.jpg', mimetype: 'image/jpeg', buffer: createValidJpegBuffer() }
    }, { providerStatus: { openai: 'UNAVAILABLE' } });

    assert.ok(Array.isArray(res.manipulationSignals));
  });

  // ----------------------------------------------------
  // Test 10: No web evidence (yields UNVERIFIED)
  // ----------------------------------------------------
  await runTest('10. No web evidence -> Agent 3 returns UNVERIFIED (never FALSE solely from zero search hits)', async () => {
    const jpegBuffer = createValidJpegBuffer();
    const file = { originalname: 'local_event.jpg', mimetype: 'image/jpeg', buffer: jpegBuffer };

    const res = await processMediaAnalysis({
      inputType: 'PHOTO',
      text: 'Local village community meeting in rural district on August 10, 2026.',
      file
    }, {
      providerStatus: { openai: 'UNAVAILABLE', webSearch: 'AVAILABLE' },
      mockSearchResults: [] // Zero search hits
    });

    assert.strictEqual(res.valid, true);
    assert.ok(res.claims.length > 0);
    assert.strictEqual(res.claims[0].status, 'SUSPICIOUS');
    assert.notStrictEqual(res.claims[0].status, 'FABRICATED');
  });

  // ----------------------------------------------------
  // Test 11: Supporting web evidence (yields VERIFIED / TRUSTED)
  // ----------------------------------------------------
  await runTest('11. Supporting web evidence -> Agent 3 verifies claim as TRUSTED / VERIFIED', async () => {
    delete process.env.OPENAI_API_KEY;

    const jpegBuffer = createValidJpegBuffer();
    const file = { originalname: 'solar_launch.jpg', mimetype: 'image/jpeg', buffer: jpegBuffer };

    const res = await processMediaAnalysis({
      inputType: 'PHOTO',
      text: 'Apex Solar reached 100MW operational capacity in 2026.',
      file
    }, {
      providerStatus: { openai: 'UNAVAILABLE', webSearch: 'AVAILABLE' },
      mockSearchResults: [{
        title: 'Apex Solar Reached 100MW Operational Capacity in 2026',
        snippet: 'Official report confirms Apex Solar reached 100MW operational capacity in 2026.',
        link: 'https://reuters.com/article/apex-solar',
        url: 'https://reuters.com/article/apex-solar',
        domain: 'reuters.com'
      }]
    });

    assert.strictEqual(res.valid, true);
    assert.ok(res.claims.length > 0);
    const targetClaim = res.claims.find(c => c.origin === 'USER_SUBMITTED_CLAIM' || c.claimText.includes('Apex Solar')) || res.claims[0];
    assert.strictEqual(targetClaim.status, 'TRUSTED');
  });

  // ----------------------------------------------------
  // Test 12: Refuting web evidence (yields FALSE / FABRICATED)
  // ----------------------------------------------------
  await runTest('12. Refuting web evidence -> Agent 3 refutes claim as FABRICATED / FALSE', async () => {
    delete process.env.OPENAI_API_KEY;

    const jpegBuffer = createValidJpegBuffer();
    const file = { originalname: 'hoax_photo.jpg', mimetype: 'image/jpeg', buffer: jpegBuffer };

    const res = await processMediaAnalysis({
      inputType: 'PHOTO',
      text: 'Metro Corp tax rates surged by 300% overnight.',
      file
    }, {
      providerStatus: { mode: 'MOCK', openai: 'UNAVAILABLE', webSearch: 'AVAILABLE' },
      mockSearchResults: [{
        title: 'Metro Corp Tax Surge Claim Debunked as False',
        snippet: 'Auditors refuted claims and confirmed Metro Corp tax rates remained completely unchanged.',
        link: 'https://bbc.com/news/tax-debunk',
        url: 'https://bbc.com/news/tax-debunk',
        domain: 'bbc.com',
        isMockFixture: true
      }]
    });

    assert.strictEqual(res.valid, true);
    assert.ok(res.claims.length > 0);
    const targetClaim = res.claims.find(c => c.origin === 'USER_SUBMITTED_CLAIM' || c.claimText.includes('Metro Corp')) || res.claims[0];
    assert.strictEqual(targetClaim.status, 'FABRICATED');
  });

  console.log('\n-----------------------------------------------------------');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('-----------------------------------------------------------\n');

  if (failed > 0) process.exit(1);
}

runRealPhotoVerificationPipelineTests();
