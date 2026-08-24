const assert = require('assert');
const { extractImageMetadata, estimateJpegQuality } = require('../src/services/media/imageMetadata');
const { generateStructuredImageForensicReport } = require('../src/services/media/imageForensics');

async function testImageForensics() {
  console.log('====================================================');
  console.log('ETRAI IMAGE PROVIDED VS. ORIGINAL AUDIT');
  console.log('====================================================');

  // Test 1: Image Metadata & JPEG Quality
  console.log('\n[Test 1]: Image Metadata & JPEG Quality Extraction...');
  const sampleBuf = Buffer.alloc(2048, 0xAA);
  const metadata = extractImageMetadata(sampleBuf, {
    filename: 'briefing-photo-circulated.jpg',
    mimeType: 'image/jpeg',
    width: 1600,
    height: 1000
  });

  assert.strictEqual(metadata.filename, 'briefing-photo-circulated.jpg');
  assert.strictEqual(metadata.dimensions, '1600 × 1000');
  assert.ok(metadata.fileSize.includes('KB') || metadata.fileSize.includes('MB'));
  assert.ok(metadata.formatQuality.startsWith('JPEG'));
  console.log('✓ Metadata successfully extracted:');
  console.log('  Dimensions · size:', `${metadata.dimensions} · ${metadata.fileSize} · ${metadata.formatQuality}`);
  console.log('  EXIF / C2PA:', metadata.exifStatus);

  // Test 2: Structured Forensic Report Generation with Matches
  console.log('\n[Test 2]: Structured Forensic Report with Wire Archive Match...');
  const reportWithMatch = await generateStructuredImageForensicReport(sampleBuf, {
    filename: 'briefing-photo-circulated.jpg',
    mimeType: 'image/jpeg',
    width: 1600,
    height: 1000
  }, {
    reverseImageMatches: [
      {
        domain: 'reuters.com',
        sourceUrl: 'https://www.reuters.com/archive/photo/2026-08-08',
        originalImageUrl: 'https://static.reuters.example/photo-2026-08-08.jpg',
        publishedAt: '8 Aug 2026, 11:26',
        similarity: 0.98
      }
    ],
    ocrDifference: true,
    hasBurnedInDate: true
  });

  console.log('✓ Report with Wire Archive Match:');
  console.log('  Original found:', reportWithMatch.originalFound);
  console.log('  Changes:', reportWithMatch.changes.join(', '));
  console.log('  Manipulation likelihood:', reportWithMatch.manipulationLikelihood);
  console.log('  Diffs generated:', reportWithMatch.diffs.map(d => `[${d.id}] ${d.title}`).join(', '));

  assert.ok(reportWithMatch.originalFound.includes('Verified visual match'), 'Should classify a high-confidence match as verified');
  assert.strictEqual(reportWithMatch.originalFoundStatus, 'FOUND');
  assert.strictEqual(reportWithMatch.originalImageUrl, 'https://static.reuters.example/photo-2026-08-08.jpg');
  assert.strictEqual(reportWithMatch.originalPageUrl, 'https://www.reuters.com/archive/photo/2026-08-08');
  assert.ok(reportWithMatch.changes.includes('Banner text'));
  assert.ok(parseFloat(reportWithMatch.manipulationLikelihood) >= 0.70);

  // Test 3: Genuine Novel Image (No Match Found)
  console.log('\n[Test 3]: Novel Unindexed Image (No Match Found)...');
  const reportNoMatch = await generateStructuredImageForensicReport(sampleBuf, {
    filename: 'private_personal_capture.jpg',
    mimeType: 'image/jpeg',
    width: 1200,
    height: 800
  }, {
    reverseImageMatches: []
  });

  console.log('✓ Novel Image without Match:');
  console.log('  Original found:', reportNoMatch.originalFound);
  console.log('  Status:', reportNoMatch.originalFoundStatus);
  console.log('  Color:', reportNoMatch.originalFoundColor);

  assert.ok(reportNoMatch.originalFound.includes('no indexed candidate') || reportNoMatch.originalFound.includes('inconclusive'));
  assert.strictEqual(reportNoMatch.originalFoundStatus, 'UNVERIFIED');
  assert.strictEqual(reportNoMatch.originalFoundColor, 'ochre');

  console.log('\n====================================================');
  console.log('ALL IMAGE FORENSICS TESTS PASSED (3/3)');
  console.log('====================================================\n');
}

testImageForensics().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
