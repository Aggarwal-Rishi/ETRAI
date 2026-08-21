const { runVerificationPipeline } = require('../src/services/verificationPipeline');
const fetch = require('node-fetch');

async function testUrlLive(url) {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    return res.ok || (res.status >= 300 && res.status < 400);
  } catch (e) {
    return false;
  }
}

async function runComprehensiveCategorySuite() {
  console.log('================================================================');
  console.log('🧪 ETRAI COMPREHENSIVE 3-CATEGORY & LIVE URL VERIFICATION SUITE');
  console.log('================================================================\n');

  let passedTests = 0;
  let totalTests = 3;

  // -------------------------------------------------------------------------
  // TEST 1: REAL TRUSTED NEWS ARTICLE
  // -------------------------------------------------------------------------
  console.log('🔹 [TEST 1/3] REAL TRUSTED NEWS STORY EVALUATION...');
  const trustedStoryText = `(Screengrab) India Today News Desk Jalpaiguri, West Bengal , UPDATED: Aug 9, 2026 23:38 IST Edited By: Ritaban Misra A 35-year-old tea farmer from West Bengal's Jalpaiguri district was allegedly abducted by a group of Bangladeshi men from a tea garden near the India-Bangladesh border on Saturday. The BSF remains in constant contact with Bangladeshi authorities to secure the farmer's safe release.`;

  const payload1 = {
    jobId: `test_trusted_${Date.now()}`,
    userId: 'suite_user',
    inputType: 'TEXT',
    text: trustedStoryText,
    selectedTypes: ['FACT_CHECKING', 'FAKE_NEWS_DETECTION', 'BUSINESS_REPORT']
  };

  const report1 = await runVerificationPipeline(payload1);
  const verdict1 = report1.reportData?.manipulationAnalysis?.verdict || report1.manipulationAnalysis?.verdict;
  const claims1 = report1.claims || [];

  console.log(`   Ingested Raw Text Length : ${trustedStoryText.length} characters`);
  console.log(`   Report Overall Verdict   : ${verdict1}`);
  console.log(`   Fact Checking Score      : ${report1.scores.factCheckingScore}%`);
  console.log(`   Claims Extracted (${claims1.length}):`);

  let t1UrlsValid = true;
  let t1TextClean = true;

  for (let i = 0; i < claims1.length; i++) {
    const c = claims1[i];
    console.log(`     [Claim ${i+1}] "${c.claimText}" -> ${c.status} (${c.confidence}%)`);

    // Check if HTML entities or metadata noise leaked
    if (c.claimText.includes('&#x27;') || c.claimText.includes('Screengrab') || c.claimText.includes('UPDATED:') || c.claimText.includes('Edited By:')) {
      t1TextClean = false;
      console.log(`       ❌ NOISE LEAK DETECTED in claim text!`);
    }

    // Check source URLs for live article link structure
    for (const src of c.sources || []) {
      const isLiveArticle = await testUrlLive(src.url);
      console.log(`       Source Link: [${src.domain}] ${src.url} -> ${isLiveArticle ? 'LIVE ARTICLE EVIDENCE LINK (200 OK)' : 'FAILED (404/DEAD)'}`);
      if (!isLiveArticle) t1UrlsValid = false;
    }
  }

  if ((verdict1 === 'TRUSTED' || verdict1 === 'HIGH_TRUST') && t1UrlsValid && t1TextClean) {
    console.log('   ✅ PASS: Test 1 (TRUSTED Story) — Perfect Category Match, Clean Text & 100% Live Links!\n');
    passedTests++;
  } else {
    console.log('   ❌ FAIL: Test 1 (TRUSTED Story) — Category or link validation failed.\n');
  }

  // -------------------------------------------------------------------------
  // TEST 2: UNCONFIRMED SUSPICIOUS REGIONAL RUMOR
  // -------------------------------------------------------------------------
  console.log('🔹 [TEST 2/3] UNCONFIRMED SUSPICIOUS REGIONAL RUMOR EVALUATION...');
  const suspiciousStoryText = `Local social media accounts reported unconfirmed claims that a massive gold deposit was unearthed in a backyard garden in rural Jalpaiguri. Local residents gathered at the site while authorities have not issued any official statement.`;

  const payload2 = {
    jobId: `test_suspicious_${Date.now()}`,
    userId: 'suite_user',
    inputType: 'TEXT',
    text: suspiciousStoryText,
    selectedTypes: ['FACT_CHECKING', 'FAKE_NEWS_DETECTION']
  };

  const report2 = await runVerificationPipeline(payload2);
  const verdict2 = report2.reportData?.manipulationAnalysis?.verdict || report2.manipulationAnalysis?.verdict;
  const claims2 = report2.claims || [];

  console.log(`   Report Overall Verdict   : ${verdict2}`);
  console.log(`   Fact Checking Score      : ${report2.scores.factCheckingScore}%`);
  claims2.forEach((c, idx) => console.log(`     [Claim ${idx+1}] "${c.claimText}" -> ${c.status} (${c.confidence}%)`));

  if (verdict2 === 'SUSPICIOUS' || verdict2 === 'MODERATE_TRUST') {
    console.log('   ✅ PASS: Test 2 (SUSPICIOUS Story) — Correct Unconfirmed Rumor Classification!\n');
    passedTests++;
  } else {
    console.log(`   ❌ FAIL: Test 2 (SUSPICIOUS Story) — Expected SUSPICIOUS but got ${verdict2}.\n`);
  }

  // -------------------------------------------------------------------------
  // TEST 3: FABRICATED FAKE NEWS STORY
  // -------------------------------------------------------------------------
  console.log('🔹 [TEST 3/3] FABRICATED FAKE NEWS STORY EVALUATION...');
  const fakeStoryText = `Billionaire tycoon Rishi Aggarwal purchased Microsoft and Google simultaneously in a $5 trillion cash buyout during a emergency press conference in New Delhi today.`;

  const payload3 = {
    jobId: `test_fake_${Date.now()}`,
    userId: 'suite_user',
    inputType: 'TEXT',
    text: fakeStoryText,
    selectedTypes: ['FACT_CHECKING', 'FAKE_NEWS_DETECTION']
  };

  const report3 = await runVerificationPipeline(payload3);
  const verdict3 = report3.reportData?.manipulationAnalysis?.verdict || report3.manipulationAnalysis?.verdict;
  const claims3 = report3.claims || [];

  console.log(`   Report Overall Verdict   : ${verdict3}`);
  console.log(`   Fact Checking Score      : ${report3.scores.factCheckingScore}%`);
  claims3.forEach((c, idx) => console.log(`     [Claim ${idx+1}] "${c.claimText}" -> ${c.status} (${c.confidence}%)`));

  if (verdict3 === 'FABRICATED' || verdict3 === 'LOW_TRUST') {
    console.log('   ✅ PASS: Test 3 (FABRICATED Story) — Decisive Misinformation Detection!\n');
    passedTests++;
  } else {
    console.log(`   ❌ FAIL: Test 3 (FABRICATED Story) — Expected FABRICATED but got ${verdict3}.\n`);
  }

  console.log('================================================================');
  console.log(`🏆 SUITE EXECUTION SUMMARY: ${passedTests}/${totalTests} TESTS PASSED (${Math.round(passedTests/totalTests*100)}%)`);
  console.log('================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

if (require.main === module) {
  runComprehensiveCategorySuite().catch(err => {
    console.error('Suite error:', err);
    process.exit(1);
  });
}
