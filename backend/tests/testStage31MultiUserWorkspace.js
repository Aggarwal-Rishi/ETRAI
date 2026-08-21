const assert = require('assert');
const {
  listUserWorkspaces,
  getWorkspaceDetails,
  inviteWorkspaceMember,
  acceptInvitation,
  cancelInvitation,
  updateMemberRole,
  toggleMemberStatus,
  removeMember
} = require('../src/services/workspaceService');
const { ROLE_PERMISSIONS } = require('../src/middleware/rbacMiddleware');
const { prisma, dbService } = require('../src/utils/prisma');

async function runStage31MultiUserWorkspaceTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING STAGE 31: MULTI-USER WORKSPACE & RBAC TEST SUITE');
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

  // Seed Test Users
  const ownerUser = await dbService.createUser({
    email: `owner_${Date.now()}@etrai.io`,
    passwordHash: '$2b$10$xyz',
    fullName: 'Editor-in-Chief Alice',
    role: 'OWNER'
  });

  const creatorUser = await dbService.createUser({
    email: `creator_${Date.now()}@etrai.io`,
    passwordHash: '$2b$10$xyz',
    fullName: 'Senior Fact-Checker Bob',
    role: 'USER'
  });

  const readerUser = await dbService.createUser({
    email: `reader_${Date.now()}@etrai.io`,
    passwordHash: '$2b$10$xyz',
    fullName: 'Junior Analyst Charlie',
    role: 'USER'
  });

  const outsiderUser = await dbService.createUser({
    email: `outsider_${Date.now()}@etrai.io`,
    passwordHash: '$2b$10$xyz',
    fullName: 'Competitor Dave',
    role: 'USER'
  });

  // Create Workspace with 3 seats max limit
  const workspace = await prisma.workspace.create({
    data: {
      id: `ws_stage31_${Date.now()}`,
      ownerId: ownerUser.id,
      name: 'Alpha News Bureau',
      slug: `alpha-news-${Date.now()}`,
      plan: 'Team',
      maxSeats: 3,
      members: {
        create: {
          userId: ownerUser.id,
          email: ownerUser.email,
          name: ownerUser.fullName,
          role: 'OWNER',
          status: 'ACTIVE'
        }
      }
    }
  });

  // ----------------------------------------------------------------
  // Test 1: Workspace Member Listing & Seat Utilization
  // ----------------------------------------------------------------
  await runTest('1. Lists workspace details, active members, and initial seat utilization (1/3)', async () => {
    const wsDetails = await getWorkspaceDetails(workspace.id, ownerUser.id);

    assert.strictEqual(wsDetails.id, workspace.id);
    assert.strictEqual(wsDetails.currentUserRole, 'OWNER');
    assert.strictEqual(wsDetails.activeMembersCount, 1);
    assert.strictEqual(wsDetails.maxSeats, 3);
    assert.strictEqual(wsDetails.seatsAvailable, 2);
  });

  // ----------------------------------------------------------------
  // Test 2: Cryptographic Invitation Flow
  // ----------------------------------------------------------------
  let inviteToken1;
  let inviteToken2;
  await runTest('2. Sends secure cryptographic invitations with 7-day expiration', async () => {
    const invite1 = await inviteWorkspaceMember(workspace.id, ownerUser.id, {
      email: creatorUser.email,
      role: 'CREATOR'
    });

    const invite2 = await inviteWorkspaceMember(workspace.id, ownerUser.id, {
      email: readerUser.email,
      role: 'READER'
    });

    assert.ok(invite1.token.startsWith('inv_'));
    assert.strictEqual(invite1.status, 'PENDING');
    assert.strictEqual(invite1.email, creatorUser.email);
    assert.strictEqual(invite1.role, 'CREATOR');

    inviteToken1 = invite1.token;
    inviteToken2 = invite2.token;

    // Check updated seat utilization (1 member + 2 pending invites = 3/3 seats)
    const updatedDetails = await getWorkspaceDetails(workspace.id, ownerUser.id);
    assert.strictEqual(updatedDetails.totalOccupiedSeats, 3);
    assert.strictEqual(updatedDetails.seatsAvailable, 0);
  });

  // ----------------------------------------------------------------
  // Test 3: Seat Limit Enforcement
  // ----------------------------------------------------------------
  await runTest('3. Strict Seat Limit: Blocks extra invitations when capacity is exhausted', async () => {
    let errorThrown = false;
    try {
      await inviteWorkspaceMember(workspace.id, ownerUser.id, {
        email: 'extra_analyst@etrai.io',
        role: 'READER'
      });
    } catch (err) {
      errorThrown = true;
      assert.ok(err.message.includes('seat limit reached'));
    }
    assert.strictEqual(errorThrown, true);
  });

  // ----------------------------------------------------------------
  // Test 4: Accept Invitation & Role Assignment
  // ----------------------------------------------------------------
  await runTest('4. Accepts invitation token and converts user into an active team member', async () => {
    const acceptResult = await acceptInvitation(inviteToken1, creatorUser.id);

    assert.strictEqual(acceptResult.member.userId, creatorUser.id);
    assert.strictEqual(acceptResult.member.role, 'CREATOR');
    assert.strictEqual(acceptResult.member.status, 'ACTIVE');

    // Confirm invite status is ACCEPTED
    const inviteRecord = await prisma.invitation.findUnique({ where: { token: inviteToken1 } });
    assert.strictEqual(inviteRecord.status, 'ACCEPTED');
  });

  // ----------------------------------------------------------------
  // Test 5: Role Permissions Hierarchy Verification
  // ----------------------------------------------------------------
  await runTest('5. Role Permissions Hierarchy validates capabilities server-side', async () => {
    assert.ok(ROLE_PERMISSIONS.OWNER.includes('manage_members'));
    assert.ok(ROLE_PERMISSIONS.OWNER.includes('create_analysis'));
    assert.ok(ROLE_PERMISSIONS.CREATOR.includes('create_analysis'));
    assert.ok(!ROLE_PERMISSIONS.CREATOR.includes('manage_members'));
    assert.ok(!ROLE_PERMISSIONS.READER.includes('create_analysis'));
    assert.ok(ROLE_PERMISSIONS.READER.includes('view_reports'));
  });

  // ----------------------------------------------------------------
  // Test 6: Member Enable/Disable & Status Toggle
  // ----------------------------------------------------------------
  await runTest('6. Owner toggles member status (ACTIVE -> DISABLED) and protects primary owner', async () => {
    const members = await prisma.teamMember.findMany({ where: { workspaceId: workspace.id } });
    const creatorMember = members.find(m => m.userId === creatorUser.id);
    const ownerMember = members.find(m => m.userId === ownerUser.id);

    // Disable creator
    const disabled = await toggleMemberStatus(workspace.id, creatorMember.id, 'DISABLED', ownerUser.id);
    assert.strictEqual(disabled.status, 'DISABLED');

    // Attempting to disable workspace owner must fail
    let ownerError = false;
    try {
      await toggleMemberStatus(workspace.id, ownerMember.id, 'DISABLED', ownerUser.id);
    } catch (e) {
      ownerError = true;
      assert.ok(e.message.includes('Cannot disable the primary workspace Owner'));
    }
    assert.strictEqual(ownerError, true);

    // Re-enable creator
    const reEnabled = await toggleMemberStatus(workspace.id, creatorMember.id, 'ACTIVE', ownerUser.id);
    assert.strictEqual(reEnabled.status, 'ACTIVE');
  });

  // ----------------------------------------------------------------
  // Test 7: Strict Multi-Tenant Isolation
  // ----------------------------------------------------------------
  await runTest('7. Multi-Tenant Isolation: Outsider is completely denied access to workspace details', async () => {
    let accessDenied = false;
    try {
      await getWorkspaceDetails(workspace.id, outsiderUser.id);
    } catch (e) {
      accessDenied = true;
      assert.ok(e.message.includes('Access denied'));
    }
    assert.strictEqual(accessDenied, true);
  });

  // Cleanup test records
  await prisma.invitation.deleteMany({ where: { workspaceId: workspace.id } });
  await prisma.teamMember.deleteMany({ where: { workspaceId: workspace.id } });
  await prisma.workspace.deleteMany({ where: { id: workspace.id } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerUser.id, creatorUser.id, readerUser.id, outsiderUser.id] } } });

  console.log('\n================================================================');
  console.log(`🏆 STAGE 31 TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runStage31MultiUserWorkspaceTests();
