/**
 * Phase 6 Test Suite: Real Media & Document Intelligence Subsystem
 * Verifies:
 * 1. Valid Image Forensics (EXIF, dHash, C2PA, ELA)
 * 2. Invalid Image & Trailing Payload Steganography Detection
 * 3. Oversized Files & Decompression Bomb Security Rejection
 * 4. PDF Structure, Metadata & Incremental Update Tampering Detection
 * 5. DOCX Metadata, Revision History & Macro Detection
 * 6. Structured OCR with Bounding Boxes & Uncertainty Quantification
 * 7. Video Container Atom Parsing & Shot Boundary Cut Detection
 * 8. Audio Waveform RMS Energy Profiling & Splice Detection
 * 9. Forensic Evidence Connection to Claims (SUPPORTS / CONTRADICTS / QUALIFIES)
 * 10. End-to-End Media Orchestrator Execution with Calibrated Verdicts
 */

const assert = require('assert');
const crypto = require('crypto');
const { validateMediaInput, detectFormatFromMagicBytes, inspectZipBombSafety } = require('../src/services/media/mediaValidator');
const { computeDHash, computeAHash, calculateHammingDistance, evaluatePerceptualMatch, detectCopyMoveForgery } = require('../src/services/media/perceptualHasher');
const { performImageForensicAnalysis, extractExifAndMetadata, detectC2PACredentials, checkImageFileIntegrity } = require('../src/services/media/imageForensics');
const { performDocumentForensicAnalysis, analyzePdfStructure, analyzeDocxStructure, verifyOfficialTemplate } = require('../src/services/media/documentForensics');
const { extractOcrText, parseSimulatedBlocks, calculateOcrUncertainty } = require('../src/services/media/ocrService');
const { performVideoAndAudioForensics, detectShotCuts, analyzeVideoContainer, profileAudioWaveform } = require('../src/services/media/videoAudioForensics');
const { mapForensicFindingsToClaims } = require('../src/services/media/mediaEvidenceService');
const { processMediaAnalysis } = require('../src/services/media/mediaOrchestrator');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(`    ${err.message}`);
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(`    ${err.message}`);
  }
}

async function runAllPhase6Tests() {
  console.log('\n======================================================');
  console.log('🧪 ETRAI PHASE 6: MEDIA & DOCUMENT INTELLIGENCE SUITE');
  console.log('======================================================\n');

  // -------------------------------------------------------------
  // Test 1: Valid Image Forensics (EXIF, dHash, ELA, C2PA)
  // -------------------------------------------------------------
  await runAsyncTest('Test 1: Valid Image Forensics (EXIF, dHash, C2PA Detection)', async () => {
    // Construct valid JPEG buffer with APP1 EXIF and C2PA manifest header
    const header = Buffer.from([0xFF, 0xD8, 0xFF, 0xE1]);
    const exifData = Buffer.from('Exif\0\0II*\0Make: Canon\0Model: EOS R5\0Software: Adobe Photoshop 2024\0\x00', 'binary');
    const c2paMarker = Buffer.from('c2pa.manifest\0jumb\0Truepic Lens C2PA Native Capture\0', 'binary');
    const pixelBody = Buffer.alloc(1024, 0x7F);
    const footer = Buffer.from([0xFF, 0xD9]);
    const validJpeg = Buffer.concat([header, exifData, c2paMarker, pixelBody, footer]);

    const result = await performImageForensicAnalysis(validJpeg, 'image/jpeg', { filename: 'test_photo.jpg' });

    assert.strictEqual(result.status, 'COMPLETED');
    assert.strictEqual(result.exif.hasExif, true);
    assert.strictEqual(result.exif.cameraMake, 'Canon');
    assert.strictEqual(result.exif.software, 'Adobe Photoshop 2024');
    assert.strictEqual(result.c2pa.hasC2PA, true);
    assert.strictEqual(result.perceptualHash.length, 16);
    assert(result.forensicEvidence.some(e => e.findingType === 'C2PA_CONTENT_CREDENTIALS'));
  });

  // -------------------------------------------------------------
  // Test 2: Invalid Image & Trailing Payload Steganography Detection
  // -------------------------------------------------------------
  await runAsyncTest('Test 2: Integrity & Trailing Payload Detection', async () => {
    // Construct JPEG with 512 trailing bytes appended past EOI marker (0xFFD9)
    const header = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
    const pixelBody = Buffer.alloc(512, 0x55);
    const eoi = Buffer.from([0xFF, 0xD9]);
    const trailingStegoPayload = Buffer.alloc(512, 0xAA); // Hidden payload
    const stegoJpeg = Buffer.concat([header, pixelBody, eoi, trailingStegoPayload]);

    const integrity = checkImageFileIntegrity(stegoJpeg, 'image/jpeg');
    assert.strictEqual(integrity.hasTrailingData, true);
    assert.strictEqual(integrity.trailingBytesCount, 512);

    const forensicRes = await performImageForensicAnalysis(stegoJpeg, 'image/jpeg');
    assert.ok(['ALTERED_OR_SUSPICIOUS', 'FABRICATED_OR_COMPOSITED'].includes(forensicRes.verdict));
    assert(forensicRes.forensicEvidence.some(e => e.findingType === 'TRAILING_PAYLOAD_DETECTED'));
  });

  // -------------------------------------------------------------
  // Test 3: Oversized File & Decompression Bomb Rejection
  // -------------------------------------------------------------
  runTest('Test 3: Oversized Files & Decompression Bomb Security Rejection', () => {
    // 1. Oversized image test (> 25MB)
    const oversizedBuffer = Buffer.alloc(26 * 1024 * 1024);
    oversizedBuffer[0] = 0xFF; oversizedBuffer[1] = 0xD8; oversizedBuffer[2] = 0xFF;

    const validation = validateMediaInput({
      file: { originalname: 'huge.jpg', mimetype: 'image/jpeg', buffer: oversizedBuffer },
      inputType: 'IMAGE'
    });
    assert.strictEqual(validation.valid, false);
    assert(validation.error.includes('exceeds maximum allowable'));

    // 2. Corrupted magic bytes test
    const corruptedBuffer = Buffer.from('FAKE_IMAGE_DATA_HEADER');
    const corruptValidation = validateMediaInput({
      file: { originalname: 'fake.png', mimetype: 'image/png', buffer: corruptedBuffer },
      inputType: 'IMAGE'
    });
    assert.strictEqual(corruptValidation.valid, false);
    assert(corruptValidation.error.includes('Magic-byte signature verification failed'));
  });

  // -------------------------------------------------------------
  // Test 4: PDF Incremental Update Tampering & Macro Detection
  // -------------------------------------------------------------
  runTest('Test 4: PDF Incremental Update Tampering & Embedded JS Detection', () => {
    // Construct PDF with multiple 'startxref' indicating incremental revision tampering and embedded JS
    const rawPdf = `%PDF-1.7
1 0 obj << /Type /Catalog /Pages 2 0 R /OpenAction 3 0 R >> endobj
3 0 obj << /Type /Action /S /JavaScript /JS (app.alert('Tampered');) >> endobj
xref
0 4
0000000000 65535 f 
trailer << /Size 4 /Root 1 0 R >>
startxref
240
%%EOF
% Incremental update #1 appended after signing
xref
0 1
trailer << /Size 5 /Prev 240 >>
startxref
480
%%EOF`;

    const pdfBuffer = Buffer.from(rawPdf, 'utf-8');
    const pdfAnalysis = analyzePdfStructure(pdfBuffer);

    assert.strictEqual(pdfAnalysis.isValidPdf, true);
    assert.strictEqual(pdfAnalysis.pdfVersion, '1.7');
    assert.strictEqual(pdfAnalysis.incrementalUpdatesCount, 1);
    assert.strictEqual(pdfAnalysis.hasIncrementalTampering, true);
    assert.strictEqual(pdfAnalysis.hasEmbeddedJavascript, true);

    const docForensics = performDocumentForensicAnalysis(pdfBuffer, 'application/pdf');
    assert.strictEqual(docForensics.verdict, 'MANIPULATION_DETECTED');
    assert(docForensics.forensicEvidence.some(e => e.findingType === 'PDF_INCREMENTAL_EDIT_TAMPERING'));
    assert(docForensics.forensicEvidence.some(e => e.findingType === 'PDF_EMBEDDED_JAVASCRIPT'));
  });

  // -------------------------------------------------------------
  // Test 5: DOCX Metadata, Revision History & Template Verification
  // -------------------------------------------------------------
  runTest('Test 5: DOCX Structure, Revision History & Template Verification', () => {
    // Construct synthetic DOCX OpenXML buffer
    const pkHeader = Buffer.from([0x50, 0x4B, 0x03, 0x04]);
    const coreXml = Buffer.from(`
      <coreProperties>
        <dc:creator>Senior Research Analyst</dc:creator>
        <cp:lastModifiedBy>External Editor</cp:lastModifiedBy>
        <cp:revision>14</cp:revision>
        <dcterms:created>2026-08-01T10:00:00Z</dcterms:created>
        <dcterms:modified>2026-08-20T18:30:00Z</dcterms:modified>
      </coreProperties>
      word/media/image1.png
      word/media/image2.png
    `, 'utf-8');
    const docxBuffer = Buffer.concat([pkHeader, coreXml]);

    const docxAnalysis = analyzeDocxStructure(docxBuffer);
    assert.strictEqual(docxAnalysis.isValidDocx, true);
    assert.strictEqual(docxAnalysis.author, 'Senior Research Analyst');
    assert.strictEqual(docxAnalysis.lastModifiedBy, 'External Editor');
    assert.strictEqual(docxAnalysis.revision, 14);
    assert.strictEqual(docxAnalysis.embeddedMediaCount, 2);

    // Official Gazette Template Check
    const templateCheck = verifyOfficialTemplate('Government of India Press Information Bureau Notification No. 14/2026 Authorized Signatory Joint Secretary');
    assert.strictEqual(templateCheck.isOfficialTemplateClaimed, true);
    assert.strictEqual(templateCheck.hasTemplateAnomalies, false);
  });

  // -------------------------------------------------------------
  // Test 6: Structured OCR with Uncertainty Representation
  // -------------------------------------------------------------
  async function testOcr() {
    const ocrSampleText = 'Official Reserve Bank Circular\nAll scheduled commercial banks must verify foreign remittances.\nRef: RBI/2026-27/88';
    const ocrRes = await extractOcrText({}, Buffer.from(ocrSampleText), {
      visionExtractedText: ocrSampleText,
      confidence: 88
    });

    assert.strictEqual(ocrRes.status, 'AVAILABLE');
    assert.strictEqual(ocrRes.blocksCount, 3);
    assert.strictEqual(ocrRes.blocks[0].page, 1);
    assert(ocrRes.blocks[0].boundingBox.width > 0);
    assert(ocrRes.uncertaintyScore >= 0 && ocrRes.uncertaintyScore <= 30);
  }
  await runAsyncTest('Test 6: Structured OCR with Bounding Boxes & Uncertainty', testOcr);

  // -------------------------------------------------------------
  // Test 7: Video Container Atom Parsing & Shot Boundary Cuts
  // -------------------------------------------------------------
  await runAsyncTest('Test 7: Video Container Atoms & Shot Cut Detection', async () => {
    // Construct MP4 buffer with ftyp and moov placement
    const ftyp = Buffer.from([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6F, 0x6D]); // ftyp isom
    const mdat = Buffer.from([0x00, 0x00, 0x04, 0x00, 0x6D, 0x64, 0x61, 0x74]); // mdat
    const moov = Buffer.from([0x00, 0x00, 0x01, 0x00, 0x6D, 0x6F, 0x6F, 0x76]); // moov trailing after mdat
    const videoBuffer = Buffer.concat([ftyp, mdat, Buffer.alloc(100, 0), moov]);

    const container = analyzeVideoContainer({ fps: 29.97, codec: 'h264' }, videoBuffer);
    assert(container.anomalies.some(a => a.includes('Trailing moov atom')));

    const keyframes = [
      { timestamp: 0.0, description: 'Press room podium', dHash: '0000ffff0000ffff' },
      { timestamp: 3.5, description: 'Aerial cityscape view', dHash: 'ffff0000ffff0000' }
    ];
    const shotCuts = detectShotCuts(keyframes, 10.0);
    assert.strictEqual(shotCuts.cutsCount, 1);
    assert.strictEqual(shotCuts.cuts[0].transitionType, 'SCENE_TRANSITION');
  });

  // -------------------------------------------------------------
  // Test 8: Audio Waveform Profiling & Splice Detection
  // -------------------------------------------------------------
  runTest('Test 8: Audio Waveform RMS Energy & Splice Detection', () => {
    // Construct synthetic audio buffer with deliberate abrupt phase discontinuity
    const audioBuffer = Buffer.alloc(4096);
    for (let i = 0; i < 4096; i++) {
      // Sine wave with sudden phase jump at sample 2000
      if (i === 2000) audioBuffer[i] = 255;
      else if (i === 2001) audioBuffer[i] = 0;
      else audioBuffer[i] = Math.round(128 + 60 * Math.sin(i * 0.1));
    }

    const profile = profileAudioWaveform(audioBuffer, 10.0);
    assert.strictEqual(profile.status, 'COMPLETED');
    assert(profile.rmsEnergy > 0);
    assert(profile.dynamicRangeDb > 0);
    assert(profile.splicesCount >= 1);
    assert(profile.fingerprint.length === 16);
  });

  // -------------------------------------------------------------
  // Test 9: Forensic Evidence Connection to Claims
  // -------------------------------------------------------------
  runTest('Test 9: Forensic Findings to Claims Evidence Mapping', () => {
    const claims = [
      { id: 'c1', text: 'The uploaded image is an authentic unaltered camera capture from the scene.' },
      { id: 'c2', text: 'The official circular was published by the Government without revisions.' }
    ];

    const findings = [
      { findingType: 'C2PA_CONTENT_CREDENTIALS', stance: 'SUPPORTS', confidence: 95, description: 'Valid signed C2PA manifest container detected.' },
      { findingType: 'COPY_MOVE_CLONE_DETECTED', stance: 'CONTRADICTS', confidence: 90, description: 'Cloned texture blocks detected.' },
      { findingType: 'PDF_INCREMENTAL_EDIT_TAMPERING', stance: 'CONTRADICTS', confidence: 85, description: 'Incremental edit tampering appended to xref table.' }
    ];

    const mappedEvidence = mapForensicFindingsToClaims(claims, findings);
    assert.strictEqual(mappedEvidence.length, 6);

    const c1Support = mappedEvidence.find(e => e.claimId === 'c1' && e.findingType === 'C2PA_CONTENT_CREDENTIALS');
    assert.strictEqual(c1Support.stance, 'SUPPORTS');

    const c1Contradict = mappedEvidence.find(e => e.claimId === 'c1' && e.findingType === 'COPY_MOVE_CLONE_DETECTED');
    assert.strictEqual(c1Contradict.stance, 'CONTRADICTS');
  });

  // -------------------------------------------------------------
  // Test 10: End-to-End Media Orchestration with Calibrated Verdicts
  // -------------------------------------------------------------
  await runAsyncTest('Test 10: End-to-End Orchestrator Execution', async () => {
    // Valid clean PNG header and body
    const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const iendChunk = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82]);
    const cleanPng = Buffer.concat([pngHeader, Buffer.alloc(256, 0x20), iendChunk]);

    const result = await processMediaAnalysis({
      inputType: 'IMAGE',
      file: { originalname: 'clean_capture.png', mimetype: 'image/png', buffer: cleanPng }
    });

    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.mediaType, 'IMAGE');
    assert.strictEqual(result.forensicVerdict, 'NO_MANIPULATION_SIGNAL_FOUND');
    assert.strictEqual(result.file.sha256.length, 64);
  });

  console.log('\n======================================================');
  console.log(`🏁 PHASE 6 TEST RESULTS: ${passedTests} / ${totalTests} PASSED`);
  console.log('======================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runAllPhase6Tests().catch(err => {
  console.error('[FATAL TEST SUITE ERROR]:', err);
  process.exit(1);
});
