const assert = require('assert');
const { calculateCategoryScores, generateReport } = require('../src/services/reportGenerator');
const { computeExplainableTrustScore } = require('../src/services/explainableScoringService');
const { isUsefulOcrText, isSubstantiveNewsHeadline } = require('../src/services/media/mediaClaimExtractor');
const { extractOcrText } = require('../src/services/media/ocrService');

async function runTests() {
  console.log('🧪 Starting Image Forensics & Strict Eliminator Verification Test Suite...');

  // ── TEST 1: OCR Binary Noise & Gibberish Filtering ──
  console.log('\n--- 1. OCR Noise Filtering Tests ---');
  
  // A binary buffer with EXIF/JFIF header strings
  const fakeJpegBuffer = Buffer.from('ÿØÿà\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00ÿá\x01\x02Exif\x00\x00II*\x00Apple iPhone 14 Pro Adobe Photoshop 2024');
  const ocrResult = await extractOcrText({ mimeType: 'image/jpeg' }, fakeJpegBuffer);
  assert.strictEqual(ocrResult.status, 'NO_TEXT_DETECTED', 'Binary buffer without real OCR provider must yield NO_TEXT_DETECTED');
  assert.strictEqual(ocrResult.ocrText, '', 'ocrText must be empty string for binary buffer without OCR');
  console.log('✅ Passed: extractOcrText correctly rejected binary raster string extraction');

  // Verify isUsefulOcrText rejects camera/binary tags
  assert.strictEqual(isUsefulOcrText('Exif II* Apple iPhone Adobe Photoshop'), false, 'Should reject metadata tags');
  assert.strictEqual(isUsefulOcrText('JFIF ICC_PROFILE sRGB'), false, 'Should reject color profile tags');
  assert.strictEqual(isUsefulOcrText('Nike Just Do It'), false, 'Should reject short brand slogans');
  assert.strictEqual(isUsefulOcrText('   '), false, 'Should reject empty strings');
  console.log('✅ Passed: isUsefulOcrText successfully filters metadata artifacts and slogans');

  // Verify isSubstantiveNewsHeadline requires >= 6 words and an assertion verb
  assert.strictEqual(isSubstantiveNewsHeadline('Nike Just Do It'), false, 'Short slogan is not headline');
  assert.strictEqual(isSubstantiveNewsHeadline('Shot on iPhone by John Doe 2024'), false, 'Incidental photo credits rejected');
  assert.strictEqual(
    isSubstantiveNewsHeadline('Prime Minister announces new economic stimulus package for rural farmers'),
    true,
    'Substantive news assertion headline accepted'
  );
  console.log('✅ Passed: isSubstantiveNewsHeadline strictly requires coherent assertion proposition');

  // ── TEST 2: Strict Eliminator Step 1 - AI Generated Image ──
  console.log('\n--- 2. Strict Eliminator: AI Generated Media (Score = 0, FALSE) ---');
  const aiGeneratedMedia = {
    mediaType: 'IMAGE',
    aiDetection: {
      status: 'SUCCESS',
      isAiGenerated: true,
      aiGeneratedProbability: 0.94,
      verdictLabel: 'AI Generated'
    },
    imageForensics: {
      manipulationScore: 10,
      verdict: 'NO_MANIPULATION_SIGNAL_FOUND'
    },
    imageSourceContextComparison: {
      status: 'UNINDEXED_NEW_CAPTURE',
      matchStatus: 'UNINDEXED_ORIGINAL'
    }
  };

  const aiScores = calculateCategoryScores([], ['FACTUAL_ACCURACY'], null, 'Photo: ai_fake.png', [], null, aiGeneratedMedia);
  assert.strictEqual(aiScores.factualAccuracyScore, 0, 'AI generated image must score 0 under Strict Eliminator');
  assert.strictEqual(aiScores.articleVerdict, 'FALSE', 'AI generated image verdict must be FALSE');

  const aiExplainable = computeExplainableTrustScore({
    verifiedClaims: [],
    sources: [],
    mediaAnalysis: aiGeneratedMedia,
    factualAccuracyScore: aiScores.factualAccuracyScore,
    articleVerdict: aiScores.articleVerdict,
    inputType: 'IMAGE'
  });
  assert.strictEqual(aiExplainable.finalTrustScore, 0, 'Trust score must be 0 for AI generated image');
  assert.strictEqual(aiExplainable.finalVerdict, 'FALSE', 'Final verdict must be FALSE for AI generated image');
  assert.strictEqual(aiExplainable.factorBreakdown[0].factorKey, 'aiAuthenticity');
  assert.strictEqual(aiExplainable.factorBreakdown[0].raw, 0, 'aiAuthenticity raw score must be 0');
  console.log('✅ Passed: AI generated photo correctly eliminated to Score 0, Verdict FALSE');

  // ── TEST 3: Strict Eliminator Step 2 - Digital Tampering / Manipulated Image ──
  console.log('\n--- 3. Strict Eliminator: Manipulated / Spliced Image (Score = 25, FALSE) ---');
  const tamperedMedia = {
    mediaType: 'IMAGE',
    aiDetection: {
      status: 'SUCCESS',
      isAiGenerated: false,
      aiGeneratedProbability: 0.02,
      verdictLabel: 'Human Capture'
    },
    imageForensics: {
      manipulationScore: 75,
      verdict: 'FABRICATED_OR_COMPOSITED',
      ela: { isManipulatedLikely: true }
    },
    imageSourceContextComparison: {
      status: 'MATCHED'
    }
  };

  const tamperedScores = calculateCategoryScores([], ['FACTUAL_ACCURACY'], null, 'Photo: edited.png', [], null, tamperedMedia);
  assert.strictEqual(tamperedScores.factualAccuracyScore, 25, 'Tampered image must score 25 under Strict Eliminator');
  assert.strictEqual(tamperedScores.articleVerdict, 'FALSE', 'Tampered image verdict must be FALSE');

  const tamperedExplainable = computeExplainableTrustScore({
    verifiedClaims: [],
    sources: [],
    mediaAnalysis: tamperedMedia,
    factualAccuracyScore: tamperedScores.factualAccuracyScore,
    articleVerdict: tamperedScores.articleVerdict,
    inputType: 'IMAGE'
  });
  assert.strictEqual(tamperedExplainable.finalTrustScore, 25, 'Trust score must be 25 for tampered image');
  assert.strictEqual(tamperedExplainable.finalVerdict, 'FALSE', 'Final verdict must be FALSE for tampered image');
  assert.strictEqual(tamperedExplainable.factorBreakdown[1].factorKey, 'mediaTampering');
  assert.strictEqual(tamperedExplainable.factorBreakdown[1].raw, 25, 'mediaTampering raw score must be 25');
  console.log('✅ Passed: Tampered/spliced photo correctly eliminated to Score 25, Verdict FALSE');

  // ── TEST 4: Strict Eliminator Step 3 - Authentic Clean Original Capture ──
  console.log('\n--- 4. Strict Eliminator: Authentic Original Camera Capture (Score 75-100, VERIFIED) ---');
  const cleanOriginalMedia = {
    mediaType: 'IMAGE',
    aiDetection: {
      status: 'SUCCESS',
      isAiGenerated: false,
      aiGeneratedProbability: 0.01,
      verdictLabel: 'Human Capture'
    },
    imageForensics: {
      manipulationScore: 5,
      verdict: 'NO_MANIPULATION_SIGNAL_FOUND',
      ela: { isManipulatedLikely: false }
    },
    imageSourceContextComparison: {
      status: 'UNINDEXED_NEW_CAPTURE',
      matchStatus: 'UNINDEXED_ORIGINAL',
      confidence: 95
    }
  };

  const cleanScores = calculateCategoryScores([], ['FACTUAL_ACCURACY'], null, 'Photo: real_capture.jpg', [], null, cleanOriginalMedia);
  assert.ok(cleanScores.factualAccuracyScore >= 90, `Clean original capture score ${cleanScores.factualAccuracyScore} should be >= 90`);
  assert.strictEqual(cleanScores.articleVerdict, 'VERIFIED', 'Clean original capture verdict must be VERIFIED');

  const cleanExplainable = computeExplainableTrustScore({
    verifiedClaims: [],
    sources: [],
    mediaAnalysis: cleanOriginalMedia,
    factualAccuracyScore: cleanScores.factualAccuracyScore,
    articleVerdict: cleanScores.articleVerdict,
    inputType: 'IMAGE'
  });
  assert.ok(cleanExplainable.finalTrustScore >= 90, `Clean trust score ${cleanExplainable.finalTrustScore} should be >= 90`);
  assert.strictEqual(cleanExplainable.finalVerdict, 'HIGHLY_SUPPORTED');
  assert.strictEqual(cleanExplainable.factorBreakdown.length, 3, 'Must produce 3 visual forensic factors');
  assert.strictEqual(cleanExplainable.factorBreakdown[0].factorKey, 'aiAuthenticity');
  assert.strictEqual(cleanExplainable.factorBreakdown[1].factorKey, 'mediaTampering');
  assert.strictEqual(cleanExplainable.factorBreakdown[2].factorKey, 'provenanceMatch');
  console.log('✅ Passed: Clean camera original photo scored >= 90% and produced 3 tailored forensic factors');

  // ── TEST 5: Strict Eliminator Step 3 - Wire Matched Photo ──
  console.log('\n--- 5. Strict Eliminator: Wire Archive Matched Photo ---');
  const wireMatchedMedia = {
    mediaType: 'IMAGE',
    aiDetection: {
      status: 'SUCCESS',
      isAiGenerated: false,
      aiGeneratedProbability: 0.03
    },
    imageForensics: {
      manipulationScore: 8,
      verdict: 'NO_MANIPULATION_SIGNAL_FOUND'
    },
    imageSourceContextComparison: {
      status: 'MATCHED',
      confidence: 96,
      source: { domain: 'reuters.com' }
    },
    reverseSearch: {
      isWire: true,
      matches: [{ domain: 'reuters.com' }]
    }
  };

  const wireScores = calculateCategoryScores([], ['FACTUAL_ACCURACY'], null, 'Photo: reuters_photo.jpg', [], null, wireMatchedMedia);
  assert.ok(wireScores.factualAccuracyScore >= 90, `Wire matched photo score ${wireScores.factualAccuracyScore} must be >= 90`);
  assert.strictEqual(wireScores.articleVerdict, 'VERIFIED');
  console.log('✅ Passed: Wire matched photo scored >= 90% and marked VERIFIED');

  // ── TEST 6: Strict Eliminator Step 3 - Contradicted Source Context ──
  console.log('\n--- 6. Strict Eliminator: Contradicted / Misattributed Context ---');
  const contradictedMedia = {
    mediaType: 'IMAGE',
    aiDetection: {
      status: 'SUCCESS',
      isAiGenerated: false,
      aiGeneratedProbability: 0.02
    },
    imageForensics: {
      manipulationScore: 10,
      verdict: 'NO_MANIPULATION_SIGNAL_FOUND'
    },
    imageSourceContextComparison: {
      status: 'CONTRADICTED',
      confidence: 85
    }
  };

  const contradictedScores = calculateCategoryScores([], ['FACTUAL_ACCURACY'], null, 'Photo: fake_caption.jpg', [], null, contradictedMedia);
  assert.strictEqual(contradictedScores.factualAccuracyScore, 25, 'Contradicted media score must be 25');
  assert.strictEqual(contradictedScores.articleVerdict, 'FALSE');
  console.log('✅ Passed: Contradicted source context scored 25 and marked FALSE');

  console.log('\n🎉 ALL IMAGE FORENSICS & STRICT ELIMINATOR TESTS PASSED SUCCESSFULLY! (6/6)');
}

runTests().catch(err => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
