const assert = require('assert');
const {
  deepResearchClaim,
  buildClaimResearchUpdate,
  mapResearchStatusToVerdict
} = require('../src/controllers/verifyController');

async function run() {
  const originalSerperKey = process.env.SERPER_API_KEY;
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  process.env.SERPER_API_KEY = 'your_serper_api_key';
  process.env.GEMINI_API_KEY = 'your_gemini_api_key_here';

  try {
    let statusCode = 200;
    let responseBody = null;
    const response = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(body) {
        responseBody = body;
        return body;
      }
    };

    await deepResearchClaim({
      body: {
        claim: {
          claimText: 'A test claim for individual research.',
          entities: ['Test']
        }
      }
    }, response);

    assert.strictEqual(statusCode, 200);
    assert.strictEqual(responseBody.success, true);
    assert.strictEqual(responseBody.deepResearch.triggerType, 'MANUAL');
    assert.ok(Array.isArray(responseBody.deepResearch.deepResearchHits));
    assert.ok(responseBody.updatedClaim);
    assert.strictEqual(responseBody.persisted, false);

    const merged = buildClaimResearchUpdate(
      { claimText: 'Claim', sources: [{ url: 'https://source.test/a', title: 'Old' }] },
      {
        updatedStatus: 'TRUSTED',
        updatedConfidence: 81,
        reasoning: 'Supported.',
        searchedAt: '2026-01-01T00:00:00.000Z',
        evaluatedSources: [{ url: 'https://source.test/a', title: 'Updated', stance: 'SUPPORTS' }]
      },
      { hasCorrection: false, correctedClaim: null, correctionBasis: null, partiallyAccurate: false }
    );
    assert.strictEqual(merged.verdict, 'VERIFIED');
    assert.strictEqual(merged.sources.length, 1, 'sources with the same URL must be deduplicated');
    assert.strictEqual(merged.sources[0].title, 'Updated');
    assert.strictEqual(mapResearchStatusToVerdict('FABRICATED'), 'FALSE');

    const preserved = buildClaimResearchUpdate(
      { claimText: 'Existing claim', status: 'TRUSTED', verdict: 'VERIFIED', confidence: 88 },
      {
        updatedStatus: 'SUSPICIOUS',
        updatedConfidence: 25,
        reasoning: 'No sources returned.',
        evaluatedSources: [],
        limitations: ['Search provider unavailable.']
      },
      { hasCorrection: false, correctedClaim: null, correctionBasis: null, partiallyAccurate: false }
    );
    assert.strictEqual(preserved.status, 'TRUSTED', 'a provider outage must not downgrade an existing claim');
    assert.strictEqual(preserved.verdict, 'VERIFIED');
    assert.strictEqual(preserved.confidence, 88);

    console.log('Individual claim research controller tests passed.');
  } finally {
    if (originalSerperKey === undefined) delete process.env.SERPER_API_KEY;
    else process.env.SERPER_API_KEY = originalSerperKey;
    if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalGeminiKey;
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
