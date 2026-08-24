const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const testsDir = __dirname;
const timeoutMs = Number(process.env.ETRAI_AUDIT_TIMEOUT_MS || 45000);
const includeExternal = process.argv.includes('--include-external');
const includeLegacy = process.argv.includes('--include-legacy');
const self = path.basename(__filename);
const externalPatterns = [
  /benchmark/i,
  /gemini_probe/i,
  /persistentauthdatabase/i,
  /prismamediaanalysispersistence/i,
  /serperapidirect/i,
  /realnewsreport/i,
  /fulle2e/i,
  /observability/i,
  /live_launch/i,
  /stage11_live/i
];

const currentCoreTests = new Set([
  'runAuthTests.js',
  'runDiagnosticTest.js',
  'runInputReaderTests.js',
  'runVerificationFixTests.js',
  'stage4_robust_audit_suite.js',
  'testAgent2ConsolidatedRules.js',
  'testAgent2SemanticContextSuite.js',
  'testAgent3EvidenceStance.js',
  'testAgent3FormalSemanticVerificationSuite.js',
  'testAgent3SemanticRetrievalSuite.js',
  'testAllInputFormatsVerdictMatrix.js',
  'testFuzzyEngineSemanticGuard.js',
  'testImageForensicsCompare.js',
  'testInputReaderMediaPropagation.js',
  'testMergedAgent2Agent3Pipeline.js',
  'testPhase2SourceIntelligenceAndGemini.js',
  'testPhase3EvidenceFirstVerification.js',
  'testPhase4TransparentScoring.js',
  'testPhase5ProvenanceSpreadEntityIntelligence.js',
  'testPhase6MediaDocumentIntelligence.js',
  'testPhase7InvestigationReportSystem.js',
  'testPhase9SaaSWorkspaceLayer.js',
  'testRealPhotoVerificationPipeline.js',
  'testRealVideoVerificationPipeline.js',
  'testReportDeletion.js',
  'testScoreDerivationRealWiring.js',
  'testSecurityAndSsrf.js',
  'testSerperReverseImageFlow.js',
  'testStage14DatabaseExpansion.js',
  'testStage15SemanticEvidenceRetrieval.js',
  'testStage16SourceIntelligence.js',
  'testStage17ContentProvenance.js',
  'testStage18LiveNewsDesk.js',
  'testStage20MultiModalInput.js',
  'testStage21ImageForensics.js',
  'testStage22VideoAudioForensics.js',
  'testStage23EntityIntentAnalysis.js',
  'testStage24NumericalFactAnalysis.js',
  'testStage25AdvancedTextAnalysis.js',
  'testStage26LinkAssetIntelligence.js',
  'testStage27ExplainableReport.js',
  'testStage28ExplainableScoring.js',
  'testStage30GlobalSearch.js',
  'testStage31MultiUserWorkspace.js',
  'testStage32AccountSecurity.js',
  'testStage33SubscriptionBilling.js',
  'testStage34OperationalIntelligence.js',
  'testStage35ProductionAudit.js',
  'testUrlValidation.js',
  'testVideoUrlVerification.js'
]);

const files = fs.readdirSync(testsDir)
  .filter((name) => name.endsWith('.js') && name !== self)
  .filter((name) => includeLegacy || currentCoreTests.has(name))
  .filter((name) => includeExternal || !externalPatterns.some((pattern) => pattern.test(name)))
  .sort();

const results = [];
for (const [index, name] of files.entries()) {
  const started = Date.now();
  process.stdout.write(`[${index + 1}/${files.length}] ${name} ... `);
  const result = spawnSync(process.execPath, [path.join(testsDir, name)], {
    cwd: path.resolve(testsDir, '..'),
    env: { ...process.env, ETRAI_TEST_MODE: process.env.ETRAI_TEST_MODE || 'mock' },
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 4 * 1024 * 1024
  });
  const elapsedMs = Date.now() - started;
  const status = result.error?.code === 'ETIMEDOUT' ? 'TIMEOUT' : result.status === 0 ? 'PASS' : 'FAIL';
  console.log(`${status} (${elapsedMs}ms)`);
  results.push({
    name,
    status,
    elapsedMs,
    exitCode: result.status,
    signal: result.signal,
    stderr: (result.stderr || '').slice(-2500),
    stdout: (result.stdout || '').slice(-2500)
  });
}

const failed = results.filter((result) => result.status !== 'PASS');
console.log(`\nAudit summary: ${results.length - failed.length}/${results.length} passed; ${failed.length} failed or timed out.`);
for (const result of failed) {
  console.log(`\n--- ${result.status}: ${result.name} ---`);
  console.log(result.stderr || result.stdout || '(no captured output)');
}

process.exitCode = failed.length > 0 ? 1 : 0;
