const { runVerificationPipeline } = require('../src/services/verificationPipeline');

async function testUserScreenshotText() {
  const userText = `advertisement <> Read Full Story According to local sources, on August 6, a Bangladeshi man allegedly tried to enter India by cutting the barbed wire fence along the Chaulhati border.`;

  const inputPayload = {
    jobId: `test_screenshot_${Date.now()}`,
    userId: 'user_demo',
    inputType: 'TEXT',
    text: userText,
    selectedTypes: ['FACT_CHECKING', 'FAKE_NEWS_DETECTION', 'BUSINESS_REPORT']
  };

  const report = await runVerificationPipeline(inputPayload);

  console.log('================================================================');
  console.log('🧪 TEST VERIFICATION FOR USER SCREENSHOT TEXT (3-CATEGORY STANDARD)');
  console.log('================================================================\n');

  console.log(`Document Title      : ${report.sourceTitle}`);
  console.log(`Fact Checking Score  : ${report.scores.factCheckingScore}%`);
  console.log(`Fake News Score      : ${report.scores.fakeNewsScore}%`);
  console.log(`Business Score       : ${String(report.scores.businessReportScore)}`);
  console.log(`Claims Count         : ${report.claims.length}`);
  
  report.claims.forEach((c, idx) => {
    console.log(`\n[Claim ${idx + 1}]`);
    console.log(`  Text       : "${c.claimText}"`);
    console.log(`  Scope      : ${c.claimScope}`);
    console.log(`  Status     : ${c.status} (${c.confidence}%)`);
    console.log(`  Sources    : ${c.sources.length} sources`);
    c.sources.forEach(s => console.log(`    - [${s.domain}]: "${s.title}" (Trust: ${s.trustScore || 'Default'})`));
    console.log(`  Audit Pass 1 Query: "${c.auditTrail.searchQueries.webQuery}"`);
    console.log(`  Audit Pass 2 Query: "${c.auditTrail.searchQueries.xQuery}"`);
    console.log(`  GPT Prompt Sent   : Present (${c.auditTrail.gptCrossVerification.promptSent ? 'YES' : 'NO'})`);
  });
}

if (require.main === module) {
  testUserScreenshotText().catch(console.error);
}
