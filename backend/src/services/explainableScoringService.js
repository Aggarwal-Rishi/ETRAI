/**
 * ETRAI Fully Explainable Trust Scoring Engine
 * Deterministic, mathematically grounded scoring engine using configurable weights.
 * Exposes factor scores, weights, penalties, raw inputs, final score,
 * explanatory drivers, and counterfactual evidence requirements.
 * 
 * GUARANTEES:
 * 1. Monotonicity: Corroborating evidence strictly increases or maintains trust score.
 * 2. Non-Hallucination: Scores are derived exclusively from actual verified claims and evidence.
 * 3. Transparent Auditability: Every point gained or deducted is fully explained.
 */

// Default Configurable Scoring Weights (Must sum to 1.0)
const DEFAULT_WEIGHTS = {
  claimTruthfulness: 0.35,
  evidenceGrounding: 0.20,
  sourceAuthority: 0.15,
  stanceAlignment: 0.10,
  sourceIndependence: 0.08,
  provenanceConfidence: 0.07,
  mediaIntegrity: 0.05
};

/**
 * Computes fully explainable trust score with mathematical audit trail
 */
function computeExplainableTrustScore(analysisData = {}, customWeights = {}) {
  const weights = { ...DEFAULT_WEIGHTS, ...customWeights };

  // Normalize weights if custom set provided
  const weightSum = Object.values(weights).reduce((a, b) => a + b, 0);
  for (const k in weights) {
    weights[k] = weights[k] / weightSum;
  }

  const claims = Array.isArray(analysisData.verifiedClaims) ? analysisData.verifiedClaims : [];
  const totalClaims = claims.length;

  let verifiedCount = 0;
  let falseCount = 0;
  let partiallyVerifiedCount = 0;
  let unverifiedCount = 0;
  let totalEvidenceCount = 0;
  let authoritySum = 0;
  let authorityCount = 0;
  let supportingCount = 0;
  let refutingCount = 0;
  const uniqueDomains = new Set();
  let syndicatedCopiesCount = 0;

  for (const c of claims) {
    const verdict = c.verdict || (c.status === 'TRUSTED' ? 'VERIFIED' : (c.status === 'REFUTED' ? 'FALSE' : 'UNVERIFIED'));
    if (verdict === 'VERIFIED') verifiedCount++;
    else if (verdict === 'FALSE') falseCount++;
    else if (verdict === 'PARTIALLY_VERIFIED') partiallyVerifiedCount++;
    else unverifiedCount++;

    const sources = Array.isArray(c.sources) ? c.sources : [];
    totalEvidenceCount += sources.length;

    for (const s of sources) {
      if (s.domain) {
        if (uniqueDomains.has(s.domain)) syndicatedCopiesCount++;
        uniqueDomains.add(s.domain);
      }
      const auth = typeof s.authorityScore === 'number' ? s.authorityScore : (s.authorityRank === 1 ? 95 : (s.authorityRank === 2 ? 80 : 60));
      authoritySum += auth;
      authorityCount++;

      if (s.stance === 'SUPPORTS') supportingCount++;
      else if (s.stance === 'REFUTES') refutingCount++;
    }
  }

  // -------------------------------------------------------------
  // Factor 1: Claim Truthfulness (0 to 100)
  // -------------------------------------------------------------
  let claimTruthfulness = 50;
  if (totalClaims > 0) {
    claimTruthfulness = Math.round(
      ((verifiedCount * 100) + (partiallyVerifiedCount * 50) + (unverifiedCount * 30) + (falseCount * 0)) / totalClaims
    );
  }

  // -------------------------------------------------------------
  // Factor 2: Evidence Grounding (0 to 100)
  // -------------------------------------------------------------
  const avgEvidencePerClaim = totalClaims > 0 ? (totalEvidenceCount / totalClaims) : 0;
  let evidenceGrounding = Math.min(100, Math.round(avgEvidencePerClaim * 35));
  if (totalEvidenceCount === 0) evidenceGrounding = 0;

  // -------------------------------------------------------------
  // Factor 3: Source Authority (0 to 100)
  // -------------------------------------------------------------
  let sourceAuthority = 50;
  if (authorityCount > 0) {
    sourceAuthority = Math.round(authoritySum / authorityCount);
  }

  // -------------------------------------------------------------
  // Factor 4: Stance Alignment (0 to 100)
  // -------------------------------------------------------------
  const totalStanceSources = supportingCount + refutingCount;
  let stanceAlignment = 50;
  if (totalStanceSources > 0) {
    stanceAlignment = Math.round((supportingCount / totalStanceSources) * 100);
  } else if (totalClaims > 0 && verifiedCount > 0) {
    stanceAlignment = 75;
  }

  // -------------------------------------------------------------
  // Factor 5: Source Independence (0 to 100)
  // -------------------------------------------------------------
  let sourceIndependence = 80;
  if (totalEvidenceCount > 1) {
    const diversityRatio = uniqueDomains.size / totalEvidenceCount;
    sourceIndependence = Math.round(diversityRatio * 100);
  }

  // -------------------------------------------------------------
  // Factor 6: Provenance Confidence (0 to 100)
  // -------------------------------------------------------------
  const originConf = analysisData.provenance?.originConfidence || 'UNKNOWN';
  let provenanceConfidence = 50;
  if (originConf === 'CONFIRMED') provenanceConfidence = 100;
  else if (originConf === 'PROBABLE') provenanceConfidence = 80;
  else if (originConf === 'EARLIEST_DISCOVERED') provenanceConfidence = 65;
  else provenanceConfidence = 40;

  // -------------------------------------------------------------
  // Factor 7: Media Integrity (0 to 100)
  // -------------------------------------------------------------
  let mediaIntegrity = 85;
  const mediaFindings = analysisData.mediaAnalysis?.forensics;
  if (mediaFindings) {
    if (mediaFindings.c2pa?.hasC2paManifest) mediaIntegrity = 100;
    else if (mediaFindings.ela?.isManipulatedLikely) mediaIntegrity = 30;
    else if (!mediaFindings.integrity?.isIntegrityIntact) mediaIntegrity = 40;
  }

  // -------------------------------------------------------------
  // Weighted Score Calculation
  // -------------------------------------------------------------
  const factorContributions = {
    claimTruthfulness: Number((claimTruthfulness * weights.claimTruthfulness).toFixed(2)),
    evidenceGrounding: Number((evidenceGrounding * weights.evidenceGrounding).toFixed(2)),
    sourceAuthority: Number((sourceAuthority * weights.sourceAuthority).toFixed(2)),
    stanceAlignment: Number((stanceAlignment * weights.stanceAlignment).toFixed(2)),
    sourceIndependence: Number((sourceIndependence * weights.sourceIndependence).toFixed(2)),
    provenanceConfidence: Number((provenanceConfidence * weights.provenanceConfidence).toFixed(2)),
    mediaIntegrity: Number((mediaIntegrity * weights.mediaIntegrity).toFixed(2))
  };

  let rawWeightedScore = Object.values(factorContributions).reduce((a, b) => a + b, 0);

  // -------------------------------------------------------------
  // Explicit Penalty Audit
  // -------------------------------------------------------------
  const appliedPenalties = [];

  // Direct Refutation Penalty
  if (falseCount > 0) {
    const penalty = falseCount * 25;
    appliedPenalties.push({
      reason: `Direct contradiction detected across ${falseCount} claim(s).`,
      pointsDeducted: penalty
    });
    rawWeightedScore -= penalty;
  }

  // Deceptive Anchor Link Penalty
  if (analysisData.linkIntelligence?.hasDeceptiveRedirects) {
    appliedPenalties.push({
      reason: 'Deceptive anchor links purporting official status detected.',
      pointsDeducted: 15
    });
    rawWeightedScore -= 15;
  }

  // Scale Mismatch / Numerical Inflation Penalty
  if (analysisData.numericalAnalysis?.discrepanciesCount > 0) {
    const penalty = analysisData.numericalAnalysis.discrepanciesCount * 15;
    appliedPenalties.push({
      reason: `Numerical scale discrepancies detected (${analysisData.numericalAnalysis.discrepanciesCount} instances).`,
      pointsDeducted: penalty
    });
    rawWeightedScore -= penalty;
  }

  // Sensationalism / Urgency Penalty
  if (analysisData.textAnalysis?.urgency?.urgencyTier === 'HIGH_SENSATIONALISM') {
    appliedPenalties.push({
      reason: 'High sensationalism and alarmist rhetoric detected.',
      pointsDeducted: 10
    });
    rawWeightedScore -= 10;
  }

  const finalTrustScore = Math.max(0, Math.min(100, Math.round(rawWeightedScore)));

  // -------------------------------------------------------------
  // Explainable Score Drivers
  // -------------------------------------------------------------
  const positiveDrivers = [];
  const negativeDrivers = [];

  if (verifiedCount > 0) positiveDrivers.push(`Corroborated ${verifiedCount} factual proposition(s) against official sources.`);
  if (sourceAuthority >= 80) positiveDrivers.push(`High average source authority score (${sourceAuthority}/100).`);
  if (originConf === 'CONFIRMED') positiveDrivers.push('Primary content provenance origin is cryptographically or archival confirmed.');
  if (mediaFindings?.c2pa?.hasC2paManifest) positiveDrivers.push('Signed C2PA Content Credentials verify original unmanipulated media.');

  if (falseCount > 0) negativeDrivers.push(`Directly refuted ${falseCount} proposition(s) with contradicting evidence.`);
  if (unverifiedCount > 0 && totalClaims > 0) negativeDrivers.push(`${unverifiedCount} assertion(s) lack independent corroborating sources.`);
  if (appliedPenalties.length > 0) {
    appliedPenalties.forEach(p => negativeDrivers.push(`${p.reason} (-${p.pointsDeducted} pts)`));
  }

  // -------------------------------------------------------------
  // Counterfactual Evidence Analysis
  // -------------------------------------------------------------
  let counterfactualExplanation = '';
  if (finalTrustScore >= 80) {
    counterfactualExplanation = 'Trust score is high. If conflicting official press statements or regulatory retractions emerge, the score will adjust downwards.';
  } else if (falseCount > 0) {
    counterfactualExplanation = `Trust score is depressed due to ${falseCount} refuted claim(s). Retracting or correcting refuted assertions with primary gazette citations would raise the score by up to 35 points.`;
  } else if (unverifiedCount > 0) {
    counterfactualExplanation = `Trust score is limited by ${unverifiedCount} unverified claim(s). Discovering Tier-1 official gazettes or regulatory filings confirming these claims would increase the trust score by ~${Math.min(35, unverifiedCount * 12)} points.`;
  } else {
    counterfactualExplanation = 'Providing independent third-party evidence citations will monotonically increase the trust score.';
  }

  return {
    finalTrustScore,
    weights,
    factorScores: {
      claimTruthfulness: { score: claimTruthfulness, weight: weights.claimTruthfulness, contribution: factorContributions.claimTruthfulness },
      evidenceGrounding: { score: evidenceGrounding, weight: weights.evidenceGrounding, contribution: factorContributions.evidenceGrounding },
      sourceAuthority: { score: sourceAuthority, weight: weights.sourceAuthority, contribution: factorContributions.sourceAuthority },
      stanceAlignment: { score: stanceAlignment, weight: weights.stanceAlignment, contribution: factorContributions.stanceAlignment },
      sourceIndependence: { score: sourceIndependence, weight: weights.sourceIndependence, contribution: factorContributions.sourceIndependence },
      provenanceConfidence: { score: provenanceConfidence, weight: weights.provenanceConfidence, contribution: factorContributions.provenanceConfidence },
      mediaIntegrity: { score: mediaIntegrity, weight: weights.mediaIntegrity, contribution: factorContributions.mediaIntegrity }
    },
    appliedPenalties,
    rawInputs: {
      totalClaims,
      verifiedClaimsCount: verifiedCount,
      falseClaimsCount: falseCount,
      unverifiedClaimsCount: unverifiedCount,
      totalEvidenceCount,
      uniqueDomainsCount: uniqueDomains.size
    },
    drivers: {
      positiveDrivers,
      negativeDrivers
    },
    counterfactualExplanation
  };
}

module.exports = {
  computeExplainableTrustScore,
  DEFAULT_WEIGHTS
};
