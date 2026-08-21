const assert = require('assert');
const { verifyClaims } = require('../src/services/factVerifier');
const { evaluateSemanticStance } = require('../src/services/semanticVerification');

async function runStage15SemanticEvidenceTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING STAGE 15: REAL CLAIM-CENTRIC EVIDENCE RETRIEVAL TESTS');
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
  // Test 1: SERP and Loopback URL Rejection Filter
  // ----------------------------------------------------------------
  await runTest('1. Rejection of SERP URLs, loopbacks, and invalid URLs', async () => {
    const claim = {
      id: 'cl_serp_test',
      text: 'National Highway Authority opened the new express corridor connecting Delhi and Jaipur.',
      category: 'Infrastructure',
      entities: ['National Highway Authority']
    };

    const mockSearchResults = [
      {
        index: 0,
        title: 'Google Search Results for Highway Authority',
        url: 'https://www.google.com/search?q=highway+authority+express+corridor',
        domain: 'google.com',
        snippet: 'Search results for highway corridor...'
      },
      {
        index: 1,
        title: 'Internal Server Endpoint',
        url: 'http://127.0.0.1:8080/api/internal',
        domain: '127.0.0.1',
        snippet: 'Internal diagnostic page.'
      },
      {
        index: 2,
        title: 'National Highway Authority Opens Delhi-Jaipur Express Corridor',
        url: 'https://infrastructure-news.example.local/express-corridor-open',
        domain: 'infrastructure-news.example.local',
        snippet: 'Official statement: National Highway Authority opened the new express corridor connecting Delhi and Jaipur today.'
      }
    ];

    const res = await verifyClaims([claim], { mockSearchResults });
    const verifiedClaim = res[0];

    // The SERP and 127.0.0.1 items must be filtered out
    assert.strictEqual(verifiedClaim.sources.length, 1, 'Only legitimate non-SERP organic sources should be accepted');
    assert.strictEqual(verifiedClaim.sources[0].domain, 'infrastructure-news.example.local');
    assert.strictEqual(verifiedClaim.supportingSourceIndices.length, 1);
  });

  // ----------------------------------------------------------------
  // Test 2: 15-Dimension Semantic Stance — Quantity & Scale Mismatch
  // ----------------------------------------------------------------
  await runTest('2. Quantity & scale mismatch evaluated as REFUTES / IRRELEVANT (not SUPPORTS)', async () => {
    const claim = {
      claimText: 'TechCorp acquired CloudBase for $2 billion in all-cash transaction.',
      subject: 'TechCorp',
      action: 'acquired',
      object: 'CloudBase',
      quantities: ['$2 billion', '$2B'],
      location: null,
      time: null
    };

    const evidence = {
      title: 'TechCorp Completes Purchase of CloudBase for $350 Million',
      snippet: 'TechCorp has completed the acquisition of CloudBase for a purchase price of $350 million.',
      url: 'https://financial.example.local/deal',
      domain: 'financial.example.local',
      quantities: ['$350 million', '$350M']
    };

    const stanceResult = evaluateSemanticStance(claim, evidence);
    assert.strictEqual(stanceResult.dimensions.quantity, 'MISMATCH', 'Quantity mismatch must be detected ($2B vs $350M)');
    assert.notStrictEqual(stanceResult.stance, 'SUPPORTS', 'Quantity discrepancy must NEVER evaluate to SUPPORTS');
  });

  // ----------------------------------------------------------------
  // Test 3: 15-Dimension Semantic Stance — Event State Discrepancy (Signed != Completed)
  // ----------------------------------------------------------------
  await runTest('3. Event-state mismatch (Agreement Signed vs Acquisition Completed) is distinguished', async () => {
    const claim = {
      claimText: 'PharmaCore completed the acquisition and takeover of BioGen Labs.',
      subject: 'PharmaCore',
      action: 'completed the acquisition',
      object: 'BioGen Labs',
      canonicalEvent: 'ACQUISITION',
      completionStatus: 'COMPLETED'
    };

    const evidence = {
      title: 'PharmaCore Signs Agreement to Explore Acquisition of BioGen Labs',
      snippet: 'PharmaCore signed an agreement to explore acquisition of BioGen Labs subject to shareholder vote.',
      url: 'https://pharma-times.example.local/signed',
      domain: 'pharma-times.example.local',
      canonicalEvent: 'SIGNED',
      completionStatus: 'PENDING'
    };

    const stanceResult = evaluateSemanticStance(claim, evidence);
    assert.strictEqual(stanceResult.dimensions.completionStatus, 'MISMATCH', 'Pending agreement must mismatch completed event state');
    assert.notStrictEqual(stanceResult.stance, 'SUPPORTS');
  });

  // ----------------------------------------------------------------
  // Test 4: 15-Dimension Semantic Stance — Location Mismatch
  // ----------------------------------------------------------------
  await runTest('4. Location mismatch (e.g. Mumbai vs Bengaluru) detected as REFUTES / MISMATCH', async () => {
    const claim = {
      claimText: 'Metropolitan Rail inaugurated the new subterranean terminal in Mumbai.',
      subject: 'Metropolitan Rail',
      action: 'inaugurated',
      object: 'subterranean terminal',
      location: 'Mumbai',
      time: null
    };

    const evidence = {
      title: 'Metropolitan Rail Inaugurates Subterranean Terminal in Bengaluru',
      snippet: 'Metropolitan Rail today inaugurated its modern subterranean terminal in Bengaluru.',
      url: 'https://transit.example.local/bengaluru-terminal',
      domain: 'transit.example.local',
      location: 'Bengaluru'
    };

    const stanceResult = evaluateSemanticStance(claim, evidence);
    assert.strictEqual(stanceResult.dimensions.location, 'MISMATCH', 'Location mismatch must be detected');
    assert.strictEqual(stanceResult.stance, 'REFUTES', 'Location discrepancy must evaluate as REFUTES');
  });

  // ----------------------------------------------------------------
  // Test 5: Preservation of Conflicting Evidence (Supporting AND Refuting)
  // ----------------------------------------------------------------
  await runTest('5. Conflicting evidence is fully preserved in lineage, producing PARTIALLY_VERIFIED', async () => {
    const claims = [{
      id: 'claim_conflict_1',
      text: 'Aviation Corp received full clearance and expanded daily flights to 120.',
      category: 'Aviation',
      entities: ['Aviation Corp']
    }];

    const mockSearchResults = [
      {
        index: 0,
        title: 'Aviation Corp Cleared for Route Expansion by Regulator',
        snippet: 'Civil Aviation Board approved Aviation Corp full clearance for fleet expansion.',
        url: 'https://aviation-daily.example.local/clearance',
        domain: 'aviation-daily.example.local'
      },
      {
        index: 1,
        title: 'Aviation Corp 120 Daily Flight Expansion Rejected by Tribunal',
        snippet: 'Tribunal rejected Aviation Corp request for 120 daily flights, capping schedule at 40.',
        url: 'https://tribunal-bulletin.example.local/flight-cap',
        domain: 'tribunal-bulletin.example.local'
      }
    ];

    const verified = await verifyClaims(claims, { mockSearchResults });
    const res = verified[0];

    assert.strictEqual(res.supportingSourceIndices.length, 1, 'Must record 1 supporting source');
    assert.strictEqual(res.refutingSourceIndices.length, 1, 'Must record 1 refuting source');
    assert.strictEqual(res.verdict, 'PARTIALLY_VERIFIED', 'Contradictory evidence must produce PARTIALLY_VERIFIED verdict');
    assert.strictEqual(res.evidenceEvaluations.length, 2, 'All evidence items must be retained in lineage');
  });

  // ----------------------------------------------------------------
  // Test 6: Unseen Breaking Claim Verification Lineage
  // ----------------------------------------------------------------
  await runTest('6. Unseen breaking claim lineage verification with multi-perspective telemetry', async () => {
    const claims = [{
      id: 'claim_unseen_1',
      text: 'Global Microchips invested $1.2 billion into Gujarat semiconductor foundry.',
      category: 'Semiconductors',
      entities: ['Global Microchips', 'Gujarat semiconductor foundry']
    }];

    const mockSearchResults = [
      {
        index: 0,
        title: 'Global Microchips Pours $1.2 Billion into Gujarat Semiconductor Plant',
        snippet: 'State government confirmed Global Microchips invested $1.2 billion into Gujarat semiconductor foundry today.',
        url: 'https://thehindu.com/business/industry/gujarat-foundry',
        domain: 'thehindu.com'
      }
    ];

    const verified = await verifyClaims(claims, { mockSearchResults });
    const item = verified[0];

    assert.strictEqual(item.verdict, 'VERIFIED');
    assert.strictEqual(item.status, 'TRUSTED');
    assert.ok(item.confidence >= 70);
    assert.ok(item.auditTrail.evidenceEvaluations.length >= 1);
  });

  console.log('\n================================================================');
  console.log(`🏆 STAGE 15 TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runStage15SemanticEvidenceTests();
