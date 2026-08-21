const assert = require('assert');
const { validateMediaInput } = require('../src/services/media/mediaValidator');
const { extractMediaMetadata } = require('../src/services/media/mediaMetadata');
const { analyzeImage } = require('../src/services/media/imageAnalyzer');
const { analyzeVideo } = require('../src/services/media/videoAnalyzer');
const { extractOcrText } = require('../src/services/media/ocrService');
const { performReverseImageSearch } = require('../src/services/media/reverseImageSearch');
const { extractMediaClaims } = require('../src/services/media/mediaClaimExtractor');
const { processMediaAnalysis } = require('../src/services/media/mediaOrchestrator');

async function runMediaAnalysisArchitectureTests() {
  console.log('======================================================');
  console.log('🧪 Running ETRAI Media Analysis Architecture Tests...');
  console.log('======================================================\n');

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

  // Test 1: Media Ingestion & SHA-256 Hash Computation
  await runTest('1. Media Validator computes SHA-256 hash and identifies file attributes', () => {
    const dummyBuffer = Buffer.from('test photo binary content 2026');
    const file = {
      originalname: 'sample_photo.jpg',
      mimetype: 'image/jpeg',
      buffer: dummyBuffer
    };

    const val = validateMediaInput({ file, inputType: 'PHOTO' });

    assert.strictEqual(val.valid, true);
    assert.strictEqual(val.mediaType, 'PHOTO');
    assert.strictEqual(val.fileInfo.filename, 'sample_photo.jpg');
    assert.strictEqual(val.fileInfo.mimeType, 'image/jpeg');
    assert.strictEqual(val.fileInfo.sizeBytes, dummyBuffer.length);
    assert.strictEqual(typeof val.fileInfo.sha256, 'string');
    assert.strictEqual(val.fileInfo.sha256.length, 64, 'SHA-256 hash must be 64 hex chars');
  });

  // Test 2: Media Metadata Extraction
  await runTest('2. Media Metadata extracts format and size properties', () => {
    const fileInfo = {
      filename: 'clip.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 1048576,
      sha256: 'abc123hash'
    };

    const metaRes = extractMediaMetadata(fileInfo, null);

    assert.strictEqual(metaRes.metadata.filename, 'clip.mp4');
    assert.strictEqual(metaRes.metadata.mimeType, 'video/mp4');
    assert.strictEqual(metaRes.metadata.format, 'mp4');
    assert.ok(Array.isArray(metaRes.limitations));
  });

  // Test 3: Image & Video Analyzer Provider Boundaries (Unavailable State)
  await runTest('3. Image & Video Analyzers return explicit UNAVAILABLE status when providers are unconfigured', async () => {
    const fileInfo = { filename: 'test.jpg', mimeType: 'image/jpeg', sizeBytes: 500, sha256: '123' };

    // Image analyzer without OpenAI key
    const imgRes = await analyzeImage(fileInfo, null, null, { providerStatus: { openai: 'UNAVAILABLE' } });
    assert.strictEqual(imgRes.status, 'UNAVAILABLE');
    assert.strictEqual(imgRes.visualDescription, '', 'Must NOT fabricate fake visual descriptions');
    assert.ok(imgRes.limitations.some(l => l.includes('unavailable')));

    // Video analyzer without frame tools
    const vidRes = await analyzeVideo(fileInfo, null, null, { providerStatus: {} });
    assert.strictEqual(vidRes.status, 'UNAVAILABLE');
    assert.strictEqual(vidRes.visualDescription, '');
    assert.ok(vidRes.limitations.length > 0);
  });

  // Test 4: OCR Service Provider Boundaries
  await runTest('4. OCR Service returns explicit UNAVAILABLE state when OCR engine is missing', async () => {
    const fileInfo = { filename: 'sign.png', mimeType: 'image/png', sizeBytes: 300, sha256: '456' };

    const ocrRes = await extractOcrText(fileInfo, null, {});
    assert.strictEqual(ocrRes.status, 'UNAVAILABLE');
    assert.strictEqual(ocrRes.ocrText, '', 'Must NOT invent fake OCR text');
    assert.ok(ocrRes.limitations.some(l => l.includes('OCR engine')));
  });

  // Test 5: Reverse Image Search Provider Boundaries
  await runTest('5. Reverse Image Search returns UNAVAILABLE status without fabricating fake matches', async () => {
    const fileInfo = { filename: 'photo.jpg', mimeType: 'image/jpeg', sizeBytes: 800, sha256: '789' };

    const revRes = await performReverseImageSearch(fileInfo, null, null, { providerStatus: { webSearch: 'UNAVAILABLE' } });
    assert.strictEqual(revRes.status, 'UNAVAILABLE');
    assert.strictEqual(revRes.matches.length, 0, 'Must NOT generate fake reverse search matches');
    assert.ok(revRes.limitations.length > 0);
  });

  // Test 6: Visual & Textual Media Claim Extraction
  await runTest('6. Media Claim Extractor extracts claims from OCR text and user notes', async () => {
    const mediaPayload = {
      userNotes: 'Photo claims Apex Solar reached 100MW operational capacity in 2026.',
      ocrText: 'Apex Solar Official Statement: 100MW achieved in 2026.',
      visualDescription: 'A solar farm with solar panels under sunlight.',
      entities: ['Apex Solar']
    };

    const claimRes = await extractMediaClaims(mediaPayload, {});

    assert.ok(Array.isArray(claimRes.claims));
    assert.ok(claimRes.claims.length > 0, 'Must extract verifiable claim from media text');
    assert.ok(claimRes.claims[0].claimText.includes('Apex Solar') || claimRes.claims[0].claimText.includes('100MW'));
  });

  // Test 7: Normalized MediaAnalysis Contract Output
  await runTest('7. End-to-End Media Orchestrator outputs canonical MediaAnalysis object', async () => {
    const file = {
      originalname: 'ev_launch.png',
      mimetype: 'image/png',
      buffer: Buffer.from('dummy image buffer for orchestrator test')
    };

    const mediaAnalysis = await processMediaAnalysis({
      inputType: 'PHOTO',
      text: 'City Transit launched 50 EV Buses in 2026.',
      file
    }, { providerStatus: { openai: 'UNAVAILABLE', webSearch: 'UNAVAILABLE' } });

    assert.strictEqual(mediaAnalysis.mediaType, 'PHOTO');
    assert.strictEqual(mediaAnalysis.file.filename, 'ev_launch.png');
    assert.strictEqual(mediaAnalysis.file.mimeType, 'image/png');
    assert.strictEqual(typeof mediaAnalysis.file.sha256, 'string');
    assert.ok(typeof mediaAnalysis.metadata === 'object');
    assert.strictEqual(typeof mediaAnalysis.ocrText, 'string');
    assert.strictEqual(typeof mediaAnalysis.visualDescription, 'string');
    assert.ok(Array.isArray(mediaAnalysis.entities));
    assert.ok(Array.isArray(mediaAnalysis.claims));
    assert.ok(Array.isArray(mediaAnalysis.manipulationSignals));
    assert.strictEqual(typeof mediaAnalysis.reverseSearch.status, 'string');
    assert.ok(Array.isArray(mediaAnalysis.reverseSearch.matches));
    assert.ok(Array.isArray(mediaAnalysis.limitations));
  });

  console.log('\n------------------------------------------------------');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('------------------------------------------------------\n');

  if (failed > 0) process.exit(1);
}

runMediaAnalysisArchitectureTests();
