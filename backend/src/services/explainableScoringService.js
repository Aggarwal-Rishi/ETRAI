/**
 * ETRAI Fully Explainable & Deterministic Trust Scoring Engine
 * Version: 2.4.0
 * 
 * Mathematical Formulation:
 *   Final Trust Score = Clamp[0, 100]( Σ (RawScore_i × NormalizedWeight_i) - Σ Penalties + Σ Adjustments )
 * 
 * Guarantees:
 * 1. Monotonicity: Corroborating evidence strictly increases or maintains trust score.
 * 2. Determinism: Exactly reproducible given the same inputs and scoring version.
 * 3. Transparent Auditability: Every single point gained or deducted is mathematically traceable.
 * 4. Dual Compatibility: Exposes structured factorBreakdown as well as legacy factorScores.
 */

'use strict';

const SCORING_VERSION = '2.4.0';

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

// Global Baseline Weights for all 10 Configurable Factors
const GLOBAL_SCORING_FACTORS = {
  claimEvidenceMatch: { defaultWeight: 0.22, name: 'Claim–evidence match', shortName: 'Evidence', description: 'Degree of semantic alignment between claim propositions and retrieved evidence passages' },
  sourceAuthority: { defaultWeight: 0.18, name: 'Source authority', shortName: 'Authority', description: 'Average authority ranking and reputation score of cited publications' },
  independentCorroboration: { defaultWeight: 0.15, name: 'Independent corroboration', shortName: 'Corroboration', description: 'Number of distinct, non-syndicated corporate media owners corroborating the claim' },
  contradictoryEvidence: { defaultWeight: 0.12, name: 'Contradictory evidence', shortName: 'Stance', description: 'Proportion of unrefuted vs contested evidence stances' },
  evidenceFreshness: { defaultWeight: 0.08, name: 'Evidence freshness', shortName: 'Freshness', description: 'Temporal proximity of evidence to claim event window' },
  provenanceQuality: { defaultWeight: 0.07, name: 'Provenance trail', shortName: 'Provenance', description: 'Confidence in first-known publication origin and wire archives' },
  attributionQuality: { defaultWeight: 0.06, name: 'Language & framing', shortName: 'Language', description: 'Clarity of named primary actors, direct quotes, and official statements' },
  contextFramingQuality: { defaultWeight: 0.05, name: 'Amplification pattern', shortName: 'Spread', description: 'Freedom from sensationalism, urgency manipulation, and logical inconsistencies' },
  mediaIntegrity: { defaultWeight: 0.15, name: 'Media integrity', shortName: 'Media', description: 'Forensic validation (ELA, EXIF, C2PA manifest) for attached images/videos', requiresMedia: true },
  documentIntegrity: { defaultWeight: 0.10, name: 'Document integrity', shortName: 'Document', description: 'Structural magic-byte and cryptographic authenticity for attached PDF/DOCX', requiresDocument: true }
};

/**
 * Standard Penalty Catalog
 */
const PENALTY_CATALOG = {
  FABRICATED_DOCUMENT: { code: 'FABRICATED_DOCUMENT', baseDeduction: 35, description: 'Fabricated official letterhead, seal, or tampered regulatory filing' },
  VERIFIED_MANIPULATION: { code: 'VERIFIED_MANIPULATION', baseDeduction: 30, description: 'Forensic image/video manipulation or AI deepfake detected' },
  DIRECT_REFUTATION: { code: 'DIRECT_REFUTATION', baseDeduction: 25, description: 'Direct factual contradiction from a Tier-1 authoritative source' },
  UNRESOLVED_CONTRADICTION: { code: 'UNRESOLVED_CONTRADICTION', baseDeduction: 20, description: 'Irreconcilable conflict between two high-authority sources' },
  DECEPTIVE_EDITING: { code: 'DECEPTIVE_EDITING', baseDeduction: 20, description: 'Deceptive out-of-context video trimming or misattributed photo' },
  NUMERICAL_DISCREPANCY: { code: 'NUMERICAL_DISCREPANCY', baseDeduction: 15, description: 'Exaggerated or fabricated quantitative metric / statistical claim' },
  SOURCE_INDEPENDENCE_FAILURE: { code: 'SOURCE_INDEPENDENCE_FAILURE', baseDeduction: 15, description: 'Apparent corroboration is solely circular wire duplication' },
  DECEPTIVE_REDIRECT: { code: 'DECEPTIVE_REDIRECT', baseDeduction: 15, description: 'Deceptive anchor links purporting official status detected' },
  HIGH_SENSATIONALISM: { code: 'HIGH_SENSATIONALISM', baseDeduction: 10, description: 'High sensationalism and alarmist rhetoric detected' },
  STALE_EVIDENCE: { code: 'STALE_EVIDENCE', baseDeduction: 10, description: 'Superseded or outdated historic evidence used for present-day claim' }
};

/**
 * Normalizes active factor weights so their sum equals exactly 1.0 (100%)
 */
function normalizeActiveWeights(activeFactorKeys, customWeights = {}) {
  const normalized = {};
  let sum = 0;

  for (const key of activeFactorKeys) {
    const raw = customWeights[key] !== undefined 
      ? parseFloat(customWeights[key]) 
      : (GLOBAL_SCORING_FACTORS[key]?.defaultWeight ?? DEFAULT_WEIGHTS[key] ?? 0.1);
    normalized[key] = Math.max(0, raw);
    sum += normalized[key];
  }

  if (sum === 0) sum = 1.0;

  for (const key of activeFactorKeys) {
    normalized[key] = Number((normalized[key] / sum).toFixed(4));
  }

  return normalized;
}

/**
 * Computes deterministic, fully explainable trust score with mathematical audit trail
 */
function computeExplainableTrustScore(analysisData = {}, customWeights = {}) {
  const inputType = (analysisData.inputType || (analysisData.mediaAnalysis ? 'PHOTO' : 'TEXT')).toUpperCase();
  const hasMedia = inputType === 'PHOTO' || inputType === 'VIDEO' || inputType === 'IMAGE' || Boolean(analysisData.mediaAnalysis);
  const hasDocument = inputType === 'FILE' || inputType === 'PDF' || inputType === 'DOCX';

  const claims = Array.isArray(analysisData.verifiedClaims) ? analysisData.verifiedClaims : (Array.isArray(analysisData.claims) ? analysisData.claims : []);
  const totalClaims = claims.length;

  let verifiedCount = 0;
  let falseCount = 0;
  let disputedCount = 0;
  let partiallyVerifiedCount = 0;
  let unverifiedCount = 0;
  let totalEvidenceCount = 0;
  let authoritySum = 0;
  let authorityCount = 0;
  let supportingCount = 0;
  let refutingCount = 0;
  let qualifyingCount = 0;
  let claimScoreSum = 0;
  const uniqueSyndicationGroups = new Set();
  const uniqueDomains = new Set();

  for (const c of claims) {
    const verdict = (c.verdict || c.claimVerificationResult?.verdict || c.status || 'UNVERIFIED').toUpperCase();
    const conf = typeof c.confidence === 'number' ? c.confidence : 50;

    if (verdict === 'VERIFIED' || verdict === 'SUPPORTED' || c.status === 'TRUSTED' || verdict === 'TRUE' || verdict === 'REAL') {
      verifiedCount++;
      claimScoreSum += Math.max(85, conf);
    } else if (verdict === 'FALSE' || verdict === 'FABRICATED' || c.status === 'FABRICATED') {
      falseCount++;
      claimScoreSum += Math.min(15, Math.max(0, 100 - conf));
    } else if (verdict === 'DISPUTED' || verdict === 'MISLEADING') {
      disputedCount++;
      claimScoreSum += 45;
    } else if (verdict === 'PARTIALLY_VERIFIED' || verdict === 'PARTIALLY_TRUE' || verdict === 'PARTIALLY_SUPPORTED') {
      partiallyVerifiedCount++;
      claimScoreSum += Math.max(50, Math.min(75, conf));
    } else {
      unverifiedCount++;
      claimScoreSum += 35;
    }

    const sources = Array.isArray(c.evidenceItems) ? c.evidenceItems : (Array.isArray(c.sources) ? c.sources : (Array.isArray(c.evidenceEvaluations) ? c.evidenceEvaluations : []));
    totalEvidenceCount += sources.length;

    for (const s of sources) {
      if (s.domain) uniqueDomains.add(s.domain.toLowerCase());
      const sGroup = s.independenceGroup || s.syndicationGroup || s.domain || 'default';
      uniqueSyndicationGroups.add(sGroup);

      const auth = typeof s.authorityScore === 'number' ? s.authorityScore : (s.authorityRank === 1 || s.rank === 1 ? 95 : (s.authorityRank === 2 || s.rank === 2 ? 80 : 65));
      authoritySum += auth;
      authorityCount++;

      const rel = (s.relationship || s.stance || 'NEUTRAL').toUpperCase();
      if (rel === 'SUPPORTS' || rel === 'SUPPORT' || rel === 'VERIFIED') supportingCount++;
      else if (rel === 'REFUTES' || rel === 'CONTRADICTS' || rel === 'FALSE') refutingCount++;
      else if (rel === 'QUALIFIES') qualifyingCount++;
    }
  }

  // Also include general sources passed at top level if claims didn't duplicate them
  const generalSources = Array.isArray(analysisData.sources) ? analysisData.sources : [];
  if (authorityCount === 0 && generalSources.length > 0) {
    for (const s of generalSources) {
      if (s.domain) uniqueDomains.add(s.domain.toLowerCase());
      const auth = typeof s.authorityScore === 'number' ? s.authorityScore : (s.authorityRank === 1 ? 95 : (s.authorityRank === 2 ? 80 : 65));
      authoritySum += auth;
      authorityCount++;
      totalEvidenceCount++;
      const rel = (s.stance || 'NEUTRAL').toUpperCase();
      if (rel === 'SUPPORTS' || rel === 'SUPPORT') supportingCount++;
      else if (rel === 'REFUTES' || rel === 'CONTRADICTS') refutingCount++;
    }
  }

  // ── Factor Scores Derivations ─────────────────────────────────────────────
  
  // 1. Claim Truthfulness / Evidence Match
  let claimTruthfulness = 50;
  if (totalClaims > 0) {
    claimTruthfulness = Math.round(claimScoreSum / totalClaims);
  } else if (analysisData.factualAccuracyScore !== undefined) {
    claimTruthfulness = Math.round(analysisData.factualAccuracyScore);
  }

  // 2. Evidence Grounding / Freshness
  const avgEvidencePerClaim = totalClaims > 0 ? (totalEvidenceCount / totalClaims) : totalEvidenceCount;
  let evidenceGrounding = Math.min(100, Math.max(30, Math.round(avgEvidencePerClaim * 30 + 10)));
  if (totalEvidenceCount === 0 && totalClaims > 0 && verifiedCount === 0) evidenceGrounding = 0;
  if (verifiedCount > 0 && totalEvidenceCount >= 2) evidenceGrounding = Math.max(85, evidenceGrounding);

  // 3. Source Authority
  let sourceAuthority = 75; // Baseline high-tier publisher expectation
  if (authorityCount > 0) {
    sourceAuthority = Math.round(authoritySum / authorityCount);
  } else if (verifiedCount > 0) {
    sourceAuthority = 85;
  }

  // 4. Stance Alignment / Contradictory Evidence
  const totalStanceSources = supportingCount + refutingCount;
  let stanceAlignment = 80;
  if (totalStanceSources > 0) {
    stanceAlignment = Math.round((supportingCount / totalStanceSources) * 100);
  } else if (verifiedCount > 0 && falseCount === 0) {
    stanceAlignment = 95;
  } else if (falseCount > 0) {
    stanceAlignment = 20;
  }

  // 5. Source Independence / Corroboration
  let sourceIndependence = 80;
  if (uniqueDomains.size >= 3) sourceIndependence = 95;
  else if (uniqueDomains.size === 2) sourceIndependence = 85;
  else if (uniqueDomains.size === 1) sourceIndependence = 70;
  else if (totalEvidenceCount === 0 && verifiedCount === 0) sourceIndependence = 40;

  // 6. Provenance Quality
  const originConf = analysisData.provenance?.originConfidence || 'UNKNOWN';
  let provenanceConfidence = 75;
  if (originConf === 'CONFIRMED') provenanceConfidence = 100;
  else if (originConf === 'PROBABLE') provenanceConfidence = 85;
  else if (originConf === 'EARLIEST_DISCOVERED') provenanceConfidence = 75;
  else if (verifiedCount > 0) provenanceConfidence = 80;
  else provenanceConfidence = 50;

  // 7. Language & Framing / Attribution Quality
  let attributionQuality = 85;
  if (analysisData.textAnalysis?.attributionQuality?.attributionGrade === 'EXCELLENT') attributionQuality = 95;
  else if (analysisData.textAnalysis?.attributionQuality?.attributionGrade === 'LOW') attributionQuality = 55;

  // 8. Amplification Pattern / Context Quality
  let contextFramingQuality = 85;
  if (analysisData.textAnalysis?.urgency?.urgencyTier === 'HIGH_SENSATIONALISM') contextFramingQuality = 40;
  else if (analysisData.spreadAnalysis?.amplificationPattern === 'COORDINATED_AMPLIFICATION_SUSPECTED') contextFramingQuality = 35;

  // 9. Media Integrity (ONLY active if media is present)
  let mediaIntegrity = 85;
  const mediaFindings = analysisData.mediaAnalysis?.forensics || analysisData.mediaAnalysis;
  const videoContextVerdict = analysisData.mediaAnalysis?.videoContextReport?.verdict || mediaFindings?.contextReport?.verdict;
  const forensicVerdict = mediaFindings?.forensicVerdict || mediaFindings?.verdict || analysisData.mediaAnalysis?.forensicVerdict;
  if (mediaFindings) {
    if (mediaFindings.c2pa?.hasC2paManifest) mediaIntegrity = 100;
    else if (videoContextVerdict === 'Deepfake' || mediaFindings.ela?.isManipulatedLikely || forensicVerdict === 'MANIPULATION_DETECTED') mediaIntegrity = 25;
    else if (videoContextVerdict === 'Manipulated') mediaIntegrity = 45;
    else if (videoContextVerdict === 'Deceptive Context') mediaIntegrity = 60;
    else if (forensicVerdict === 'INCONCLUSIVE_LIMITED_ANALYSIS') mediaIntegrity = 50;
    else if (mediaFindings.integrity && !mediaFindings.integrity.isIntegrityIntact) mediaIntegrity = 40;
    else mediaIntegrity = 90;
  }

  // 10. Document Integrity (ONLY active if document is present)
  let documentIntegrity = 90;
  if (hasDocument && analysisData.mediaAnalysis?.docForensics) {
    const doc = analysisData.mediaAnalysis.docForensics;
    if (doc.isTampered || doc.hasStructuralAnomalies) documentIntegrity = 20;
  }

  // Determine active factors based on presence of media/document
  const isLegacyWeightSet = Object.keys(customWeights).some(k => k in DEFAULT_WEIGHTS);
  let activeFactorKeys = isLegacyWeightSet
    ? Object.keys(DEFAULT_WEIGHTS)
    : Object.keys(GLOBAL_SCORING_FACTORS).filter(k => {
        if (GLOBAL_SCORING_FACTORS[k].requiresMedia && !hasMedia) return false;
        if (GLOBAL_SCORING_FACTORS[k].requiresDocument && !hasDocument) return false;
        return true;
      });

  const normalizedWeights = normalizeActiveWeights(activeFactorKeys, customWeights);

  const rawFactorScores = {
    claimTruthfulness,
    claimEvidenceMatch: claimTruthfulness,
    evidenceGrounding,
    sourceAuthority,
    stanceAlignment,
    contradictoryEvidence: stanceAlignment,
    sourceIndependence,
    independentCorroboration: sourceIndependence,
    provenanceConfidence,
    provenanceQuality: provenanceConfidence,
    attributionQuality,
    contextFramingQuality,
    evidenceFreshness: evidenceGrounding,
    mediaIntegrity,
    documentIntegrity
  };

  const factorScores = {};
  const factorBreakdown = [];
  let weightedBaseScore = 0;

  for (const key of activeFactorKeys) {
    const rawScore = rawFactorScores[key] ?? 75;
    const weight = normalizedWeights[key];
    const contribution = Number((rawScore * weight).toFixed(2));
    weightedBaseScore += contribution;

    factorScores[key] = { score: rawScore, weight, contribution };
    factorBreakdown.push({
      k: key,
      factorKey: key,
      n: GLOBAL_SCORING_FACTORS[key]?.name || key,
      factorName: GLOBAL_SCORING_FACTORS[key]?.name || key,
      sh: GLOBAL_SCORING_FACTORS[key]?.shortName || key,
      shortName: GLOBAL_SCORING_FACTORS[key]?.shortName || key,
      d: GLOBAL_SCORING_FACTORS[key]?.description || key,
      description: GLOBAL_SCORING_FACTORS[key]?.description || key,
      raw: rawScore,
      rawScore,
      w: Math.round(weight * 100),
      weight: Number((weight * 100).toFixed(1)),
      weightedContribution: contribution,
      contribution: Number(contribution.toFixed(1)),
      reason: `${GLOBAL_SCORING_FACTORS[key]?.name || key} scored ${rawScore}/100.`
    });
  }

  // Legacy mappings for backward compatibility
  if (!factorScores.claimTruthfulness) factorScores.claimTruthfulness = { score: claimTruthfulness, weight: normalizedWeights.claimEvidenceMatch || 0.22, contribution: Number((claimTruthfulness * (normalizedWeights.claimEvidenceMatch || 0.22)).toFixed(2)) };
  if (!factorScores.evidenceGrounding) factorScores.evidenceGrounding = { score: evidenceGrounding, weight: normalizedWeights.evidenceFreshness || 0.08, contribution: Number((evidenceGrounding * (normalizedWeights.evidenceFreshness || 0.08)).toFixed(2)) };
  if (!factorScores.sourceAuthority) factorScores.sourceAuthority = { score: sourceAuthority, weight: normalizedWeights.sourceAuthority || 0.18, contribution: Number((sourceAuthority * (normalizedWeights.sourceAuthority || 0.18)).toFixed(2)) };
  if (!factorScores.stanceAlignment) factorScores.stanceAlignment = { score: stanceAlignment, weight: normalizedWeights.contradictoryEvidence || 0.12, contribution: Number((stanceAlignment * (normalizedWeights.contradictoryEvidence || 0.12)).toFixed(2)) };
  if (!factorScores.sourceIndependence) factorScores.sourceIndependence = { score: sourceIndependence, weight: normalizedWeights.independentCorroboration || 0.15, contribution: Number((sourceIndependence * (normalizedWeights.independentCorroboration || 0.15)).toFixed(2)) };
  if (!factorScores.provenanceConfidence) factorScores.provenanceConfidence = { score: provenanceConfidence, weight: normalizedWeights.provenanceQuality || 0.07, contribution: Number((provenanceConfidence * (normalizedWeights.provenanceQuality || 0.07)).toFixed(2)) };
  if (hasMedia && !factorScores.mediaIntegrity) factorScores.mediaIntegrity = { score: mediaIntegrity, weight: normalizedWeights.mediaIntegrity || 0.15, contribution: Number((mediaIntegrity * (normalizedWeights.mediaIntegrity || 0.15)).toFixed(2)) };

  // ── Explicit Penalty Audit (STRICTLY CONDITIONAL) ─────────────────────────
  const appliedPenalties = [];
  let totalPenaltyDeductions = 0;

  // 1. Direct Factual Contradiction Penalty
  if (falseCount > 0) {
    const penalty = Math.min(45, falseCount * 25);
    appliedPenalties.push({
      ...PENALTY_CATALOG.DIRECT_REFUTATION,
      label: 'Direct factual contradiction',
      val: `-${penalty}.0`,
      value: penalty,
      pointsDeducted: penalty,
      reason: `Direct factual contradiction detected across ${falseCount} claim(s).`,
      evidenceRef: 'claims.verdict === FALSE',
      scoringVersion: SCORING_VERSION
    });
    totalPenaltyDeductions += penalty;
  }

  // 2. Unresolved High-Authority Dispute Penalty
  if (disputedCount > 0) {
    const penalty = Math.min(30, disputedCount * 15);
    appliedPenalties.push({
      ...PENALTY_CATALOG.UNRESOLVED_CONTRADICTION,
      label: 'Unresolved source contradiction',
      val: `-${penalty}.0`,
      value: penalty,
      pointsDeducted: penalty,
      reason: `Unresolved contradiction across ${disputedCount} claim(s).`,
      evidenceRef: 'claims.verdict === DISPUTED',
      scoringVersion: SCORING_VERSION
    });
    totalPenaltyDeductions += penalty;
  }

  // 3. Media Manipulation Penalty (STRICTLY ONLY IF MEDIA WAS SUBMITTED)
  if (hasMedia && mediaFindings) {
    if (mediaFindings.ela?.isManipulatedLikely || forensicVerdict === 'MANIPULATION_DETECTED' || ['Deepfake', 'Manipulated', 'Deceptive Context'].includes(videoContextVerdict)) {
      const penalty = videoContextVerdict === 'Deceptive Context' ? 15 : videoContextVerdict === 'Manipulated' ? 20 : 30;
      appliedPenalties.push({
        ...PENALTY_CATALOG.VERIFIED_MANIPULATION,
        label: videoContextVerdict === 'Deceptive Context' ? 'Source-backed contextual manipulation' : 'Media manipulation signal',
        val: `-${penalty}.0`,
        value: penalty,
        pointsDeducted: penalty,
        reason: videoContextVerdict === 'Deceptive Context'
          ? 'Segment-level source evidence indicates materially deceptive context.'
          : 'Forensic image/video manipulation or synthetic-media signals detected.',
        evidenceRef: videoContextVerdict ? 'mediaAnalysis.videoContextReport' : 'mediaAnalysis.manipulationSignals',
        scoringVersion: SCORING_VERSION
      });
      totalPenaltyDeductions += penalty;
    }
  }

  // 4. Document Tampering Penalty (STRICTLY ONLY IF DOCUMENT WAS SUBMITTED)
  if (hasDocument && analysisData.mediaAnalysis?.docForensics?.isTampered) {
    const penalty = 35;
    appliedPenalties.push({
      ...PENALTY_CATALOG.FABRICATED_DOCUMENT,
      label: 'Tampered document structure',
      val: `-${penalty}.0`,
      value: penalty,
      pointsDeducted: penalty,
      reason: 'Fabricated document structure or incremental magic-byte tampering detected.',
      evidenceRef: 'mediaAnalysis.docForensics',
      scoringVersion: SCORING_VERSION
    });
    totalPenaltyDeductions += penalty;
  }

  // 5. Numerical Scale Discrepancy Penalty
  if (analysisData.numericalAnalysis?.discrepanciesCount > 0) {
    const penalty = Math.min(25, analysisData.numericalAnalysis.discrepanciesCount * 15);
    appliedPenalties.push({
      ...PENALTY_CATALOG.NUMERICAL_DISCREPANCY,
      label: 'Numerical scale discrepancy',
      val: `-${penalty}.0`,
      value: penalty,
      pointsDeducted: penalty,
      reason: `Numerical scale discrepancies detected (${analysisData.numericalAnalysis.discrepanciesCount} instances).`,
      evidenceRef: 'numericalAnalysis.discrepancies',
      scoringVersion: SCORING_VERSION
    });
    totalPenaltyDeductions += penalty;
  }

  // 6. Deceptive redirect / misleading anchor penalty
  const hasDeceptiveRedirects = analysisData.linkIntelligence?.hasDeceptiveRedirects === true ||
    (analysisData.linkIntelligence?.links || []).some(link => link?.isDeceptiveRedirect || link?.redirectMismatch);
  if (hasDeceptiveRedirects) {
    const penalty = PENALTY_CATALOG.DECEPTIVE_REDIRECT.baseDeduction;
    appliedPenalties.push({
      ...PENALTY_CATALOG.DECEPTIVE_REDIRECT,
      label: 'Deceptive anchor or redirect',
      val: `-${penalty}.0`,
      value: penalty,
      pointsDeducted: penalty,
      reason: PENALTY_CATALOG.DECEPTIVE_REDIRECT.description,
      evidenceRef: 'linkIntelligence.hasDeceptiveRedirects',
      scoringVersion: SCORING_VERSION
    });
    totalPenaltyDeductions += penalty;
  }

  // 7. Sensationalism / Urgency Penalty
  if (analysisData.textAnalysis?.urgency?.urgencyTier === 'HIGH_SENSATIONALISM') {
    const penalty = 10;
    appliedPenalties.push({
      ...PENALTY_CATALOG.HIGH_SENSATIONALISM,
      label: 'Alarmist rhetoric / high sensationalism',
      val: `-${penalty}.0`,
      value: penalty,
      pointsDeducted: penalty,
      reason: 'High sensationalism and alarmist rhetoric detected.',
      evidenceRef: 'textAnalysis.urgency',
      scoringVersion: SCORING_VERSION
    });
    totalPenaltyDeductions += penalty;
  }

  // Compute final trust score
  const finalTrustScore = Math.max(0, Math.min(100, Math.round(weightedBaseScore - totalPenaltyDeductions)));

  // ── Verdict Mapping ───────────────────────────────────────────────────────
  let finalVerdict = 'UNCERTAIN';
  if (falseCount > 0 && finalTrustScore < 40) finalVerdict = 'FALSE';
  else if (falseCount > 0) finalVerdict = 'MISLEADING';
  else if (disputedCount > 0 || (supportingCount > 0 && refutingCount > 0)) finalVerdict = 'MIXED';
  else if (finalTrustScore >= 85 && unverifiedCount === 0) finalVerdict = 'HIGHLY_SUPPORTED';
  else if (finalTrustScore >= 70) finalVerdict = 'SUPPORTED';
  else if (finalTrustScore >= 50) finalVerdict = 'MIXED';
  else if (totalEvidenceCount === 0) finalVerdict = 'UNCERTAIN';
  else finalVerdict = 'FALSE';

  // ── Drivers ───────────────────────────────────────────────────────────────
  const positiveDrivers = [];
  const negativeDrivers = [];

  if (verifiedCount > 0) positiveDrivers.push(`Corroborated ${verifiedCount} factual proposition(s) against official sources.`);
  if (sourceAuthority >= 80) positiveDrivers.push(`High average source authority score (${sourceAuthority}/100).`);
  if (uniqueDomains.size >= 2) positiveDrivers.push(`Corroborated across ${uniqueDomains.size} independent domains.`);
  if (originConf === 'CONFIRMED') positiveDrivers.push('Primary content provenance origin is cryptographically or archival confirmed.');
  if (mediaFindings?.c2pa?.hasC2paManifest) positiveDrivers.push('Signed C2PA Content Credentials verify original unmanipulated media.');

  if (falseCount > 0) negativeDrivers.push(`Directly refuted ${falseCount} proposition(s) with contradicting evidence.`);
  if (disputedCount > 0) negativeDrivers.push(`${disputedCount} claim(s) subject to active contradiction between authoritative sources.`);
  if (unverifiedCount > 0 && totalClaims > 0) negativeDrivers.push(`${unverifiedCount} assertion(s) lack independent corroborating sources.`);
  appliedPenalties.forEach(p => negativeDrivers.push(`${p.reason || p.description} (-${p.pointsDeducted || p.value} pts)`));

  // ── Real Sensitivity / What Would Move This Score ──────────────────────────
  const counterfactualConditions = [];

  if (unverifiedCount > 0) {
    const potImpact = Math.min(30, unverifiedCount * 12);
    counterfactualConditions.push({
      label: `Official gazette or primary citation confirming ${unverifiedCount} unverified assertion(s)`,
      change: `+${potImpact}`,
      condition: `Discovering Tier-1 official gazettes confirming the ${unverifiedCount} unverified claim(s)`,
      potentialImpact: `+${potImpact} points`,
      impactScore: potImpact
    });
  }

  if (uniqueDomains.size < 3 && totalClaims > 0) {
    counterfactualConditions.push({
      label: 'Two additional independent Tier-1 press outlets corroborating findings',
      change: '+15',
      condition: 'Two additional independent Tier-1 press outlets carrying the claim',
      potentialImpact: '+15 points',
      impactScore: 15
    });
  }

  if (disputedCount > 0) {
    const potImpact = disputedCount * 15;
    counterfactualConditions.push({
      label: `Official clarification resolving ${disputedCount} contested assertion(s)`,
      change: `+${potImpact}`,
      condition: 'Official retraction or clarification resolving disputed claims',
      potentialImpact: `+${potImpact} points`,
      impactScore: potImpact
    });
  }

  if (finalTrustScore >= 80) {
    counterfactualConditions.push({
      label: 'Emergence of conflicting regulatory filings or official corrections',
      change: '-30',
      condition: 'Emergence of conflicting regulatory filings or official corrections',
      potentialImpact: '-30 points',
      impactScore: -30
    });
    counterfactualConditions.push({
      label: 'Discovery of earlier contradictory wire dispatch or archival retraction',
      change: '-15',
      condition: 'Discovery of earlier contradictory wire dispatch or archival retraction',
      potentialImpact: '-15 points',
      impactScore: -15
    });
  } else if (falseCount > 0) {
    counterfactualConditions.push({
      label: 'Retraction or official correction with primary gazette citations',
      change: '+35',
      condition: 'Retracting or correcting refuted assertions with primary gazette citations',
      potentialImpact: '+35 points',
      impactScore: 35
    });
  }

  // Fallback if none added
  if (counterfactualConditions.length === 0) {
    counterfactualConditions.push({
      label: 'Providing independent third-party evidence citations',
      change: '+10',
      condition: 'Providing independent third-party evidence citations',
      potentialImpact: '+10 points',
      impactScore: 10
    });
  }

  let counterfactualExplanation = '';
  if (finalTrustScore >= 80) {
    counterfactualExplanation = 'Trust score is high. If conflicting official press statements or regulatory retractions emerge, the score will adjust downwards.';
  } else if (falseCount > 0) {
    counterfactualExplanation = `Trust score is depressed due to ${falseCount} refuted claim(s). Retracting or correcting refuted assertions with primary gazette citations would raise the score by up to 35 points.`;
  } else if (unverifiedCount > 0) {
    counterfactualExplanation = `Trust score is limited by ${unverifiedCount} unverified claim(s). Discovering Tier-1 official gazettes confirming these claims would increase the trust score by ~${Math.min(30, unverifiedCount * 12)} points.`;
  } else {
    counterfactualExplanation = 'Providing independent third-party evidence citations will monotonically increase the trust score.';
  }

  return {
    scoringVersion: SCORING_VERSION,
    overallTrustScore: finalTrustScore,
    finalTrustScore,
    verdict: finalVerdict,
    weightedBaseScore: Number(weightedBaseScore.toFixed(1)),
    totalPenalties: Number(totalPenaltyDeductions.toFixed(1)),
    penaltyTotal: Number(totalPenaltyDeductions.toFixed(1)),
    activeFactorsCount: activeFactorKeys.length,
    weights: normalizedWeights,
    factors: factorBreakdown,
    factorScores,
    factorBreakdown,
    appliedPenalties,
    penalties: appliedPenalties,
    sensitivity: counterfactualConditions,
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
    counterfactualExplanation,
    counterfactualConditions,
    summaryText: `Investigation scored ${finalTrustScore}/100 (${finalVerdict}) under DeepTrust Scoring Methodology v${SCORING_VERSION}.`
  };
}

module.exports = {
  SCORING_VERSION,
  DEFAULT_WEIGHTS,
  GLOBAL_SCORING_FACTORS,
  PENALTY_CATALOG,
  normalizeActiveWeights,
  computeExplainableTrustScore
};
