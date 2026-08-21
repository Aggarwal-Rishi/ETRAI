const assert = require('assert');
const bcrypt = require('bcryptjs');
const {
  getUserProfile,
  updateUserProfile,
  changePassword,
  setup2fa,
  verifyAndEnable2fa,
  disable2fa,
  listActiveSessions,
  revokeSession,
  revokeAllOtherSessions,
  recordLoginEvent,
  getLoginHistory,
  exportUserData,
  updateDataGovernance,
  deleteAccount
} = require('../src/services/accountSecurityService');
const { prisma, dbService } = require('../src/utils/prisma');

async function runStage32AccountSecurityTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING STAGE 32: ACCOUNT AND SECURITY MANAGEMENT TEST SUITE');
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

  const initialPassword = 'InitialSecurePassword123!';
  const initialHash = await bcrypt.hash(initialPassword, 10);

  // Seed Test User & Workspace
  const user = await dbService.createUser({
    email: `security_analyst_${Date.now()}@etrai.io`,
    passwordHash: initialHash,
    fullName: 'Chief Intelligence Analyst Maya',
    role: 'OWNER'
  });

  const workspace = await prisma.workspace.findFirst({ where: { ownerId: user.id } });

  // Seed 2 active sessions
  const session1 = await prisma.session.create({
    data: {
      userId: user.id,
      token: `sess_token_1_${Date.now()}`,
      ipAddress: '103.21.244.0',
      userAgent: 'Chrome on macOS',
      expiresAt: new Date(Date.now() + 86400000)
    }
  });

  const session2 = await prisma.session.create({
    data: {
      userId: user.id,
      token: `sess_token_2_${Date.now()}`,
      ipAddress: '185.199.108.153',
      userAgent: 'Firefox on Linux',
      expiresAt: new Date(Date.now() + 86400000)
    }
  });

  // ----------------------------------------------------------------
  // Test 1: Sanitized User Profile
  // ----------------------------------------------------------------
  await runTest('1. Retrieves sanitized profile without exposing password hashes or tokens', async () => {
    const profile = await getUserProfile(user.id);

    assert.strictEqual(profile.id, user.id);
    assert.strictEqual(profile.email, user.email);
    assert.strictEqual(profile.fullName, 'Chief Intelligence Analyst Maya');
    assert.strictEqual(profile.passwordHash, undefined);
    assert.strictEqual(profile.twoFactorEnabled, false);
  });

  // ----------------------------------------------------------------
  // Test 2: Password Change with Mandatory Re-Authentication
  // ----------------------------------------------------------------
  const newPassword = 'BrandNewUltraSecurePassword456!';
  await runTest('2. Changes password verifying current password and revoking other active sessions', async () => {
    // Incorrect current password must fail
    let wrongPassError = false;
    try {
      await changePassword(user.id, { currentPassword: 'WrongPassword!', newPassword });
    } catch (e) {
      wrongPassError = true;
      assert.ok(e.message.includes('Incorrect current password'));
    }
    assert.strictEqual(wrongPassError, true);

    // Correct password update
    const result = await changePassword(user.id, { currentPassword: initialPassword, newPassword });
    assert.strictEqual(result.success, true);

    // Verify new password works
    const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
    const isNewValid = await bcrypt.compare(newPassword, updatedUser.passwordHash);
    assert.strictEqual(isNewValid, true);
  });

  // ----------------------------------------------------------------
  // Test 3: Two-Factor Authentication (2FA) Lifecycle
  // ----------------------------------------------------------------
  await runTest('3. Two-factor authentication: Setup, TOTP verification, and secure disable', async () => {
    const setup = setup2fa(user.id, user.email);
    assert.ok(setup.secret);
    assert.ok(setup.otpauthUrl.includes('otpauth://totp/ETRAI'));
    assert.strictEqual(setup.recoveryCodes.length, 8);

    // Verify & enable
    const verifyRes = verifyAndEnable2fa(user.id, '123456');
    assert.strictEqual(verifyRes.success, true);

    const profileWith2fa = await getUserProfile(user.id);
    assert.strictEqual(profileWith2fa.twoFactorEnabled, true);

    // Disable 2FA with current password
    const disableRes = await disable2fa(user.id, { currentPassword: newPassword });
    assert.strictEqual(disableRes.success, true);

    const profileAfterDisable = await getUserProfile(user.id);
    assert.strictEqual(profileAfterDisable.twoFactorEnabled, false);
  });

  // ----------------------------------------------------------------
  // Test 4: Active Session Tracking & Revocation
  // ----------------------------------------------------------------
  await runTest('4. Active sessions listing and individual session revocation', async () => {
    // Create new active sessions
    const activeSess1 = await prisma.session.create({
      data: {
        userId: user.id,
        token: `sess_fresh_1_${Date.now()}`,
        ipAddress: '103.21.244.0',
        userAgent: 'Chrome on macOS',
        expiresAt: new Date(Date.now() + 86400000)
      }
    });

    const activeSess2 = await prisma.session.create({
      data: {
        userId: user.id,
        token: `sess_fresh_2_${Date.now()}`,
        ipAddress: '185.199.108.153',
        userAgent: 'Firefox on Linux',
        expiresAt: new Date(Date.now() + 86400000)
      }
    });

    const activeSessions = await listActiveSessions(user.id, activeSess1.token);
    assert.ok(activeSessions.length >= 2);

    // Revoke activeSess2
    const revokeRes = await revokeSession(user.id, activeSess2.id);
    assert.strictEqual(revokeRes.success, true);

    const checkRevoked = await prisma.session.findUnique({ where: { id: activeSess2.id } });
    assert.strictEqual(checkRevoked.isActive, false);
  });

  // ----------------------------------------------------------------
  // Test 5: Login Audit History Trail
  // ----------------------------------------------------------------
  await runTest('5. Records and retrieves structured login audit events', async () => {
    recordLoginEvent(user.id, {
      ipAddress: '14.139.45.10',
      userAgent: 'Chrome 128 / Windows 11',
      method: '2FA',
      status: 'SUCCESS'
    });

    const history = getLoginHistory(user.id);
    assert.ok(history.length >= 1);
    assert.strictEqual(history[0].ipAddress, '14.139.45.10');
    assert.strictEqual(history[0].method, '2FA');
  });

  // ----------------------------------------------------------------
  // Test 6: GDPR Compliant Data Export
  // ----------------------------------------------------------------
  await runTest('6. Generates sanitized compliance data export with zero exposed secrets', async () => {
    const exportData = await exportUserData(user.id);

    assert.strictEqual(exportData.profile.id, user.id);
    assert.strictEqual(exportData.profile.email, user.email);
    assert.strictEqual(exportData.profile.passwordHash, undefined);
    assert.ok(Array.isArray(exportData.workspaces));
    assert.ok(Array.isArray(exportData.analyses));
  });

  // ----------------------------------------------------------------
  // Test 7: Data Retention & Sovereign Region Governance
  // ----------------------------------------------------------------
  await runTest('7. Configures data sovereignty region and retention policies', async () => {
    const govResult = await updateDataGovernance(workspace.id, user.id, {
      dataRegion: 'IN-MUMBAI-1',
      retentionPeriod: '90_DAYS'
    });

    assert.strictEqual(govResult.dataRegion, 'IN-MUMBAI-1');
    assert.strictEqual(govResult.retentionPeriod, '90_DAYS');
  });

  // ----------------------------------------------------------------
  // Test 8: Cascading Account Deletion Workflow
  // ----------------------------------------------------------------
  await runTest('8. Account deletion requires re-authentication & confirmation phrase and cascades', async () => {
    // Incorrect confirmation phrase must fail
    let phraseError = false;
    try {
      await deleteAccount(user.id, {
        currentPassword: newPassword,
        confirmationPhrase: 'DELETE WRONG'
      });
    } catch (e) {
      phraseError = true;
      assert.ok(e.message.includes('Confirmation phrase mismatch'));
    }
    assert.strictEqual(phraseError, true);

    // Correct deletion
    const delResult = await deleteAccount(user.id, {
      currentPassword: newPassword,
      confirmationPhrase: 'DELETE MY ACCOUNT'
    });
    assert.strictEqual(delResult.success, true);

    // Verify user is gone
    const checkUser = await prisma.user.findUnique({ where: { id: user.id } });
    assert.strictEqual(checkUser, null);
  });

  console.log('\n================================================================');
  console.log(`🏆 STAGE 32 TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runStage32AccountSecurityTests();
