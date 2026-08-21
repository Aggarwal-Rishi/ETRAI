const assert = require('assert');
const { getFakeNewsFeed, getDailyFakeNewsDigest, deriveSuspiciousReasoning, clusterNarratives } = require('../src/services/fakeNewsDesk');
const { prisma, dbService } = require('../src/utils/prisma');

async function runStage19FakeNewsDeskTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING STAGE 19: FAKE NEWS DESK TEST SUITE');
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

  // Setup mock database analyses for tests
  const testUser = await dbService.createUser({
    email: `fakenews_test_${Date.now()}@etrai.local`,
    passwordHash: 'hashed_pw',
    name: 'Fake News Tester'
  });
  const workspace = await dbService.getWorkspaceForUser(testUser.id);

  // Analysis 1: Direct Contradiction (FABRICATED / FALSE)
  const analysis1 = await prisma.analysis.create({
    data: {
      id: `fake_analysis_1_${Date.now()}`,
      userId: testUser.id,
      workspaceId: workspace.id,
      title: 'Emergency Non-Basmati Rice Export Ban Imposed',
      inputType: 'URL',
      inputSource: 'https://viral-rumour.local/rice-ban',
      selectedTypes: JSON.stringify(['FAKE_NEWS_DETECTION']),
      status: 'COMPLETED',
      verdict: 'FALSE',
      trustScore: 18.0,
      summary: 'Statutory gazette confirms export remains unrestricted; ban report is fabricated.',
      claims: {
        create: [
          {
            id: `claim_fn_1_${Date.now()}`,
            claimText: 'Ministry announced immediate ban on non-basmati rice exports.',
            verdict: 'FALSE',
            status: 'FABRICATED',
            confidence: 94.0,
            reasoning: 'Official gazette notification refuted ban claim.',
            evidenceItems: {
              create: [
                {
                  sourceIndex: 0,
                  url: 'https://gazette.gov.in/notices/rice',
                  domain: 'gazette.gov.in',
                  title: 'Ministry Official Gazette',
                  snippet: 'Ministry explicitly refuted rumours of export ban.',
                  stance: 'REFUTES',
                  authorityRank: 1,
                  authorityScore: 99.0
                }
              ]
            }
          }
        ]
      }
    }
  });

  // Analysis 2: Scale/Scope Mismatch (PARTIALLY_VERIFIED)
  const analysis2 = await prisma.analysis.create({
    data: {
      id: `fake_analysis_2_${Date.now()}`,
      userId: testUser.id,
      workspaceId: workspace.id,
      title: 'State Foundry Secures ₹500000 Cr Investment',
      inputType: 'TEXT',
      inputSource: 'Circulating WhatsApp forward',
      selectedTypes: JSON.stringify(['FACT_CHECKING']),
      status: 'COMPLETED',
      verdict: 'PARTIALLY_VERIFIED',
      trustScore: 48.0,
      summary: 'Investment authentic but scale inflated by 10x from actual ₹50,000 Cr.',
      claims: {
        create: [
          {
            id: `claim_fn_2_${Date.now()}`,
            claimText: 'State foundry secured ₹500,000 Cr investment.',
            verdict: 'PARTIALLY_VERIFIED',
            status: 'SUSPICIOUS',
            confidence: 50.0,
            reasoning: 'Verified investment is ₹50,000 Cr, not ₹500,000 Cr.',
            evidenceItems: {
              create: [
                {
                  sourceIndex: 0,
                  url: 'https://newsroom.local/foundry',
                  domain: 'newsroom.local',
                  title: 'State Foundry Details',
                  snippet: 'Investment package confirmed at ₹50,000 Cr.',
                  stance: 'SUPPORTS',
                  authorityRank: 2,
                  authorityScore: 82.0
                }
              ]
            }
          }
        ]
      }
    }
  });

  // ----------------------------------------------------------------
  // Test 1: Suspicious Article Discovery & Classification
  // ----------------------------------------------------------------
  await runTest('1. Suspicious feed retrieves fabricated and partially verified items with reasoning', async () => {
    const feed = await getFakeNewsFeed({ pageSize: 10 });
    assert.ok(feed.items.length >= 2, 'Feed must contain created test analyses');

    const fabricatedItem = feed.items.find(i => i.id === analysis1.id);
    assert.ok(fabricatedItem);
    assert.strictEqual(fabricatedItem.verdict, 'FALSE');
    assert.strictEqual(fabricatedItem.status, 'FABRICATED');
    assert.strictEqual(fabricatedItem.contradictionType, 'DIRECT_FACTUAL_CONTRADICTION');
    assert.strictEqual(fabricatedItem.refutingCount, 1);

    const partialItem = feed.items.find(i => i.id === analysis2.id);
    assert.ok(partialItem);
    assert.strictEqual(partialItem.verdict, 'PARTIALLY_VERIFIED');
    assert.strictEqual(partialItem.contradictionType, 'SCALE_OR_SCOPE_MISMATCH');
  });

  // ----------------------------------------------------------------
  // Test 2: Risk Level Filtering
  // ----------------------------------------------------------------
  await runTest('2. Filtering by riskLevel correctly isolates FABRICATED vs PARTIALLY_VERIFIED', async () => {
    const fabricatedOnly = await getFakeNewsFeed({ riskLevel: 'FABRICATED' });
    assert.ok(fabricatedOnly.items.every(i => i.verdict === 'FALSE'));

    const partialOnly = await getFakeNewsFeed({ riskLevel: 'PARTIALLY_VERIFIED' });
    assert.ok(partialOnly.items.every(i => i.verdict === 'PARTIALLY_VERIFIED'));
  });

  // ----------------------------------------------------------------
  // Test 3: Narrative Clustering
  // ----------------------------------------------------------------
  await runTest('3. Clusters related suspicious stories around shared topics and velocity trends', async () => {
    const mockItems = [
      { id: '1', title: 'Rice export ban circular leaked online', category: 'Trade', verdict: 'FALSE' },
      { id: '2', title: 'Rice export ban gazette rumours intensify', category: 'Trade', verdict: 'FALSE' },
      { id: '3', title: 'Foundry investment package ₹500000 Cr claim', category: 'Economy', verdict: 'PARTIALLY_VERIFIED' }
    ];

    const clusters = clusterNarratives(mockItems);
    assert.ok(clusters.length >= 2);

    const riceCluster = clusters.find(c => c.name.toLowerCase().includes('rice'));
    assert.ok(riceCluster, 'Rice narrative cluster must be created');
    assert.strictEqual(riceCluster.itemsCount, 2);
    assert.strictEqual(riceCluster.confirmedDebunksCount, 2);
  });

  // ----------------------------------------------------------------
  // Test 4: Daily Intelligence Digest
  // ----------------------------------------------------------------
  await runTest('4. Generates daily intelligence digest with summary statistics and high-impact debunks', async () => {
    const digest = await getDailyFakeNewsDigest();

    assert.ok(digest.summaryStats);
    assert.ok(digest.summaryStats.totalSuspiciousIdentified >= 2);
    assert.ok(digest.summaryStats.confirmedDebunkedCount >= 1);
    assert.ok(digest.topImpactDebunk);
    assert.strictEqual(digest.topImpactDebunk.verdict, 'FALSE');
    assert.strictEqual(digest.topImpactDebunk.contradictionType, 'DIRECT_FACTUAL_CONTRADICTION');
  });

  // ----------------------------------------------------------------
  // Test 5: Independent Contradiction Requirement
  // ----------------------------------------------------------------
  await runTest('5. Independent contradiction requirement ensures absence of evidence is not marked fabricated', async () => {
    const unverifiedAnalysis = {
      verdict: 'UNVERIFIED',
      trustScore: 40.0,
      claims: [
        {
          claimText: 'Unrecorded private conversation took place yesterday.',
          verdict: 'UNVERIFIED',
          supportingSourceIndices: [],
          refutingSourceIndices: []
        }
      ]
    };

    const reasoning = deriveSuspiciousReasoning(unverifiedAnalysis);
    assert.strictEqual(reasoning.contradictionType, 'UNSUBSTANTIATED_VIRAL_CLAIM');
    assert.strictEqual(reasoning.refutingClaimsCount, 0);
  });

  // Clean up
  await dbService.deleteAnalysisById(analysis1.id, testUser.id);
  await dbService.deleteAnalysisById(analysis2.id, testUser.id);
  await prisma.user.delete({ where: { id: testUser.id } });

  console.log('\n================================================================');
  console.log(`🏆 STAGE 19 TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runStage19FakeNewsDeskTests();
