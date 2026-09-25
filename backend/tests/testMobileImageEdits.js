/**
 * Test Suite: Gemini Mobile Photo & Inpainting Edit Detection
 * Tests:
 * 1. Mobile edit parsing, action sanitization, and 3%-10% proportional penalty calculation.
 * 2. Forensics pipeline diffing and bounding box mapping for added, erased, and modified elements.
 * 3. Proportional trust score deduction (3% to 10%) retaining authentic/verified verdict.
 * 4. Explainable trust score factor breakdown documenting mobile edits.
 */

'use strict';

const assert = require('assert');
const { analyzeImage } = require('../src/services/media/imageAnalyzer');
const { generateStructuredImageForensicReport } = require('../src/services/media/imageForensics');
const { calculateCategoryScores } = require('../src/services/reportGenerator');
const { computeExplainableTrustScore } = require('../src/services/explainableScoringService');

async function runTests() {
  console.log('🧪 Starting Gemini Mobile Edit & Inpainting Detection Test Suite...\n');

  // ── TEST 1: Mobile Edit Sanitization & Proportional Deduction ──
  console.log('--- 1. Mobile Edit Sanitization & Proportional Calculation ---');
  const mockAnalysisData = {
    status: 'AVAILABLE',
    observed: {},
    inferred: {},
    visualDescription: 'A photo of a living room with edits.',
    visualInconsistencies: [],
    manipulationSignals: [],
    mobileEdits: {
      hasEdits: true,
      editCount: 2,
      estimatedEditPercentage: 6,
      summary: 'Sticker added to table and object erased in background.',
      items: [
        {
          id: 'A',
          action: 'ADDED',
          category: 'STICKER_OVERLAY',
          title: 'Digital Sticker',
          explanation: 'A cartoon sticker with sharp digital edges.',
          confidence: 90,
          box_2d: [100, 200, 300, 400]
        },
        {
          id: 'B',
          action: 'ERASED',
          category: 'OBJECT_ERASED',
          title: 'Erased Object Residue',
          explanation: 'Inpainting smudges where a cup was erased.',
          confidence: 85,
          box_2d: [500, 600, 700, 800]
        }
      ]
    }
  };

  const analyzed = await analyzeImage({ mimeType: 'image/jpeg' }, null, null, {
    mockImageAnalysis: mockAnalysisData
  });

  assert.strictEqual(analyzed.mobileEdits.hasEdits, true);
  assert.strictEqual(analyzed.mobileEdits.editCount, 2);
  assert.strictEqual(analyzed.mobileEdits.estimatedEditPercentage, 6);
  assert.strictEqual(analyzed.mobileEdits.items[0].action, 'ADDED');
  assert.strictEqual(analyzed.mobileEdits.items[1].action, 'ERASED');
  console.log('✅ Passed: analyzeImage preserves and normalizes mobileEdits structure');

  // ── TEST 2: Forensics Pipeline Diffs & Changes Mapping ──
  console.log('\n--- 2. Forensics Pipeline Diffs Mapping ---');
  const sampleJpeg = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
    0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
    0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
    0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20,
    0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
    0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
    0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01,
    0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04,
    0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f,
    0x00, 0xbf, 0x00, 0xff, 0xd9
  ]);

  const reportItem = await generateStructuredImageForensicReport(sampleJpeg, {
    filename: 'mobile_edit.jpg',
    mimeType: 'image/jpeg'
  }, {
    disableSightengine: true,
    disableEla: true,
    reverseSearch: { status: 'NO_MATCH', matches: [] },
    mobileEdits: analyzed.mobileEdits
  });

  assert(reportItem.mobileEdits, 'mobileEdits must be present on reportItem');
  assert.strictEqual(reportItem.mobileEdits.hasEdits, true);
  assert(reportItem.diffs.length >= 2, 'diffs must contain the 2 mobile edits');
  const addedDiff = reportItem.diffs.find(d => d.action === 'ADDED');
  const erasedDiff = reportItem.diffs.find(d => d.action === 'ERASED');
  assert(addedDiff, 'ADDED diff marker must exist');
  assert(erasedDiff, 'ERASED diff marker must exist');
  assert.strictEqual(addedDiff.box.y, 10, 'Box coordinates normalized (100 -> 10%)');
  assert.strictEqual(addedDiff.box.x, 20, 'Box coordinates normalized (200 -> 20%)');
  assert(reportItem.changes.some(c => c.includes('[ADDED]')), 'changes must document [ADDED]');
  assert(reportItem.changes.some(c => c.includes('[ERASED]')), 'changes must document [ERASED]');
  console.log('✅ Passed: generateStructuredImageForensicReport maps mobileEdits to diffs with action tags and percent coordinates');

  // ── TEST 3: Proportional 3%-10% Deduction in calculateCategoryScores ──
  console.log('\n--- 3. Proportional 3%-10% Trust Deduction ---');
  // Baseline camera capture with 0 edits:
  const cleanMedia = {
    mediaType: 'IMAGE',
    aiDetection: { status: 'SUCCESS', isAiGenerated: false, aiGeneratedProbability: 0.01 },
    imageForensics: { manipulationScore: 5, verdict: 'NO_MANIPULATION_SIGNAL_FOUND', signals: [] },
    imageSourceContextComparison: { status: 'UNINDEXED_NEW_CAPTURE', matchStatus: 'UNINDEXED_ORIGINAL' }
  };
  const cleanScores = calculateCategoryScores([], ['FACTUAL_ACCURACY'], null, 'Clean Photo', [], null, cleanMedia);
  assert.strictEqual(cleanScores.factualAccuracyScore, 95, 'Clean unindexed photo base score is 95');
  assert.strictEqual(cleanScores.articleVerdict, 'VERIFIED');

  // Photo with minor mobile edits (penalty = 6%):
  const editedMedia = {
    ...cleanMedia,
    mobileEdits: {
      hasEdits: true,
      editCount: 2,
      estimatedEditPercentage: 6,
      summary: 'Sticker added to table and object erased in background.'
    }
  };
  const editedScores = calculateCategoryScores([], ['FACTUAL_ACCURACY'], null, 'Mobile Edited Photo', [], null, editedMedia);
  assert.strictEqual(editedScores.factualAccuracyScore, 89, 'Score must be 95 - 6 = 89');
  assert.strictEqual(editedScores.articleVerdict, 'VERIFIED', 'Verdict remains VERIFIED for minor mobile edits');
  console.log('✅ Passed: Minor mobile edit deducts 6% (95 -> 89) and preserves VERIFIED verdict');

  // Photo with heavy mobile edits (penalty capped at 10%):
  const heavyEditedMedia = {
    ...cleanMedia,
    mobileEdits: {
      hasEdits: true,
      editCount: 5,
      estimatedEditPercentage: 15 // exceeding 10%
    }
  };
  const heavyScores = calculateCategoryScores([], ['FACTUAL_ACCURACY'], null, 'Heavy Mobile Edited', [], null, heavyEditedMedia);
  assert.strictEqual(heavyScores.factualAccuracyScore, 85, 'Penalty capped at 10%: 95 - 10 = 85');
  assert.strictEqual(heavyScores.articleVerdict, 'VERIFIED');
  console.log('✅ Passed: Heavy mobile edits capped at 10% maximum penalty (95 -> 85)');

  // ── TEST 4: Explainable Scoring Factor Breakdown ──
  console.log('\n--- 4. Explainable Scoring Factor Breakdown ---');
  const explainable = computeExplainableTrustScore({
    claims: [],
    categories: ['FACTUAL_ACCURACY'],
    mediaAnalysis: editedMedia,
    articleTitle: 'Mobile Edited Photo'
  });
  assert.strictEqual(explainable.finalTrustScore, 89, 'Explainable finalTrustScore must be 89');
  assert.strictEqual(explainable.finalVerdict, 'HIGHLY_SUPPORTED');
  const tamperingFactor = explainable.factorBreakdown.find(f => f.factorKey === 'mediaTampering' || f.k === 'mediaTampering');
  assert(tamperingFactor, 'mediaTampering factor must exist');
  assert(tamperingFactor.reason.includes('Local/mobile editing identified'), 'Reason must document local/mobile editing');
  assert(tamperingFactor.reason.includes('-6%'), 'Reason must document -6% adjustment');
  console.log('✅ Passed: computeExplainableTrustScore reflects proportional deduction and reason');

  console.log('\n🎉 ALL GEMINI MOBILE EDIT & INPAINTING TESTS PASSED SUCCESSFULLY!\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
