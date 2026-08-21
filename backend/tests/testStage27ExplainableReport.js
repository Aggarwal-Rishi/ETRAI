const assert = require('assert');
const { sanitizeReportForExport, generateReportMarkdownExport } = require('../src/services/shareExportService');
const { generateReport, calculateCategoryScores } = require('../src/services/reportGenerator');

async function runStage27ExplainableReportTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING STAGE 27: COMPLETE EXPLAINABLE REPORT TEST SUITE');
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

  // Mock raw analysis result with all multi-dimensional findings
  const mockRawReport = {
    id: 'analysis_uuid_9921',
    userId: 'private_user_uuid_123',
    workspaceId: 'tenant_workspace_uuid_456',
    apiKey: 'sk-proj-secret-12345',
    title: 'Union Cabinet Approves Clean Hydrogen Mission',
    sourceTitle: 'Union Cabinet Approves Clean Hydrogen Mission',
    articleVerdict: 'VERIFIED',
    factualAccuracyScore: 92,
    evidenceConfidence: 88,
    scores: {
      factCheckingScore: 92,
      fakeNewsScore: 92
    },
    summary: 'Authoritative gazette records verify the budgetary outlay and renewable capacity targets.',
    verifiedClaims: [
      {
        id: 'claim_1',
        claimText: 'Union Cabinet approved ₹19,744 Cr for National Green Hydrogen Mission',
        verdict: 'VERIFIED',
        confidence: 94,
        reasoning: 'Corroborated by official PIB notification and Ministry gazette.',
        sources: [
          { domain: 'pib.gov.in', title: 'Cabinet approves National Green Hydrogen Mission', stance: 'SUPPORTS', authorityRank: 1, authorityScore: 95 }
        ]
      }
    ],
    breakdown: {
      totalClaims: 1,
      verified: 1,
      partiallyVerified: 0,
      suspicious: 0,
      unverified: 0,
      false: 0
    },
    provenance: {
      earliestAppearance: '2026-08-19T06:00:00Z',
      originConfidence: 'CONFIRMED',
      timeline: []
    },
    sourceIntelligence: {
      rankedSources: [{ domain: 'pib.gov.in', rank: 1 }]
    },
    numericalAnalysis: {
      factsCount: 1,
      facts: [{ asPrinted: '₹19,744 Cr', refersTo: 'Financial budget', status: 'VERIFIED' }]
    },
    textAnalysis: {
      readability: { wordCount: 150, fleschReadingEase: 65.2 },
      urgency: { urgencyScore: 10, urgencyTier: 'LOW_URGENCY' },
      attributionQuality: { attributionGrade: 'AUTHORITATIVE' }
    },
    linkIntelligence: {
      totalLinks: 1,
      primarySourcesCount: 1,
      links: [{ url: 'https://pib.gov.in/PR123', isPrimarySource: true }]
    },
    discoveredImages: [{ url: 'https://cdn.etrai.io/cabinet.jpg', dimensions: '1920x1080' }],
    discoveredVideos: [],
    entities: [{ normalizedName: 'Ministry of New and Renewable Energy', type: 'GOVERNMENT_BODY' }],
    intentAnalysis: { primaryIntent: 'INFORMATIONAL', isAnalyticalInference: true }
  };

  // ----------------------------------------------------------------
  // Test 1: Complete Explainable Report Synthesis
  // ----------------------------------------------------------------
  await runTest('1. Calculates canonical scores, verdicts, and breakdown from verified claims', async () => {
    const scoresData = calculateCategoryScores(mockRawReport.verifiedClaims, ['FACT_CHECKING', 'FAKE_NEWS_DETECTION']);

    assert.strictEqual(scoresData.articleVerdict, 'VERIFIED');
    assert.strictEqual(scoresData.factualAccuracyScore, 100);
    assert.strictEqual(scoresData.evidenceConfidence, 94);
    assert.strictEqual(scoresData.breakdown.verified, 1);
    assert.strictEqual(scoresData.breakdown.false, 0);
  });

  // ----------------------------------------------------------------
  // Test 2: Sanitization of Share/Export Payload (Tenant Privacy Guard)
  // ----------------------------------------------------------------
  await runTest('2. sanitizeReportForExport strictly strips private user IDs, workspace IDs, and API keys', async () => {
    const sanitized = sanitizeReportForExport(mockRawReport);

    assert.strictEqual(sanitized.userId, undefined, 'userId must be deleted');
    assert.strictEqual(sanitized.workspaceId, undefined, 'workspaceId must be deleted');
    assert.strictEqual(sanitized.apiKey, undefined, 'apiKey must be deleted');
    assert.strictEqual(sanitized.title, 'Union Cabinet Approves Clean Hydrogen Mission');
    assert.strictEqual(sanitized.verdict, 'VERIFIED');
  });

  // ----------------------------------------------------------------
  // Test 3: Multi-Tab Report Decomposition
  // ----------------------------------------------------------------
  await runTest('3. Report cleanly structures Full Report, Text, Links, Images, Videos, and Numbers tabs', async () => {
    const sanitized = sanitizeReportForExport(mockRawReport);

    // Full Report Tab
    assert.ok(sanitized.verifiedClaims.length > 0);
    // Text Tab
    assert.strictEqual(sanitized.textAnalysis.readability.wordCount, 150);
    assert.strictEqual(sanitized.textAnalysis.attributionQuality.attributionGrade, 'AUTHORITATIVE');
    // Links Tab
    assert.strictEqual(sanitized.linkIntelligence.primarySourcesCount, 1);
    // Images Tab
    assert.strictEqual(sanitized.imagesAnalysis.discoveredImages.length, 1);
    // Videos Tab
    assert.ok(Array.isArray(sanitized.videosAnalysis.discoveredVideos));
    // Numbers Tab
    assert.strictEqual(sanitized.numericalAnalysis.factsCount, 1);
  });

  // ----------------------------------------------------------------
  // Test 4: Markdown Export Generation
  // ----------------------------------------------------------------
  await runTest('4. Generates formatted Markdown export summary with all key metrics and citations', async () => {
    const md = generateReportMarkdownExport(mockRawReport);

    assert.ok(md.includes('# ETRAI Fact-Check & Verification Report'));
    assert.ok(md.includes('**Overall Verdict:** VERIFIED'));
    assert.ok(md.includes('pib.gov.in'));
    assert.ok(md.includes('₹19,744 Cr'));
  });

  // ----------------------------------------------------------------
  // Test 5: Dynamic Field Integrity
  // ----------------------------------------------------------------
  await runTest('5. Every displayed field originates dynamically from actual analysis data', async () => {
    const reportData = await generateReport({
      sourceTitle: 'Test Title',
      extractedText: 'Sample text body',
      verifiedClaims: mockRawReport.verifiedClaims,
      selectedTypes: ['FACT_CHECKING']
    });

    assert.strictEqual(reportData.articleVerdict, 'VERIFIED');
    assert.ok(reportData.scores.factCheckingScore > 0);
    assert.ok(reportData.summary.length > 0);
  });

  console.log('\n================================================================');
  console.log(`🏆 STAGE 27 TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runStage27ExplainableReportTests();
