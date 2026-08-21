const assert = require('assert');
const { verifyClaims } = require('../src/services/factVerifier');

async function runEvidenceStanceTests() {
  console.log('==============================================');
  console.log('🧪 Running Agent 3 Evidence Stance Tests...');
  console.log('==============================================\n');

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

  const originalEnv = { ...process.env };
  const resetEnv = () => { process.env = { ...originalEnv }; };

  try {
    // ----------------------------------------------------
    // Test 1: Search result exists but contradicts claim -> REFUTES
    // ----------------------------------------------------
    await runTest('1. Search result exists but contradicts claim -> REFUTES', async () => {
      process.env.ETRAI_TEST_MODE = 'mock';

      const claims = [{
        id: 'claim_refute_1',
        text: 'Acme Corporation declared bankruptcy after posting record losses in Q4.',
        category: 'Financial Claim',
        entities: ['Acme Corporation']
      }];

      // Mock search hit with debunking/refuting text
      const searchResultsMock = [{
        index: 0,
        title: 'Acme Corporation Bankruptcy Reports Debunked as False Rumor',
        snippet: 'Official representatives confirmed Acme Corporation is solvent and denied all false claims regarding bankruptcy.',
        url: 'https://news.example.local/article-1',
        domain: 'news.example.local'
      }];

      // Call verifier with controlled search results
      const verified = await verifyClaims(claims, { mockSearchResults: searchResultsMock });
      assert.strictEqual(verified.length, 1);
      const evalItem = verified[0].evidenceEvaluations[0];

      assert.strictEqual(evalItem.stance, 'REFUTES', `Expected stance to be REFUTES, got ${evalItem.stance}`);
      assert.strictEqual(verified[0].refutingSourceIndices.length, 1, 'Should have 1 refuting source index');
      assert.strictEqual(verified[0].supportingSourceIndices.length, 0, 'Should have 0 supporting source indices');
    });

    // ----------------------------------------------------
    // Test 2: Search result exists but is unrelated -> IRRELEVANT
    // ----------------------------------------------------
    await runTest('2. Search result exists but is unrelated -> IRRELEVANT', async () => {
      const claims = [{
        id: 'claim_unrelated_1',
        text: 'The municipal transit authority expanded bus routes in downtown Metroville.',
        category: 'Infrastructure',
        entities: ['Metroville Transit']
      }];

      const searchResultsMock = [{
        index: 0,
        title: 'Baking Recipe for Homemade Chocolate Chip Cookies',
        snippet: 'Preheat oven to 350 degrees and mix flour with brown sugar and butter for delicious treats.',
        url: 'https://recipes.example.local/cookies',
        domain: 'recipes.example.local'
      }];

      const verified = await verifyClaims(claims, { mockSearchResults: searchResultsMock });
      const evalItem = verified[0].evidenceEvaluations[0];

      assert.strictEqual(evalItem.stance, 'IRRELEVANT', `Expected stance to be IRRELEVANT, got ${evalItem.stance}`);
      assert.strictEqual(verified[0].supportingSourceIndices.length, 0, 'Unrelated search result must not increase supportingCount');
    });

    // ----------------------------------------------------
    // Test 3: Search result discusses same entity but different event -> IRRELEVANT
    // ----------------------------------------------------
    await runTest('3. Search result discusses same entity but different event -> IRRELEVANT', async () => {
      const claims = [{
        id: 'claim_diff_event',
        text: 'Apex Pharma acquired BioHealth Labs for $500 million in a cash transaction.',
        category: 'Corporate M&A',
        entities: ['Apex Pharma']
      }];

      // Search hit discusses Apex Pharma, but a completely different event (patent lawsuit in 2021)
      const searchResultsMock = [{
        index: 0,
        title: 'Apex Pharma Wins Intellectual Property Patent Lawsuit in 2021',
        snippet: 'Federal court ruled in favor of Apex Pharma regarding chemical patent disputes from three years ago.',
        url: 'https://legalnews.example.local/apex-patent',
        domain: 'legalnews.example.local'
      }];

      const verified = await verifyClaims(claims, { mockSearchResults: searchResultsMock });
      const evalItem = verified[0].evidenceEvaluations[0];

      assert.strictEqual(evalItem.entityMatch, true, 'Entity match should be true');
      assert.strictEqual(evalItem.eventMatch, false, 'Event match should be false');
      assert.strictEqual(evalItem.stance, 'IRRELEVANT', `Expected stance to be IRRELEVANT for different event, got ${evalItem.stance}`);
      assert.strictEqual(verified[0].supportingSourceIndices.length, 0, 'Different event must not count as supporting proof');
    });

    // ----------------------------------------------------
    // Test 4: Search result supports exact claim -> SUPPORTS
    // ----------------------------------------------------
    await runTest('4. Search result supports exact claim -> SUPPORTS', async () => {
      const claims = [{
        id: 'claim_support_1',
        text: 'Apex Pharma acquired BioHealth Labs for $500 million in a cash transaction.',
        category: 'Corporate M&A',
        entities: ['Apex Pharma', 'BioHealth Labs']
      }];

      const searchResultsMock = [{
        index: 0,
        title: 'Apex Pharma Announces $500 Million Acquisition of BioHealth Labs',
        snippet: 'Apex Pharma officially completed the $500 million cash acquisition of BioHealth Labs following regulatory approval.',
        url: 'https://financial.example.local/apex-biohealth',
        domain: 'financial.example.local'
      }];

      const verified = await verifyClaims(claims, { mockSearchResults: searchResultsMock });
      const evalItem = verified[0].evidenceEvaluations[0];

      assert.strictEqual(evalItem.stance, 'SUPPORTS', `Expected stance to be SUPPORTS, got ${evalItem.stance}`);
      assert.strictEqual(verified[0].supportingSourceIndices.length, 1, 'Should have 1 supporting source index');
    });

    // ----------------------------------------------------
    // Test 5: Zero results -> INSUFFICIENT_EVIDENCE / SUSPICIOUS, never TRUSTED
    // ----------------------------------------------------
    await runTest('5. Zero results -> INSUFFICIENT_EVIDENCE / SUSPICIOUS, never TRUSTED', async () => {
      const claims = [{
        id: 'claim_zero_hits',
        text: 'An unverified private meeting occurred without public records or official statements.',
        category: 'Unverified Event',
        entities: ['Unverified Entity']
      }];

      const verified = await verifyClaims(claims, { mockSearchResults: [] });
      const res = verified[0];

      assert.notStrictEqual(res.status, 'TRUSTED', 'Zero search results must NEVER evaluate to TRUSTED');
      assert.notStrictEqual(res.status, 'Verified', 'Zero search results must NEVER evaluate to Verified');
      assert.strictEqual(res.supportingSourceIndices.length, 0);
      assert.ok(res.status === 'SUSPICIOUS' || res.status === 'Suspicious', `Expected status to be SUSPICIOUS, got ${res.status}`);
    });

    // ----------------------------------------------------
    // Test 6: Search results from copied/syndicated wire source must not count as multiple independent confirmations
    // ----------------------------------------------------
    await runTest('6. Copied/syndicated wire sources must not count as multiple independent confirmations', async () => {
      const claims = [{
        id: 'claim_wire_1',
        text: 'National Energy Board authorized new solar grid project expansion.',
        category: 'Government Regulation',
        entities: ['National Energy Board']
      }];

      // 3 search hits with identical wire press copy from different domains
      const searchResultsMock = [
        {
          index: 0,
          title: 'National Energy Board Authorizes Solar Grid Project Expansion',
          snippet: 'Official release confirms National Energy Board authorized new solar grid project expansion today.',
          url: 'https://wire-outlet-1.example.local/solar',
          domain: 'wire-outlet-1.example.local'
        },
        {
          index: 1,
          title: 'National Energy Board Authorizes Solar Grid Project Expansion',
          snippet: 'Official release confirms National Energy Board authorized new solar grid project expansion today.',
          url: 'https://wire-outlet-2.example.local/solar',
          domain: 'wire-outlet-2.example.local'
        },
        {
          index: 2,
          title: 'National Energy Board Authorizes Solar Grid Project Expansion',
          snippet: 'Official release confirms National Energy Board authorized new solar grid project expansion today.',
          url: 'https://wire-outlet-3.example.local/solar',
          domain: 'wire-outlet-3.example.local'
        }
      ];

      const verified = await verifyClaims(claims, { mockSearchResults: searchResultsMock });
      const evals = verified[0].evidenceEvaluations;

      assert.strictEqual(evals.length, 3);
      assert.strictEqual(evals[0].isSyndicatedDuplicate, false, 'First source is primary wire copy');
      assert.strictEqual(evals[1].isSyndicatedDuplicate, true, 'Second source must be marked as syndicated duplicate');
      assert.strictEqual(evals[2].isSyndicatedDuplicate, true, 'Third source must be marked as syndicated duplicate');

      // Unique independent supporting count must be 1, NOT 3
      assert.strictEqual(verified[0].supportingSourceIndices.length, 1, 'Syndicated wire copies must yield exactly 1 independent supporting source');
    });

  } finally {
    resetEnv();
  }

  console.log('\n----------------------------------------------');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------\n');

  if (failed > 0) process.exit(1);
}

runEvidenceStanceTests();
