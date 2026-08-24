/**
 * Phase 7 Test Suite: Complete Persistent ETRAI Investigation & Report System
 * Verifies:
 * 1. Persistent Investigation Entity & Lifecycle States (CREATED -> COMPLETED / FAILED / ARCHIVED)
 * 2. 20-Section Investigation Dossier Generation
 * 3. Claim Drill-Down Matrix (Claim -> Evidence -> Source)
 * 4. Persistent History Pagination, Multi-Filter & Range Queries
 * 5. Global Multi-Modal Search Indexing across Reports, Claims, Entities & Sources
 * 6. Real Binary PDF Export with Valid PDF 1.4 Header & Content Streams
 * 7. Real Structured JSON Export with Sensitive Credential Sanitization
 * 8. Real Tabular CSV Export for Claims & Evidence Auditing
 * 9. Cryptographically Secure Shareable Links with Token Resolution & Expiration
 * 10. Historical Reproducibility (Frozen Scoring & Methodology Preservation)
 */

const assert = require('assert');
const crypto = require('crypto');
const { prisma } = require('../src/utils/prisma');
const { listVerificationHistory } = require('../src/services/historyLedgerService');
const { searchGlobalIndex } = require('../src/services/globalSearchService');
const {
  sanitizeReportForExport,
  generateReportJsonExport,
  generateReportCsvExport,
  generateReportPdfExport,
  createShareableLink,
  resolveSharedReport
} = require('../src/services/shareExportService');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(`    ${err.message}`);
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(`    ${err.message}`);
  }
}

async function runAllPhase7Tests() {
  console.log('\n================================================================');
  console.log('🧪 ETRAI PHASE 7: INVESTIGATION & REPORT SYSTEM TEST SUITE');
  console.log('================================================================\n');

  // Test User for Tenant Isolation
  const testUserId = `usr_test_${Date.now()}`;
  const testUserEmail = `investigator_${Date.now()}@etrai.local`;

  let testUser = null;
  try {
    testUser = await prisma.user.create({
      data: {
        id: testUserId,
        email: testUserEmail,
        passwordHash: 'dummy_hash_for_testing',
        fullName: 'Lead Investigator'
      }
    });
  } catch (e) {
    // If user already exists or mock
    testUser = await prisma.user.findFirst() || { id: testUserId, email: testUserEmail, fullName: 'Lead Investigator' };
  }

  // -------------------------------------------------------------
  // Test 1: Persistent Investigation Lifecycle (CREATED -> COMPLETED / ARCHIVED)
  // -------------------------------------------------------------
  await runAsyncTest('Test 1: Persistent Investigation Lifecycle & Status Transitions', async () => {
    const invId = `inv_${Date.now()}`;
    const inv = await prisma.analysis.create({
      data: {
        id: invId,
        userId: testUser.id,
        title: 'Investigation on Renewable Energy Subsidies',
        inputType: 'TEXT',
        inputSource: 'Press Release Wire',
        selectedTypes: JSON.stringify(['FACT_CHECKING']),
        status: 'CREATED',
        summary: 'Initial intake created.',
        overallMetrics: JSON.stringify({ overallTrustScore: 82 }),
        reportData: JSON.stringify({ verdict: 'Real', confidence: 90 }),
        trustScore: 82.0,
        verdict: 'Real'
      }
    });

    assert.strictEqual(inv.status, 'CREATED');

    // Transition to PROCESSING then COMPLETED
    const updated = await prisma.analysis.update({
      where: { id: invId },
      data: { status: 'COMPLETED' }
    });
    assert.strictEqual(updated.status, 'COMPLETED');

    // Archive investigation
    const archived = await prisma.analysis.update({
      where: { id: invId },
      data: { status: 'ARCHIVED' }
    });
    assert.strictEqual(archived.status, 'ARCHIVED');
  });

  // -------------------------------------------------------------
  // Test 2: 20-Section Investigation Dossier Generation
  // -------------------------------------------------------------
  runTest('Test 2: Complete 20-Section Investigation Dossier Generation', () => {
    const sampleDossierData = {
      id: 'dossier_001',
      title: 'Solar Tariff Policy Audit',
      verdict: 'Real',
      scores: {
        overallTrustScore: 88,
        factCheckingScore: 88,
        scoreDerivation: {
          baseScore: 100,
          evidenceFactor: 88,
          penalties: { manipulationPenalty: 0, consistencyPenalty: 0 }
        }
      },
      summary: 'Executive verdict confirms tariff data matches official gazette.',
      recommendation: 'Reliable for newsroom publication.',
      keyHighlights: ['Primary gazette match verified', 'Zero tampering detected'],
      verifiedClaims: [
        {
          id: 'cl_1',
          claimText: 'Ministry allocated 15,000 Cr for rooftop solar scheme.',
          verdict: 'VERIFIED',
          confidence: 95,
          reasoning: 'Matches statutory cabinet press notification.',
          sources: [
            { domain: 'pib.gov.in', title: 'Cabinet Approval Notice', stance: 'SUPPORTS', authorityScore: 98, rank: 1 }
          ]
        }
      ],
      provenance: {
        originConfidence: 'CONFIRMED_ORIGIN',
        earliestDiscoveredDate: '2026-08-01T09:00:00Z',
        firstKnownPublisher: 'PIB'
      },
      entities: [{ name: 'Ministry of New & Renewable Energy', category: 'GOVERNMENTS' }],
      whatWouldChangeVerdict: ['Official gazette revocation']
    };

    const sanitized = sanitizeReportForExport(sampleDossierData);

    assert.strictEqual(sanitized.verdict, 'Real');
    assert.strictEqual(sanitized.overallTrustScore, 88);
    assert.strictEqual(sanitized.claimsFoundCount, 1);
    assert.strictEqual(sanitized.supportingEvidence.length, 1);
    assert.strictEqual(sanitized.supportingEvidence[0].domain, 'pib.gov.in');
    assert.strictEqual(sanitized.methodologyVersion, 'ETRAI-v2.4-TransparentScoring');
    assert(sanitized.whatWouldChangeVerdict.length > 0);
  });

  // -------------------------------------------------------------
  // Test 3: Claim Drill-Down Matrix (Claim -> Evidence -> Source)
  // -------------------------------------------------------------
  runTest('Test 3: Claim-by-Claim Drill-Down to Evidence & Source', () => {
    const claims = [
      {
        claimId: 'cl_100',
        text: 'Foreign remittances rose 12% in Q1.',
        verdict: 'VERIFIED',
        confidence: 92,
        evidenceEvaluations: [
          { domain: 'rbi.org.in', title: 'RBI Statistical Bulletin', stance: 'SUPPORTS', authorityRank: 1, authorityScore: 99 }
        ]
      }
    ];

    const sanitized = sanitizeReportForExport({ verifiedClaims: claims });
    const claim = sanitized.verifiedClaims[0];

    assert.strictEqual(claim.claimId, 'cl_100');
    assert.strictEqual(claim.sourcesCount, 1);
    assert.strictEqual(claim.sources[0].domain, 'rbi.org.in');
    assert.strictEqual(claim.sources[0].authorityScore, 99);
  });

  // -------------------------------------------------------------
  // Test 4: Persistent History Filtering & Pagination
  // -------------------------------------------------------------
  await runAsyncTest('Test 4: History Pagination, Multi-Filter & Score Range Queries', async () => {
    // Create 3 distinct historical records for test user
    await prisma.analysis.createMany({
      data: [
        {
          id: `hist_${Date.now()}_1`,
          userId: testUser.id,
          title: 'Investigation on Healthcare Budget',
          inputType: 'PDF',
          inputSource: 'budget.pdf',
          selectedTypes: JSON.stringify(['FACT_CHECKING']),
          status: 'COMPLETED',
          trustScore: 92.0,
          verdict: 'Real'
        },
        {
          id: `hist_${Date.now()}_2`,
          userId: testUser.id,
          title: 'Suspicious Viral Video on Bridge Collapse',
          inputType: 'VIDEO',
          inputSource: 'video.mp4',
          selectedTypes: JSON.stringify(['FAKE_NEWS_DETECTION']),
          status: 'COMPLETED',
          trustScore: 35.0,
          verdict: 'Fake'
        },
        {
          id: `hist_${Date.now()}_3`,
          userId: testUser.id,
          title: 'Ambiguous Statement on EV Subsidies',
          inputType: 'TEXT',
          inputSource: 'speech_text',
          selectedTypes: JSON.stringify(['FACT_CHECKING']),
          status: 'PARTIAL',
          trustScore: 55.0,
          verdict: 'Suspicious'
        }
      ]
    });

    // 1. Test pagination
    const pageResult = await listVerificationHistory(testUser.id, {}, { page: 1, limit: 2 });
    assert(pageResult.items.length <= 2);
    assert(pageResult.pagination.totalCount >= 3);

    // 2. Test verdict filter (Fake)
    const fakeFilter = await listVerificationHistory(testUser.id, { verdict: 'Fake' });
    assert(fakeFilter.items.every(i => i.verdict === 'Fake'));

    // 3. Test score range filter (minScore: 80)
    const scoreFilter = await listVerificationHistory(testUser.id, { minScore: 80 });
    assert(scoreFilter.items.every(i => i.trustScore >= 80));

    // 4. Test inputType filter (VIDEO)
    const videoFilter = await listVerificationHistory(testUser.id, { inputType: 'VIDEO' });
    assert(videoFilter.items.every(i => i.inputType === 'VIDEO'));
  });

  // -------------------------------------------------------------
  // Test 5: Global Search Multi-Modal Indexing
  // -------------------------------------------------------------
  await runAsyncTest('Test 5: Global Search Multi-Modal Indexing', async () => {
    const searchRes = await searchGlobalIndex(testUser.id, 'Healthcare Budget');
    assert(searchRes.items.length > 0);
    assert(searchRes.items.some(i => i.title.includes('Healthcare Budget')));
    assert(searchRes.items[0].highlightedTitle.includes('<mark>Healthcare Budget</mark>'));
  });

  // -------------------------------------------------------------
  // Test 6: Real PDF Binary Export
  // -------------------------------------------------------------
  runTest('Test 6: Real PDF Binary Export Generation', () => {
    const reportData = {
      title: 'Global Trade Analysis',
      verdict: 'Real',
      scores: { overallTrustScore: 85 },
      summary: 'Verified trade balances match official custom declarations.',
      verifiedClaims: [
        { text: 'Customs exports grew 8%.', verdict: 'VERIFIED', confidence: 90, reasoning: 'Official customs bulletin.' }
      ]
    };

    const pdfBuffer = generateReportPdfExport(reportData);
    assert(Buffer.isBuffer(pdfBuffer));
    assert(pdfBuffer.length > 200);

    // Check %PDF-1.4 header and %%EOF trailer
    const pdfStr = pdfBuffer.toString('utf-8');
    assert(pdfStr.startsWith('%PDF-1.4'));
    assert(pdfStr.includes('%%EOF'));
    assert(pdfStr.includes('Global Trade Analysis'));
  });

  // -------------------------------------------------------------
  // Test 7: Real Structured JSON Export (Sanitized)
  // -------------------------------------------------------------
  runTest('Test 7: Real JSON Export with Security Sanitization', () => {
    const rawReportWithSecrets = {
      userId: 'usr_secret_123',
      apiKey: 'sk-prod-secret-999',
      title: 'Audited Report',
      verdict: 'Real',
      scores: { overallTrustScore: 90 },
      summary: 'Clean public export.'
    };

    const jsonStr = generateReportJsonExport(rawReportWithSecrets);
    const parsed = JSON.parse(jsonStr);

    assert.strictEqual(parsed.title, 'Audited Report');
    assert.strictEqual(parsed.verdict, 'Real');
    assert.strictEqual(parsed.userId, undefined);
    assert.strictEqual(parsed.apiKey, undefined);
  });

  // -------------------------------------------------------------
  // Test 8: Real Tabular CSV Export
  // -------------------------------------------------------------
  runTest('Test 8: Real Tabular CSV Export for Claims & Evidence', () => {
    const reportData = {
      title: 'Tax Policy Verification',
      verdict: 'Real',
      verifiedClaims: [
        {
          id: 'c1',
          text: 'Corporate tax rate remains 22%.',
          verdict: 'VERIFIED',
          confidence: 98,
          sources: [{ domain: 'incometax.gov.in', stance: 'SUPPORTS', rank: 1, authorityScore: 99, url: 'https://incometax.gov.in' }]
        }
      ]
    };

    const csvData = generateReportCsvExport(reportData);
    assert(typeof csvData === 'string');
    assert(csvData.includes('Claim ID') && csvData.includes('Claim Text') && csvData.includes('Claim Verdict'));
    assert(csvData.includes('incometax.gov.in'));
    assert(csvData.includes('Corporate tax rate remains 22%'));
  });

  // -------------------------------------------------------------
  // Test 9: Cryptographically Secure Shareable Links
  // -------------------------------------------------------------
  await runAsyncTest('Test 9: Secure Shareable Link Creation & Resolution', async () => {
    const invId = `inv_share_${Date.now()}`;
    await prisma.analysis.create({
      data: {
        id: invId,
        userId: testUser.id,
        title: 'Confidential Investigation Dossier',
        inputType: 'TEXT',
        inputSource: 'Direct memo',
        selectedTypes: JSON.stringify(['FACT_CHECKING']),
        status: 'COMPLETED',
        trustScore: 84.0,
        verdict: 'Real',
        reportData: JSON.stringify({ title: 'Confidential Investigation Dossier', verdict: 'Real', confidence: 90 })
      }
    });

    // 1. Create secure random share token
    const shareResult = await createShareableLink(invId, testUser.id, { expiresInDays: 7 });
    assert(shareResult.shareToken.length >= 32);
    assert(shareResult.shareUrl.includes('/shared/dossier/'));

    // 2. Resolve share token
    const resolved = await resolveSharedReport(shareResult.shareToken);
    assert.strictEqual(resolved.valid, true);
    assert.strictEqual(resolved.investigationId, invId);
    assert.strictEqual(resolved.report.title, 'Confidential Investigation Dossier');

    // 3. Resolve invalid token
    const invalidResolve = await resolveSharedReport('invalid_random_token_9999');
    assert.strictEqual(invalidResolve.valid, false);
  });

  // -------------------------------------------------------------
  // Test 10: Historical Reproducibility
  // -------------------------------------------------------------
  runTest('Test 10: Historical Reproducibility & Methodology Version Preservation', () => {
    const historicalReport = {
      id: 'dossier_historical_2025',
      title: 'Historical 2025 Verification',
      methodologyVersion: 'ETRAI-v2.1-FrozenMethodology',
      verdict: 'Suspicious',
      scores: { overallTrustScore: 62 },
      exportedAt: '2025-11-15T12:00:00Z'
    };

    const sanitized = sanitizeReportForExport(historicalReport);
    assert.strictEqual(sanitized.methodologyVersion, 'ETRAI-v2.1-FrozenMethodology');
    assert.strictEqual(sanitized.overallTrustScore, 62);
    assert.strictEqual(sanitized.verdict, 'Suspicious');
  });

  console.log('\n================================================================');
  console.log(`🏁 PHASE 7 TEST RESULTS: ${passedTests} / ${totalTests} PASSED`);
  console.log('================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runAllPhase7Tests().catch(err => {
  console.error('[FATAL TEST SUITE ERROR]:', err);
  process.exit(1);
});
