/**
 * Unit Test Suite for Sequential Standalone Gemini Grounded Verifier
 */

'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const assert = require('assert');
const {
  extractDomain,
  extractJsonPayload,
  normalizeVerdict,
  buildDualEngineComparison,
  verifyClaimsWithGeminiGrounding
} = require('../src/services/ai/geminiGroundedVerifier');

(async () => {
  console.log('🧪 Starting Standalone Gemini Grounded Verifier Test Suite...\n');

  // =========================================================================
  // TEST 1: Domain Extraction & JSON Parsing
  // =========================================================================
  console.log('Test 1: Domain Extraction & JSON Parsing');
  assert.strictEqual(extractDomain('https://www.bbc.com/news/world-12345'), 'bbc.com');
  assert.strictEqual(extractDomain('https://reuters.com/tech/ai-article'), 'reuters.com');
  assert.strictEqual(extractDomain('invalid-url'), 'web-source');
  console.log('  ✅ extractDomain correctly extracts clean hostnames.');

  const markdownJson = '```json\n{"verdict": "VERIFIED", "confidence": 95, "explanation": "Confirmed by reporting"}\n```';
  const parsed = extractJsonPayload(markdownJson);
  assert.strictEqual(parsed.verdict, 'VERIFIED');
  assert.strictEqual(parsed.confidence, 95);
  console.log('  ✅ extractJsonPayload correctly strips markdown fences.');

  assert.strictEqual(normalizeVerdict('VERIFIED'), 'VERIFIED');
  assert.strictEqual(normalizeVerdict('partially verified'), 'PARTIALLY_VERIFIED');
  assert.strictEqual(normalizeVerdict('FALSE'), 'FALSE');
  assert.strictEqual(normalizeVerdict('unknown'), 'UNVERIFIED');
  console.log('  ✅ normalizeVerdict accurately normalizes status labels.\n');

  // =========================================================================
  // TEST 2: Dual-Engine Comparison Legacy Helper
  // =========================================================================
  console.log('Test 2: Dual-Engine Comparison Legacy Helper');
  const g1 = { verdict: 'VERIFIED', confidence: 92 };
  const e1 = { verdict: 'VERIFIED', confidence: 90 };
  const comp1 = buildDualEngineComparison(g1, e1);
  assert.strictEqual(comp1.isAgreement, true);
  assert.strictEqual(comp1.comparisonStatus, 'FULL_AGREEMENT');
  console.log('  ✅ Legacy comparison helper correctly preserved for backward compatibility.\n');

  // =========================================================================
  // TEST 3: Sequential Claim-by-Claim Verification
  // =========================================================================
  console.log('Test 3: Sequential Claim-by-Claim Verification');

  // Empty claim array
  const emptyRes = await verifyClaimsWithGeminiGrounding([]);
  assert.strictEqual(emptyRes.totalClaims, 0);
  assert.strictEqual(emptyRes.status, 'EMPTY');
  console.log('  ✅ Empty input gracefully handled.');

  // Test sequential callback flow
  const sampleClaims = [
    { id: 'claim_1', text: 'Anthropic is an AI safety and research company founded by former OpenAI members.' },
    { id: 'claim_2', text: 'The Eiffel Tower is located in Paris, France.' }
  ];

  const claimStartEvents = [];
  const claimCompleteEvents = [];

  const sequentialRes = await verifyClaimsWithGeminiGrounding(sampleClaims, {
    delayBetweenClaimsMs: 500,
    sourceTitle: 'AI and Paris Facts',
    onClaimStart: (curr, total, claim) => {
      claimStartEvents.push({ curr, total, id: claim.id });
    },
    onClaimComplete: (curr, total, res) => {
      claimCompleteEvents.push({ curr, total, verdict: res.verdict, sourcesCount: res.groundedSources?.length || 0 });
    }
  });

  assert.strictEqual(sequentialRes.totalClaims, 2);
  assert.strictEqual(claimStartEvents.length, 2);
  assert.strictEqual(claimCompleteEvents.length, 2);
  assert.strictEqual(claimStartEvents[0].curr, 1);
  assert.strictEqual(claimStartEvents[1].curr, 2);

  console.log(`  ✅ Successfully executed 2 claims sequentially:`);
  claimCompleteEvents.forEach((ev, i) => {
    console.log(`     Claim ${ev.curr}/${ev.total}: ${ev.verdict} (${ev.sourcesCount} live sources retrieved)`);
  });

  assert.ok(sequentialRes.claims[0].groundedSources.length > 0, 'Claim 1 should have returned live sources');
  assert.ok(sequentialRes.claims[1].groundedSources.length > 0, 'Claim 2 should have returned live sources');
  const validVerdicts = ['VERIFIED', 'PARTIALLY_VERIFIED', 'FALSE', 'UNVERIFIED'];
  assert.ok(validVerdicts.includes(sequentialRes.claims[0].verdict), 'Claim 1 should have valid canonical verdict');
  assert.ok(validVerdicts.includes(sequentialRes.claims[1].verdict), 'Claim 2 should have valid canonical verdict');
  assert.ok(validVerdicts.includes(sequentialRes.overallVerdict), 'Overall verdict should be valid');
  assert.strictEqual(sequentialRes.claims[0].comparison, undefined, 'Must NOT contain comparison fields');

  console.log('\n🎉 ALL SEQUENTIAL GEMINI GROUNDED VERIFIER TESTS PASSED SUCCESSFULLY!');
})();
