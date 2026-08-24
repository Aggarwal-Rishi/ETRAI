const assert = require('assert');
const sharp = require('sharp');

const { performReverseImageSearch, querySerperSearch, createDifferenceHash, hashSimilarity, regionalHashSimilarity, isPresentableVisualCandidate, isUsefulOcrText, prepareSerpApiUploadImage, normalizeSerpApiLensMatches } = require('../src/services/media/reverseImageSearch');
const { extractMediaClaims } = require('../src/services/media/mediaClaimExtractor');
const { generateStructuredImageForensicReport } = require('../src/services/media/imageForensics');

// Unit tests must never consume a developer's live Google Lens quota. Some
// integration imports load backend/.env, so override only after all imports.
process.env.SERPAPI_API_KEY = 'YOUR_SERPAPI_API_KEY_HERE';

async function runTests() {
  console.log('====================================================');
  console.log('TESTING SERPER REVERSE IMAGE SEARCH FLOW');
  console.log('====================================================');

  const testBuffer = Buffer.alloc(1024, 0x42);

  // Test 1: Flexible Argument Normalization
  console.log('\n[Test 1]: Argument normalization across signatures...');
  const resFromBuffer = await performReverseImageSearch(testBuffer, {
    mimeType: 'image/jpeg',
    ocrText: 'Currency Withdrawal Notice 1 Oct 2026',
    entities: ['Central bank', 'Finance Ministry']
  });

  assert.ok(resFromBuffer, 'Should return a valid response object');
  assert.ok(Array.isArray(resFromBuffer.matches), 'Matches must be an array');
  console.log('✓ Signature (buffer, options) normalized successfully. Provider:', resFromBuffer.provider);

  // Test 2: Serper Credit / Error Handling
  console.log('\n[Test 2]: Serper credit exhaustion graceful handling...');
  const serperTest = await querySerperSearch('test query', 'invalid_or_exhausted_key', false);
  assert.ok(serperTest, 'querySerperSearch should handle errors gracefully without throwing');
  assert.strictEqual(serperTest.success, false, 'Should return success=false on failure');
  console.log('✓ Handled Serper API error cleanly without uncaught exceptions.');

  // Test 3: Structured Forensic Report with Custom Matching
  console.log('\n[Test 3]: Full forensic report integration...');
  const report = await generateStructuredImageForensicReport(testBuffer, {
    filename: 'test_sample.jpg',
    mimeType: 'image/jpeg'
  }, {
    reverseImageMatches: [
      {
        domain: 'reuters.com',
        sourceUrl: 'https://www.reuters.com/archive/photo/2026-08-08',
        thumbnailUrl: 'https://www.reuters.com/images/sample.jpg',
        publishedAt: '8 Aug 2026, 11:26',
        similarity: 0.98
      }
    ]
  });

  assert.strictEqual(report.originalFoundStatus, 'FOUND');
  assert.ok(report.originalFound.includes('Verified visual match'));
  assert.strictEqual(report.originalImageUrl, 'https://www.reuters.com/images/sample.jpg');
  assert.ok(report.uploadedImageDataUrl.startsWith('data:image/jpeg;base64,'));
  console.log('✓ Full forensic report integration validated:');
  console.log('  Original Found:', report.originalFound);
  console.log('  Original Image URL:', report.originalImageUrl);
  console.log('  Uploaded Data URL present:', Boolean(report.uploadedImageDataUrl));

  const candidateReport = await generateStructuredImageForensicReport(testBuffer, {
    filename: 'candidate_sample.jpg',
    mimeType: 'image/jpeg'
  }, {
    reverseImageMatches: [
      {
        domain: 'gettyimages.com',
        sourceUrl: 'https://www.gettyimages.com/detail/photo/example',
        originalImageUrl: 'https://media.gettyimages.com/example.jpg',
        matchType: 'VISUAL_SEARCH_CANDIDATE',
        similarity: null
      }
    ]
  });
  assert.strictEqual(candidateReport.originalFoundStatus, 'CANDIDATE');
  assert.ok(candidateReport.originalFound.includes('Visual candidate'));

  const rising = Buffer.from(Array.from({ length: 72 }, (_, index) => index % 9));
  const falling = Buffer.from(Array.from({ length: 72 }, (_, index) => 8 - (index % 9)));
  const risingPng = await sharp(rising, { raw: { width: 9, height: 8, channels: 1 } }).png().toBuffer();
  const fallingPng = await sharp(falling, { raw: { width: 9, height: 8, channels: 1 } }).png().toBuffer();
  const risingHash = await createDifferenceHash(risingPng);
  const sameHash = await createDifferenceHash(risingPng);
  const fallingHash = await createDifferenceHash(fallingPng);
  assert.strictEqual(hashSimilarity(risingHash, sameHash), 1);
  assert.ok(hashSimilarity(risingHash, fallingHash) < 0.2, 'Opposite image gradients should not be accepted as the same image');

  const regionHashes = Array(9).fill(risingHash);
  const locallyEditedRegions = [...regionHashes];
  locallyEditedRegions[4] = fallingHash;
  assert.strictEqual(regionalHashSimilarity(regionHashes, locallyEditedRegions), 1, 'A local edit must not hide matching surrounding regions');
  assert.strictEqual(isPresentableVisualCandidate(0.58), false, 'Weak scene lookalikes must not be exposed as reverse-image candidates');
  assert.strictEqual(isPresentableVisualCandidate(0.72), true, 'A locally compared candidate at the presentation threshold may be shown with a candidate label');

  const lensUploadSource = await sharp({
    create: { width: 1800, height: 1200, channels: 3, background: { r: 40, g: 120, b: 210 } }
  }).png().toBuffer();
  const preparedLensUpload = await prepareSerpApiUploadImage(lensUploadSource);
  assert.strictEqual(preparedLensUpload.mimeType, 'image/jpeg');
  assert.ok(preparedLensUpload.buffer.length <= 500 * 1024, 'SerpApi upload copy must stay under the documented 500 KB limit');

  const normalizedLensMatches = normalizeSerpApiLensMatches({
    exact_matches: [
      {
        title: 'Example exact match',
        link: 'https://example.com/news/photo-story',
        thumbnail: 'https://example.com/images/photo.jpg',
        source: 'Example News',
        date: 'Aug 24, 2026'
      },
      {
        title: 'Duplicate exact match',
        link: 'https://example.com/news/photo-story',
        thumbnail: 'https://example.com/images/photo.jpg'
      },
      {
        title: 'Unsafe local result',
        link: 'http://127.0.0.1/private',
        thumbnail: 'http://127.0.0.1/private.jpg'
      }
    ]
  });
  assert.strictEqual(normalizedLensMatches.length, 1, 'Lens results must be de-duplicated and SSRF-filtered');
  assert.strictEqual(normalizedLensMatches[0].matchType, 'LENS_EXACT_MATCH_CANDIDATE');

  const gibberishOcr = '(((((((((((((((((((((((((((((((((((( y67qY xM-E4;uW:h ?!:Uk?L:vQwlf';
  assert.strictEqual(isUsefulOcrText(gibberishOcr), false, 'Repeated punctuation OCR noise must not poison visual search');
  assert.strictEqual(isUsefulOcrText('[model-extracted text]: विकसित भारत @ 2047'), true, 'Readable multilingual OCR must remain usable');
  const noisyClaims = await extractMediaClaims({ ocrText: gibberishOcr }, {});
  assert.strictEqual(noisyClaims.claims.length, 0, 'Gibberish OCR must not become a factual claim');

  console.log('\n====================================================');
  console.log('ALL SERPER REVERSE IMAGE FLOW TESTS PASSED (3/3)');
  console.log('====================================================\n');
}

runTests().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
