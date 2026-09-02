'use strict';

const assert = require('assert');
const {
  extractVisualEntityCandidates,
  verifyVisualEntities
} = require('../src/services/media/mediaEntityVerification');
const { performEntityAndIntentAnalysis } = require('../src/services/entityIntentService');
const { performImageForensicAnalysis } = require('../src/services/media/imageForensics');

async function run() {
  const mediaAnalysis = {
    transcript: 'Rahul Gandhi addressed reporters after the meeting.',
    observed: {
      publicFigures: [
        { name: 'Rahul Gandhi', confidence: 92, basis: 'Consistent facial features across frames.' },
        { name: 'unidentified person', confidence: 99 }
      ],
      logos: ['Indian National Congress'],
      landmarks: [],
      visibleLocationClues: []
    },
    keyframes: [
      {
        timestamp: 0,
        publicFigures: [{ name: 'Rahul Gandhi', confidence: 91 }],
        logos: ['Indian National Congress'],
        entities: ['person']
      },
      {
        timestamp: 10.5,
        publicFigures: [{ name: 'Rahul Gandhi', confidence: 93 }],
        logos: [],
        entities: ['unidentified person']
      }
    ]
  };

  const candidates = extractVisualEntityCandidates(mediaAnalysis);
  const rahulCandidate = candidates.find(entity => entity.normalizedName === 'Rahul Gandhi');
  assert(rahulCandidate, 'expected the recognizable public figure to be extracted');
  assert.deepStrictEqual(rahulCandidate.frameTimestamps, [0, 10.5], 'expected duplicate frame identities to merge with timestamps');
  assert.strictEqual(candidates.some(entity => /unidentified person|^person$/i.test(entity.name)), false, 'generic people labels must not become named entities');

  let consentedSearchCalls = 0;
  const entitySearchProvider = {
    async search({ entity, query, context }) {
      consentedSearchCalls += 1;
      assert(query.includes(`\"${entity.normalizedName || entity.name}\"`), 'query should include the exact proposed entity name');
      assert.strictEqual(Object.prototype.hasOwnProperty.call(context, 'buffer'), false, 'search context must not expose raw uploaded media');
      return {
        status: 'AVAILABLE',
        provider: 'TEST',
        matches: [{
          title: `${entity.normalizedName || entity.name} appears at the reported event`,
          snippet: `Reporting and official context concerning ${entity.normalizedName || entity.name}.`,
          sourceUrl: `https://www.reuters.com/world/${encodeURIComponent(entity.name)}`,
          domain: 'reuters.com'
        }]
      };
    }
  };

  const withheld = await verifyVisualEntities(candidates, mediaAnalysis, mediaAnalysis.transcript, {
    entitySearchProvider,
    allowExternalEntitySearch: false
  });
  assert.strictEqual(consentedSearchCalls, 0, 'no media-derived entity may be sent to search without explicit consent');
  assert.strictEqual(withheld.summary.providerStatus, 'WITHHELD');
  assert.strictEqual(withheld.summary.searchedCount, 0);

  const result = await performEntityAndIntentAnalysis(mediaAnalysis.transcript, {
    mediaAnalysis,
    claims: [{ id: 'claim-1', text: 'Rahul Gandhi addressed reporters after the meeting.' }],
    sources: [],
    entitySearchProvider,
    allowExternalEntitySearch: true
  });

  const rahul = result.entities.find(entity => entity.normalizedName === 'Rahul Gandhi');
  assert(rahul, 'expected visual identity to remain in combined entity analysis');
  assert.strictEqual(rahul.visuallyDetected, true);
  assert.strictEqual(rahul.verificationStatus, 'VERIFIED', 'high-confidence visual, transcript, and authoritative search evidence should verify');
  assert(rahul.sources.length > 0, 'verified entity should retain its evidence sources');
  assert(result.entityVerification.verifiedCount >= 1);
  assert(result.entityVerification.searchedCount >= 1);
  assert(result.intentAnalysis.misinformationTargeting.targetedEntities.includes('Rahul Gandhi'));
  assert(consentedSearchCalls >= 1, 'explicit consent should enable corroboration searches');

  const tinyPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64'
  );
  const imageForensics = await performImageForensicAnalysis(tinyPng, 'image/png', {
    enableReverseSearch: true,
    allowExternalVisualSearch: false
  });
  assert.strictEqual(imageForensics.reverseSearch.status, 'WITHHELD', 'image bytes must not leave the app without explicit visual-search consent');

  console.log('PASS media entity extraction, consent, corroboration, image privacy, and intent integration');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
