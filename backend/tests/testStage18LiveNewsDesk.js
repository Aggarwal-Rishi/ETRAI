const assert = require('assert');
const { fetchLiveNews, CATEGORY_QUERIES } = require('../src/services/liveNewsDesk');
const { prisma, dbService } = require('../src/utils/prisma');

async function runStage18LiveNewsDeskTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING STAGE 18: LIVE NEWS DESK TEST SUITE');
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
  // Test 1: Real Live News Retrieval & Source Intelligence Enrichment
  // ----------------------------------------------------------------
  await runTest('1. News feed retrieval enriches articles with source intelligence and authority ranks', async () => {
    const mockNewsHits = [
      {
        title: 'Cabinet approves comprehensive clean energy roadmap',
        link: 'https://pib.gov.in/PressReleasePage.aspx?PRID=448102',
        snippet: 'Cabinet committee cleared the national solar and battery initiative.',
        source: 'Press Information Bureau (PIB)',
        date: '2 hours ago',
        imageUrl: 'https://pib.gov.in/media/clean_energy.jpg'
      },
      {
        title: 'Markets rally following industrial production index growth',
        link: 'https://reuters.com/markets/asia/india-industrial-output-growth.html',
        snippet: 'Industrial output climbed 5.8% year on year.',
        source: 'Reuters',
        date: '4 hours ago'
      }
    ];

    const res = await fetchLiveNews({ mockNews: mockNewsHits });

    assert.strictEqual(res.items.length, 2);
    assert.strictEqual(res.items[0].authorityRank, 1, 'PIB must evaluate to Rank 1 authority');
    assert.strictEqual(res.items[0].mediaType, 'Image');
    assert.strictEqual(res.items[0].status, 'UNVERIFIED', 'Fresh incoming news starts as UNVERIFIED');
    assert.strictEqual(res.items[1].authorityRank, 2, 'Reuters must evaluate to Rank 2 authority');
    assert.strictEqual(res.items[1].mediaType, 'Text');
  });

  // ----------------------------------------------------------------
  // Test 2: Category & Topic Filtering
  // ----------------------------------------------------------------
  await runTest('2. Category queries map properly across National, Business, Tech, Health, Science', async () => {
    assert.ok(CATEGORY_QUERIES.National.includes('national'));
    assert.ok(CATEGORY_QUERIES.Business.includes('business'));
    assert.ok(CATEGORY_QUERIES.Technology.includes('technology'));
    assert.ok(CATEGORY_QUERIES.Health.includes('health'));
    assert.ok(CATEGORY_QUERIES.Science.includes('science'));
  });

  // ----------------------------------------------------------------
  // Test 3: Media Type Filtering
  // ----------------------------------------------------------------
  await runTest('3. Media filtering separates articles with visual assets from text-only stories', async () => {
    const mockArticles = [
      { title: 'Story with Photo', link: 'https://news1.local/story1', imageUrl: 'https://img.local/1.jpg' },
      { title: 'Text Only Wire', link: 'https://news2.local/story2' },
      { title: 'Second Video Report', link: 'https://news3.local/story3', image: 'https://img.local/3.jpg' }
    ];

    const imageOnly = await fetchLiveNews({ mockNews: mockArticles, mediaType: 'Image' });
    assert.strictEqual(imageOnly.items.length, 2);
    assert.ok(imageOnly.items.every(a => a.mediaType === 'Image'));

    const textOnly = await fetchLiveNews({ mockNews: mockArticles, mediaType: 'Text' });
    assert.strictEqual(textOnly.items.length, 1);
    assert.strictEqual(textOnly.items[0].mediaType, 'Text');
  });

  // ----------------------------------------------------------------
  // Test 4: Pagination & Infinite Loading State
  // ----------------------------------------------------------------
  await runTest('4. Pagination partitions live news into pages with total count and hasMore flag', async () => {
    const mockFeed = Array.from({ length: 25 }, (_, i) => ({
      title: `Live Breaking Update Headline ${i + 1}`,
      link: `https://newsroom.local/articles/${i + 1}`,
      snippet: `Summary of news update item number ${i + 1}`
    }));

    const page1 = await fetchLiveNews({ mockNews: mockFeed, page: 1, pageSize: 10 });
    assert.strictEqual(page1.items.length, 10);
    assert.strictEqual(page1.total, 25);
    assert.strictEqual(page1.hasMore, true);
    assert.strictEqual(page1.page, 1);

    const page3 = await fetchLiveNews({ mockNews: mockFeed, page: 3, pageSize: 10 });
    assert.strictEqual(page3.items.length, 5);
    assert.strictEqual(page3.hasMore, false);
  });

  // ----------------------------------------------------------------
  // Test 5: Syndicated Wire Deduplication
  // ----------------------------------------------------------------
  await runTest('5. Deduplication eliminates redundant copies of identical syndicated stories', async () => {
    const duplicatedFeed = [
      {
        title: 'Central bank leaves benchmark repo rate unchanged at 6.50 percent',
        link: 'https://outlet-a.local/repo-rate-decision',
        source: 'Outlet A'
      },
      {
        title: 'Central bank leaves benchmark repo rate unchanged at 6.50 percent',
        link: 'https://outlet-b.local/repo-rate-decision-copy',
        source: 'Outlet B'
      },
      {
        title: 'Completely different story on aerospace mission launch',
        link: 'https://outlet-c.local/space-mission',
        source: 'Outlet C'
      }
    ];

    const res = await fetchLiveNews({ mockNews: duplicatedFeed });
    assert.strictEqual(res.items.length, 2, 'Duplicate repo rate story must be consolidated');
  });

  // ----------------------------------------------------------------
  // Test 6: Verification Status Cross-Referencing
  // ----------------------------------------------------------------
  await runTest('6. News item cross-references existing ETRAI verification analysis from database', async () => {
    const testUser = await dbService.createUser({
      email: `news_tester_${Date.now()}@etrai.local`,
      passwordHash: 'hashed_pw',
      name: 'News Desk Tester'
    });

    const workspace = await dbService.getWorkspaceForUser(testUser.id);
    const verifiedUrl = `https://gazette.example.local/verified-order-${Date.now()}`;

    // Create a verified analysis in database
    const analysis = await prisma.analysis.create({
      data: {
        id: `news_job_${Date.now()}`,
        userId: testUser.id,
        workspaceId: workspace.id,
        title: 'Statutory Gazette Order Verification',
        inputType: 'URL',
        inputSource: verifiedUrl,
        selectedTypes: JSON.stringify(['FACT_CHECKING']),
        status: 'COMPLETED',
        verdict: 'VERIFIED',
        trustScore: 94.0,
        summary: 'Order authentic and gazetted.'
      }
    });

    const mockLiveNews = [
      {
        title: 'Statutory Gazette Order Released Today',
        link: verifiedUrl,
        source: 'Official Gazette',
        snippet: 'Official notification gazetted.'
      }
    ];

    const res = await fetchLiveNews({ mockNews: mockLiveNews });
    assert.strictEqual(res.items.length, 1);
    assert.strictEqual(res.items[0].status, 'VERIFIED', 'Article matching verified URL must reflect VERIFIED status');
    assert.strictEqual(res.items[0].trustScore, 94.0);
    assert.strictEqual(res.items[0].analysisId, analysis.id);

    // Clean up
    await dbService.deleteAnalysisById(analysis.id, testUser.id);
    await prisma.user.delete({ where: { id: testUser.id } });
  });

  console.log('\n================================================================');
  console.log(`🏆 STAGE 18 TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runStage18LiveNewsDeskTests();
