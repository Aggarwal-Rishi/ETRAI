/**
 * Deterministic Mamdani Fuzzy Logic Verdict Engine for ETRAI (9-Signal Expansion)
 * Evaluates Corroboration, Domain Trust, Sentiment, Significance, Model Confidence,
 * Discourse Volume, Social Corroboration, Community Skepticism, AND Claim Scope.
 * Includes complete mathematical telemetry and audit tracing.
 */

// Configurable threshold constants for label mapping
const CONFIGURABLE_THRESHOLDS = {
  VERIFIED_THRESHOLD: 65,
  SUSPICIOUS_THRESHOLD: 35
};

/**
 * Triangular membership function with robust boundary handling
 */
function trimf(x, [a, b, c]) {
  if (x < a || x > c) return 0;
  if (x === b) return 1;
  if (x >= a && x < b) return (b === a) ? 1 : (x - a) / (b - a);
  if (x > b && x <= c) return (c === b) ? 1 : (c - x) / (c - b);
  return 0;
}

/**
 * Trapezoidal membership function with robust boundary handling
 */
function trapmf(x, [a, b, c, d]) {
  if (x < a || x > d) return 0;
  if (x >= b && x <= c) return 1;
  if (x >= a && x < b) return (b === a) ? 1 : (x - a) / (b - a);
  if (x > c && x <= d) return (d === c) ? 1 : (d - x) / (d - c);
  return 0;
}

/**
 * Determines explicit evidence state signal before fuzzy rule evaluation
 * States: SUPPORTED | REFUTED | INSUFFICIENT | MIXED
 */
function determineEvidenceState(supportingCount = 0, refutingCount = 0) {
  if (supportingCount > 0 && refutingCount > 0) {
    return 'MIXED';
  }
  if (refutingCount > 0) {
    return 'REFUTED';
  }
  if (supportingCount > 0) {
    return 'SUPPORTED';
  }
  return 'INSUFFICIENT';
}

/**
 * Fuzzifies all 9 input signals into linguistic membership degrees
 */
function fuzzifyInputs({ 
  corroborationScore, 
  sourceCredibilityScore, 
  sentimentIntensity, 
  claimSignificance, 
  modelConfidence,
  discourseVolume = 0,
  socialCorroborationScore = 0,
  communitySkepticismScore = 0,
  claimScope = 'Regional',
  supportingCount = 0,
  refutingCount = 0,
  plausibilityFlag = false
}) {
  const evidenceState = determineEvidenceState(supportingCount, refutingCount);

  // 1. Corroboration Strength (0 to 10 scale)
  const corroboration = {
    None: trapmf(corroborationScore, [0, 0, 0.5, 1.8]),
    Weak: trimf(corroborationScore, [1.0, 2.8, 4.8]),
    Moderate: trimf(corroborationScore, [3.8, 5.8, 7.8]),
    Strong: trapmf(corroborationScore, [6.8, 8.2, 10, 10])
  };

  // 2. Source Credibility (0.0 to 1.0 continuous scale)
  const sourceCredibility = {
    Untrusted: trapmf(sourceCredibilityScore, [0, 0, 0.35, 0.50]),
    Mixed: trimf(sourceCredibilityScore, [0.40, 0.60, 0.75]),
    Trusted: trapmf(sourceCredibilityScore, [0.65, 0.80, 1.0, 1.0])
  };

  // 3. Sentiment / Emotional Intensity (0.0 to 1.0 absolute value)
  const sentimentIntensitySet = {
    Neutral: trapmf(sentimentIntensity, [0, 0, 0.20, 0.40]),
    SlightlyBiased: trimf(sentimentIntensity, [0.30, 0.50, 0.70]),
    HighlyBiased: trapmf(sentimentIntensity, [0.60, 0.75, 1.0, 1.0])
  };

  // 4. Claim Significance / Importance (1 to 100 scale from Agent 2)
  const claimSignificanceSet = {
    Minor: trapmf(claimSignificance, [0, 0, 30, 48]),
    Moderate: trimf(claimSignificance, [40, 60, 75]),
    Major: trapmf(claimSignificance, [65, 80, 100, 100])
  };

  // 5. Model Confidence (0 to 100 scale)
  const modelConfidenceSet = {
    Low: trapmf(modelConfidence, [0, 0, 30, 50]),
    Medium: trimf(modelConfidence, [40, 60, 75]),
    High: trapmf(modelConfidence, [65, 80, 100, 100])
  };

  // 6. Discourse Volume (0 to 10 count of X-scoped results)
  const discourseVolumeSet = {
    Silent: trapmf(discourseVolume, [0, 0, 0.5, 1.0]),
    Low: trimf(discourseVolume, [0.8, 1.5, 2.5]),
    Moderate: trimf(discourseVolume, [2.0, 3.5, 5.0]),
    High: trapmf(discourseVolume, [4.0, 6.0, 10, 10])
  };

  // 7. Social Corroboration (0.0 to 1.0 score based on verified/credible X accounts)
  const socialCorroborationSet = {
    None: trapmf(socialCorroborationScore, [0, 0, 0.20, 0.40]),
    Weak: trimf(socialCorroborationScore, [0.30, 0.50, 0.70]),
    Strong: trapmf(socialCorroborationScore, [0.65, 0.80, 1.0, 1.0])
  };

  // 8. Community Skepticism (0.0 to 1.0 score based on debunk/fake keyword density)
  const communitySkepticismSet = {
    Low: trapmf(communitySkepticismScore, [0, 0, 0.20, 0.40]),
    Moderate: trimf(communitySkepticismScore, [0.30, 0.50, 0.70]),
    High: trapmf(communitySkepticismScore, [0.60, 0.80, 1.0, 1.0])
  };

  // 9. Claim Scope (Discrete Category)
  const isGlobalScope = claimScope === 'International' || claimScope === 'National';

  return {
    corroboration,
    sourceCredibility,
    sentimentIntensity: sentimentIntensitySet,
    claimSignificance: claimSignificanceSet,
    modelConfidence: modelConfidenceSet,
    discourseVolume: discourseVolumeSet,
    socialCorroboration: socialCorroborationSet,
    communitySkepticism: communitySkepticismSet,
    isGlobalScope,
    claimScope,
    supportingCount,
    refutingCount,
    evidenceState,
    plausibilityFlag: !!plausibilityFlag
  };
}

/**
 * Defines Mamdani output linguistic fuzzy sets for Trust Level (0 to 100)
 */
const TRUST_SETS = {
  VeryLow: [0, 0, 15, 28],
  Low: [22, 32, 42, 50],
  Medium: [46, 56, 65, 74],
  High: [72, 82, 88, 94],
  VeryHigh: [88, 94, 100, 100]
};

/**
 * Mamdani-style Fuzzy Rule Evaluation & Min-Max Inference
 */
function evaluateFuzzyRules(fuzzified) {
  const { 
    corroboration, 
    sourceCredibility, 
    sentimentIntensity, 
    claimSignificance, 
    modelConfidence,
    discourseVolume,
    socialCorroboration,
    communitySkepticism,
    isGlobalScope,
    supportingCount,
    refutingCount,
    evidenceState,
    plausibilityFlag
  } = fuzzified;
  
  const ruleActivations = [];

  // Rule 1: IF Corroboration=Strong AND SourceCredibility=Trusted THEN Trust=VeryHigh
  const r1 = Math.min(corroboration.Strong, sourceCredibility.Trusted);
  if (r1 > 0) ruleActivations.push({ rule: 'R1 (Strong search + Trusted domain)', target: 'VeryHigh', weight: r1 });

  // Rule 2 Gated by Scope: IF Corroboration=None AND ClaimSignificance=Major AND Scope=International/National THEN Trust=Low
  if (isGlobalScope && evidenceState === 'INSUFFICIENT') {
    const r2 = Math.min(corroboration.None, claimSignificance.Major);
    if (r2 > 0) ruleActivations.push({ rule: 'R2 (Major International claim + Zero coverage -> Uncertainty Penalty)', target: 'Low', weight: r2 * 0.7 });
  }

  // Rule 3: IF Corroboration=None AND ClaimSignificance=Minor THEN Trust=Medium
  const r3 = Math.min(corroboration.None, claimSignificance.Minor);
  if (r3 > 0) ruleActivations.push({ rule: 'R3 (Minor claim + Zero news search coverage)', target: 'Medium', weight: r3 });

  // Rule 4: IF SourceCredibility=Untrusted AND Corroboration=Weak THEN Trust=Low
  const r4 = Math.min(sourceCredibility.Untrusted, corroboration.Weak);
  if (r4 > 0) ruleActivations.push({ rule: 'R4 (Untrusted source + Weak search)', target: 'Low', weight: r4 });

  // Rule 5: IF Corroboration=Moderate AND SourceCredibility=Trusted THEN Trust=High
  const r5 = Math.min(corroboration.Moderate, sourceCredibility.Trusted);
  if (r5 > 0) ruleActivations.push({ rule: 'R5 (Moderate search + Trusted domain)', target: 'High', weight: r5 });

  // Rule 6: IF Corroboration=None AND ClaimSignificance=Moderate AND Scope=Global THEN Trust=Low
  if (isGlobalScope && evidenceState === 'INSUFFICIENT') {
    const r6 = Math.min(corroboration.None, claimSignificance.Moderate);
    if (r6 > 0) ruleActivations.push({ rule: 'R6 (Moderate International claim + Zero search coverage)', target: 'Low', weight: r6 * 0.6 });
  }

  // Rule 7: IF Corroboration=Weak AND SourceCredibility=Mixed THEN Trust=Medium
  const r7 = Math.min(sourceCredibility.Mixed, corroboration.Weak);
  if (r7 > 0) ruleActivations.push({ rule: 'R7 (Weak search + Mixed source)', target: 'Medium', weight: r7 });

  // Rule 8: IF Corroboration=Weak AND SourceCredibility=Trusted THEN Trust=High
  const r8 = Math.min(corroboration.Weak, sourceCredibility.Trusted);
  if (r8 > 0) ruleActivations.push({ rule: 'R8 (Weak search + Trusted domain)', target: 'High', weight: r8 });

  // Rule 9: IF Corroboration=Strong AND SourceCredibility=Mixed THEN Trust=High
  const r9 = Math.min(corroboration.Strong, sourceCredibility.Mixed);
  if (r9 > 0) ruleActivations.push({ rule: 'R9 (Strong search + Mixed domain)', target: 'High', weight: r9 });

  // Rule 10: IF ModelConfidence=Low THEN Trust=Low
  const r10 = modelConfidence.Low;
  if (r10 > 0) ruleActivations.push({ rule: 'R10 (Low model reasoning confidence)', target: 'Low', weight: r10 });

  // Rule 11: IF Sentiment=HighlyBiased THEN reduce Trust
  const r11 = sentimentIntensity.HighlyBiased;
  if (r11 > 0) ruleActivations.push({ rule: 'R11 (Highly biased/emotional framing penalty)', target: 'Low', weight: r11 * 0.8 });

  // Rule 12 Gated by Scope: IF Corroboration=None AND Discourse Volume=Silent AND Claim Significance=Major AND Scope=International/National THEN Trust=Low
  if (isGlobalScope && corroboration.None > 0 && evidenceState === 'INSUFFICIENT') {
    const r12 = Math.min(discourseVolume.Silent, claimSignificance.Major, corroboration.None);
    if (r12 > 0) ruleActivations.push({ rule: 'R12 (Dual Silence: Zero social discourse for major global event)', target: 'Low', weight: r12 * 0.7 });
  }

  // Rule 13: IF Social Corroboration=Strong THEN Trust=High
  const r13 = socialCorroboration.Strong;
  if (r13 > 0) ruleActivations.push({ rule: 'R13 (Strong social corroboration from verified account)', target: 'High', weight: r13 });

  // Rule 14: IF Community Skepticism=High THEN Trust=VeryLow
  const r14 = communitySkepticism.High;
  if (r14 > 0) ruleActivations.push({ rule: 'R14 (High community skepticism & debunk callouts)', target: 'VeryLow', weight: r14 });

  // Rule 15 (Insufficient Evidence Semantic Handling — NO EVIDENCE ≠ FALSE):
  if (evidenceState === 'INSUFFICIENT') {
    const r15 = corroboration.None;
    if (r15 > 0) {
      if (isGlobalScope) {
        ruleActivations.push({ rule: 'R15 (Major International/National claim + Zero coverage -> Uncertainty Penalty)', target: 'Low', weight: r15 * 0.7 });
      } else {
        ruleActivations.push({ rule: 'R15 (Regional/Local claim + Zero coverage -> Insufficient Evidence)', target: 'Medium', weight: r15 * 0.8 });
      }
    }
  }

  // Rule 16 (Refuting Evidence Penalty — Direct Contradiction):
  if (refutingCount > 0 || evidenceState === 'REFUTED') {
    const refutationWeight = Math.min(1.0, Math.max(1, refutingCount) * 0.5 + 0.4);
    ruleActivations.push({ rule: `R16 (${refutingCount} refuting evidence item(s) detected -> Direct Contradiction)`, target: 'VeryLow', weight: refutationWeight });
  }

  // Rule 17 (Plausibility Red-Flagging Reinforcement):
  if (plausibilityFlag) {
    const r17 = Math.max(corroboration.None, corroboration.Weak);
    if (r17 > 0) {
      ruleActivations.push({ rule: 'R17 (Procedural implausibility flag -> Reduced Trust)', target: 'VeryLow', weight: r17 * 0.7 });
    }
  }

  return ruleActivations;
}

/**
 * Centroid Defuzzification Method with full mathematical audit trace
 */
function defuzzifyCentroid(ruleActivations) {
  if (!ruleActivations || ruleActivations.length === 0) {
    return { crispScore: 50.0, numerator: 0, denominator: 0 };
  }

  let numerator = 0;
  let denominator = 0;

  for (let x = 0; x <= 100; x += 1) {
    let maxMembershipForX = 0;

    for (const act of ruleActivations) {
      const setBounds = TRUST_SETS[act.target];
      if (!setBounds) continue;

      const membershipValue = trapmf(x, setBounds);
      const clippedValue = Math.min(act.weight, membershipValue);
      if (clippedValue > maxMembershipForX) {
        maxMembershipForX = clippedValue;
      }
    }

    numerator += x * maxMembershipForX;
    denominator += maxMembershipForX;
  }

  const crispScore = denominator === 0 ? 50.0 : Number((numerator / denominator).toFixed(1));
  return { crispScore, numerator: Number(numerator.toFixed(2)), denominator: Number(denominator.toFixed(2)) };
}

/**
 * Main entry point for 9-Signal Fuzzy Logic Verdict Engine with Hard Semantic Guarding
 */
function evaluateFuzzyVerdict({ 
  corroborationScore, 
  sourceCredibilityScore, 
  sentimentIntensity, 
  claimSignificance, 
  modelConfidence,
  discourseVolume = 0,
  socialCorroborationScore = 0,
  communitySkepticismScore = 0,
  claimScope = 'Regional',
  supportingCount = 0,
  refutingCount = 0,
  plausibilityFlag = false,
  thresholds = CONFIGURABLE_THRESHOLDS 
}) {
  const fuzzified = fuzzifyInputs({
    corroborationScore,
    sourceCredibilityScore,
    sentimentIntensity,
    claimSignificance,
    modelConfidence,
    discourseVolume,
    socialCorroborationScore,
    communitySkepticismScore,
    claimScope,
    supportingCount,
    refutingCount,
    plausibilityFlag
  });

  const ruleActivations = evaluateFuzzyRules(fuzzified);
  let { crispScore, numerator, denominator } = defuzzifyCentroid(ruleActivations);

  const activeThresholds = (thresholds && typeof thresholds === 'object') ? thresholds : CONFIGURABLE_THRESHOLDS;
  const verifiedThreshold = activeThresholds.VERIFIED_THRESHOLD || CONFIGURABLE_THRESHOLDS.VERIFIED_THRESHOLD;
  const suspiciousThreshold = activeThresholds.SUSPICIOUS_THRESHOLD || CONFIGURABLE_THRESHOLDS.SUSPICIOUS_THRESHOLD;

  const evidenceState = fuzzified.evidenceState;
  let verdict = 'SUSPICIOUS';

  // Hard Semantic Guard before fuzzy score label mapping
  if (evidenceState === 'REFUTED' || plausibilityFlag) {
    if (crispScore < suspiciousThreshold || refutingCount > 0 || plausibilityFlag) {
      verdict = 'FABRICATED';
    } else {
      verdict = 'SUSPICIOUS';
    }
  } else if (evidenceState === 'INSUFFICIENT') {
    // HARD SEMANTIC GUARD: INSUFFICIENT evidence MUST NOT yield FABRICATED solely from absence of evidence!
    verdict = 'SUSPICIOUS';
    if (crispScore < suspiciousThreshold) {
      crispScore = Math.max(crispScore, suspiciousThreshold + 5); // Clamped >= 40% (SUSPICIOUS / INSUFFICIENT_EVIDENCE)
    }
  } else if (evidenceState === 'SUPPORTED') {
    if (crispScore >= verifiedThreshold) {
      verdict = 'TRUSTED';
    } else {
      verdict = 'SUSPICIOUS';
    }
  } else if (evidenceState === 'MIXED') {
    verdict = 'SUSPICIOUS';
  } else {
    if (crispScore >= verifiedThreshold) {
      verdict = 'TRUSTED';
    } else if (crispScore < suspiciousThreshold) {
      verdict = 'FABRICATED';
    }
  }

  return {
    crispScore,
    verdict,
    evidenceState,
    fuzzified,
    ruleActivations: ruleActivations.map(r => `${r.rule} -> ${r.target} (weight: ${r.weight.toFixed(2)})`),
    rawRuleObjects: ruleActivations,
    defuzzificationMath: {
      numerator,
      denominator,
      formula: `CrispScore = Integral(x * mu(x)) / Integral(mu(x)) = ${numerator} / ${denominator} = ${crispScore}%`
    },
    thresholdsUsed: { verifiedThreshold, suspiciousThreshold }
  };
}

module.exports = {
  evaluateFuzzyVerdict,
  defuzzifyCentroid,
  fuzzifyInputs,
  determineEvidenceState,
  CONFIGURABLE_THRESHOLDS
};
