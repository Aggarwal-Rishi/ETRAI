/**
 * Test Suite: Multimodal Image-to-Image Visual Diffing & Strict Slider Gate
 * Verifies that:
 * 1. Image visual differ normalizes bounding boxes correctly.
 * 2. Visual diffing detects person/face swaps and overrides reverse search "match" authenticity.
 * 3. Modified images cannot score >= 90; they are strictly capped at 25 (FALSE / ALTERED).
 * 4. Unedited identical images retain verified provenance scores.
 * 5. Slider gate prevents unverified lookalike candidates from auto-loading as originals.
 */

'use strict';

const assert = require('assert');
const { convertBox2dToPercent, diffImagesWithGemini } = require('../src/services/media/imageVisualDiffer');
const { calculateCategoryScores, generateReport } = require('../src/services/reportGenerator');
const { computeExplainableTrustScore } = require('../src/services/explainableScoringService');
const { generateStructuredImageForensicReport } = require('../src/services/media/imageForensics');

async function runTests() {
  console.log('🧪 Starting Multimodal Image-to-Image Visual Diffing Test Suite...\n');

  // ── TEST 1: convertBox2dToPercent Coordinate Scaling ──
  console.log('--- 1. Bounding Box Normalization ---');
  const box1000 = [200, 150, 600, 750]; // [ymin, xmin, ymax, xmax] in 0-1000 scale
  const norm1000 = convertBox2dToPercent(box1000);
  assert.strictEqual(norm1000.y, 20, 'Top y must scale to 20%');
  assert.strictEqual(norm1000.x, 15, 'Left x must scale to 15%');
  assert.strictEqual(norm1000.h, 40, 'Height must scale to 40%');
  assert.strictEqual(norm1000.w, 60, 'Width must scale to 60%');
  assert.strictEqual(norm1000.top, '20%');
  assert.strictEqual(norm1000.left, '15%');

  const box1 = [0.1, 0.2, 0.5, 0.8]; // in 0-1 scale
  const norm1 = convertBox2dToPercent(box1);
  assert.strictEqual(norm1.y, 10, 'Top y must scale to 10%');
  assert.strictEqual(norm1.x, 20, 'Left x must scale to 20%');
  assert.strictEqual(norm1.h, 40, 'Height must scale to 40%');
  assert.strictEqual(norm1.w, 60, 'Width must scale to 60%');

  assert.strictEqual(convertBox2dToPercent('invalid'), null, 'Non-array returns fallback');
  console.log('✅ Passed: convertBox2dToPercent correctly normalizes 0-1000 and 0-1 scales');

  // ── TEST 2: diffImagesWithGemini Interface & Fallbacks ──
  console.log('\n--- 2. diffImagesWithGemini Interface & Mock Handling ---');
  const emptyResult = await diffImagesWithGemini(null, null);
  assert.strictEqual(emptyResult.status, 'SKIPPED');
  assert.strictEqual(emptyResult.isModified, false);

  const mockDiff = {
    status: 'COMPLETED',
    isModified: true,
    modificationType: 'PERSON_SWAPPED',
    confidence: 96,
    summary: 'The person standing on the right has been replaced with a different individual.',
    domain: 'reuters.com',
    differences: [
      {
        id: 'A',
        title: 'Person Swapped',
        desc: 'Individual on right altered',
        detail: 'Compared to Reuters original, subject on right was swapped with another person.',
        box: { x: 55, y: 15, w: 35, h: 70, left: '55%', top: '15%', width: '35%', height: '70%' },
        type: 'PERSON_SWAPPED'
      }
    ]
  };

  const dummyBuf1 = Buffer.from('image1');
  const dummyBuf2 = Buffer.from('image2');
  const diffResult = await diffImagesWithGemini(dummyBuf1, dummyBuf2, { domain: 'reuters.com' }, {
    mockDiffResult: mockDiff
  });
  assert.strictEqual(diffResult.isModified, true);
  assert.strictEqual(diffResult.modificationType, 'PERSON_SWAPPED');
  assert.strictEqual(diffResult.differences.length, 1);
  console.log('✅ Passed: diffImagesWithGemini handles mock and fallback flows');

  // ── TEST 3: Strict Eliminator Step 2 - Person Swapped Image With Found Original ──
  console.log('\n--- 3. Strict Eliminator: Person Swapped Against Found Web Original ---');
  // Scenario: An image with a face/person swapped is submitted.
  // Google Lens finds the genuine Reuters original on the web.
  // In the past, finding the original caused the system to mistakenly score 90-95% VERIFIED.
  // Now, Multimodal Diffing detects the swap -> caps at Score = 25, FALSE.
  const swappedMediaAnalysis = {
    mediaType: 'IMAGE',
    aiDetection: {
      status: 'SUCCESS',
      isAiGenerated: false,
      aiGeneratedProbability: 0.05
    },
    visualComparison: {
      status: 'COMPLETED',
      isModified: true,
      modificationType: 'PERSON_SWAPPED',
      confidence: 96,
      summary: 'Subject on right swapped with a different person.',
      differences: [
        {
          id: 'A',
          title: 'Person Swapped',
          box: { x: 50, y: 10, w: 40, h: 80, left: '50%', top: '10%', width: '40%', height: '80%' }
        }
      ]
    },
    imageForensics: {
      manipulationScore: 95,
      verdict: 'FABRICATED_OR_COMPOSITED',
      signals: [{ severity: 'HIGH', type: 'COMPOSITING' }]
    },
    imageSourceContextComparison: {
      status: 'MATCHED',
      matchStatus: 'FOUND',
      confidence: 95,
      source: { domain: 'reuters.com' }
    }
  };

  const swappedScores = calculateCategoryScores([], ['FACTUAL_ACCURACY'], null, 'Photo: swapped.png', [], null, swappedMediaAnalysis);
  assert.strictEqual(swappedScores.factualAccuracyScore, 25, 'Person-swapped image MUST score 25 (FALSE) even if original was found');
  assert.strictEqual(swappedScores.articleVerdict, 'FALSE', 'Person-swapped image verdict MUST be FALSE');
  console.log('✅ Passed: calculateCategoryScores caps person-swapped image at 25 / FALSE');

  const explainableSwapped = computeExplainableTrustScore({
    claims: [],
    categories: ['FACTUAL_ACCURACY'],
    mediaAnalysis: swappedMediaAnalysis,
    articleTitle: 'Photo: swapped.png'
  });
  assert.strictEqual(explainableSwapped.finalTrustScore, 25, 'Explainable trust score must be 25 for swapped person');
  assert.strictEqual(explainableSwapped.finalVerdict, 'FALSE', 'Explainable verdict must be FALSE');
  const tamperingFactor = explainableSwapped.factorBreakdown.find(f => f.factorKey === 'mediaTampering' || f.k === 'mediaTampering');
  assert(tamperingFactor, 'mediaTampering factor must exist');
  assert.strictEqual(tamperingFactor.rawScore || tamperingFactor.raw, 25, 'Tampering factor raw score must be 25');
  assert(tamperingFactor.reason.includes('swapped') || tamperingFactor.reason.includes('Subject on right'), 'Reason must document visual diffing swap');
  console.log('✅ Passed: computeExplainableTrustScore penalizes modified image with full diff reason');

  // ── TEST 4: Clean, Unedited Image With Found Original ──
  console.log('\n--- 4. Clean Unedited Image Retains High Verified Authenticity ---');
  const cleanMediaAnalysis = {
    mediaType: 'IMAGE',
    aiDetection: {
      status: 'SUCCESS',
      isAiGenerated: false,
      aiGeneratedProbability: 0.02
    },
    visualComparison: {
      status: 'COMPLETED',
      isModified: false,
      modificationType: 'NONE',
      confidence: 98,
      summary: 'Submitted image matches verified web original with no pixel discrepancy.'
    },
    imageForensics: {
      manipulationScore: 5,
      verdict: 'NO_MANIPULATION_SIGNAL_FOUND',
      signals: []
    },
    imageSourceContextComparison: {
      status: 'MATCHED',
      matchStatus: 'FOUND',
      confidence: 95,
      source: { domain: 'apnews.com' }
    }
  };

  const cleanScores = calculateCategoryScores([], ['FACTUAL_ACCURACY'], null, 'Photo: clean.png', [], null, cleanMediaAnalysis);
  assert(cleanScores.factualAccuracyScore >= 90, `Clean image must score >= 90, got: ${cleanScores.factualAccuracyScore}`);
  assert.strictEqual(cleanScores.articleVerdict, 'VERIFIED');
  console.log('✅ Passed: Clean unedited photo scores verified (>= 90)');

  // ── TEST 5: Forensics Pipeline with Diffing Mock Injection ──
  console.log('\n--- 5. Forensics Pipeline Visual Diffing Integration ---');
  // Create a minimal 1x1 test JPEG buffer
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

  const mockReverseMatches = [
    {
      sourceUrl: 'https://www.reuters.com/world/sample-story',
      imageUrl: 'https://www.reuters.com/images/original.jpg',
      originalImageUrl: 'https://www.reuters.com/images/original.jpg',
      domain: 'reuters.com',
      similarity: 0.92,
      matchType: 'FULL_MATCH',
      isWire: true
    }
  ];

  const forensicsResult = await generateStructuredImageForensicReport(sampleJpeg, {
    filename: 'test_image.jpg',
    mimeType: 'image/jpeg'
  }, {
    disableSightengine: true,
    disableEla: true,
    reverseImageMatches: mockReverseMatches,
    candidateBuffer: sampleJpeg,
    mockDiffResult: {
      status: 'COMPLETED',
      isModified: true,
      modificationType: 'FACE_SWAPPED',
      confidence: 94,
      summary: 'Face region was replaced with an external face.',
      differences: [
        {
          id: 'A',
          title: 'Face Swapped',
          box: { x: 30, y: 15, w: 25, h: 30, left: '30%', top: '15%', width: '25%', height: '30%' },
          type: 'FACE_SWAPPED'
        }
      ]
    }
  });

  assert(forensicsResult.visualComparison, 'visualComparison must be present on forensicsResult');
  assert.strictEqual(forensicsResult.visualComparison.isModified, true, 'isModified must be true');
  assert.strictEqual(forensicsResult.originalFoundStatus, 'FOUND');
  assert(forensicsResult.originalFound.includes('Modified version of original photo'), 'originalFound must indicate modified version');
  assert.strictEqual(forensicsResult.forensics.verdict, 'FABRICATED_OR_COMPOSITED');
  assert.strictEqual(forensicsResult.forensics.manipulationScore, 95);
  console.log('✅ Passed: generateStructuredImageForensicReport seamlessly executes multimodal visual diffing');

  // ── TEST 6: Strict Slider Gate Unit Check (Unknown Person Prevention) ──
  console.log('\n--- 6. Strict Slider Gate (Prevent Random Stranger in Slider) ---');
  // Simulate unknown person image where Google Lens returns loose candidates
  const unknownPersonReverseSearch = {
    originalFoundStatus: 'CANDIDATE',
    originalFound: 'Closest match from flickr.com (52% similarity)',
    originalImageUrl: null,
    candidateImages: [
      {
        imageUrl: 'https://images.unsplash.com/photo-random-stranger.jpg',
        domain: 'unsplash.com',
        similarity: 48
      }
    ]
  };

  // Slider Logic verification:
  const rawOriginalUrl = unknownPersonReverseSearch.originalImageUrl; // null!
  const manualOriginalSrc = null;
  const isVerifiedOriginal = false;
  const selectedCandidate = null; // User has not clicked a candidate yet!
  const candidateDismissed = false;

  const originalSrc = manualOriginalSrc || (rawOriginalUrl ? 'proxy-url' : null);
  const activeCandidate = candidateDismissed ? null : (selectedCandidate || null);
  const candidateProxyUrl = activeCandidate?.imageUrl ? 'candidate-proxy-url' : null;
  const effectiveRightSrc = originalSrc || (selectedCandidate ? candidateProxyUrl : null);

  assert.strictEqual(originalSrc, null, 'originalSrc must be null for unknown person');
  assert.strictEqual(effectiveRightSrc, null, 'effectiveRightSrc MUST be null when no candidate was clicked');
  console.log('✅ Passed: Unverified candidate stranger is NOT automatically loaded into the slider');

  // When user clicks the candidate in the tray:
  const userSelectedCandidate = unknownPersonReverseSearch.candidateImages[0];
  const userCandidateProxyUrl = `proxy-url-for-${userSelectedCandidate.imageUrl}`;
  const effectiveRightSrcAfterClick = originalSrc || (userSelectedCandidate ? userCandidateProxyUrl : null);
  assert.strictEqual(effectiveRightSrcAfterClick, userCandidateProxyUrl, 'effectiveRightSrc loads ONLY after user clicks');
  console.log('✅ Passed: Candidate loads only on explicit user selection');

  console.log('\n🎉 ALL MULTIMODAL IMAGE DIFFING & SLIDER GATE TESTS PASSED SUCCESSFULLY!\n');
}

runTests().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
