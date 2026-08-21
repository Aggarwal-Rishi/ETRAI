const assert = require('assert');
const { processInputContent } = require('../src/services/inputReader');
const { extractClaims, cleanClaimText, isCoherentClaimStatement } = require('../src/services/claimExtractor');
const { validateSourceUrl, verifyClaims } = require('../src/services/factVerifier');

async function runSevenBugsVerification() {
  console.log('================================================================');
  console.log('🚀 RUNNING MANDATORY VERIFICATION SUITE FOR ALL 7 BUGS');
  console.log('================================================================\n');

  let totalTests = 0;
  let passedTests = 0;

  // ----------------------------------------------------------------
  // TEST 1: BUG 1 — URL Validation Gate Rejects Search Query URLs
  // ----------------------------------------------------------------
  totalTests++;
  console.log('----------------------------------------------------------------');
  console.log('1️⃣ TEST 1: URL Validation Gate Rejects Search Engine URLs (Bug 1)');
  console.log('----------------------------------------------------------------');
  const searchUrlsToTest = [
    'https://news.google.com/search?q=Reuters+Coverage+Claim',
    'https://www.google.com/search?q=test',
    'https://www.bing.com/search?q=factcheck',
    'https://webcache.googleusercontent.com/search?q=cache:http://example.com'
  ];

  let searchUrlsRejected = true;
  for (const sUrl of searchUrlsToTest) {
    const isValid = await validateSourceUrl(sUrl);
    if (isValid) {
      searchUrlsRejected = false;
      console.log(`❌ FAIL: URL validator permitted search engine URL: ${sUrl}`);
    }
  }

  // Pure validation check on non-search URL structure
  const isValidFormat = await validateSourceUrl('invalid_scheme://test');

  if (searchUrlsRejected && !isValidFormat) {
    passedTests++;
    console.log('   Search Engine URLs Tested:', searchUrlsToTest);
    console.log('   All Search Engine URLs Rejected: YES');
    console.log('   Evaluation: ✅ PASS (Bug 1 Fixed)\n');
  } else {
    console.log('   Evaluation: ❌ FAIL (Search URLs permitted)\n');
  }

  // ----------------------------------------------------------------
  // TEST 2: BUG 2 & META-INSTRUCTION — Multi-Source Cleanup & Escape Sequences
  // ----------------------------------------------------------------
  totalTests++;
  console.log('----------------------------------------------------------------');
  console.log('2️⃣ TEST 2: Multi-Source Formatting Cleanup & Escape Sequences (Bug 2)');
  console.log('----------------------------------------------------------------');
  
  // Source Type A: Wikipedia-style text with wikilinks, HTML tags, citations, escape sequences
  const wikiSourceText = `
    Soumitra Dutta is an Indian academic.\\nHe was appointed dean of the Saïd Business School at the [[University of Oxford]] in 2022.[1][2]
    Prior to Oxford, he served as founding dean at [[Cornell University]]'s SC Johnson College of Business.</small>
    His resignation followed allegations of sexual harassment towards a junior academic in Delhi.[3]
  `;

  // Source Type B: Standard news article HTML export
  const newsSourceText = `
    <article>
      <h1>Tech Corp Quarterly Financial Report</h1>
      <p>Tech Corp reported a 15% increase in annual net profit for fiscal year 2026.</p>
      <p>The company announced plans to expand data center operations across Europe.</p>
    </article>
  `;

  // Source Type C: PDF text extract with escaped newlines and footnote citations
  const pdfSourceText = `
    Global Energy Institute Report 2026.\\nSolar capacity grew by 24% globally in 2025.[note 1]
    Wind energy installations reached 100 GW across North America.[citation needed]
  `;

  const inputA = await processInputContent({ inputType: 'TEXT', text: wikiSourceText });
  const inputB = await processInputContent({ inputType: 'TEXT', text: newsSourceText });
  const inputC = await processInputContent({ inputType: 'TEXT', text: pdfSourceText });

  const resA = await extractClaims(inputA.extractedText);
  const resB = await extractClaims(inputB.extractedText);
  const resC = await extractClaims(inputC.extractedText);

  const claimsA = Array.isArray(resA) ? resA : (resA.claims || []);
  const claimsB = Array.isArray(resB) ? resB : (resB.claims || []);
  const claimsC = Array.isArray(resC) ? resC : (resC.claims || []);

  const allClaims = [...claimsA, ...claimsB, ...claimsC];

  const leaksFound = allClaims.filter(c => 
    /\[\[|\]\]|<\/[^>]+>|\\n|\\t|\[\d+\]/.test(c.text)
  );

  console.log(`   Total Claims Extracted Across 3 Source Types: ${allClaims.length}`);
  allClaims.forEach((c, idx) => console.log(`     - [Claim ${idx + 1}]: "${c.text}"`));

  if (leaksFound.length === 0 && allClaims.length > 0) {
    passedTests++;
    console.log('   Evaluation: ✅ PASS (Zero wikilinks, HTML tags, citations, or \\n escapes across all 3 source types)\n');
  } else {
    console.log(`   Leaks Found (${leaksFound.length}):`, leaksFound);
    console.log('   Evaluation: ❌ FAIL\n');
  }

  // ----------------------------------------------------------------
  // TEST 3: BUG 3 & BUG 6 — Garbled Claims & Infobox Dumps Rejected
  // ----------------------------------------------------------------
  totalTests++;
  console.log('----------------------------------------------------------------');
  console.log('3️⃣ TEST 3: Coherence Gate Rejects Garbled Text & Infobox Dumps (Bugs 3 & 6)');
  console.log('----------------------------------------------------------------');
  
  const garbledFragment1 = ") University of California, Berkeley ( M in Delhi.";
  const infoboxDump = ") Occupations University Dean, academic, author and entrepreneur Spouse Lourdes Casanova Soumitra Dutta is an Indian academic...";
  const coherentClaim = "Soumitra Dutta was appointed dean of the Saïd Business School at the University of Oxford in 2022.";

  const testGarbled1 = isCoherentClaimStatement(garbledFragment1);
  const testInfobox = isCoherentClaimStatement(infoboxDump);
  const testCoherent = isCoherentClaimStatement(coherentClaim);

  console.log(`   Garbled Fragment 1 ("${garbledFragment1.substring(0, 35)}...") -> Coherent: ${testGarbled1}`);
  console.log(`   Infobox Dump ("${infoboxDump.substring(0, 35)}...") -> Coherent: ${testInfobox}`);
  console.log(`   Coherent Sentence ("${coherentClaim.substring(0, 35)}...") -> Coherent: ${testCoherent}`);

  if (!testGarbled1 && !testInfobox && testCoherent) {
    passedTests++;
    console.log('   Evaluation: ✅ PASS (Garbled claims rejected by coherence gate)\n');
  } else {
    console.log('   Evaluation: ❌ FAIL\n');
  }

  // ----------------------------------------------------------------
  // TEST 4: BUG 4 — Displayed Score Consistency Audit
  // ----------------------------------------------------------------
  totalTests++;
  console.log('----------------------------------------------------------------');
  console.log('4️⃣ TEST 4: Displayed Score Synchronization (Bug 4)');
  console.log('----------------------------------------------------------------');
  
  const sampleClaim = {
    id: 'claim_test',
    text: 'Soumitra Dutta served as founding dean at Cornell University.',
    importanceScore: 80,
    claimScope: 'International'
  };

  const verifiedRes = await verifyClaims([sampleClaim]);
  const verifiedClaim = verifiedRes[0];

  const confidenceScore = verifiedClaim.confidence;
  const explanationStr = verifiedClaim.explanation;
  const scoreInExplanationMatch = explanationStr.match(/yielding crisp trust score of ([\d.]+)%/i);
  const scoreInExplanation = scoreInExplanationMatch ? parseFloat(scoreInExplanationMatch[1]) : null;

  console.log(`   Claim Confidence Score Badge : ${confidenceScore}%`);
  console.log(`   Score Stated in Explanation  : ${scoreInExplanation}%`);
  console.log(`   Full Explanation Text        : "${explanationStr}"`);

  if (scoreInExplanation !== null && Math.abs(confidenceScore - scoreInExplanation) < 0.1) {
    passedTests++;
    console.log('   Evaluation: ✅ PASS (Badge score and explanation text match 100%)\n');
  } else {
    console.log('   Evaluation: ❌ FAIL (Score mismatch between badge and explanation)\n');
  }

  // ----------------------------------------------------------------
  // TEST 5: BUG 5 — Possessive Pronoun Resolution Verification
  // ----------------------------------------------------------------
  totalTests++;
  console.log('----------------------------------------------------------------');
  console.log('5️⃣ TEST 5: Possessive Pronoun Resolution (Bug 5)');
  console.log('----------------------------------------------------------------');
  
  const pronounClaim = claimsA.find(c => c.text.includes('resignation followed allegations'));

  console.log(`   Input Sentence : "His resignation followed allegations..."`);
  console.log(`   Resolved Claim : "${pronounClaim ? pronounClaim.text : 'NOT FOUND'}"`);

  if (pronounClaim && !pronounClaim.text.startsWith('His ') && pronounClaim.text.includes("'s resignation")) {
    passedTests++;
    console.log('   Evaluation: ✅ PASS (Possessive pronoun "His" resolved to subject)\n');
  } else {
    console.log('   Evaluation: ❌ FAIL (Pronoun "His" was not resolved)\n');
  }

  // ----------------------------------------------------------------
  // TEST 6: BUG 7 — Zero Search Hits Produce Honest Uncertainty (No Fake Fallback)
  // ----------------------------------------------------------------
  totalTests++;
  console.log('----------------------------------------------------------------');
  console.log('6️⃣ TEST 6: Zero Search Hits Produce Honest Low-Trust Result (Bug 7)');
  console.log('----------------------------------------------------------------');

  const unsearchableClaim = {
    id: 'claim_unsearchable',
    text: 'An unverified private meeting took place in an unlisted building on March 12.',
    importanceScore: 50,
    claimScope: 'Regional'
  };

  const unsearchableRes = await verifyClaims([unsearchableClaim]);
  const verifiedUnsearchable = unsearchableRes[0];

  console.log(`   Verdict        : ${verifiedUnsearchable.verdict}`);
  console.log(`   Crisp Score    : ${verifiedUnsearchable.confidence}%`);
  console.log(`   Supporting Hits: ${verifiedUnsearchable.supportingSourceIndices.length}`);
  console.log(`   Explanation    : "${verifiedUnsearchable.explanation}"`);

  const bug7Passed = (verifiedUnsearchable.verdict === 'SUSPICIOUS' || verifiedUnsearchable.verdict === 'FABRICATED') &&
                     verifiedUnsearchable.supportingSourceIndices.length === 0 &&
                     verifiedUnsearchable.confidence <= 50;

  if (bug7Passed) {
    passedTests++;
    console.log('   Evaluation: ✅ PASS (Zero search hits produced honest low trust score; no fake 83.5% TRUSTED fallback)\n');
  } else {
    console.log('   Evaluation: ❌ FAIL (Synthetic high-confidence fallback detected)\n');
  }

  // ----------------------------------------------------------------
  // FINAL SUMMARY
  // ----------------------------------------------------------------
  console.log('================================================================');
  console.log(`🏆 7 BUGS MANDATORY VERIFICATION FINAL RESULT: ${passedTests}/${totalTests} PASSED`);
  console.log('================================================================\n');

  if (passedTests === totalTests) {
    console.log('🎉 ALL 7 BUGS SUCCESSFULLY FIXED AND VERIFIED ACROSS MULTIPLE SOURCE TYPES!');
  } else {
    process.exit(1);
  }
}

runSevenBugsVerification().catch(err => {
  console.error('❌ Verification script crashed:', err);
  process.exit(1);
});
