const assert = require('assert');
const { dbService } = require('../src/utils/prisma');

async function testReportDeletion() {
  console.log('====================================================');
  console.log('TESTING REPORT DELETION API & DATABASE INTEGRATION');
  console.log('====================================================');

  // 1. Create a dummy test user & analysis in DB
  const testEmail = `test_delete_${Date.now()}@example.com`;
  const user = await dbService.createUser({
    email: testEmail,
    passwordHash: 'dummy_hash',
    fullName: 'Test Delete User'
  });

  const { prisma } = require('../src/utils/prisma');
  const dummyAnalysis = await prisma.analysis.create({
    data: {
      id: `test_del_run_${Date.now()}`,
      userId: user.id,
      title: 'Temporary Test Report For Deletion',
      inputType: 'TEXT',
      inputSource: 'Direct Input',
      status: 'COMPLETED',
      selectedTypes: JSON.stringify(['CLAIM_DECOMPOSITION']),
      trustScore: 82,
      verdict: 'TRUSTED',
      reportData: JSON.stringify({ summary: 'Test delete summary' })
    }
  });

  console.log('\n[Test 1]: Created test report:', dummyAnalysis.id);

  // 2. Test deletion via dbService.deleteAnalysisById
  const deleted = await dbService.deleteAnalysisById(dummyAnalysis.id, user.id);
  assert.strictEqual(deleted, true, 'Report should be deleted successfully');
  console.log('✓ Report deleted successfully via dbService');

  // 3. Verify it is no longer found
  const lookup = await dbService.findAnalysisById(dummyAnalysis.id, user.id);
  assert.strictEqual(lookup, null, 'Deleted report should return null');
  console.log('✓ Verified report no longer exists in database');

  // 4. Test deleting non-existent ID
  const deleteAgain = await dbService.deleteAnalysisById(dummyAnalysis.id, user.id);
  assert.strictEqual(deleteAgain, false, 'Deleting non-existent report should return false');
  console.log('✓ Deleting non-existent ID handled properly');

  // Clean up user
  await prisma.workspace.deleteMany({ where: { ownerId: user.id } }).catch(() => {});
  await prisma.user.delete({ where: { id: user.id } }).catch(() => {});

  console.log('\n====================================================');
  console.log('ALL REPORT DELETION TESTS PASSED (3/3)');
  console.log('====================================================\n');
}

testReportDeletion().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
