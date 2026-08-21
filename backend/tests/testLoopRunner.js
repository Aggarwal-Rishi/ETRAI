require('dotenv').config();
const { fetchArticleFromUrl } = require('../src/services/inputReader');
const { extractClaims } = require('../src/services/claimExtractor');
const { verifyClaims } = require('../src/services/factVerifier');
const { evaluateFuzzyVerdict } = require('../src/services/fuzzyEngine');

const TEST_CASES = [
  {
    id: 1,
    name: "News 1 (Real Article URL - Jalpaiguri Tea Farmer Abduction)",
    url: "https://www.indiatoday.in/india/story/jalpaiguri-tea-farmer-abducted-near-bangladesh-border-bsf-seeks-release-2967286-2026-08-09",
    expectedVerdict: "TRUSTED"
  },
  {
    id: 2,
    name: "News 2 (Real Article URL - Jharkhand Student Assembly Protest)",
    url: "https://www.indiatoday.in/india/story/jharkhand-student-assembly-protest-live-updates-jharkhand-jpsc-jssc-exam-hemant-soren-devendra-nath-mahto-2967405-2026-08-10",
    expectedVerdict: "TRUSTED"
  },
  {
    id: 3,
    name: "News 3 (Fake Story Text - Rishi Aggarwal PM War on Russia)",
    text: "India's newly appointed Prime Minister, Rishi Aggarwal, has reportedly announced sweeping national policy reforms while declaring a military campaign against Russia over alleged border security concerns. The government supposedly imposed emergency measures and increased defense spending overnight.",
    expectedVerdict: "FABRICATED"
  }
];

async function runIteration(iterationNum) {
  console.log('================================================================');
  console.log(`🔄 ITERATION ${iterationNum}: TESTING ALL 3 NEWS STORIES`);
  console.log('================================================================\n');

  let allPassed = true;
  const resultsSummary = [];

  for (const testCase of TEST_CASES) {
    console.log(`\n📰 TEST CASE ${testCase.id}: ${testCase.name}`);
    console.log('----------------------------------------------------------------');

    let articleText = testCase.text || '';
    if (testCase.url) {
      console.log(`🌐 Fetching article text from URL: ${testCase.url}`);
      try {
        const articleData = await fetchArticleFromUrl(testCase.url);
        articleText = articleData.text;
        console.log(`   Fetched headline: "${articleData.headline}" (${articleText.length} chars)`);
      } catch (err) {
        console.error(`   ❌ URL fetch failed: ${err.message}`);
        allPassed = false;
        resultsSummary.push({ id: testCase.id, name: testCase.name, status: 'FAILED_URL_FETCH', expected: testCase.expectedVerdict });
        continue;
      }
    }

    if (!articleText || articleText.length < 50) {
      console.error('   ❌ Empty or insufficient article text!');
      allPassed = false;
      resultsSummary.push({ id: testCase.id, name: testCase.name, status: 'EMPTY_TEXT', expected: testCase.expectedVerdict });
      continue;
    }

    // Step 1: Agent 2 Claim Extraction
    console.log('🤖 Running Agent 2 Claim Extraction...');
    const claims = await extractClaims(articleText);
    console.log(`   Extracted ${claims.length} claims:\n`);

    claims.forEach((c, idx) => {
      console.log(`   [Claim ${idx + 1}] ID: ${c.id}`);
      console.log(`     TEXT        : "${c.text}"`);
      console.log(`     SEARCH QUERY: "${c.searchQuery}"`);
      console.log(`     SCOPE       : ${c.claimScope} | SCORED: ${c.importanceScore}`);
      console.log(`     ENTITIES    : ${JSON.stringify(c.entities)}`);
    });

    // Step 2: Agent 3 Fact Verification
    console.log('\n🤖 Running Agent 3 Fact Verification & 9-Signal Fuzzy Engine...');
    const verifiedResults = await verifyClaims(claims);

    let trustedCount = 0;
    let suspiciousCount = 0;
    let fabricatedCount = 0;

    verifiedResults.forEach((v, idx) => {
      console.log(`   [Result ${idx + 1}] Claim ID: ${v.claimId}`);
      console.log(`     STATUS      : ${v.status} (${v.confidence}%)`);
      console.log(`     WEB QUERY   : "${v.auditTrail?.searchQueries?.webQuery || ''}"`);
      console.log(`     EXPLANATION : "${v.explanation}"`);
      console.log(`     SUPPORT IND : ${JSON.stringify(v.supportingSourceIndices)} | REFUTE IND: ${JSON.stringify(v.refutingSourceIndices)}`);

      if (v.status === 'TRUSTED') trustedCount++;
      else if (v.status === 'SUSPICIOUS') suspiciousCount++;
      else if (v.status === 'FABRICATED') fabricatedCount++;
    });

    // Overall Article Verdict Calculation
    let overallVerdict = 'SUSPICIOUS';
    const totalClaims = verifiedResults.length;
    if (totalClaims > 0) {
      if (trustedCount / totalClaims >= 0.5) {
        overallVerdict = 'TRUSTED';
      } else if (fabricatedCount / totalClaims >= 0.5 || (trustedCount === 0 && (fabricatedCount > 0 || suspiciousCount > 0))) {
        overallVerdict = 'FABRICATED';
      }
    }

    const testPassed = testCase.expectedVerdict === 'TRUSTED' 
      ? (overallVerdict === 'TRUSTED') 
      : (overallVerdict === 'FABRICATED' || overallVerdict === 'SUSPICIOUS');

    console.log(`\n   📊 ARTICLE SUMMARY:`);
    console.log(`      Total Claims: ${totalClaims} | Trusted: ${trustedCount} | Suspicious: ${suspiciousCount} | Fabricated: ${fabricatedCount}`);
    console.log(`      Calculated Overall Verdict: ${overallVerdict}`);
    console.log(`      Expected Verdict          : ${testCase.expectedVerdict}`);
    console.log(`      Result                    : ${testPassed ? '✅ PASS' : '❌ FAIL'}`);

    if (!testPassed) allPassed = false;

    resultsSummary.push({
      id: testCase.id,
      name: testCase.name,
      overallVerdict,
      expected: testCase.expectedVerdict,
      totalClaims,
      trustedCount,
      suspiciousCount,
      fabricatedCount,
      passed: testPassed
    });
  }

  console.log('\n================================================================');
  console.log(`📊 ITERATION ${iterationNum} FINAL SUMMARY SCORE:`);
  resultsSummary.forEach(r => {
    console.log(`  Case ${r.id}: ${r.name}`);
    console.log(`    Calculated: ${r.overallVerdict} | Expected: ${r.expected} | Passed: ${r.passed ? '✅ YES' : '❌ NO'}`);
  });
  console.log('================================================================\n');

  return { allPassed, resultsSummary };
}

if (require.main === module) {
  runIteration(1).catch(err => {
    console.error('Iteration execution error:', err);
    process.exit(1);
  });
}

module.exports = { runIteration };
