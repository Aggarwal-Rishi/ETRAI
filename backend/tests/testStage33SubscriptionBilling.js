const assert = require('assert');
const {
  PLANS,
  validatePromoCode,
  getPaymentGatewayStatus,
  getBillingSummary,
  checkVerificationQuota,
  incrementVerificationUsage,
  changeSubscriptionPlan,
  cancelSubscription,
  reactivateSubscription
} = require('../src/services/subscriptionBillingService');
const { prisma, dbService } = require('../src/utils/prisma');

async function runStage33SubscriptionBillingTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING STAGE 33: SUBSCRIPTION AND BILLING TEST SUITE');
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

  // Seed test owner and workspace
  const user = await dbService.createUser({
    email: `billing_owner_${Date.now()}@etrai.io`,
    passwordHash: '$2b$10$xyz',
    fullName: 'Executive Publisher Priya',
    role: 'OWNER'
  });

  const workspace = await prisma.workspace.findFirst({ where: { ownerId: user.id } });

  // ----------------------------------------------------------------
  // Test 1: Plan Catalog & Cycle Math
  // ----------------------------------------------------------------
  await runTest('1. Plans catalog provides 4 distinct tiers with seat and verification limits', async () => {
    assert.ok(PLANS.Starter && PLANS.Team && PLANS.Newsroom && PLANS.Enterprise);
    assert.strictEqual(PLANS.Starter.seats, 1);
    assert.strictEqual(PLANS.Starter.verificationLimit, 100);
    assert.strictEqual(PLANS.Team.seats, 5);
    assert.strictEqual(PLANS.Team.verificationLimit, 500);
    assert.strictEqual(PLANS.Newsroom.seats, 20);
    assert.strictEqual(PLANS.Newsroom.verificationLimit, 2500);

    // Annual discount check (~20%)
    assert.ok(PLANS.Team.priceAnnualInr < PLANS.Team.priceMonthlyInr * 12);
  });

  // ----------------------------------------------------------------
  // Test 2: Promotional Coupon Engine
  // ----------------------------------------------------------------
  await runTest('2. Coupon validation calculates correct discount percentage', async () => {
    const promo20 = validatePromoCode('ETRAI20', 'Team');
    assert.strictEqual(promo20.discountPercent, 20);

    const promo50 = validatePromoCode('newsroom50', 'Newsroom');
    assert.strictEqual(promo50.discountPercent, 50);

    // Invalid coupon check
    let invalidError = false;
    try {
      validatePromoCode('INVALID_CODE', 'Team');
    } catch (e) {
      invalidError = true;
      assert.ok(e.message.includes('Invalid promotional coupon code'));
    }
    assert.strictEqual(invalidError, true);
  });

  // ----------------------------------------------------------------
  // Test 3: Upgrade Plan & 18% GST Tax Invoice Generation
  // ----------------------------------------------------------------
  await runTest('3. Upgrades plan to Newsroom with promo code and generates RFC 18% GST tax invoice', async () => {
    const upgradeRes = await changeSubscriptionPlan(workspace.id, user.id, {
      plan: 'Newsroom',
      cycle: 'ANNUAL',
      promoCode: 'NEWSROOM50',
      paymentMethodType: 'UPI',
      gstin: '27AAAAA0000A1Z5'
    });

    assert.strictEqual(upgradeRes.success, true);
    assert.strictEqual(upgradeRes.workspace.plan, 'Newsroom');
    assert.strictEqual(upgradeRes.workspace.maxSeats, 20);
    assert.strictEqual(upgradeRes.workspace.verificationLimit, 2500);

    // Base price = 239990, 50% discount = 119995, Taxable = 119995, 18% GST = 21599, Total = 141594
    assert.strictEqual(upgradeRes.invoice.basePrice, 239990);
    assert.strictEqual(upgradeRes.invoice.discountAmount, 119995);
    assert.strictEqual(upgradeRes.invoice.taxAmount, 21599);
    assert.strictEqual(upgradeRes.invoice.amount, 141594);
    assert.strictEqual(upgradeRes.invoice.status, 'PAID');
    assert.ok(upgradeRes.invoice.invoiceNumber.startsWith('INV-'));
  });

  // ----------------------------------------------------------------
  // Test 4: Server-Side Quota Enforcement Guard
  // ----------------------------------------------------------------
  await runTest('4. Quota Guard: Enforces monthly verification limits server-side', async () => {
    // Set usage to limit
    await prisma.workspace.update({
      where: { id: workspace.id },
      data: { verificationsUsed: 2500, verificationLimit: 2500 }
    });

    let quotaExceeded = false;
    try {
      await checkVerificationQuota(workspace.id);
    } catch (e) {
      quotaExceeded = true;
      assert.ok(e.message.includes('Monthly verification quota exceeded'));
    }
    assert.strictEqual(quotaExceeded, true);

    // Reset quota
    await prisma.workspace.update({
      where: { id: workspace.id },
      data: { verificationsUsed: 24 }
    });

    const checkOk = await checkVerificationQuota(workspace.id);
    assert.strictEqual(checkOk.allowed, true);
    assert.strictEqual(checkOk.remaining, 2476);
  });

  // ----------------------------------------------------------------
  // Test 5: Usage & Token Consumption Recording
  // ----------------------------------------------------------------
  await runTest('5. Increments verification usage and records token consumption telemetry', async () => {
    await incrementVerificationUsage(workspace.id, user.id, {
      tokensConsumed: 4500,
      costUsd: 0.028
    });

    const summary = await getBillingSummary(workspace.id, user.id);
    assert.strictEqual(summary.quota.verificationsUsed, 25);
    assert.ok(summary.telemetry.totalTokensConsumed >= 4500);
    assert.ok(summary.telemetry.totalCostUsd >= 0.02);
  });

  // ----------------------------------------------------------------
  // Test 6: Subscription Cancellation & Reactivation
  // ----------------------------------------------------------------
  await runTest('6. Cancels subscription at period end and reactivates auto-renewal', async () => {
    const cancelRes = await cancelSubscription(workspace.id, user.id);
    assert.strictEqual(cancelRes.success, true);

    const subAfterCancel = await prisma.subscription.findFirst({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: 'desc' }
    });
    assert.strictEqual(subAfterCancel.cancelAtPeriodEnd, true);

    const reactivateRes = await reactivateSubscription(workspace.id, user.id);
    assert.strictEqual(reactivateRes.success, true);

    const subAfterReactivate = await prisma.subscription.findFirst({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: 'desc' }
    });
    assert.strictEqual(subAfterReactivate.cancelAtPeriodEnd, false);
  });

  // ----------------------------------------------------------------
  // Test 7: Truthful Payment Gateway Status
  // ----------------------------------------------------------------
  await runTest('7. Reports truthful payment gateway status without faking live transactions', async () => {
    const gwStatus = getPaymentGatewayStatus();
    assert.ok(gwStatus.provider);
    assert.ok(typeof gwStatus.configured === 'boolean');
  });

  // Cleanup test user & workspace
  await prisma.usageRecord.deleteMany({ where: { workspaceId: workspace.id } });
  await prisma.invoice.deleteMany({ where: { workspaceId: workspace.id } });
  await prisma.subscription.deleteMany({ where: { workspaceId: workspace.id } });
  await prisma.workspace.deleteMany({ where: { id: workspace.id } });
  await prisma.user.deleteMany({ where: { id: user.id } });

  console.log('\n================================================================');
  console.log(`🏆 STAGE 33 TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runStage33SubscriptionBillingTests();
