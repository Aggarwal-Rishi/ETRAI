const assert = require('assert');
const {
  resolvePrimarySpeaker,
  calculateVerbatimSimilarity,
  verifyOnlineTranscript
} = require('../src/services/media/videoTranscriptVerifier');
const {
  extractMediaClaims,
  isSubstantiveNewsHeadline
} = require('../src/services/media/mediaClaimExtractor');
const {
  calculateCategoryScores,
  generateReport
} = require('../src/services/reportGenerator');
const {
  computeExplainableTrustScore
} = require('../src/services/explainableScoringService');

(async () => {
  console.log('🧪 Starting Video Forensics Architecture Test Suite...\n');

  // =========================================================================
  // TEST 1: Song / Music Filtering from Spoken Transcript
  // =========================================================================
  console.log('Test 1: Song & Background Music Filtering');

  // Case A: Audio is pure song lyrics - must NOT generate factual claims
  const songClaimResult = await extractMediaClaims({
    userNotes: '',
    visualDescription: 'A music video of a singer in a studio',
    ocrText: '',
    transcript: 'Ooh baby I love you so much forever in the sky',
    isVideo: true,
    audioBreakdown: {
      isPureSongOrMusic: true,
      dominantType: 'SONG_VOCALS',
      speechRatio: 0.05,
      musicRatio: 0.95
    }
  });

  const songTranscriptClaims = (songClaimResult.claims || []).filter(c => c.sourceRole === 'VIDEO_TRANSCRIPT');
  assert.strictEqual(songTranscriptClaims.length, 0, 'Pure song vocals must not generate factual claims');

  // Case B: Audio is spoken speech - should extract dialogue claims
  const speechClaimResult = await extractMediaClaims({
    userNotes: '',
    visualDescription: 'Press briefing at the podium',
    ocrText: '',
    transcript: 'The treasury announced a fifteen percent interest rate adjustment effective next quarter.',
    isVideo: true,
    audioBreakdown: {
      isPureSongOrMusic: false,
      dominantType: 'SPEECH',
      speechRatio: 0.9,
      musicRatio: 0.1
    }
  });

  const speechTranscriptClaims = (speechClaimResult.claims || []).filter(c => c.sourceRole === 'VIDEO_TRANSCRIPT');
  assert.ok(speechTranscriptClaims.length > 0, 'Spoken dialogue must generate factual claims');
  console.log('  ✅ Song lyrics suppressed; spoken dialogue preserved.\n');

  // =========================================================================
  // TEST 2: Speaker Resolution & Verbatim Transcript Matching
  // =========================================================================
  console.log('Test 2: Speaker Resolution and Transcript Verification');

  // Speaker resolution from public figures array
  const speaker = resolvePrimarySpeaker({
    observed: {
      publicFigures: [{ name: 'Narendra Modi', confidence: 95 }]
    }
  });
  assert.strictEqual(speaker, 'Narendra Modi', 'Should resolve recognized public figure');

  // Verbatim lexical similarity calculation
  const quoteA = 'The government will launch the semiconductor incentive package on Monday morning.';
  const quoteB = 'The government will launch the semiconductor incentive package on Monday morning.';
  const quoteC = 'The government announced a different package for agriculture last year.';

  const simHigh = calculateVerbatimSimilarity(quoteA, quoteB);
  assert.ok(simHigh >= 95, 'Identical strings must yield >= 95% similarity');

  const simLow = calculateVerbatimSimilarity(quoteA, quoteC);
  assert.ok(simLow < 50, 'Dissimilar strings must yield < 50% similarity');

  // Transcript verification against mock search results:
  // Case A: Verbatim Match against official portal
  const verbatimVerification = await verifyOnlineTranscript({
    transcript: quoteA,
    primarySpeaker: 'Narendra Modi',
    mockSearchResults: [
      {
        title: 'Prime Minister remarks on semiconductor initiative - PIB Gazette',
        link: 'https://pib.gov.in/PressReleasePage.aspx?PRID=12345',
        snippet: 'Prime Minister Narendra Modi stated: The government will launch the semiconductor incentive package on Monday morning.'
      }
    ]
  });

  assert.strictEqual(verbatimVerification.status, 'AUTHENTIC_VERBATIM');
  assert.ok(verbatimVerification.similarityScore >= 80);
  assert.ok(verbatimVerification.matchedSource.domain.includes('pib.gov.in'));

  // Case B: Debunked Deepfake Match
  const deepfakeVerification = await verifyOnlineTranscript({
    transcript: 'I resign from office immediately effective tonight',
    primarySpeaker: 'Joe Biden',
    mockSearchResults: [
      {
        title: 'Fact Check: Viral video claiming Biden resignation is AI voice clone deepfake',
        link: 'https://www.reuters.com/fact-check/biden-resignation-ai-voice-clone',
        snippet: 'A manipulated video using an AI voice clone falsely depicts Biden claiming to resign.'
      }
    ]
  });

  assert.strictEqual(deepfakeVerification.status, 'DEBUNKED_DEEPFAKE');
  assert.strictEqual(deepfakeVerification.isDebunkedDeepfake, true);
  console.log('  ✅ Verbatim match and deepfake debunking validated.\n');

  // =========================================================================
  // TEST 3: On-Screen News Chyron / Headline Rail
  // =========================================================================
  console.log('Test 3: On-Screen News Chyron Extraction');

  // Clocks, logos, and timestamps must be rejected
  assert.strictEqual(isSubstantiveNewsHeadline('10:30 AM EST'), false, 'Clock timestamp should be rejected');
  assert.strictEqual(isSubstantiveNewsHeadline('CNN LIVE 12:45'), false, 'Channel bug should be rejected');
  assert.strictEqual(isSubstantiveNewsHeadline('BREAKING NEWS'), false, 'Generic banner without headline should be rejected');

  // Real substantive chyrons must be accepted
  assert.strictEqual(
    isSubstantiveNewsHeadline('BREAKING: SENATE PASSES $1.2 TRILLION INFRASTRUCTURE BILL IN BIPARTISAN VOTE'),
    true,
    'Substantive news chyron should be accepted'
  );

  // Extract claims with on-screen headlines
  const chyronClaimResult = await extractMediaClaims({
    userNotes: '',
    visualDescription: 'News broadcast anchor desk',
    ocrText: 'SENATE PASSES $1.2 TRILLION INFRASTRUCTURE BILL',
    transcript: '',
    isVideo: true,
    onScreenHeadlines: [
      {
        timestamp: 4.5,
        headlineText: 'SENATE PASSES $1.2 TRILLION INFRASTRUCTURE BILL',
        confidence: 0.94
      }
    ]
  });

  const chyronClaims = (chyronClaimResult.claims || []).filter(c => c.sourceRole === 'VIDEO_ON_SCREEN_HEADLINE');
  assert.strictEqual(chyronClaims.length, 1, 'Substantive on-screen chyron must produce a dedicated claim');
  assert.ok(chyronClaims[0].claimText.includes('1.2 TRILLION'));
  console.log('  ✅ Substantive chyron filtered and isolated.\n');

  // =========================================================================
  // TEST 4: Fatal AI Gate & Video Trust Scoring
  // =========================================================================
  console.log('Test 4: Fatal AI Gate & Deterministic Video Trust Scoring');

  // Scenario 1: Video with 100% verified text claims BUT Sightengine flags AI generative synthetic footage
  const fatalAiScoring = calculateCategoryScores(
    [
      { claimText: 'The sky is blue', verdict: 'VERIFIED', confidence: 95 }
    ],
    ['FACT_CHECKING', 'FAKE_NEWS_DETECTION'],
    null,
    'AI Synthesized Footage Clip',
    [],
    null,
    {
      mediaType: 'VIDEO',
      aiDetection: {
        status: 'SUCCESS',
        isAiGenerated: true,
        aiGeneratedProbability: 0.92
      }
    }
  );

  assert.strictEqual(fatalAiScoring.articleVerdict, 'FALSE', 'Fatal AI gate must force FALSE verdict');
  assert.ok(fatalAiScoring.factualAccuracyScore <= 20, 'Factual score must be clamped <= 20% on AI synthetic media');

  // Scenario 2: Pure video (total claims = 0) with AUTHENTIC_VERBATIM transcript verification
  const authenticVideoScoring = calculateCategoryScores(
    [],
    ['FACT_CHECKING'],
    null,
    'Live Press Conference.mp4',
    [],
    null,
    {
      mediaType: 'VIDEO',
      transcriptVerification: {
        status: 'AUTHENTIC_VERBATIM',
        similarityScore: 94
      }
    }
  );

  assert.strictEqual(authenticVideoScoring.articleVerdict, 'VERIFIED');
  assert.ok(authenticVideoScoring.factualAccuracyScore >= 88);

  // Scenario 3: Explainable Trust Score with DEEPFAKE_AUDIO penalty
  const explainableResult = computeExplainableTrustScore({
    inputType: 'VIDEO',
    verifiedClaims: [],
    mediaAnalysis: {
      mediaType: 'VIDEO',
      transcriptVerification: {
        status: 'DEBUNKED_DEEPFAKE',
        debunkedMatch: {
          title: 'Fact Check: AI Voice Clone'
        }
      }
    }
  });

  assert.strictEqual(explainableResult.finalVerdict, 'FALSE');
  assert.ok(explainableResult.finalTrustScore <= 20);
  assert.ok(explainableResult.appliedPenalties.some(p => p.code === 'DEEPFAKE_AUDIO'));
  assert.ok(explainableResult.negativeDrivers.some(d => d.includes('deepfake')));

  console.log('  ✅ Fatal AI gate, pure video scoring, and explainable deepfake penalties verified.\n');

  console.log('🎉 ALL VIDEO FORENSICS ARCHITECTURE TESTS PASSED SUCCESSFULLY!');
})().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
