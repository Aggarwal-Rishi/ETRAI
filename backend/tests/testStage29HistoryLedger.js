const assert = require('assert');
const {
  listVerificationHistory,
  exportHistoryToCsv,
  getUsageAndCostReport,
  reverifyExistingAnalysis
} = require('../src/services/historyLedgerService');
const { prisma, dbService } = require('../src/utils/prisma');

async function runStage29HistoryLedgerTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING STAGE 29: VERIFICATION HISTORY & LEDGER TEST SUITE');
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

  // Seed test tenant users and sample analysis records
  const userA = await dbService.createUser({
    email: `tenant_ledger_a_${Date.now()}@etrai.io`,
    passwordHash: '$2b$10$xyz',
    fullName: 'Ledger Analyst A',
    role: 'OWNER'
  });

  const userB = await dbService.createUser({
    email: `tenant_ledger_b_${Date.now()}@etrai.io`,
    passwordHash: '$2b$10$xyz',
    fullName: 'Ledger Analyst B',
    role: 'OWNER'
  });

  // Seed analyses for User A
  const analysis1 = await prisma.analysis.create({
    data: {
      id: `ana_hist_1_${Date.now()}`,
      userId: userA.id,
      title: 'Solar Energy Policy Notification',
      inputType: 'TEXT',
      inputSource: 'The Union Cabinet approved a ₹10,000 Cr package for the National Solar Mission to expand domestic rooftop solar infrastructure across all states.',
      selectedTypes: JSON.stringify(['FACT_CHECKING']),
      verdict: 'VERIFIED',
      trustScore: 92,
      tokensConsumed: 1200,
      costUsd: 0.0024,
      status: 'COMPLETED'
    }
  });

  const analysis2 = await prisma.analysis.create({
    data: {
      id: `ana_hist_2_${Date.now()}`,
      userId: userA.id,
      title: 'Breaking Viral Rumour on Tax Ban',
      inputType: 'URL',
      inputSource: 'https://rumour-blog.com/tax-ban',
      selectedTypes: JSON.stringify(['FAKE_NEWS_DETECTION']),
      verdict: 'FALSE',
      trustScore: 15,
      tokensConsumed: 850,
      costUsd: 0.0017,
      status: 'COMPLETED'
    }
  });

  // Seed analysis for User B
  await prisma.analysis.create({
    data: {
      id: `ana_hist_3_${Date.now()}`,
      userId: userB.id,
      title: 'Private Biotech Research Grant',
      inputType: 'FILE',
      inputSource: 'research_grant.pdf',
      selectedTypes: JSON.stringify(['FACT_CHECKING']),
      verdict: 'VERIFIED',
      trustScore: 88,
      tokensConsumed: 1500,
      costUsd: 0.0030,
      status: 'COMPLETED'
    }
  });

  // ----------------------------------------------------------------
  // Test 1: Strict Tenant Isolation
  // ----------------------------------------------------------------
  await runTest('1. Tenant Isolation: User A only sees their own analyses, completely isolated from User B', async () => {
    const resA = await listVerificationHistory(userA.id);
    const resB = await listVerificationHistory(userB.id);

    assert.strictEqual(resA.totalCount, 2);
    assert.strictEqual(resB.totalCount, 1);
    assert.ok(!resA.items.some(item => item.title === 'Private Biotech Research Grant'));
    assert.ok(resB.items.some(item => item.title === 'Private Biotech Research Grant'));
  });

  // ----------------------------------------------------------------
  // Test 2: Search & Multi-Attribute Filtering
  // ----------------------------------------------------------------
  await runTest('2. Filters history records by keyword search, verdict, and input type', async () => {
    // Search by title keyword
    const searchRes = await listVerificationHistory(userA.id, { search: 'Solar' });
    assert.strictEqual(searchRes.totalCount, 1);
    assert.strictEqual(searchRes.items[0].id, analysis1.id);

    // Filter by verdict FALSE
    const falseRes = await listVerificationHistory(userA.id, { verdict: 'FALSE' });
    assert.strictEqual(falseRes.totalCount, 1);
    assert.strictEqual(falseRes.items[0].id, analysis2.id);

    // Filter by inputType URL
    const urlRes = await listVerificationHistory(userA.id, { inputType: 'URL' });
    assert.strictEqual(urlRes.totalCount, 1);
    assert.strictEqual(urlRes.items[0].id, analysis2.id);
  });

  // ----------------------------------------------------------------
  // Test 3: Pagination and Custom Sorting
  // ----------------------------------------------------------------
  await runTest('3. Paginates and sorts history ledger records by trustScore and createdAt', async () => {
    // Sort by trustScore ascending (lowest first)
    const ascRes = await listVerificationHistory(userA.id, { sortBy: 'trustScore', sortOrder: 'asc' });
    assert.strictEqual(ascRes.items[0].trustScore, 15);
    assert.strictEqual(ascRes.items[1].trustScore, 92);

    // Pagination test (limit 1)
    const pageRes = await listVerificationHistory(userA.id, {}, { page: 1, limit: 1 });
    assert.strictEqual(pageRes.items.length, 1);
    assert.strictEqual(pageRes.totalPages, 2);
    assert.strictEqual(pageRes.hasMore, true);
  });

  // ----------------------------------------------------------------
  // Test 4: CSV Export Formatting
  // ----------------------------------------------------------------
  await runTest('4. exportHistoryToCsv generates valid RFC 4180 CSV with properly escaped columns', async () => {
    const csv = await exportHistoryToCsv(userA.id);

    assert.ok(csv.includes('Report ID,Title,Input Type,Verdict,Trust Score') || csv.includes('"Report ID"'));
    assert.ok(csv.includes('"Solar Energy Policy Notification"'));
    assert.ok(csv.includes('"VERIFIED"'));
    assert.ok(csv.includes('"FALSE"'));
  });

  // ----------------------------------------------------------------
  // Test 5: Cost & Token Usage Report
  // ----------------------------------------------------------------
  await runTest('5. Aggregates tokens consumed, cost in USD/INR, and run type breakdown', async () => {
    const ws = await prisma.workspace.findFirst({ where: { ownerId: userA.id } });

    // Record usage entries
    await prisma.usageRecord.create({
      data: {
        workspaceId: ws?.id || 'ws_default',
        userId: userA.id,
        tokensConsumed: 1200,
        costUsd: 0.0024,
        runType: 'VERIFICATION'
      }
    });

    await prisma.usageRecord.create({
      data: {
        workspaceId: ws?.id || 'ws_default',
        userId: userA.id,
        tokensConsumed: 800,
        costUsd: 0.0016,
        runType: 'RE_VERIFY'
      }
    });

    const usageReport = await getUsageAndCostReport(userA.id);

    assert.strictEqual(usageReport.totalRuns, 2);
    assert.strictEqual(usageReport.totalTokensConsumed, 2000);
    assert.strictEqual(usageReport.totalCostUsd, 0.004);
    assert.strictEqual(usageReport.runTypeBreakdown.VERIFICATION, 1);
    assert.strictEqual(usageReport.runTypeBreakdown.RE_VERIFY, 1);
  });

  // ----------------------------------------------------------------
  // Test 6: Real Pipeline Re-Verification
  // ----------------------------------------------------------------
  await runTest('6. reverifyExistingAnalysis executes real verification pipeline and increments runVersion', async () => {
    const reverifyRes = await reverifyExistingAnalysis(analysis1.id, userA.id);

    assert.ok(reverifyRes.reverificationJobId.startsWith('reverify_'));
    assert.strictEqual(reverifyRes.originalAnalysisId, analysis1.id);
    assert.ok(reverifyRes.reportData);

    // Verify runVersion incremented
    const updated = await prisma.analysis.findUnique({ where: { id: analysis1.id } });
    assert.strictEqual(updated.runVersion, 2);
  });

  // Cleanup test records
  await prisma.analysis.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });

  console.log('\n================================================================');
  console.log(`🏆 STAGE 29 TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runStage29HistoryLedgerTests();
