const assert = require('assert');
const { evaluateSourceIntelligence, evaluateSourcesCollection, getSourceIntelligenceLedger } = require('../src/services/sourceIntelligence');
const { verifyClaims } = require('../src/services/factVerifier');
const { prisma, dbService } = require('../src/utils/prisma');

async function runStage16SourceIntelligenceTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING STAGE 16: SOURCE INTELLIGENCE & LEDGER TEST SUITE');
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
  // Test 1: Derivation of Full Intelligence Spectrum
  // ----------------------------------------------------------------
  await runTest('1. Derivation of publication, sourceType, authority rank & score, directness, recency', async () => {
    const rawHit = {
      index: 0,
      url: 'https://pib.gov.in/PressReleasePage.aspx?PRID=2048912',
      domain: 'pib.gov.in',
      title: 'Cabinet approves semiconductor incentive package',
      snippet: 'Union Cabinet chaired by Prime Minister approved the scheme.',
      relevanceScore: 92,
      publishedAt: new Date().toISOString()
    };

    const intel = evaluateSourceIntelligence(rawHit);

    assert.strictEqual(intel.domain, 'pib.gov.in');
    assert.strictEqual(intel.publication, 'Press Information Bureau (PIB)');
    assert.strictEqual(intel.rank, 1, 'Official government domain must be Rank 1');
    assert.strictEqual(intel.sourceType, 'OFFICIAL_GAZETTE');
    assert.strictEqual(intel.directness, 'PRIMARY_DIRECT');
    assert.strictEqual(intel.primarySecondaryStatus, 'PRIMARY');
    assert.ok(intel.authorityScore >= 98, 'PIB must receive >= 98 authority score');
    assert.strictEqual(intel.recency, 'BREAKING_NOW');
    assert.ok(intel.reasoning.includes('Rank 1'));
  });

  // ----------------------------------------------------------------
  // Test 2: Multi-Tier Authority Hierarchy
  // ----------------------------------------------------------------
  await runTest('2. Authority hierarchy (Rank 1 Gazette > Rank 2 Global Wire > Rank 3 Regional > Rank 4 Social)', async () => {
    const hits = [
      { domain: 'gazette.gov.in', title: 'Statutory Notification' },
      { domain: 'reuters.com', title: 'Reuters Market Report' },
      { domain: 'deccanherald.com', title: 'Regional City News' },
      { domain: 'x.com', title: 'Anonymous Post' }
    ];

    const evaluations = hits.map(evaluateSourceIntelligence);

    assert.strictEqual(evaluations[0].rank, 1, 'Gazette must be Rank 1');
    assert.strictEqual(evaluations[1].rank, 2, 'Reuters must be Rank 2');
    assert.strictEqual(evaluations[2].rank, 3, 'Regional must be Rank 3');
    assert.strictEqual(evaluations[3].rank, 4, 'Social must be Rank 4');

    assert.ok(evaluations[0].authorityScore > evaluations[1].authorityScore);
    assert.ok(evaluations[1].authorityScore > evaluations[2].authorityScore);
    assert.ok(evaluations[2].authorityScore > evaluations[3].authorityScore);
  });

  // ----------------------------------------------------------------
  // Test 3: Unverified Domain Protection (Do not assume trust based on name alone)
  // ----------------------------------------------------------------
  await runTest('3. Unknown domain claiming authoritative name is not blindly elevated', async () => {
    const fakeOutlet = {
      domain: 'official-national-news-portal-breaking.com',
      title: 'Official Gazette Bureau Report',
      snippet: 'We are the official source of government truth.'
    };

    const intel = evaluateSourceIntelligence(fakeOutlet);

    assert.strictEqual(intel.rank, 3, 'Unverified commercial TLD must remain Rank 3 general web');
    assert.strictEqual(intel.sourceType, 'GENERAL_WEB');
    assert.strictEqual(intel.authorityScore, 55.0, 'Unknown commercial domain receives default score 55');
  });

  // ----------------------------------------------------------------
  // Test 4: Workspace Custom Ranking Preferences Overrides
  // ----------------------------------------------------------------
  await runTest('4. Configurable workspace source preferences override system defaults', async () => {
    const customMap = new Map();
    customMap.set('specialist-lab.local', {
      name: 'Specialist Verification Lab',
      domain: 'specialist-lab.local',
      rank: 1,
      authorityScore: 96.0,
      sourceType: 'SPECIALIZED_DESK',
      purpose: 'Workspace verified forensic lab'
    });

    const hit = {
      domain: 'specialist-lab.local',
      title: 'Lab Authenticity Report'
    };

    const intel = evaluateSourceIntelligence(hit, customMap);

    assert.strictEqual(intel.isCustom, true, 'Should be flagged as custom configured source');
    assert.strictEqual(intel.rank, 1, 'Custom ranking should elevate to Rank 1');
    assert.strictEqual(intel.authorityScore, 96.0);
    assert.strictEqual(intel.sourcePurpose, 'Workspace verified forensic lab');
  });

  // ----------------------------------------------------------------
  // Test 5: Conflicting High-Authority vs Low-Authority Sources in Verification
  // ----------------------------------------------------------------
  await runTest('5. Conflicting evidence: High-authority Rank 1 gazette refutes low-authority Rank 4 blog rumour', async () => {
    const claim = {
      id: 'cl_conflicting_authority',
      text: 'Ministry announced immediate ban on export of non-basmati rice.',
      category: 'Trade Policy',
      entities: ['Ministry', 'non-basmati rice']
    };

    const mockSearchResults = [
      {
        index: 0,
        title: 'Ministry Gazette Notification: Rice Export Free and Unrestricted',
        snippet: 'Ministry official gazette notification explicitly denied and refuted reports of non-basmati rice export ban.',
        url: 'https://gazette.example.local/notifications/rice-trade',
        domain: 'gazette.gov.in' // Rank 1 Authority (100)
      },
      {
        index: 1,
        title: 'Rumours of rice ban circulate on social channels',
        snippet: 'Social feeds reported that Ministry announced immediate ban on export of non-basmati rice.',
        url: 'https://social.example.local/trader_alerts/123984',
        domain: 'x.com' // Rank 4 Authority (45)
      }
    ];

    const res = await verifyClaims([claim], { mockSearchResults });
    const verified = res[0];

    // High authority source correctly refutes the claim
    assert.strictEqual(verified.refutingSourceIndices.length, 1);
    assert.strictEqual(verified.sources[0].authorityRank, 1);
    assert.strictEqual(verified.sources[1].authorityRank, 4);
    assert.strictEqual(verified.sources[0].primarySecondaryStatus, 'PRIMARY');
    assert.strictEqual(verified.verdict, 'FALSE');
  });

  // ----------------------------------------------------------------
  // Test 6: Source Intelligence Ledger Derivation
  // ----------------------------------------------------------------
  await runTest('6. Source Intelligence Ledger exposes directory of ranked publications and verification counts', async () => {
    const ledger = await getSourceIntelligenceLedger();

    assert.ok(Array.isArray(ledger));
    assert.ok(ledger.length >= 10, 'Ledger should contain known publications directory');

    const pib = ledger.find(l => l.domain === 'pib.gov.in');
    assert.ok(pib, 'PIB must be listed in ledger');
    assert.strictEqual(pib.rank, 1);
    assert.strictEqual(pib.sourceType, 'OFFICIAL_GAZETTE');

    const reuters = ledger.find(l => l.domain === 'reuters.com');
    assert.ok(reuters, 'Reuters must be listed in ledger');
    assert.strictEqual(reuters.rank, 2);
    assert.strictEqual(reuters.sourceType, 'GLOBAL_WIRE');
  });

  console.log('\n================================================================');
  console.log(`🏆 STAGE 16 TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runStage16SourceIntelligenceTests();
