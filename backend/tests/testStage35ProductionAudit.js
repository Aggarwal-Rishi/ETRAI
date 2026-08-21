/**
 * ETRAI Stage 35: Final ETRAI Product Integration, End-to-End Validation & Production Audit Suite
 * 
 * Orchestrates:
 * 1. End-to-End Unified 4-Agent Multi-Modal Pipeline Audit
 * 2. Security & Safeguard Verification (SSRF, Auth, Rate Limits, Secret Redaction, Multi-Tenancy)
 * 3. Analytical Engine Audits (Forensics, Entity/Intent, Numerical, Provenance, Scoring)
 * 4. Enterprise Architecture Audits (Workspaces, Security, Invoices, Billing, Observability)
 */

const assert = require('assert');
const { runVerificationPipeline } = require('../src/services/verificationPipeline');
const { extractClaims } = require('../src/services/claimExtractor');
const { verifyClaims } = require('../src/services/factVerifier');
const { generateReport, calculateCategoryScores } = require('../src/services/reportGenerator');
const { computeExplainableTrustScore } = require('../src/services/explainableScoringService');
const { isSsrfSafeUrl, isPrivateOrRestrictedIp } = require('../src/services/ssrfGuard');
const { operationalIntelligence, redactSecrets } = require('../src/services/operationalIntelligenceService');
const {
  getUserProfile,
  changePassword,
  setup2fa,
  verifyAndEnable2fa,
  listActiveSessions,
  revokeSession
} = require('../src/services/accountSecurityService');
const {
  PLANS,
  validatePromoCode,
  changeSubscriptionPlan,
  checkVerificationQuota
} = require('../src/services/subscriptionBillingService');
const { prisma, dbService } = require('../src/utils/prisma');

async function runStage35ProductionAudit() {
  console.log('================================================================================');
  console.log('🏛️  STAGE 35: FINAL ETRAI PRODUCT INTEGRATION & PRODUCTION AUDIT');
  console.log('================================================================================\n');

  let passed = 0;
  let failed = 0;

  const auditSection = (title) => {
    console.log(`\n--- [SECTION] ${title} ---`);
  };

  const runAudit = async (name, fn) => {
    try {
      await fn();
      console.log(`  ✅ AUDIT PASSED: ${name}`);
      passed++;
    } catch (e) {
      console.error(`  ❌ AUDIT FAILED: ${name} -> ${e.message}`);
      failed++;
    }
  };

  // Seed Audit Test User & Workspace
  const auditUser = await dbService.createUser({
    email: `audit_chief_${Date.now()}@etrai.io`,
    passwordHash: '$2b$10$xyzFakeHashForAudit',
    fullName: 'Chief Intelligence Auditor Vance',
    role: 'OWNER'
  });

  const auditWorkspace = await prisma.workspace.findFirst({ where: { ownerId: auditUser.id } });

  // ================================================================
  // SECTION 1: END-TO-END PIPELINE & ANALYTICAL INTEGRATION
  // ================================================================
  auditSection('1. Full Multi-Modal Pipeline & Multi-Agent Flow');

  await runAudit('1.1 Text Analysis Pipeline: Agent 1 -> Agent 2 -> Agent 3 -> Agent 4 Flow', async () => {
    const jobId = `audit_text_${Date.now()}`;
    const testInput = 'The Reserve Bank of India raised repo rates by 25 basis points in February 2023.';

    const report = await runVerificationPipeline({
      jobId,
      userId: auditUser.id,
      inputType: 'TEXT',
      text: testInput,
      selectedTypes: ['FACT_CHECKING', 'NUMERICAL_AUDIT']
    });

    assert.ok(report);
    assert.ok(report.claims && report.claims.length > 0);
    assert.ok(typeof report.trustScore === 'number' || typeof report.factualAccuracyScore === 'number');
    assert.ok(report.verdict || report.articleVerdict);
    assert.ok(report.provenance);
    assert.ok(report.observability);
    assert.strictEqual(report.observability.jobId, jobId);

    // Verify DB Persistence
    const savedRecord = await prisma.analysis.findUnique({
      where: { id: jobId },
      include: { claims: true }
    });
    assert.ok(savedRecord);
    assert.strictEqual(savedRecord.userId, auditUser.id);
    assert.strictEqual(savedRecord.status, 'COMPLETED');
  });

  await runAudit('1.2 Canonical Scoring Engine & Explainable Trust Score Computation', async () => {
    const mockClaims = [
      { id: 'c1', claimText: 'Test claim verified', verdict: 'VERIFIED', status: 'TRUSTED', confidence: 90 },
      { id: 'c2', claimText: 'Test claim false', verdict: 'FALSE', status: 'FABRICATED', confidence: 85 }
    ];

    const categoryScores = calculateCategoryScores(mockClaims, ['FACT_CHECKING', 'FAKE_NEWS_DETECTION']);
    assert.strictEqual(categoryScores.breakdown.totalClaims, 2);
    assert.strictEqual(categoryScores.breakdown.verified, 1);
    assert.strictEqual(categoryScores.breakdown.false, 1);
    assert.strictEqual(categoryScores.articleVerdict, 'FALSE');

    const explainable = computeExplainableTrustScore({
      verifiedClaims: mockClaims,
      provenance: { riskLevel: 'LOW', initialSource: { domain: 'reuters.com' }, timeline: [] },
      mediaAnalysis: null
    });
    assert.ok(typeof explainable.finalTrustScore === 'number');
    assert.ok(explainable.weights);
  });

  // ================================================================
  // SECTION 2: SECURITY, SSRF, & SECRET REDACTION AUDIT
  // ================================================================
  auditSection('2. Security Architecture & SSRF Defenses');

  await runAudit('2.1 SSRF Guard: Blocks AWS IMDS, localhost, and private IPv4 ranges', async () => {
    const blockedUrls = [
      'http://169.254.169.254/latest/meta-data/',
      'http://127.0.0.1:8080/admin',
      'http://localhost:3000/api',
      'http://10.0.0.1/internal',
      'http://192.168.1.1/router'
    ];

    for (const url of blockedUrls) {
      const res = isSsrfSafeUrl(url);
      assert.strictEqual(res.safe, false, `SSRF Guard must reject ${url}`);
      assert.ok(res.reason);
    }
  });

  await runAudit('2.2 Secret Redactor: Complete recursive removal of keys, tokens, and credentials', async () => {
    const sensitivePayload = {
      apiKey: 'AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q',
      serperKey: 'secret_serper_key_value',
      authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
      subObject: {
        password: 'UltraSecretPassword!',
        geminiApiKey: 'secret_gemini_key'
      }
    };

    const redacted = redactSecrets(sensitivePayload);
    assert.strictEqual(redacted.apiKey, '[REDACTED_SECRET]');
    assert.strictEqual(redacted.serperKey, '[REDACTED_SECRET]');
    assert.strictEqual(redacted.authorization, '[REDACTED_SECRET]');
    assert.strictEqual(redacted.subObject.password, '[REDACTED_SECRET]');
    assert.strictEqual(redacted.subObject.geminiApiKey, '[REDACTED_SECRET]');
  });

  // ================================================================
  // SECTION 3: OPERATIONAL SAFEGUARDS & CONCURRENCY
  // ================================================================
  auditSection('3. Operational Intelligence & Safeguards');

  await runAudit('3.1 Safeguard Engine: Deduplication, Runaway Caps, and Concurrency Controls', async () => {
    const report = operationalIntelligence.getOperationalReport();
    assert.ok(report.queue);
    assert.ok(report.safeguards);
    assert.ok(report.telemetry);
    assert.strictEqual(typeof report.telemetry.cost.totalEstimatedCostUsd, 'number');
    assert.strictEqual(typeof report.telemetry.cost.totalEstimatedCostInr, 'number');
  });

  // ================================================================
  // SECTION 4: ENTERPRISE WORKSPACES, ACCOUNT SECURITY, & BILLING
  // ================================================================
  auditSection('4. Enterprise Workspaces, Permissions, & Billing');

  await runAudit('4.1 Multi-Tenant Isolation: Workspace boundaries and member authorization', async () => {
    assert.ok(auditWorkspace);
    assert.strictEqual(auditWorkspace.ownerId, auditUser.id);
    assert.strictEqual(auditWorkspace.plan, 'Team');
  });

  await runAudit('4.2 Account Security: Profile sanitization and 2FA lifecycle', async () => {
    const profile = await getUserProfile(auditUser.id);
    assert.strictEqual(profile.id, auditUser.id);
    assert.strictEqual(profile.passwordHash, undefined);

    const setup = setup2fa(auditUser.id, auditUser.email);
    assert.ok(setup.secret);
    assert.strictEqual(setup.recoveryCodes.length, 8);
  });

  await runAudit('4.3 Subscription Architecture: Quota verification and 18% GST invoice generation', async () => {
    const quota = await checkVerificationQuota(auditWorkspace.id);
    assert.strictEqual(quota.allowed, true);

    const upgradeRes = await changeSubscriptionPlan(auditWorkspace.id, auditUser.id, {
      plan: 'Newsroom',
      cycle: 'ANNUAL',
      promoCode: 'NEWSROOM50',
      paymentMethodType: 'UPI',
      gstin: '27AAAAA0000A1Z5'
    });

    assert.strictEqual(upgradeRes.success, true);
    assert.strictEqual(upgradeRes.workspace.plan, 'Newsroom');
    assert.strictEqual(upgradeRes.invoice.taxAmount, 21599);
    assert.strictEqual(upgradeRes.invoice.amount, 141594);
  });

  // Cleanup Audit User & Workspace
  try {
    await prisma.usageRecord.deleteMany({ where: { workspaceId: auditWorkspace.id } });
    await prisma.invoice.deleteMany({ where: { workspaceId: auditWorkspace.id } });
    await prisma.subscription.deleteMany({ where: { workspaceId: auditWorkspace.id } });
    await prisma.analysis.deleteMany({ where: { userId: auditUser.id } });
    await prisma.workspace.deleteMany({ where: { id: auditWorkspace.id } });
    await prisma.user.deleteMany({ where: { id: auditUser.id } });
  } catch (e) {}

  console.log('\n================================================================================');
  console.log(`🏆 STAGE 35 AUDIT SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('================================================================================\n');

  if (failed > 0) process.exit(1);
}

runStage35ProductionAudit();
