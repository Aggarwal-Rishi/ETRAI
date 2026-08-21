const { runVerificationPipeline } = require('../src/services/verificationPipeline');

async function runObservabilityTestRun() {
  console.log('================================================================');
  console.log('🔍 ETRAI SYSTEM OBSERVABILITY & TELEMETRY TEST RUN');
  console.log('================================================================\n');

  const testDocument = `
Global cloud computing and AI infrastructure expenditure grew by over 20 percent according to major tech industry evaluations.
A tea garden worker was abducted by unidentified miscreants near the India-Bangladesh border in West Bengal today.
Local police and border security forces initiated search operations following the tea farmer abduction.
Billionaire tycoon Rishi Aggarwal purchased Microsoft and Google simultaneously in a $5 trillion cash buyout.
`;

  const inputPayload = {
    jobId: `test_obs_${Date.now()}`,
    userId: 'test_user_1',
    inputType: 'TEXT',
    text: testDocument,
    selectedTypes: ['FACT_CHECKING', 'FAKE_NEWS_DETECTION', 'BUSINESS_REPORT']
  };

  console.log('📥 INGESTED TEST PAYLOAD:');
  console.log(`   • Input Type    : ${inputPayload.inputType}`);
  console.log(`   • Text Length   : ${inputPayload.text.length} characters`);
  console.log(`   • Selected Types: ${inputPayload.selectedTypes.join(', ')}\n`);

  const reportData = await runVerificationPipeline(inputPayload);
  const obs = reportData.observability;

  console.log('----------------------------------------------------------------');
  console.log('⏱️  PIPELINE EXECUTION SUMMARY & PHASE TIMING');
  console.log('----------------------------------------------------------------');
  console.log(`  • Job ID                    : ${obs.jobId}`);
  console.log(`  • Total Pipeline Duration   : ${obs.totalDurationMs} ms`);
  console.log(`  • Phase 1 (Content Reader)  : ${obs.summary.phase1DurationMs} ms`);
  console.log(`  • Phase 2 (Claim Extractor) : ${obs.summary.phase2DurationMs} ms`);
  console.log(`  • Phase 3 (Fact Verifier)   : ${obs.summary.phase3DurationMs} ms`);
  console.log(`  • Phase 4 (Report Generator): ${obs.summary.phase4DurationMs} ms\n`);

  console.log('----------------------------------------------------------------');
  console.log('📄 PHASE 1 TELEMETRY (AGENT 1: CONTENT READER)');
  console.log('----------------------------------------------------------------');
  const p1 = obs.phases.phase1_contentReader;
  console.log(`  • Status                    : ${p1.status}`);
  console.log(`  • Word Count Ingested       : ${p1.outputs?.wordCount} words`);
  console.log(`  • Character Count           : ${p1.inputs?.text ? p1.inputs.text.length : 0} chars`);
  console.log(`  • Token Truncation Status   : ${p1.outputs?.truncated ? 'TRUNCATED (>12,000 tokens)' : 'FULL CONTEXT INGESTED'}`);
  console.log(`  • Article Sentiment VADER   : Compound = ${p1.outputs?.articleSentiment?.compound}, Intensity = ${p1.outputs?.articleSentiment?.intensity} (${p1.outputs?.articleSentiment?.label})`);
  console.log(`  • Warnings Logged           : ${p1.warnings.length === 0 ? 'None' : p1.warnings.join(', ')}\n`);

  console.log('----------------------------------------------------------------');
  console.log('🧠 PHASE 2 TELEMETRY (AGENT 2: CLAIM EXTRACTOR)');
  console.log('----------------------------------------------------------------');
  const p2 = obs.phases.phase2_claimExtractor;
  console.log(`  • Status                    : ${p2.status}`);
  console.log(`  • Total Claims Extracted    : ${p2.metadata?.totalClaims} claims`);
  console.log(`  • Claim Scope Breakdown    :`);
  console.log(`     - International Scope    : ${p2.metadata?.scopeCounts?.International || 0} claims`);
  console.log(`     - National Scope         : ${p2.metadata?.scopeCounts?.National || 0} claims`);
  console.log(`     - Regional Scope         : ${p2.metadata?.scopeCounts?.Regional || 0} claims`);
  console.log(`     - Local Scope            : ${p2.metadata?.scopeCounts?.Local || 0} claims`);
  console.log(`  • Breaking News Claims      : ${p2.metadata?.recentBreakingCount} claims\n`);

  console.log('----------------------------------------------------------------');
  console.log('🔍 PHASE 3 TELEMETRY (AGENT 3: FACT VERIFIER & 9-SIGNAL FUZZY ENGINE)');
  console.log('----------------------------------------------------------------');
  const p3 = obs.phases.phase3_factVerifier;
  console.log(`  • Status                    : ${p3.status}`);
  console.log(`  • Verification Breakdown   : ${p3.metadata?.verifiedCount} Verified, ${p3.metadata?.suspiciousCount} Suspicious, ${p3.metadata?.falseCount} False\n`);

  console.log('  📊 Detailed Claim-by-Claim Fuzzy Logic & Search Telemetry:');
  (reportData.claims || []).forEach((c, idx) => {
    const b = c.fuzzySignalBreakdown || {};
    const d = c.socialDiscourse || {};

    console.log(`  --------------------------------------------------------------`);
    console.log(`  [Claim ${idx + 1}] ID: ${c.claimId}`);
    console.log(`      Text                  : "${c.claimText}"`);
    console.log(`      Claim Scope           : ${c.claimScope}`);
    console.log(`      System Verdict        : ${c.status} (Crisp Defuzzified Confidence: ${c.confidence}%)`);
    console.log(`      Sources Found         : ${c.sources.length} sources`);
    c.sources.forEach(s => console.log(`        - [${s.domain}]: "${s.title}"`));
    console.log(`      X Discourse Signals   : Volume = ${d.discourseVolume} (${d.discourseVolumeLabel}), Social Corrob = ${d.socialCorroborationLabel}, Skepticism = ${d.communitySkepticismLabel}`);
    console.log(`      9 Fuzzy Input Signals :`);
    console.log(`        1. Corroboration Strength : ${b.corroborationScore} / 10`);
    console.log(`        2. Source Credibility     : ${b.sourceCredibilityScore} (${b.sourceCredibilityLabel})`);
    console.log(`        3. Sentiment Intensity    : ${b.sentimentIntensity}`);
    console.log(`        4. Claim Significance     : ${b.claimSignificance} / 100`);
    console.log(`        5. Model Confidence       : ${b.modelConfidence} %`);
    console.log(`        6. Discourse Volume       : ${b.discourseVolume} (${b.discourseVolumeLabel})`);
    console.log(`        7. Social Corroboration   : ${b.socialCorroborationLabel}`);
    console.log(`        8. Community Skepticism   : ${b.communitySkepticismLabel}`);
    console.log(`        9. Claim Scope            : ${b.claimScope}`);
    console.log(`      Activated Mamdani Rules:`);
    (b.activatedRules || []).forEach(r => console.log(`        * ${r}`));
    console.log(`      Reasoning Explanation : "${c.explanation}"`);
  });

  console.log('\n----------------------------------------------------------------');
  console.log('📊 PHASE 4 TELEMETRY (AGENT 4: CATEGORY SCORE ENGINE AUDIT)');
  console.log('----------------------------------------------------------------');
  const p4 = obs.phases.phase4_reportGenerator;
  console.log(`  • Status                    : ${p4.status}`);
  console.log(`  • Deterministic Category Scores Output:`);
  console.log(`     - Fact Checking Score          : ${reportData.scores.factCheckingScore}%`);
  console.log(`     - Fake News & Credibility Score: ${reportData.scores.fakeNewsScore}%`);
  console.log(`       * Base Credibility           : ${reportData.scores.sentimentAdjustmentApplied?.baseCredibility}%`);
  console.log(`       * Sentiment Intensity        : ${reportData.scores.sentimentAdjustmentApplied?.sentimentIntensity}`);
  console.log(`       * Standalone Sentiment Penalty: -${reportData.scores.sentimentAdjustmentApplied?.sentimentPenalty}%`);
  console.log(`     - Business Metric Precision    : ${String(reportData.scores.businessReportScore)}`);

  console.log('\n================================================================');
  console.log('🎉 OBSERVABILITY TEST RUN COMPLETED SUCCESSFULLY!');
  console.log('================================================================\n');
}

if (require.main === module) {
  runObservabilityTestRun().catch(err => {
    console.error('[Observability Test Error]:', err);
    process.exit(1);
  });
}

module.exports = { runObservabilityTestRun };
