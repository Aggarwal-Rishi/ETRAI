const assert = require('assert');
const {
  performImageForensics,
  detectC2PACredentials,
  checkImageFileIntegrity,
  analyzeManipulationArtifacts
} = require('../src/services/media/imageForensics');
const { processMediaAnalysis } = require('../src/services/media/mediaOrchestrator');

async function runStage21ImageForensicsTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING STAGE 21: REAL IMAGE FORENSICS TEST SUITE');
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
  // Test 1: C2PA Content Credentials Detection
  // ----------------------------------------------------------------
  await runTest('1. Detects cryptographically signed C2PA manifest container in binary headers', async () => {
    // Simulated C2PA image buffer containing JUMBF box and Adobe C2PA manifest
    const c2paHeader = Buffer.from('ffd8ffe10020687474703a2f2f6361692e636f6e74656e7461757468656e7469636974792e6f72672f633270612f6a756d626641646f62652050686f746f73686f70ffd9', 'hex');
    const res = detectC2PACredentials(c2paHeader);

    assert.strictEqual(res.hasC2PA, true);
    assert.strictEqual(res.status, 'C2PA_CREDENTIALS_DETECTED');
    assert.ok(res.claimGenerator.includes('Adobe Photoshop'));
    assert.strictEqual(res.isAuthentic, true);
  });

  // ----------------------------------------------------------------
  // Test 2: Honest Unavailable State (No fake C2PA / EXIF scores)
  // ----------------------------------------------------------------
  await runTest('2. Honest unavailable state: Returns NO_C2PA_MANIFEST when credentials are not present', async () => {
    const rawBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0xFF, 0xD9]);
    const res = detectC2PACredentials(rawBuffer);

    assert.strictEqual(res.hasC2PA, false);
    assert.strictEqual(res.status, 'NO_C2PA_MANIFEST');
    assert.strictEqual(res.manifestIssuer, null);
  });

  // ----------------------------------------------------------------
  // Test 3: Binary File Integrity Checks & Magic Bytes Validation
  // ----------------------------------------------------------------
  await runTest('3. Binary file integrity checks detect missing EOF marker and trailing hidden data', async () => {
    // Scenario A: Valid JPEG
    const validJpeg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x04, 0x00, 0x00, 0xFF, 0xD9]);
    const resA = checkImageFileIntegrity(validJpeg, 'image/jpeg');
    assert.strictEqual(resA.isValid, true);
    assert.strictEqual(resA.isTruncated, false);

    // Scenario B: Truncated JPEG (missing 0xFFD9)
    const truncatedJpeg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x04, 0x00, 0x00]);
    const resB = checkImageFileIntegrity(truncatedJpeg, 'image/jpeg');
    assert.strictEqual(resB.isValid, false);
    assert.strictEqual(resB.isTruncated, true);

    // Scenario C: Trailing appended payload past EOF
    const trailingPayload = Buffer.concat([
      validJpeg,
      Buffer.alloc(128, 0xAA) // 128 trailing hidden bytes
    ]);
    const resC = checkImageFileIntegrity(trailingPayload, 'image/jpeg');
    assert.strictEqual(resC.hasTrailingData, true);
    assert.ok(resC.anomalies[0].includes('trailing bytes'));
  });

  // ----------------------------------------------------------------
  // Test 4: Error Level Analysis & Double-Compression Disparity Detection
  // ----------------------------------------------------------------
  await runTest('4. ELA & recompression analysis detects multi-pass quantization disparities and software tags', async () => {
    // Construct valid JPEG buffer containing Photoshop APP1 marker and 4 DQT markers (multi-pass composite)
    const photoshopMarker = Buffer.from('ffe1001a41646f62652050686f746f73686f7020456469746564', 'hex');
    const dqt1 = Buffer.from([0xFF, 0xDB, 0x00, 0x04, 0x00, 0x00]);
    const dqt2 = Buffer.from([0xFF, 0xDB, 0x00, 0x04, 0x01, 0x00]);
    const dqt3 = Buffer.from([0xFF, 0xDB, 0x00, 0x04, 0x02, 0x00]);
    const dqt4 = Buffer.from([0xFF, 0xDB, 0x00, 0x04, 0x03, 0x00]);
    const multiDqtJpeg = Buffer.concat([
      Buffer.from([0xFF, 0xD8]),
      photoshopMarker,
      dqt1, dqt2, dqt3, dqt4,
      Buffer.from([0xFF, 0xD9])
    ]);

    const artifacts = analyzeManipulationArtifacts(multiDqtJpeg, 'image/jpeg');

    assert.ok(artifacts.manipulationLikelihood >= 60);
    assert.strictEqual(artifacts.riskTier, 'HIGH_MANIPULATION_PROBABILITY');
    assert.ok(artifacts.detectedSoftware.includes('Photoshop'));
    assert.ok(artifacts.signals.some(s => s.type === 'DOUBLE_COMPRESSION'));
    assert.strictEqual(artifacts.suspiciousRegions.length, 1);
    assert.strictEqual(artifacts.suspiciousRegions[0].anomalyType, 'COMPRESSION_GRID_DISPARITY');
  });

  // ----------------------------------------------------------------
  // Test 5: Full Image Forensic Pipeline Execution
  // ----------------------------------------------------------------
  await runTest('5. performImageForensics aggregates C2PA, integrity, ELA, and first-appearance', async () => {
    const testBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x04, 0x00, 0x00, 0xFF, 0xD9]);
    const fileInfo = {
      filename: 'statutory_press_photo.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: testBuffer.length,
      sha256: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0'
    };

    const res = await performImageForensics({
      fileInfo,
      buffer: testBuffer,
      options: {
        reverseSearchProvider: {
          search: async () => ({
            status: 'COMPLETED',
            matches: [
              { domain: 'pib.gov.in', publishedDate: '2026-08-19T04:00:00Z', title: 'Original Press Release Photo' }
            ]
          })
        }
      }
    });

    assert.strictEqual(res.mimeType, 'image/jpeg');
    assert.strictEqual(res.integrity.status, 'INTEGRITY_VERIFIED');
    assert.strictEqual(res.firstAppearance.earliestDomain, 'pib.gov.in');
    assert.strictEqual(res.forensicSummary.verdict, 'NO_MANIPULATION_SIGNAL_FOUND');
  });

  // ----------------------------------------------------------------
  // Test 6: Media Orchestrator Integration
  // ----------------------------------------------------------------
  await runTest('6. processMediaAnalysis seamlessly incorporates real forensics into mediaAnalysis payload', async () => {
    const validJpeg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x04, 0x00, 0x00, 0xFF, 0xD9]);
    const file = {
      originalname: 'evidence_scan.jpg',
      mimetype: 'image/jpeg',
      buffer: validJpeg,
      size: validJpeg.length
    };

    const analysis = await processMediaAnalysis({
      inputType: 'PHOTO',
      file
    });

    assert.ok(analysis.valid);
    assert.strictEqual(analysis.mediaType, 'PHOTO');
    assert.ok(analysis.forensics, 'mediaAnalysis must contain forensics object');
    assert.strictEqual(analysis.forensics.integrity.status, 'INTEGRITY_VERIFIED');
    assert.ok(analysis.forensics.forensicSummary);
  });

  console.log('\n================================================================');
  console.log(`🏆 STAGE 21 TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runStage21ImageForensicsTests();
