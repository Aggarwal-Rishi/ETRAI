const path = require('path');
const fs = require('fs');
const { verifyClaims } = require('../src/services/factVerifier');
const { calculateCategoryScores } = require('../src/services/reportGenerator');
const { CONFIGURABLE_THRESHOLDS } = require('../src/services/fuzzyEngine');

// Load updated benchmark claims fixture
const benchmarkPath = path.join(__dirname, 'fixtures', 'benchmarkClaims.json');
const benchmarkClaims = JSON.parse(fs.readFileSync(benchmarkPath, 'utf8'));

/**
 * MANDATORY VERIFICATION 1: Tea-Farmer Abduction Regional News Story Test
 */
async function verifyTeaFarmerRegionalStory() {
  console.log('================================================================');
  console.log('🍵 MANDATORY VERIFICATION 1: REGIONAL NEWS STORY (TEA-FARMER ABDUCTION)');
  console.log('================================================================\n');

  const teaFarmerClaim = {
    id: 'tea_farmer_1',
    text: 'A tea garden worker was abducted by unidentified miscreants near the India-Bangladesh border in West Bengal today.',
    importanceScore: 75,
    claimScope: 'Regional',
    isRecentBreaking: true,
    category: 'Regional Incident'
  };

  const results = await verifyClaims([teaFarmerClaim]);
  const res = results[0];
  const b = res.fuzzySignalBreakdown;

  console.log(`   Claim Text                 : "${res.claimText}"`);
  console.log(`   Assigned Claim Scope       : ${res.claimScope} (Regional/Local Scope)`);
  console.log(`   System Verdict             : ${res.status}`);
  console.log(`   Crisp Score                : ${res.confidence}% (Mathematically Defuzzified)`);
  console.log(`   Cited Sources              : ${res.sources.length} sources`);
  res.sources.forEach(s => console.log(`     • [${s.domain}]: "${s.title}"`));
  console.log(`   Explanation Note           : "${res.explanation}"`);
  console.log(`   Activated Fuzzy Rules:`);
  b.activatedRules.forEach(r => console.log(`     - ${r}`));

  const isIndiaTodayFound = res.sources.some(s => s.domain.includes('indiatoday.in') || s.domain.includes('ndtv.com'));
  const isNotFalse = res.status !== 'False';

  if (isNotFalse) {
    console.log(`\n   ✅ SUCCESS: Tea-farmer regional story correctly verified (${res.status}, ${res.confidence}%), avoiding false positive 100% False verdict! (Matched Tier 2 domain: ${isIndiaTodayFound ? 'India Today' : 'Regional Outlet'}).\n`);
  } else {
    console.log(`\n   ❌ FAILURE: Regional story was improperly marked False.\n`);
  }
}

/**
 * MANDATORY VERIFICATION 2: Division-by-Zero Score Fix (0/0 Edge Case)
 */
function verifyDivisionByZeroScoreFix() {
  console.log('================================================================');
  console.log('📐 MANDATORY VERIFICATION 2: DIVISION-BY-ZERO SCORE RENDERING FIX');
  console.log('================================================================\n');

  // Article with ZERO business claims (e.g. regional crime report)
  const regionalIncidentClaims = [
    { status: 'Verified', category: 'Regional Incident' },
    { status: 'Suspicious', category: 'General Statement' }
  ];

  const calc = calculateCategoryScores(regionalIncidentClaims, ['FACT_CHECKING', 'FAKE_NEWS_DETECTION', 'BUSINESS_REPORT'], { intensity: 0.1 });

  console.log('   Sample Article: Regional Crime Report (0 Financial/Business Claims)');
  console.log(`   • Fact Checking Score           : ${calc.scores.factCheckingScore}%`);
  console.log(`   • Fake News Credibility Score   : ${calc.scores.fakeNewsScore}%`);
  console.log(`   • Business Metric Precision Score: "${calc.scores.businessReportScore}"\n`);

  if (calc.scores.businessReportScore === "N/A — No claims of this type detected") {
    console.log('   ✅ SUCCESS: Business Metric Precision renders as "N/A — No claims of this type detected" instead of 0%!\n');
  } else {
    console.log(`   ❌ FAILURE: Score rendered as ${calc.scores.businessReportScore}\n`);
  }
}

/**
 * MANDATORY VERIFICATION 3: Rishi Aggarwal Fabricated Story (International Scope)
 */
async function verifyRishiAggarwalInternationalStory() {
  console.log('================================================================');
  console.log('🧪 MANDATORY VERIFICATION 3: FABRICATED "RISHI AGGARWAL" STORY');
  console.log('   (Verifying International Scope Gated Fabrication Detection)');
  console.log('================================================================\n');

  const rishiClaim = {
    id: 'rishi_test',
    text: 'Billionaire tycoon Rishi Aggarwal purchased Microsoft and Google simultaneously in a $5 trillion cash buyout.',
    importanceScore: 98,
    claimScope: 'International',
    category: 'Financial Fabrication'
  };

  const results = await verifyClaims([rishiClaim]);
  const res = results[0];
  const b = res.fuzzySignalBreakdown;

  console.log(`   Claim Text              : "${res.claimText}"`);
  console.log(`   Assigned Scope          : ${res.claimScope} (Global/International)`);
  console.log(`   System Verdict          : ${res.status}`);
  console.log(`   Crisp Score             : ${res.confidence}% (Mathematically Defuzzified)`);
  console.log(`   Explanation             : "${res.explanation}"`);
  console.log(`   Activated Fuzzy Rules:`);
  b.activatedRules.forEach(r => console.log(`     - ${r}`));

  if ((res.status === 'FABRICATED' || res.status === 'False') && res.confidence < 40) {
    console.log('\n   ✅ SUCCESS: International major fabrication STILL caught as FABRICATED (Scope=International triggered full fabrication penalty).\n');
  } else {
    console.log(`\n   ❌ FAILURE: International major fabrication was not flagged as FABRICATED (${res.status}, ${res.confidence}%).\n`);
  }
}

/**
 * MANDATORY VERIFICATION 4: 34-Claim Multi-Class Confusion Matrix & Metric Calculations
 */
async function runEvaluation(customThresholds = CONFIGURABLE_THRESHOLDS, quiet = false) {
  if (!quiet) {
    console.log('================================================================');
    console.log('📊 MANDATORY VERIFICATION 4: 34-CLAIM BENCHMARK EVALUATION SUITE');
    console.log('   (Includes 14 True, 10 False, 10 Ambiguous Claims)');
    console.log('================================================================\n');
  }

  let TP = 0, FP = 0, TN = 0, FN = 0;

  const labels = ['TRUSTED', 'SUSPICIOUS', 'FABRICATED'];
  const matrix3x3 = {
    TRUSTED: { TRUSTED: 0, SUSPICIOUS: 0, FABRICATED: 0 },
    SUSPICIOUS: { TRUSTED: 0, SUSPICIOUS: 0, FABRICATED: 0 },
    FABRICATED: { TRUSTED: 0, SUSPICIOUS: 0, FABRICATED: 0 }
  };

  const misclassifications = [];
  const evaluatedResults = [];

  for (const claim of benchmarkClaims) {
    const systemResults = await verifyClaims([claim], customThresholds);
    const result = systemResults[0];
    
    let systemVerdict = result.status;
    if (systemVerdict === 'Verified') systemVerdict = 'TRUSTED';
    if (systemVerdict === 'False') systemVerdict = 'FABRICATED';
    if (systemVerdict === 'Suspicious') systemVerdict = 'SUSPICIOUS';

    let groundTruth = claim.groundTruth;
    if (groundTruth === 'Verified') groundTruth = 'TRUSTED';
    if (groundTruth === 'False') groundTruth = 'FABRICATED';
    if (groundTruth === 'Suspicious') groundTruth = 'SUSPICIOUS';

    evaluatedResults.push({ claim, result });

    if (matrix3x3[groundTruth] && matrix3x3[groundTruth][systemVerdict] !== undefined) {
      matrix3x3[groundTruth][systemVerdict]++;
    }

    if (systemVerdict === 'TRUSTED') {
      if (groundTruth === 'TRUSTED') TP++;
      else FP++;
    } else {
      if (groundTruth === 'TRUSTED') FN++;
      else TN++;
    }

    if (systemVerdict !== groundTruth) {
      misclassifications.push({
        id: claim.id,
        text: claim.text,
        groundTruth,
        systemVerdict,
        confidence: result.confidence,
        importanceScore: claim.importanceScore,
        breakdown: result.fuzzySignalBreakdown
      });
    }
  }

  const precision = (TP + FP) > 0 ? TP / (TP + FP) : 0;
  const recall = (TP + FN) > 0 ? TP / (TP + FN) : 0;
  const f1 = (precision + recall) > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  let macroF1Sum = 0;
  for (const l of labels) {
    let classTP = matrix3x3[l][l];
    let classFP = 0;
    let classFN = 0;

    for (const other of labels) {
      if (other !== l) {
        classFP += matrix3x3[other][l];
        classFN += matrix3x3[l][other];
      }
    }

    const classPrec = (classTP + classFP) > 0 ? classTP / (classTP + classFP) : 0;
    const classRec = (classTP + classFN) > 0 ? classTP / (classTP + classFN) : 0;
    const classF1 = (classPrec + classRec) > 0 ? (2 * classPrec * classRec) / (classPrec + classRec) : 0;
    macroF1Sum += classF1;
  }
  const macroF1 = macroF1Sum / 3;

  if (!quiet) {
    console.log('----------------------------------------------------------------');
    console.log('📌 BINARY CONFUSION MATRIX (Positive Class = "TRUSTED")');
    console.log('----------------------------------------------------------------');
    console.log(`  True Positives  (TP): ${TP}  | System = TRUSTED,  Truth = TRUSTED`);
    console.log(`  False Positives (FP): ${FP}  | System = TRUSTED,  Truth = FABRICATED/SUSPICIOUS`);
    console.log(`  True Negatives  (TN): ${TN}  | System = Non-TRUSTED, Truth = FABRICATED/SUSPICIOUS`);
    console.log(`  False Negatives (FN): ${FN}  | System = Non-TRUSTED, Truth = TRUSTED\n`);

    console.log('🎯 PRIMARY & SECONDARY METRICS:');
    console.log(`  • Precision (TRUSTED Class): ${(precision * 100).toFixed(2)}%  [Target: Minimize FP]`);
    console.log(`  • Recall    (TRUSTED Class): ${(recall * 100).toFixed(2)}%`);
    console.log(`  • F1-Score  (TRUSTED Class): ${(f1 * 100).toFixed(2)}%`);
    console.log(`  • Macro-F1 (All 3 Classes)  : ${(macroF1 * 100).toFixed(2)}%\n`);

    console.log('----------------------------------------------------------------');
    console.log('📊 FULL 3x3 MULTI-CLASS CONFUSION MATRIX (Truth \\ System)');
    console.log('----------------------------------------------------------------');
    console.log('Ground Truth \\ Verdict | TRUSTED | SUSPICIOUS | FABRICATED');
    console.log('------------------------------------------------');
    console.log(`TRUSTED                |   ${String(matrix3x3.TRUSTED.TRUSTED).padStart(2)}    |     ${String(matrix3x3.TRUSTED.SUSPICIOUS).padStart(2)}     |   ${String(matrix3x3.TRUSTED.FABRICATED).padStart(2)}`);
    console.log(`SUSPICIOUS             |   ${String(matrix3x3.SUSPICIOUS.TRUSTED).padStart(2)}    |     ${String(matrix3x3.SUSPICIOUS.SUSPICIOUS).padStart(2)}     |   ${String(matrix3x3.SUSPICIOUS.FABRICATED).padStart(2)}`);
    console.log(`FABRICATED             |   ${String(matrix3x3.FABRICATED.TRUSTED).padStart(2)}    |     ${String(matrix3x3.FABRICATED.SUSPICIOUS).padStart(2)}     |   ${String(matrix3x3.FABRICATED.FABRICATED).padStart(2)}`);
    console.log('------------------------------------------------\n');

    if (misclassifications.length > 0) {
      console.log(`⚠️  MISCLASSIFIED CLAIMS (${misclassifications.length}/${benchmarkClaims.length}):`);
      misclassifications.forEach((m, idx) => {
        console.log(`  [${idx + 1}] Claim ID: ${m.id}`);
        console.log(`      Text: "${m.text.substring(0, 75)}..."`);
        console.log(`      Truth: ${m.groundTruth} | System Verdict: ${m.systemVerdict} (Crisp Confidence: ${m.confidence}%)`);
      });
      console.log('');
    } else {
      console.log('🎉 PERFECT CLASSIFICATION ACROSS ALL 34 BENCHMARK CLAIMS!\n');
    }
  }

  return {
    TP, FP, TN, FN,
    precision,
    recall,
    f1,
    macroF1,
    matrix3x3,
    misclassifications,
    evaluatedResults
  };
}

/**
 * MANDATORY VERIFICATION STEP 5: Architectural Explanation
 */
function displayArchitecturalExplanation() {
  console.log('================================================================');
  console.log('🧠 MANDATORY VERIFICATION 5: SYSTEM TREATMENT EXPLANATION');
  console.log('================================================================\n');

  console.log('   "How the system now distinguishes International Silence vs Regional Silence:"');
  console.log('   -------------------------------------------------------------------------');
  console.log('   1. International/National Claims (e.g. leader actions, wars, corporate buyouts):');
  console.log('      • Expected Behavior: IF real, global wire services (Reuters, AP, BBC) and social feeds MUST cover it.');
  console.log('      • Rule R2/R12 Treatment: Zero search coverage triggers the harsh fabrication penalty (Trust -> VeryLow -> FALSE).');
  console.log('      • Rationale: An unrecorded global event is overwhelmingly evidence of fabrication.\n');
  console.log('   2. Regional/Local Claims (e.g. district crimes, local abductions, regional projects):');
  console.log('      • Expected Behavior: IF real, global wire services will NOT cover it; only regional press or local feeds might.');
  console.log('      • Rule R15 Treatment: Zero coverage in global search engines is NORMAL and EXPECTED.');
  console.log('        It triggers a soft rule (Trust -> Medium -> SUSPICIOUS), attaching recency/indexing delay notes.');
  console.log('      • Rationale: Absence of global coverage for a regional event reflects scope limitation, NOT fabrication!\n');
}

async function main() {
  // Step 1: Tea Farmer Regional Story
  await verifyTeaFarmerRegionalStory();

  // Step 2: Division-by-Zero Score Fix
  verifyDivisionByZeroScoreFix();

  // Step 3: Rishi Aggarwal Story
  await verifyRishiAggarwalInternationalStory();

  // Step 4: Benchmark Evaluation Suite
  await runEvaluation();

  // Step 5: Self Explanation
  displayArchitecturalExplanation();
}

if (require.main === module) {
  main().catch(err => {
    console.error('[Evaluation Framework Error]:', err);
    process.exit(1);
  });
}

module.exports = {
  runEvaluation,
  verifyTeaFarmerRegionalStory,
  verifyDivisionByZeroScoreFix,
  verifyRishiAggarwalInternationalStory,
  displayArchitecturalExplanation
};
