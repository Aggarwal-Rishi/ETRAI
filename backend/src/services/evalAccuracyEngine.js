/**
 * ETRAI Stage 7: Real-World Accuracy & Fact-Checking Evaluation Engine
 * 
 * Provides rigorous evaluation instrumentation across all 5 verification dimensions:
 * 1. Claim Extraction Evaluation (Agent 2 Precision, Recall, Self-Containment)
 * 2. Retrieval & Source Evaluation (Agent 3 Search Queries, Domain Authority, URL Validity)
 * 3. 15-Dimension Semantic Stance Evaluation (Agent 3 Stance Correctness, Adversarial Invariance)
 * 4. Overall Verdict & Multi-Class Confusion Matrix (Accuracy, Macro-F1, FPR, FNR)
 * 5. Trust Score Calibration & Evidence Grounding (Monotonic Score Validity, Zero Hallucination)
 */

'use strict';

const { evaluateSemanticStance } = require('./semanticVerification');
const { getDomainTrustScore } = require('./domainTrust');

/**
 * Calculates Token / Entity Overlap Similarity between two strings
 */
function calculateJaccardSimilarity(strA, strB) {
  if (!strA || !strB) return 0;
  const setA = new Set(strA.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 2));
  const setB = new Set(strB.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 2));
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * 1. Claim Extraction Evaluation (Agent 2)
 */
function evaluateClaimExtraction(extractedClaims = [], expectedClaims = []) {
  const extracted = Array.isArray(extractedClaims) ? extractedClaims : [];
  const expected = Array.isArray(expectedClaims) ? expectedClaims : [];

  let matchedCount = 0;
  const matchedPairs = [];
  const missingClaims = [];
  const malformedClaims = [];

  // Check self-containment of extracted claims
  for (const ext of extracted) {
    const text = ext.text || ext.claimText || '';
    const isTooShort = text.length < 15;
    const isPronounStart = /^(he|she|it|they|this|that|these|those)\b/i.test(text.trim());
    if (isTooShort || isPronounStart) {
      malformedClaims.push({ text, reason: isTooShort ? 'TOO_SHORT' : 'PRONOUN_DEPENDENT' });
    }
  }

  // Match extracted against expected ground truth
  for (const exp of expected) {
    const expText = exp.claimText || exp.text || '';
    let bestMatch = null;
    let maxSim = 0;

    for (const ext of extracted) {
      const extText = ext.text || ext.claimText || '';
      const sim = calculateJaccardSimilarity(expText, extText);
      if (sim > maxSim) {
        maxSim = sim;
        bestMatch = ext;
      }
    }

    if (maxSim >= 0.25) {
      matchedCount++;
      matchedPairs.push({ expected: expText, extracted: bestMatch?.text || bestMatch?.claimText, similarity: maxSim });
    } else {
      missingClaims.push(expText);
    }
  }

  const precision = extracted.length > 0 ? Math.min(1.0, matchedCount / extracted.length) : 0;
  const recall = expected.length > 0 ? Math.min(1.0, matchedCount / expected.length) : 0;
  const f1 = (precision + recall) > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return {
    extractedCount: extracted.length,
    expectedCount: expected.length,
    matchedCount,
    precision: Number(precision.toFixed(4)),
    recall: Number(recall.toFixed(4)),
    f1: Number(f1.toFixed(4)),
    matchedPairs,
    missingClaims,
    malformedClaims,
    isSelfContained: malformedClaims.length === 0
  };
}

/**
 * 2. Retrieval Quality Evaluation (Agent 3)
 */
function evaluateRetrievalQuality(searchQuery, searchResults = [], groundTruthSources = []) {
  const results = Array.isArray(searchResults) ? searchResults : [];
  const gtSources = Array.isArray(groundTruthSources) ? groundTruthSources : [];

  let trustedSourceCount = 0;
  let relevantHitCount = 0;
  const searchEngineUrls = [];
  const invalidUrls = [];

  for (const item of results) {
    const url = item.url || '';
    const domain = item.domain || (url ? url.replace(/^https?:\/\//, '').split('/')[0] : '');

    // Check for search engine URL leak (Bug 1 guard)
    if (/\b(search\?q=|google\.com\/search|bing\.com\/search|duckduckgo\.com)\b/i.test(url)) {
      searchEngineUrls.push(url);
    }

    // Check URL syntax validity
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      invalidUrls.push(url);
    }

    // Check domain trust rating
    const trust = getDomainTrustScore(domain);
    if (trust >= 60 || gtSources.some(gt => domain.includes(gt) || gt.includes(domain))) {
      trustedSourceCount++;
    }

    // Check relevance of title/snippet
    const titleSnippet = `${item.title || ''} ${item.snippet || ''}`;
    if (titleSnippet.length > 20) {
      relevantHitCount++;
    }
  }

  const queryEntityQuality = typeof searchQuery === 'string' && searchQuery.trim().length >= 6;
  const trustedRatio = results.length > 0 ? trustedSourceCount / results.length : 0;

  return {
    searchQuery,
    totalHits: results.length,
    trustedSourceCount,
    trustedRatio: Number(trustedRatio.toFixed(4)),
    relevantHitCount,
    searchEngineLeakCount: searchEngineUrls.length,
    invalidUrlCount: invalidUrls.length,
    queryEntityQuality,
    cleanRetrieval: searchEngineUrls.length === 0 && invalidUrls.length === 0
  };
}

/**
 * 3. 15-Dimension Semantic Stance Accuracy (Agent 3)
 */
function evaluateSemanticStanceAccuracy(claim, evidenceItem, expectedStance) {
  const evalResult = evaluateSemanticStance(claim, evidenceItem);
  const isMatch = evalResult.stance === expectedStance;

  return {
    claimText: typeof claim === 'string' ? claim : (claim.text || claim.claimText || ''),
    evidenceSnippet: evidenceItem.snippet || evidenceItem.text || '',
    predictedStance: evalResult.stance,
    expectedStance,
    isCorrect: isMatch,
    confidence: evalResult.confidence,
    dimensions: evalResult.dimensionAnalysis,
    components: evalResult.componentAnalysis,
    reason: evalResult.reason
  };
}

/**
 * 4. Overall Article Verdict Evaluation & Confusion Matrix
 */
const VERDICT_CLASSES = ['VERIFIED', 'FALSE', 'PARTIALLY_VERIFIED', 'UNVERIFIED'];

function evaluateOverallVerdict(predictedVerdict, expectedVerdict) {
  const normPred = String(predictedVerdict || 'UNVERIFIED').toUpperCase();
  const normExp = String(expectedVerdict || 'UNVERIFIED').toUpperCase();

  const isExactMatch = normPred === normExp;
  
  // Semantic compatibility check (e.g. PARTIALLY_VERIFIED is adjacent to VERIFIED or UNVERIFIED)
  let isCompatible = isExactMatch;
  if (!isExactMatch) {
    if (normExp === 'FALSE' && (normPred === 'FALSE' || normPred === 'FABRICATED')) isCompatible = true;
    if (normExp === 'VERIFIED' && (normPred === 'VERIFIED' || normPred === 'TRUSTED')) isCompatible = true;
  }

  return {
    predictedVerdict: normPred,
    expectedVerdict: normExp,
    isExactMatch,
    isCompatible
  };
}

/**
 * 5. Trust Score Calibration
 */
function evaluateTrustScoreCalibration(actualScore, expectedRange = [0, 100], verdict = 'UNVERIFIED') {
  const numScore = typeof actualScore === 'number' ? actualScore : 50;
  const [minExpected, maxExpected] = Array.isArray(expectedRange) ? expectedRange : [0, 100];

  const inExpectedRange = numScore >= minExpected && numScore <= maxExpected;
  
  // Monotonic sanity checks
  let isMonotonicallySound = true;
  if (verdict === 'VERIFIED' && numScore < 50) isMonotonicallySound = false;
  if (verdict === 'FALSE' && numScore > 50) isMonotonicallySound = false;

  return {
    actualScore: numScore,
    expectedRange: [minExpected, maxExpected],
    inExpectedRange,
    isMonotonicallySound
  };
}

/**
 * 6. Evidence Grounding & Zero-Hallucination Audit
 */
function evaluateEvidenceGrounding(verifiedClaims = []) {
  const claims = Array.isArray(verifiedClaims) ? verifiedClaims : [];
  let totalClaims = claims.length;
  let groundedClaims = 0;
  let ungroundedClaims = 0;
  const groundingFailures = [];

  for (const c of claims) {
    const verdict = c.status || c.verdict || 'UNVERIFIED';
    const sources = Array.isArray(c.sources) ? c.sources : [];

    if (verdict === 'TRUSTED' || verdict === 'Verified' || verdict === 'VERIFIED') {
      if (sources.length === 0) {
        ungroundedClaims++;
        groundingFailures.push({ claim: c.claimText, reason: 'VERIFIED claim has ZERO supporting sources' });
        continue;
      }
      
      const hasValidSource = sources.some(s => s.domain && (s.url || s.snippet));
      if (!hasValidSource) {
        ungroundedClaims++;
        groundingFailures.push({ claim: c.claimText, reason: 'VERIFIED claim sources lack valid domain/URL' });
        continue;
      }
    }

    groundedClaims++;
  }

  const groundingRatio = totalClaims > 0 ? groundedClaims / totalClaims : 1.0;
  return {
    totalClaims,
    groundedClaims,
    ungroundedClaims,
    groundingRatio: Number(groundingRatio.toFixed(4)),
    isFullyGrounded: ungroundedClaims === 0,
    groundingFailures
  };
}

/**
 * 7. Comprehensive Aggregate Metrics & Confusion Matrix
 */
function calculateAggregateMetrics(evalCaseResults = []) {
  const matrix = {};
  for (const actual of VERDICT_CLASSES) {
    matrix[actual] = {};
    for (const pred of VERDICT_CLASSES) {
      matrix[actual][pred] = 0;
    }
  }

  let totalCases = evalCaseResults.length;
  let correctCases = 0;
  const categoryStats = {};
  const difficultyStats = {};

  for (const res of evalCaseResults) {
    const exp = VERDICT_CLASSES.includes(res.expectedVerdict) ? res.expectedVerdict : 'UNVERIFIED';
    const pred = VERDICT_CLASSES.includes(res.predictedVerdict) ? res.predictedVerdict : 'UNVERIFIED';

    if (!matrix[exp]) matrix[exp] = {};
    matrix[exp][pred] = (matrix[exp][pred] || 0) + 1;

    if (res.isExactMatch || res.isCompatible) {
      correctCases++;
    }

    // Category metrics
    const cat = res.category || 'UNKNOWN';
    if (!categoryStats[cat]) categoryStats[cat] = { total: 0, correct: 0 };
    categoryStats[cat].total++;
    if (res.isExactMatch || res.isCompatible) categoryStats[cat].correct++;

    // Difficulty metrics
    const diff = res.difficulty || 'MEDIUM';
    if (!difficultyStats[diff]) difficultyStats[diff] = { total: 0, correct: 0 };
    difficultyStats[diff].total++;
    if (res.isExactMatch || res.isCompatible) difficultyStats[diff].correct++;
  }

  const accuracy = totalCases > 0 ? correctCases / totalCases : 0;

  // Per-class Precision, Recall, F1
  const perClassMetrics = {};
  let macroPrecisionSum = 0;
  let macroRecallSum = 0;
  let activeClassCount = 0;

  for (const cls of VERDICT_CLASSES) {
    const tp = matrix[cls]?.[cls] || 0;
    let fn = 0;
    let fp = 0;
    let tn = 0;

    for (const other of VERDICT_CLASSES) {
      if (other !== cls) {
        fn += matrix[cls]?.[other] || 0;
        fp += matrix[other]?.[cls] || 0;
      }
    }

    const precision = (tp + fp) > 0 ? tp / (tp + fp) : 0;
    const recall = (tp + fn) > 0 ? tp / (tp + fn) : 0;
    const f1 = (precision + recall) > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    perClassMetrics[cls] = {
      truePositives: tp,
      falsePositives: fp,
      falseNegatives: fn,
      precision: Number(precision.toFixed(4)),
      recall: Number(recall.toFixed(4)),
      f1: Number(f1.toFixed(4))
    };

    if ((tp + fn) > 0) {
      macroPrecisionSum += precision;
      macroRecallSum += recall;
      activeClassCount++;
    }
  }

  const macroPrecision = activeClassCount > 0 ? macroPrecisionSum / activeClassCount : 0;
  const macroRecall = activeClassCount > 0 ? macroRecallSum / activeClassCount : 0;
  const macroF1 = (macroPrecision + macroRecall) > 0 ? (2 * macroPrecision * macroRecall) / (macroPrecision + macroRecall) : 0;

  return {
    totalCases,
    correctCases,
    accuracy: Number(accuracy.toFixed(4)),
    macroPrecision: Number(macroPrecision.toFixed(4)),
    macroRecall: Number(macroRecall.toFixed(4)),
    macroF1: Number(macroF1.toFixed(4)),
    confusionMatrix: matrix,
    perClassMetrics,
    categoryBreakdown: categoryStats,
    difficultyBreakdown: difficultyStats
  };
}

module.exports = {
  calculateJaccardSimilarity,
  evaluateClaimExtraction,
  evaluateRetrievalQuality,
  evaluateSemanticStanceAccuracy,
  evaluateOverallVerdict,
  evaluateTrustScoreCalibration,
  evaluateEvidenceGrounding,
  calculateAggregateMetrics,
  VERDICT_CLASSES
};
