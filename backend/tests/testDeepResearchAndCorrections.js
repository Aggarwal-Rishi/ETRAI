const assert = require('assert');
const { performPerClaimDeepResearch } = require('../src/services/articleResearch');
const { generateClaimCorrection } = require('../src/services/correctionsService');

async function runDeepResearchAndCorrectionsTests() {
  console.log('=====================================================');
  console.log('🧪 Running Deep Research & Corrections Engine Tests...');
  console.log('=====================================================\n');

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
    // Test 1: Exact supporting source
    // ----------------------------------------------------
    await runTest('1. Exact supporting source hit -> evidenceState SUPPORTED, dynamic confidence (no hardcoded 92.5)', async () => {
      const claim = {
        text: 'Apex Solar reached 100MW operational capacity in 2026.',
        entities: ['Apex Solar'],
        status: 'SUSPICIOUS'
      };

      const mockDeepHits = [{
        title: 'Apex Solar Reached 100MW Operational Capacity in 2026',
        snippet: 'Official records confirm Apex Solar reached 100MW operational capacity in 2026.',
        link: 'https://news.example.local/apex-solar',
        domain: 'news.example.local'
      }];

      const res = await performPerClaimDeepResearch(claim, null, false, mockDeepHits);

      assert.strictEqual(res.evidenceState, 'SUPPORTED');
      assert.strictEqual(res.supportingSources.length, 1);
      assert.strictEqual(res.updatedStatus, 'TRUSTED');
      assert.notStrictEqual(res.confidence, 92.5, 'Must NOT use hardcoded 92.5% confidence score');
      assert.ok(typeof res.confidence === 'number' && res.confidence >= 55);
    });

    // ----------------------------------------------------
    // Test 2: Unrelated Tier 0 source
    // ----------------------------------------------------
    await runTest('2. Unrelated Tier 0 source (gov.in) -> entityMatch false, stance IRRELEVANT, evidenceState INSUFFICIENT', async () => {
      const claim = {
        text: 'Crypto Token XYZ surged by 1000% overnight.',
        entities: ['Crypto Token XYZ'],
        status: 'SUSPICIOUS'
      };

      // Search hit comes from a Tier 0 government domain, but text is about agricultural water policy
      const mockDeepHits = [{
        title: 'National Agricultural Water Policy 2026',
        snippet: 'Government ministry published comprehensive water management guidelines for irrigation.',
        link: 'https://india.gov.in/water-policy',
        domain: 'india.gov.in'
      }];

      const res = await performPerClaimDeepResearch(claim, null, false, mockDeepHits);

      assert.strictEqual(res.evidenceState, 'INSUFFICIENT');
      assert.strictEqual(res.supportingSources.length, 0);
      assert.strictEqual(res.updatedStatus, 'SUSPICIOUS');
      assert.notStrictEqual(res.updatedStatus, 'TRUSTED', 'Unrelated Tier 0 domain MUST NOT verify claim');
      assert.ok(res.confidence <= 40);
    });

    // ----------------------------------------------------
    // Test 3: Copied / syndicated wire sources
    // ----------------------------------------------------
    await runTest('3. Copied/syndicated wire hits -> flagged duplicate, does NOT inflate independent supporting count', async () => {
      const claim = {
        text: 'City Transit launched EV Bus Fleet in 2026.',
        entities: ['City Transit'],
        status: 'SUSPICIOUS'
      };

      const mockDeepHits = [
        {
          title: 'City Transit Launched EV Bus Fleet',
          snippet: 'Official release confirms City Transit launched EV bus fleet in 2026.',
          link: 'https://outlet1.example.local/bus',
          domain: 'outlet1.example.local'
        },
        {
          title: 'City Transit Launched EV Bus Fleet',
          snippet: 'Official release confirms City Transit launched EV bus fleet in 2026.',
          link: 'https://outlet2.example.local/bus',
          domain: 'outlet2.example.local'
        }
      ];

      const res = await performPerClaimDeepResearch(claim, null, false, mockDeepHits);

      assert.strictEqual(res.evidenceState, 'SUPPORTED');
      assert.strictEqual(res.supportingSources.length, 1, 'Syndicated wire duplicate must not increase supportingSources length beyond 1');
    });

    // ----------------------------------------------------
    // Test 4: Refuting source
    // ----------------------------------------------------
    await runTest('4. Refuting source hit -> stance REFUTES, evidenceState REFUTES, updatedStatus FABRICATED', async () => {
      const claim = {
        text: 'Metro Corp tax rates surged by 300% overnight.',
        entities: ['Metro Corp'],
        status: 'SUSPICIOUS'
      };

      const mockDeepHits = [{
        title: 'Metro Corp Tax Surge Claim Debunked as False',
        snippet: 'Auditors refuted claims and confirmed Metro Corp tax rates remained completely unchanged.',
        link: 'https://news.example.local/tax-debunk',
        domain: 'news.example.local'
      }];

      const res = await performPerClaimDeepResearch(claim, null, false, mockDeepHits);

      assert.strictEqual(res.evidenceState, 'REFUTES');
      assert.strictEqual(res.refutingSources.length, 1);
      assert.strictEqual(res.updatedStatus, 'FABRICATED');
    });

    // ----------------------------------------------------
    // Test 5: Conflicting / mixed sources
    // ----------------------------------------------------
    await runTest('5. Conflicting sources (1 supporting + 1 refuting) -> evidenceState MIXED, updatedStatus SUSPICIOUS', async () => {
      const claim = {
        text: 'Acme Corp profit margin reached 40% in Q1.',
        entities: ['Acme Corp'],
        status: 'SUSPICIOUS'
      };

      const mockDeepHits = [
        {
          title: 'Acme Corp Q1 Earnings Reported',
          snippet: 'Press release reported Acme Corp profit margin reached 40% in Q1.',
          link: 'https://outlet1.example.local/earnings',
          domain: 'outlet1.example.local'
        },
        {
          title: 'Acme Corp 40% Profit Margin Debunked',
          snippet: 'Auditors debunked 40% profit margin claim for Acme Corp, stating actual margin was 10%.',
          link: 'https://outlet2.example.local/audit',
          domain: 'outlet2.example.local'
        }
      ];

      const res = await performPerClaimDeepResearch(claim, null, false, mockDeepHits);

      assert.strictEqual(res.evidenceState, 'MIXED');
      assert.strictEqual(res.supportingSources.length, 1);
      assert.strictEqual(res.refutingSources.length, 1);
      assert.strictEqual(res.updatedStatus, 'SUSPICIOUS');
    });

    // ----------------------------------------------------
    // Test 6: Missing replacement value in corrections
    // ----------------------------------------------------
    await runTest('6. Refuted claim with NO replacement number in evidence -> outputs "The reported value could not be independently confirmed."', async () => {
      resetEnv();
      delete process.env.OPENAI_API_KEY;

      const claim = {
        text: 'City unemployment rate hit 45% in 2026.',
        entities: ['City unemployment']
      };

      const verificationResult = {
        status: 'FABRICATED',
        verdict: 'FALSE',
        sources: [{
          domain: 'factcheck.example.local',
          snippet: 'Economists refuted the reported 45% unemployment figure as completely false and baseless.'
        }]
      };

      const corr = await generateClaimCorrection(claim, verificationResult);

      assert.strictEqual(corr.hasCorrection, true);
      assert.strictEqual(corr.correctedClaim, 'The reported value could not be independently confirmed.');
      assert.ok(!corr.correctedClaim.includes('45%'), 'Must NOT invent a replacement number when evidence contains none');
    });

    // ----------------------------------------------------
    // Test 7: Exact corrected number in evidence
    // ----------------------------------------------------
    await runTest('7. Refuted claim with explicit replacement number in evidence -> replaces original number with exact evidence number', async () => {
      resetEnv();
      delete process.env.OPENAI_API_KEY;

      const claim = {
        text: 'Company profit margin hit 50% in 2026.',
        entities: ['Company profit']
      };

      const verificationResult = {
        status: 'SUSPICIOUS',
        verdict: 'PARTIALLY_VERIFIED',
        sources: [{
          domain: 'financial.example.local',
          snippet: 'Auditors confirmed actual company profit margin was 12% in 2026.'
        }]
      };

      const corr = await generateClaimCorrection(claim, verificationResult);

      assert.strictEqual(corr.hasCorrection, true);
      assert.ok(corr.correctedClaim.includes('12%'), 'Must replace original figure with exact replacement number 12% from evidence');
      assert.ok(!corr.correctedClaim.includes('50% as reported in original text') || corr.correctedClaim.includes('12%'));
    });

  } finally {
    resetEnv();
  }

  console.log('\n-----------------------------------------------------');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('-----------------------------------------------------\n');

  if (failed > 0) process.exit(1);
}

runDeepResearchAndCorrectionsTests();
