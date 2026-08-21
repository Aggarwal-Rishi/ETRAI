const assert = require('assert');
const { analyzeContentProvenance, extractTimestamp, formatTimeLabel, detectModifications } = require('../src/services/provenanceEngine');
const { generateReport } = require('../src/services/reportGenerator');
const { prisma, dbService } = require('../src/utils/prisma');

async function runStage17ContentProvenanceTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING STAGE 17: CONTENT PROVENANCE INTELLIGENCE TEST SUITE');
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
  // Test 1: Chronological Timeline & Timestamp Sorting
  // ----------------------------------------------------------------
  await runTest('1. Earliest discoverable appearance & chronological sorting across timestamps', async () => {
    const rawSources = [
      {
        url: 'https://thehindu.com/news/national/article123.html',
        domain: 'thehindu.com',
        title: 'Morning Broadcast: Policy initiative announced',
        publishedAt: '2026-08-19T06:30:00Z',
        authorityRank: 2,
        stance: 'SUPPORTS'
      },
      {
        url: 'https://pib.gov.in/PressReleasePage.aspx?PRID=111',
        domain: 'pib.gov.in',
        title: 'Statutory Press Release: Official Gazetted Scheme',
        publishedAt: '2026-08-19T04:15:00Z',
        authorityRank: 1,
        stance: 'SUPPORTS'
      },
      {
        url: 'https://x.com/viral_alerts/status/987',
        domain: 'x.com',
        title: 'Viral discussion on new scheme',
        publishedAt: '2026-08-19T08:45:00Z',
        authorityRank: 4,
        sourceType: 'SOCIAL_MEDIA',
        stance: 'SUPPORTS'
      }
    ];

    const res = analyzeContentProvenance({ sources: rawSources });

    assert.strictEqual(res.timeline.length, 3);
    assert.strictEqual(res.timeline[0].domain, 'pib.gov.in', 'Earliest timestamp (04:15) must be sequenceIndex 1');
    assert.strictEqual(res.timeline[1].domain, 'thehindu.com', 'Second timestamp (06:30) must be sequenceIndex 2');
    assert.strictEqual(res.timeline[2].domain, 'x.com', 'Latest timestamp (08:45) must be sequenceIndex 3');
    assert.strictEqual(res.timeline[0].sequenceIndex, 1);
  });

  // ----------------------------------------------------------------
  // Test 2: Origin Status Classification (CONFIRMED vs PROBABLE vs EARLIEST vs UNKNOWN)
  // ----------------------------------------------------------------
  await runTest('2. Origin confidence distinguishing CONFIRMED, PROBABLE, EARLIEST_DISCOVERED, UNKNOWN', async () => {
    // Scenario A: Confirmed Origin (Official Government Gazette)
    const confirmedSources = [
      { domain: 'pib.gov.in', authorityRank: 1, stance: 'SUPPORTS', publishedAt: '2026-08-19T05:00:00Z' }
    ];
    const resA = analyzeContentProvenance({ sources: confirmedSources });
    assert.strictEqual(resA.originAnalysis.originStatus, 'CONFIRMED_ORIGIN');
    assert.ok(resA.originAnalysis.originConfidence >= 90);

    // Scenario B: Probable Origin (Major Newsroom of Record)
    const probableSources = [
      { domain: 'reuters.com', authorityRank: 2, stance: 'SUPPORTS', publishedAt: '2026-08-19T05:00:00Z' }
    ];
    const resB = analyzeContentProvenance({ sources: probableSources });
    assert.strictEqual(resB.originAnalysis.originStatus, 'PROBABLE_ORIGIN');
    assert.ok(resB.originAnalysis.originConfidence >= 75);

    // Scenario C: Earliest Discovered Source (General web / unranked blog)
    const earliestSources = [
      { domain: 'unranked-blog.xyz', authorityRank: 3, stance: 'SUPPORTS', publishedAt: '2026-08-19T05:00:00Z' }
    ];
    const resC = analyzeContentProvenance({ sources: earliestSources });
    assert.strictEqual(resC.originAnalysis.originStatus, 'EARLIEST_DISCOVERED_SOURCE');

    // Scenario D: Unknown Origin (Zero discoverable evidence)
    const resD = analyzeContentProvenance({ sources: [] });
    assert.strictEqual(resD.originAnalysis.originStatus, 'UNKNOWN_ORIGIN');
  });

  // ----------------------------------------------------------------
  // Test 3: Do Not Claim Origin Unless Supported By Evidence
  // ----------------------------------------------------------------
  await runTest('3. Refuses to claim origin when zero supporting evidence is available', async () => {
    const emptyProvenance = analyzeContentProvenance({
      claims: [{ text: 'Unsubstantiated anonymous rumour' }],
      sources: []
    });

    assert.strictEqual(emptyProvenance.originAnalysis.originStatus, 'UNKNOWN_ORIGIN');
    assert.strictEqual(emptyProvenance.originAnalysis.originPublisher, 'Unknown');
    assert.strictEqual(emptyProvenance.timeline.length, 0);
  });

  // ----------------------------------------------------------------
  // Test 4: Syndication Duplicates & Modification Detection
  // ----------------------------------------------------------------
  await runTest('4. Detects modifications, burned-in overlays, and syndicated copies in propagation timeline', async () => {
    const propagationSources = [
      {
        domain: 'apnews.com',
        title: 'Summit concludes with joint security declaration',
        authorityRank: 2,
        isSyndicatedDuplicate: false,
        publishedAt: '2026-08-19T02:00:00Z'
      },
      {
        domain: 'viral-portal.net',
        title: 'Altered headline: Sensationalized leak from summit',
        snippet: 'A circulating video with burned-in watermark and altered text appeared on channels.',
        authorityRank: 4,
        isSyndicatedDuplicate: true,
        publishedAt: '2026-08-19T04:00:00Z'
      }
    ];

    const res = analyzeContentProvenance({ sources: propagationSources });

    assert.strictEqual(res.propagationMetrics.syndicatedCopyCount, 1);
    assert.strictEqual(res.propagationMetrics.modifiedCopyCount, 1);
    assert.ok(res.timeline[1].hasModifications);
    assert.ok(res.timeline[1].modifications[0].includes('Burned-in visual overlay'));
  });

  // ----------------------------------------------------------------
  // Test 5: Report Integration with Full Provenance Analysis
  // ----------------------------------------------------------------
  await runTest('5. Report generator embeds Content Provenance Intelligence object seamlessly', async () => {
    const verifiedClaims = [
      {
        id: 'claim_1',
        text: 'Cabinet approves semiconductor incentive scheme.',
        verdict: 'VERIFIED',
        status: 'TRUSTED',
        confidence: 96,
        sources: [
          {
            url: 'https://pib.gov.in/PressReleasePage.aspx?PRID=999',
            domain: 'pib.gov.in',
            publication: 'Press Information Bureau (PIB)',
            authorityRank: 1,
            stance: 'SUPPORTS',
            publishedAt: '2026-08-19T04:00:00Z'
          }
        ]
      }
    ];

    const report = await generateReport({
      sourceTitle: 'Semiconductor Cabinet Approval',
      extractedText: 'Cabinet approves semiconductor incentive scheme.',
      verifiedClaims,
      selectedTypes: ['FACT_CHECKING']
    });

    assert.ok(report.provenance, 'Report must contain provenance object');
    assert.strictEqual(report.provenance.originAnalysis.originStatus, 'CONFIRMED_ORIGIN');
    assert.strictEqual(report.provenance.timeline.length, 1);
    assert.strictEqual(report.provenance.timeline[0].publisher, 'Press Information Bureau (PIB)');
  });

  // ----------------------------------------------------------------
  // Test 6: Database Persistence of Provenance Events
  // ----------------------------------------------------------------
  await runTest('6. Provenance events persist into relational Prisma models with sequence ordering', async () => {
    const testUser = await dbService.createUser({
      email: `prov_user_${Date.now()}@etrai.local`,
      passwordHash: 'hashed_pw',
      name: 'Provenance Test User'
    });

    const workspace = await dbService.getWorkspaceForUser(testUser.id);

    const analysis = await prisma.analysis.create({
      data: {
        id: `prov_job_${Date.now()}`,
        userId: testUser.id,
        workspaceId: workspace.id,
        title: 'Provenance Persistence Verification Run',
        inputType: 'TEXT',
        inputSource: 'Verified press release',
        selectedTypes: JSON.stringify(['FACT_CHECKING']),
        summary: 'Verified scheme origin',
        provenance: {
          create: [
            {
              timeLabel: '04:00 UTC · Aug 19, 2026',
              platform: 'Official Gazette / Portal',
              description: 'Earliest authoritative origin published by PIB.',
              status: 'VERIFIED',
              sequenceIndex: 1
            },
            {
              timeLabel: '06:00 UTC · Aug 19, 2026',
              platform: 'Newsroom Broadcast',
              description: 'The Hindu published report regarding claim.',
              status: 'VERIFIED',
              sequenceIndex: 2
            }
          ]
        }
      }
    });

    const retrieved = await dbService.findAnalysisById(analysis.id, testUser.id);
    assert.ok(retrieved, 'Retrieved analysis record must exist');
    assert.strictEqual(retrieved.provenance.length, 2);
    assert.strictEqual(retrieved.provenance[0].sequenceIndex, 1);
    assert.strictEqual(retrieved.provenance[0].status, 'VERIFIED');
    assert.strictEqual(retrieved.provenance[1].sequenceIndex, 2);

    // Clean up
    await dbService.deleteAnalysisById(analysis.id, testUser.id);
    await prisma.user.delete({ where: { id: testUser.id } });
  });

  console.log('\n================================================================');
  console.log(`🏆 STAGE 17 TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runStage17ContentProvenanceTests();
