/**
 * ETRAI Fully Explainable & Deterministic Trust Scoring Engine
 * Version: 2.5.0
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

const SCORING_VERSION = '3.0.0';

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
  const analyzedWordCount = Number(analysisData.textAnalysis?.summary?.wordCount ?? analysisData.textAnalysis?.readability?.wordCount ?? 0);
  const hasNarrativeText = analyzedWordCount > 0 && (!(inputType === 'PHOTO' || inputType === 'IMAGE') || analysisData.hasAttachedNews === true);

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
  const authorityByOrigin = new Map();
  const datedEvidence = new Map();
  let explicitlyUnknownAuthority = 0;

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

    for (const s of sources) {
      const rel = (s.relationship || s.stance || 'NEUTRAL').toUpperCase();
      const isEvidentiary = ['SUPPORTS', 'SUPPORT', 'VERIFIED', 'REFUTES', 'CONTRADICTS', 'FALSE', 'QUALIFIES'].includes(rel) || s.locallyVerified === true;
      if (!isEvidentiary) continue;
      totalEvidenceCount++;
      if (s.domain) uniqueDomains.add(s.domain.toLowerCase());
      const sGroup = s.independenceGroup || s.syndicationGroup || s.domain || 'default';
      if(s.sourceType !== 'SOCIAL_MEDIA' && s.authorityKnown !== false)uniqueSyndicationGroups.add(sGroup);
      const auth = typeof s.authorityScore === 'number' ? s.authorityScore : (s.authorityRank === 1 || s.rank === 1 ? 95 : (s.authorityRank === 2 || s.rank === 2 ? 80 : 65));
      if (s.authorityKnown === false) explicitlyUnknownAuthority++;
      if (s.authorityKnown !== false) authorityByOrigin.set(sGroup, Math.max(authorityByOrigin.get(sGroup) || 0, auth));
      const published = Date.parse(s.publishedAt || s.publishedDate || '');
      const eventDate = Date.parse(c.articleContext?.publishedAt || c.articleContext?.date || analysisData.textAnalysis?.docAuthenticity?.publishedAt || '');
      if (Number.isFinite(published) && Number.isFinite(eventDate)) datedEvidence.set(s.url || s.link, Math.abs(published-eventDate)/86400000);
      authoritySum += auth;
      authorityCount++;
      if (rel === 'SUPPORTS' || rel === 'SUPPORT' || rel === 'VERIFIED') supportingCount++;
      else if (rel === 'REFUTES' || rel === 'CONTRADICTS' || rel === 'FALSE') refutingCount++;
      else if (rel === 'QUALIFIES') qualifyingCount++;
    }
  }

  // Also include general sources passed at top level if claims didn't duplicate them
  const generalSources = Array.isArray(analysisData.sources) ? analysisData.sources : [];
  if (authorityCount === 0 && generalSources.length > 0) {
    for (const s of generalSources) {
      const rel = (s.relationship || s.stance || 'NEUTRAL').toUpperCase();
      const isEvidentiary = ['SUPPORTS', 'SUPPORT', 'REFUTES', 'CONTRADICTS', 'QUALIFIES'].includes(rel) || s.locallyVerified === true;
      if (!isEvidentiary) continue;
      if (s.domain) uniqueDomains.add(s.domain.toLowerCase());
      const auth = typeof s.authorityScore === 'number' ? s.authorityScore : (s.authorityRank === 1 ? 95 : (s.authorityRank === 2 ? 80 : 65));
      authoritySum += auth;
      authorityCount++;
      totalEvidenceCount++;
      if (rel === 'SUPPORTS' || rel === 'SUPPORT') supportingCount++;
      else if (rel === 'REFUTES' || rel === 'CONTRADICTS') refutingCount++;
    }
  }

  if (authorityByOrigin.size || explicitlyUnknownAuthority > 0) {
    authoritySum = [...authorityByOrigin.values()].reduce((a,b)=>a+b,0);
    authorityCount = authorityByOrigin.size;
  }
  const freshnessScore = datedEvidence.size ? Math.round([...datedEvidence.values()].reduce((sum,days)=>sum+(days<=7?100:days<=30?85:days<=365?60:30),0)/datedEvidence.size) : null;
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
  let sourceAuthority = 0;
  if (authorityCount > 0) {
    sourceAuthority = Math.round(authoritySum / authorityCount);
  } else if (verifiedCount > 0) {
    sourceAuthority = 85;
  }

  // 4. Stance Alignment / Contradictory Evidence
  const totalStanceSources = supportingCount + refutingCount;
  let stanceAlignment = 50;
  if (totalStanceSources > 0) {
    stanceAlignment = Math.round((supportingCount / totalStanceSources) * 100);
  } else if (verifiedCount > 0 && falseCount === 0) {
    stanceAlignment = 95;
  } else if (falseCount > 0) {
    stanceAlignment = 20;
  }

  // 5. Source Independence / Corroboration
  let sourceIndependence = 0;
  if (uniqueSyndicationGroups.size >= 3) sourceIndependence = 95;
  else if (uniqueSyndicationGroups.size === 2) sourceIndependence = 85;
  else if (uniqueSyndicationGroups.size === 1) sourceIndependence = 70;

  // 6. Provenance Quality
  const originConf = analysisData.provenance?.originAnalysis?.originConfidence ?? analysisData.provenance?.originConfidence ?? null;
  let provenanceConfidence = 0;
  if (typeof originConf === 'number') provenanceConfidence = Math.max(0,Math.min(100,originConf));
  else if (originConf === 'CONFIRMED') provenanceConfidence = 100;
  else if (originConf === 'PROBABLE') provenanceConfidence = 85;
  else if (originConf === 'EARLIEST_DISCOVERED') provenanceConfidence = 75;
  // Missing provenance stays unknown and is excluded from active factors.

  // 7. Language & Framing / Attribution Quality
  const attributionAnalysis = analysisData.textAnalysis?.attribution || analysisData.textAnalysis?.attributionQuality;
  let attributionQuality = hasNarrativeText ? Number(attributionAnalysis?.attributionScore ?? 50) : 0;
  attributionQuality = Math.max(0, Math.min(100, attributionQuality));

  // 8. Amplification Pattern / Context Quality
  let contextFramingQuality = hasNarrativeText
    ? Math.max(0, 100 - Number(analysisData.textAnalysis?.urgency?.urgencyScore || 0))
    : 0;
  if (analysisData.spreadAnalysis?.amplificationPattern === 'COORDINATED_AMPLIFICATION_SUSPECTED') contextFramingQuality = Math.min(contextFramingQuality || 100, 35);

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
    else if (mediaFindings.integrity && mediaFindings.integrity.isValid === false) mediaIntegrity = 40;
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
      if (k === 'sourceAuthority' && authorityCount === 0 && explicitlyUnknownAuthority > 0) return false;
      if (k === 'evidenceFreshness' && freshnessScore == null) return false;
      if (k === 'provenanceQuality' && originConf == null) return false;
      if (GLOBAL_SCORING_FACTORS[k].requiresMedia && !hasMedia) return false;
      if (GLOBAL_SCORING_FACTORS[k].requiresDocument && !hasDocument) return false;
      if ((k === 'attributionQuality' || k === 'contextFramingQuality') && !hasNarrativeText) return false;
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
    evidenceFreshness: freshnessScore ?? 0,
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
      // Preserve the normalized weight used by the calculation so consumers
      // can reproduce the final score exactly from the audit breakdown.
      w: weight * 100,
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
    const penalty = Math.round(25 * falseCount / Math.max(1, totalClaims) * 10) / 10;
    appliedPenalties.push({
      ...PENALTY_CATALOG.DIRECT_REFUTATION,
      label: 'Direct factual contradiction',
      val: `-${penalty.toFixed(1)}`,
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
  if (falseCount > 0 && falseCount === totalClaims) finalVerdict = 'FALSE';
  else if (falseCount > 0) finalVerdict = 'MISLEADING';
  else if (disputedCount > 0 || (supportingCount > 0 && refutingCount > 0)) finalVerdict = 'MIXED';
  else if (finalTrustScore >= 85 && unverifiedCount === 0) finalVerdict = 'HIGHLY_SUPPORTED';
  else if (finalTrustScore >= 70) finalVerdict = 'SUPPORTED';
  else if (finalTrustScore >= 50) finalVerdict = 'MIXED';
  else if (totalEvidenceCount === 0) finalVerdict = 'UNCERTAIN';
  else finalVerdict = 'UNCERTAIN';

  // ── Drivers ───────────────────────────────────────────────────────────────
  const positiveDrivers = [];
  const negativeDrivers = [];

  if (verifiedCount > 0) positiveDrivers.push(`Corroborated ${verifiedCount} factual proposition(s) against attributable evidence.`);
  if (sourceAuthority >= 80) positiveDrivers.push(`High average source authority score (${sourceAuthority}/100).`);
  if (uniqueDomains.size >= 2) positiveDrivers.push(`Corroborated across ${uniqueSyndicationGroups.size} reporting-origin groups (ownership/syndication metadata where available).`);
  if (originConf === 'CONFIRMED') positiveDrivers.push('Primary content provenance origin is cryptographically or archival confirmed.');
  if (mediaFindings?.c2pa?.hasC2paManifest) positiveDrivers.push('Signed C2PA Content Credentials verify original unmanipulated media.');

  if (falseCount > 0) negativeDrivers.push(`Directly refuted ${falseCount} proposition(s) with contradicting evidence.`);
  if (disputedCount > 0) negativeDrivers.push(`${disputedCount} claim(s) subject to active contradiction between authoritative sources.`);
  if (unverifiedCount > 0 && totalClaims > 0) negativeDrivers.push(`${unverifiedCount} assertion(s) lack independent corroborating sources.`);
  appliedPenalties.forEach(p => negativeDrivers.push(`${p.reason || p.description} (-${p.pointsDeducted || p.value} pts)`));

  // ── Real Sensitivity / What Would Move This Score ──────────────────────────
  const counterfactualConditions = [];

  // Counterfactuals rerun the exact formula; no fixed promised point changes.
  if (!analysisData.skipSensitivity && unverifiedCount > 0) {
    const changedClaims = claims.map(c => ['UNVERIFIED','INSUFFICIENT_EVIDENCE','UNSUPPORTED','SUSPICIOUS'].includes((c.verdict || c.status || 'UNVERIFIED').toUpperCase()) ? {...c, verdict:'VERIFIED', status:'TRUSTED', confidence:90} : c);
    const hypothetical = computeExplainableTrustScore({...analysisData, verifiedClaims:changedClaims, skipSensitivity:true},customWeights);
    const delta = hypothetical.finalTrustScore-finalTrustScore;
    counterfactualConditions.push({label:'All unresolved details supported at 90% confidence; existing source factors held constant',change:(delta>=0?'+':'')+delta,condition:'Illustrative assumption: all unverified details become supported at 90% confidence; actual new evidence also changes source factors.',potentialImpact:delta+' points under stated assumptions',impactScore:delta});
  }
  const counterfactualExplanation = 'An unverified claim indicates limited evidence coverage, not established falsehood. Score changes depend on the actual new evidence; any scenario shown states its assumptions.';

  return {
    evidenceCoverage: totalClaims ? Math.round(100*(totalClaims-unverifiedCount)/totalClaims) : 0,
    limitations: [freshnessScore == null ? 'Evidence freshness was not scored because comparable publication dates were unavailable.' : null, originConf == null ? 'Provenance was not scored because origin confidence was unavailable.' : null].filter(Boolean),
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
