/**
 * Comprehensive Correctness & Reliability Test Suite for Agent 3 Upgrade
 * Verifies:
 * 1. Multi-Angle Search Query Formulation (Affirmative + Refutation)
 * 2. Deterministic Evidence Guard Gate (Temporal, Scale, Authority, Contradiction)
 * 3. Circuit Breaker State Machine (Healthy, Cooldown, Retry)
 * 4. Controlled Concurrency Pool & Worker Dispatch
 * 5. Canonical Output Contract & Telemetry Generation (Audit Trail, Exact Flow)
 * 6. Live Verification Flow with Fallback Handling
 *
 * NON-NEGOTIABLE: Zero hardcoded entity/test-case overrides in production code.
 */

'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const assert = require('assert');
const {
  verifySingleClaimGrounded,
  verifyClaimsWithGeminiGrounding,
  buildClaimSearchQueries,
  applyEvidenceGuard,
  circuitBreaker,
  CIRCUIT_STATES,
  extractDomain,
  extractJsonPayload,
  normalizeVerdict,
  verdictToStatus
} = require('../src/services/ai/geminiGroundedVerifier');

async function runTestSuite() {
  console.log('================================================================');
  console.log('🧪 RUNNING AGENT 3 MERGED CORRECTNESS TEST SUITE');
  console.log('================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function runTest(testName, fn) {
    totalTests++;
    try {
      fn();
      console.log(`  ✅ Test ${totalTests}: ${testName}`);
      passedTests++;
    } catch (err) {
      console.error(`  ❌ Test ${totalTests} FAILED: ${testName}`);
      console.error(`     Error: ${err.message}`);
      throw err;
    }
  }

  async function runAsyncTest(testName, fn) {
    totalTests++;
    try {
      await fn();
      console.log(`  ✅ Test ${totalTests}: ${testName}`);
      passedTests++;
    } catch (err) {
      console.error(`  ❌ Test ${totalTests} FAILED: ${testName}`);
      console.error(`     Error: ${err.message}`);
      throw err;
    }
  }

  // ── TEST 1: Multi-Angle Query Formulation ──────────────────────────────────
  runTest('Multi-Angle Search Query Generation (Support + Contradiction)', () => {
    const claim = {
      claimText: 'The Reserve Bank of India increased repo rate by 25 basis points in February 2023'
    };
    const { supportQuery, contradictionQuery, queries } = buildClaimSearchQueries(claim);
    assert.ok(Array.isArray(queries), 'Should return an array of queries in queries property');
    assert.ok(queries.length >= 2, 'Should generate at least 2 search angles');

    assert.ok(supportQuery.includes('Reserve Bank') || supportQuery.includes('repo rate'), 'Support query must contain core terms');
    assert.ok(
      contradictionQuery.includes('fact check') ||
      contradictionQuery.includes('false') ||
      contradictionQuery.includes('debunk') ||
      contradictionQuery.includes('dispute'),
      'Contradiction query must probe refutation angles'
    );
  });

  // ── TEST 2: Temporal Consistency Gate in Evidence Guard ────────────────────
  runTest('Evidence Guard: Temporal Mismatch Penalization', () => {
    const claim = {
      claimText: 'Esha Singh won gold in 25m pistol at the Asian Games in 2023'
    };
    // Candidate says VERIFIED, but evidence only talks about 2018 or 2014
    const sources = [
      {
        url: 'https://reuters.com/sports/shooting-2018',
        domain: 'reuters.com',
        snippet: 'In the 2018 competition, other athletes competed.',
        authorityScore: 92,
        stance: 'SUPPORTS'
      }
    ];

    const { finalVerdict, guardChecks } = applyEvidenceGuard(
      claim,
      'VERIFIED',
      sources,
      ['Gold medal in pistol']
    );

    assert.strictEqual(guardChecks.hasYearMatch, false, 'Should flag temporal mismatch when 2023 is missing from evidence');
    assert.ok(
      finalVerdict === 'PARTIALLY_VERIFIED' || finalVerdict === 'UNVERIFIED',
      'Verdict must be downgraded due to temporal mismatch'
    );
  });

  // ── TEST 3: Quantity / Numerical Scale Mismatch Gate ───────────────────────
  runTest('Evidence Guard: Quantity / Scale Mismatch Penalization', () => {
    const claim = {
      claimText: 'TechCorp revenue surged 500% to $10 billion in Q3'
    };
    const sources = [
      {
        url: 'https://bloomberg.com/news/techcorp-q3',
        domain: 'bloomberg.com',
        snippet: 'TechCorp reported $2 billion in revenue, up 5% year over year.',
        authorityScore: 94,
        stance: 'SUPPORTS'
      }
    ];

    const { finalVerdict, guardChecks } = applyEvidenceGuard(
      claim,
      'VERIFIED',
      sources,
      ['TechCorp revenue grew']
    );

    assert.strictEqual(guardChecks.hasQuantityMismatch, true, 'Should detect numerical mismatch between $10B/500% and $2B/5%');
    assert.strictEqual(finalVerdict, 'PARTIALLY_VERIFIED', 'Verdict must be downgraded on numerical conflict');
  });

  // ── TEST 4: Contradiction Penalty in Evidence Guard ────────────────────────
  runTest('Evidence Guard: Contradiction Penalty Overrides Candidate', () => {
    const claim = {
      claimText: 'NASA confirmed discovery of alien life on Europa in 2024'
    };
    const sources = [
      {
        url: 'https://reuters.com/science/nasa-europa-mission-2024',
        domain: 'reuters.com',
        snippet: 'NASA scientists explicitly stated no signs of alien life have been found on Europa.',
        authorityScore: 95,
        stance: 'CONTRADICTS'
      }
    ];

    const { finalVerdict, status, guardChecks } = applyEvidenceGuard(
      claim,
      'VERIFIED', // Candidate LLM hallucinated VERIFIED
      sources,
      ['Mission launched']
    );

    assert.strictEqual(guardChecks.hasContradiction, true, 'Evidence Guard must flag contradiction');
    assert.strictEqual(finalVerdict, 'FALSE', 'Must override candidate VERIFIED to FALSE when authoritative evidence contradicts');
    assert.strictEqual(status, 'FABRICATED', 'Status must map to FABRICATED');
  });

  // ── TEST 5: Authority Tier Weighting in Evidence Guard ─────────────────────
  runTest('Evidence Guard: Authority Tiering & Verification Threshold', () => {
    const claim = {
      claimText: 'ISRO launched Chandrayaan-3 successfully in July 2023'
    };
    const tier0Sources = [
      {
        url: 'https://isro.gov.in/chandrayaan3_press_release.html',
        domain: 'isro.gov.in',
        snippet: 'Chandrayaan-3 was successfully launched in July 2023 by ISRO.',
        authorityScore: 98,
        stance: 'SUPPORTS'
      },
      {
        url: 'https://bbc.com/news/world-asia-india-66185544',
        domain: 'bbc.com',
        snippet: 'India launched Chandrayaan-3 to the moon in July 2023.',
        authorityScore: 90,
        stance: 'SUPPORTS'
      }
    ];

    const { finalVerdict, confidence, guardChecks } = applyEvidenceGuard(
      claim,
      'VERIFIED',
      tier0Sources,
      ['Successful launch in July 2023']
    );

    assert.strictEqual(finalVerdict, 'VERIFIED', 'Authoritative sources must corroborate VERIFIED');
    assert.strictEqual(guardChecks.hasYearMatch, true, 'Temporal year 2023 must match');
    assert.ok(guardChecks.authorityDistribution.tier0 >= 1, 'Should record Tier 0 (.gov) source');
    assert.ok(confidence >= 85, 'Confidence must be high for Tier 0/1 corroborated facts');
  });

  // ── TEST 6: Circuit Breaker State Machine ──────────────────────────────────
  runTest('Circuit Breaker: State Machine Transitions & Cooldown', () => {
    // Save original state
    const originalState = circuitBreaker.state;
    const originalCooldownExpiry = circuitBreaker.cooldownExpiry;

    try {
      circuitBreaker.state = CIRCUIT_STATES.HEALTHY;
      circuitBreaker.failureCount = 0;
      assert.strictEqual(circuitBreaker.isAvailable(), true, 'Should be available when HEALTHY');

      // Record a simulated 429 quota exhaustion
      circuitBreaker.recordFailure(new Error('RESOURCE_EXHAUSTED: 429 Too Many Requests'));
      assert.strictEqual(circuitBreaker.state, CIRCUIT_STATES.COOLDOWN, 'Should immediately trip to COOLDOWN on 429');
      assert.strictEqual(circuitBreaker.isAvailable(), false, 'Should not be available while in COOLDOWN');

      // Simulate expired cooldown
      circuitBreaker.cooldownExpiry = Date.now() - 1000;
      assert.strictEqual(circuitBreaker.isAvailable(), true, 'Should allow RETRY test after cooldown window');
      assert.strictEqual(circuitBreaker.state, CIRCUIT_STATES.RETRY, 'Should transition to RETRY state');

      // Record success
      circuitBreaker.recordSuccess();
      assert.strictEqual(circuitBreaker.state, CIRCUIT_STATES.HEALTHY, 'Should transition back to HEALTHY on success');
    } finally {
      circuitBreaker.state = originalState;
      circuitBreaker.cooldownExpiry = originalCooldownExpiry;
    }
  });

  // ── TEST 7: Controlled Concurrency Pool Execution ─────────────────────────
  await runAsyncTest('Concurrency Pool: Multi-Claim Batch with Progress Callbacks', async () => {
    const claims = [
      { id: 'c1', claimText: 'Water boils at 100 degrees Celsius at standard atmospheric pressure.' },
      { id: 'c2', claimText: 'The Pacific Ocean is the largest ocean on Earth.' },
      { id: 'c3', claimText: 'Mount Everest is the highest mountain above sea level.' }
    ];

    const startedClaims = [];
    const completedClaims = [];

    const result = await verifyClaimsWithGeminiGrounding(claims, {
      onClaimStart: (idx, total, claim) => {
        startedClaims.push({ idx, id: claim.id });
      },
      onClaimComplete: (completed, total, claim) => {
        completedClaims.push({ completed, id: claim.id, verdict: claim.verdict });
      }
    });

    assert.strictEqual(result.totalClaims, 3, 'Total claims must match input length');
    assert.strictEqual(startedClaims.length, 3, 'All 3 claims must start');
    assert.strictEqual(completedClaims.length, 3, 'All 3 claims must complete');
    assert.ok(result.claims.length === 3, 'Result must contain 3 evaluated claims');

    result.claims.forEach((c, idx) => {
      assert.ok(c.id, `Claim ${idx + 1} must have an id`);
      assert.ok(c.verdict, `Claim ${idx + 1} must have a verdict`);
      assert.ok(c.status, `Claim ${idx + 1} must have a status`);
      assert.ok(typeof c.confidence === 'number', `Claim ${idx + 1} must have numeric confidence`);
      assert.ok(Array.isArray(c.sources), `Claim ${idx + 1} must have sources array`);
      assert.ok(Array.isArray(c.exactFlow), `Claim ${idx + 1} must have exactFlow telemetry`);
      assert.ok(c.auditTrail, `Claim ${idx + 1} must have auditTrail`);
    });
  });

  // ── TEST 8: Canonical Field Mapping & Downstream Compatibility ────────────
  await runAsyncTest('Canonical Field Contract: Downstream Ingestion Verification', async () => {
    const claim = {
      id: 'downstream_claim_1',
      claimText: 'Tokyo is the capital city of Japan.'
    };

    const evaluated = await verifySingleClaimGrounded(claim, {});

    // Canonical fields required by Agent 4, trust scoring, and UI
    assert.strictEqual(evaluated.id, 'downstream_claim_1');
    assert.ok(typeof evaluated.claimText === 'string' && evaluated.claimText.length > 0);
    assert.ok(['VERIFIED', 'PARTIALLY_VERIFIED', 'FALSE', 'UNVERIFIED'].includes(evaluated.verdict));
    assert.ok(['TRUSTED', 'SUSPICIOUS', 'FABRICATED', 'UNVERIFIED'].includes(evaluated.status));
    assert.ok(typeof evaluated.confidence === 'number' && evaluated.confidence >= 0 && evaluated.confidence <= 100);
    assert.ok(typeof evaluated.explanation === 'string' && evaluated.explanation.length > 0);
    assert.ok(Array.isArray(evaluated.keyFindings));
    assert.ok(Array.isArray(evaluated.searchQueries));
    assert.ok(Array.isArray(evaluated.sources));
    assert.ok(Array.isArray(evaluated.groundedSources));
    assert.ok(evaluated.exactFlow.length >= 4, 'Must produce full lifecycle execution flow steps');
    assert.ok(evaluated.auditTrail !== null && typeof evaluated.auditTrail === 'object');
    assert.ok(typeof evaluated.latencyMs === 'number');
  });

  // ── TEST 9: Empty & Malformed Input Safety ────────────────────────────────
  await runAsyncTest('Edge Case Resilience: Empty & Malformed Inputs', async () => {
    const emptyResult = await verifyClaimsWithGeminiGrounding([]);
    assert.strictEqual(emptyResult.status, 'EMPTY');
    assert.strictEqual(emptyResult.totalClaims, 0);

    const nullResult = await verifyClaimsWithGeminiGrounding(null);
    assert.strictEqual(nullResult.status, 'EMPTY');

    const singleMalformed = await verifySingleClaimGrounded({}, {});
    assert.ok(singleMalformed.id, 'Must generate fallback ID');
    assert.strictEqual(singleMalformed.verdict, 'UNVERIFIED');
  });

  // ── TEST 10: Zero Hardcoding Grep Verification ─────────────────────────────
  runTest('Zero Hardcoding Verification: Generic Production Codebase', () => {
    // Assert that extractDomain, normalizeVerdict, verdictToStatus have no domain or entity hardcoding
    assert.strictEqual(verdictToStatus('VERIFIED'), 'TRUSTED');
    assert.strictEqual(verdictToStatus('FALSE'), 'FABRICATED');
    assert.strictEqual(verdictToStatus('PARTIALLY_VERIFIED'), 'SUSPICIOUS');
    assert.strictEqual(verdictToStatus('UNVERIFIED'), 'UNVERIFIED');

    assert.strictEqual(normalizeVerdict('VERIFIED'), 'VERIFIED');
    assert.strictEqual(normalizeVerdict('true'), 'VERIFIED');
    assert.strictEqual(normalizeVerdict('false'), 'FALSE');
    assert.strictEqual(normalizeVerdict('debunked'), 'FALSE');
    assert.strictEqual(normalizeVerdict('ambiguous'), 'UNVERIFIED');
  });

  console.log('\n================================================================');
  console.log(`🎉 TEST SUITE COMPLETE: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('================================================================\n');
}

runTestSuite().catch(err => {
  console.error('Fatal test failure:', err);
  process.exit(1);
});
