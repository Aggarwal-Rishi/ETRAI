const assert = require('assert');
const {
  performDualImageComparison,
  performImageForensicAnalysis,
  generateStructuredImageForensicReport
} = require('../src/services/media/imageForensics');
const { performReverseImageSearch } = require('../src/services/media/reverseImageSearch');

async function testAgent7Pipeline() {
  console.log('====================================================');
  console.log('TESTING AGENT 7: DUAL-IMAGE MULTIMODAL COMPARATOR');
  console.log('====================================================\n');

  // Create a 1x1 test image buffer (JPEG SOI/EOI)
  const dummyJpegBuffer = Buffer.from([
    0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
    0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
    0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xDA, 0x00,
    0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00, 0xBF, 0x00, 0xFF, 0xD9
  ]);

  // Test 1: Reverse image search service with mock wire provider
  console.log('[Test 1]: Testing Google Lens & Reverse Search Service...');
  const mockProvider = {
    search: async () => ({
      status: 'AVAILABLE',
      provider: 'GOOGLE_LENS_SERPAPI',
      originalImageUrl: 'https://wire-archive.reuters.com/photos/2024/08/15/modi_independence_day_original.jpg',
      sourceArticleUrl: 'https://reuters.com/world/india/independence-day-2024-report-12345',
      sourceTitle: 'Prime Minister Narendra Modi addresses the nation from Red Fort',
      domain: 'reuters.com',
      publishedDate: '15 Aug 2024, 08:30 IST',
      matches: [
        {
          title: 'Prime Minister Narendra Modi addresses the nation from Red Fort',
          sourceUrl: 'https://reuters.com/world/india/independence-day-2024-report-12345',
          originalImageUrl: 'https://wire-archive.reuters.com/photos/2024/08/15/modi_independence_day_original.jpg',
          domain: 'reuters.com',
          similarity: 0.99,
          isWire: true
        }
      ]
    })
  };

  const reverseResults = await performReverseImageSearch(dummyJpegBuffer, { reverseSearchProvider: mockProvider });
  assert.strictEqual(reverseResults.status, 'AVAILABLE', 'Reverse search status should be AVAILABLE');
  assert.strictEqual(reverseResults.provider, 'GOOGLE_LENS_SERPAPI', 'Should report GOOGLE_LENS_SERPAPI provider');
  assert.ok(reverseResults.originalImageUrl.includes('reuters.com'), 'Should return direct wire image link');
  assert.strictEqual(reverseResults.matches[0].isWire, true, 'Should mark wire source as true');
  console.log('✓ Google Lens reverse search integration verified');

  // Test 2: Structured Image Forensic Report with Dual-Image Comparator Data
  console.log('\n[Test 2]: Testing Structured Image Forensic Report & Bounding Boxes...');
  const reportItem = await generateStructuredImageForensicReport(dummyJpegBuffer, {
    filename: 'circulated_red_fort_photo.jpg',
    mimeType: 'image/jpeg'
  }, {
    reverseSearchProvider: mockProvider,
    visionObserved: {
      visibleText: 'विकसित भारत @ 2047',
      entities: ['Narendra Modi', 'Salman Khan']
    }
  });

  assert.ok(reportItem.id, 'Report item must have an ID');
  assert.ok(reportItem.uploadedImageDataUrl.startsWith('data:image/jpeg;base64,'), 'Must contain base64 data URL for uploaded photo');
  assert.strictEqual(reportItem.originalFoundStatus, 'FOUND', 'Should confirm original photo found in wire archive');
  assert.ok(reportItem.originalFound.includes('Wire archive'), 'Should display Wire archive status');
  assert.ok(Array.isArray(reportItem.diffs), 'Should contain diff markers');
  assert.ok(reportItem.diffs.length > 0, 'Should have at least 1 diff marker');
  assert.ok(reportItem.diffs[0].box, 'Diff marker must have box geometry');
  assert.ok(reportItem.diffs[0].box.left || reportItem.diffs[0].box.x, 'Diff box must have coordinates');

  console.log('✓ Structured report item produced:', {
    filename: reportItem.filename,
    originalFound: reportItem.originalFound,
    diffsCount: reportItem.diffs.length,
    manipulationLikelihood: reportItem.manipulationLikelihood
  });

  console.log('\n====================================================');
  console.log('ALL AGENT 7 DUAL-IMAGE VLM TESTS PASSED (2/2)');
  console.log('====================================================\n');
}

testAgent7Pipeline().catch(err => {
  console.error('Agent 7 Test Failed:', err);
  process.exit(1);
});
