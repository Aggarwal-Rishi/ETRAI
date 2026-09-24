/**
 * ETRAI Claim Diagnostic Report Generator
 * Assembles a comprehensive, auditable JSON diagnostic report for a single verified claim.
 * Contains all scoring formulas, active weights, per-source scores & reasons, fuzzy math traces,
 * and categorization rules so discrepancies can be analyzed deterministically.
 */

export function generateClaimDiagnosticJson(claim) {
  if (!claim) return null;

  // Attempt to parse rawJson if nested attributes are missing
  let rawClaim = {};
  if (typeof claim.rawJson === 'string') {
    try { rawClaim = JSON.parse(claim.rawJson); } catch (_) {}
  }

  const merged = { ...rawClaim, ...claim };
  const audit = merged.auditTrail || rawClaim.auditTrail || {};
  const claimVerificationResult = merged.claimVerificationResult || rawClaim.claimVerificationResult || {};

  // 1. Claim Metadata
  const claimId = merged.id || merged.claimId || 'claim_unknown';
  const claimText = merged.claimText || merged.text || merged.normalizedClaim || 'Unspecified assertion';
  const originalExcerpt = merged.originalSentence || merged.sourceContext?.originalSentence || merged.sourceExcerpt || merged.sourceSpan || merged.quoteText || null;
  const category = merged.category || merged.claimType || 'Factual Statement';
  const claimScope = merged.claimScope || 'Regional';
  const importanceScore = merged.importanceScore || null;
  const isRecentBreaking = Boolean(merged.isRecentBreaking);
  const extractionMode = merged.extractionMode || 'REAL_LLM';

  // 2. Verdict & Canonical Status
  const verdict = merged.verdict || claimVerificationResult.verdict || (merged.status === 'TRUSTED' ? 'VERIFIED' : (merged.status === 'FABRICATED' ? 'FALSE' : 'UNVERIFIED'));
  const status = merged.status || (verdict === 'VERIFIED' ? 'TRUSTED' : (verdict === 'FALSE' ? 'FABRICATED' : 'SUSPICIOUS'));
  const confidence = typeof merged.confidence === 'number' ? Math.round(merged.confidence) : (typeof claimVerificationResult.confidence === 'number' ? Math.round(claimVerificationResult.confidence) : 50);
  const evidenceState = merged.evidenceState || claimVerificationResult.evidenceState || 'INSUFFICIENT';
  const claimStanceReason = merged.claimStanceReason || claimVerificationResult.claimStanceReason || merged.explanation || '';

  // 3. Global Unified Scoring Weights & Factor Scores
  const activeWeights = merged.scoringWeights || claimVerificationResult.scoringWeights || {
    evidenceQuality: 0.30,
    sourceAuthority: 0.25,
    sourceAgreement: 0.25,
    sourceIndependence: 0.20
  };

  const eqScore = claimVerificationResult.evidenceQuality ?? merged.evidenceQuality ?? 50;
  const saScore = claimVerificationResult.sourceAuthority ?? merged.sourceAuthorityScore ?? merged.sourceAuthority ?? 50;
  const sagScore = claimVerificationResult.sourceAgreement ?? merged.sourceAgreement ?? (evidenceState === 'SUPPORTED' ? 100 : (evidenceState === 'REFUTED' ? 100 : 50));
  const siScore = claimVerificationResult.sourceIndependence ?? merged.sourceIndependence ?? 50;

  const wEq = Number(activeWeights.evidenceQuality || 0.30);
  const wSa = Number(activeWeights.sourceAuthority || 0.25);
  const wSag = Number(activeWeights.sourceAgreement || 0.25);
  const wSi = Number(activeWeights.sourceIndependence || 0.20);

  const eqContribution = Number((eqScore * wEq).toFixed(2));
  const saContribution = Number((saScore * wSa).toFixed(2));
  const sagContribution = Number((sagScore * wSag).toFixed(2));
  const siContribution = Number((siScore * wSi).toFixed(2));
  const calculatedSum = Number((eqContribution + saContribution + sagContribution + siContribution).toFixed(2));

  // 4. Per-Source Evaluation Ledger
  const rawSources = merged.sources || audit.rawSearchHits?.webHits || [];
  const rawEvals = merged.evidenceEvaluations || audit.evidenceEvaluations || [];

  const sourcesList = rawSources.map((s, idx) => {
    const sIndex = s.index !== undefined ? s.index : idx;
    const matchingEval = rawEvals.find(e => e.sourceIndex === sIndex || e.index === sIndex) || {};
    
    // Domain Trust & Authority Tiering
    const domain = s.domain || (s.url ? (() => { try { return new URL(s.url).hostname.replace(/^www\./, ''); } catch (_) { return s.url; } })() : 'unknown');
    const authScore = typeof s.authorityScore === 'number' ? s.authorityScore : (typeof s.trustScore === 'number' ? Math.round(s.trustScore * 100) : 50);
    
    let domainTier = 'Tier 4 (Unlisted / General Web / Blog)';
    if (authScore >= 95 || /\.(gov|edu)(\.[a-z]{2})?$/i.test(domain)) {
      domainTier = 'Tier 0 (Government, Educational & Official Fact-Check Portals)';
    } else if (authScore >= 88) {
      domainTier = 'Tier 1 (Global Wire Agencies: Reuters, AP, BBC, Bloomberg)';
    } else if (authScore >= 70) {
      domainTier = 'Tier 2 (Major Regional & National Publishers: The Hindu, NYT, Indian Express)';
    } else if (authScore < 50 || domain.includes('twitter.com') || domain.includes('x.com')) {
      domainTier = 'Tier 3 (Social Discourse / Unverified Media)';
    }

    const stance = s.stance || matchingEval.stance || 'NEUTRAL';
    const reason = s.reason || s.sourceReasoning || matchingEval.reason || matchingEval.explanation || 'No explicit per-source stance reason provided.';
    const relevanceScore = s.relevanceScore || matchingEval.relevanceScore || 50;
    const isSyndicatedDuplicate = Boolean(matchingEval.isSyndicatedDuplicate || s.isSyndicatedDuplicate);

    return {
      sourceIndex: sIndex,
      url: s.url || s.link || '',
      domain,
      publication: s.publication || domain,
      domainTier,
      authorityScore: authScore,
      stance,
      reason,
      relevanceScore,
      isSyndicatedDuplicate,
      dimensionMatches: {
        entityMatch: matchingEval.entityMatch ?? true,
        eventMatch: matchingEval.eventMatch ?? true,
        temporalMatch: matchingEval.temporalMatch ?? true,
        locationMatch: matchingEval.locationMatch ?? true
      }
    };
  });

  // Stance Distribution
  const supportingSources = sourcesList.filter(s => s.stance === 'SUPPORTS');
  const refutingSources = sourcesList.filter(s => s.stance === 'REFUTES');
  const qualifyingSources = sourcesList.filter(s => s.stance === 'QUALIFIES');
  const neutralSources = sourcesList.filter(s => s.stance === 'NEUTRAL');
  const irrelevantSources = sourcesList.filter(s => s.stance === 'IRRELEVANT');

  const maxSupportingAuthority = supportingSources.length > 0 ? Math.max(...supportingSources.map(s => s.authorityScore)) : 0;
  const maxRefutingAuthority = refutingSources.length > 0 ? Math.max(...refutingSources.map(s => s.authorityScore)) : 0;

  // Dual-Axis Formulation
  const dualAxis = claimVerificationResult.dualAxis || merged.dualAxis || {
    veracityIndex: typeof merged.veracityIndex === 'number' ? merged.veracityIndex : (verdict === 'VERIFIED' ? 90 : verdict === 'FALSE' ? 10 : 50),
    evidentiaryCertainty: typeof merged.evidentiaryCertainty === 'number' ? merged.evidentiaryCertainty : confidence,
    independentCorporateCount: claimVerificationResult.corporateParentCount || 1,
    qualifyingCount: qualifyingSources.length
  };

  // Override Rule Detection
  const tier0OverrideApplied = Boolean(refutingSources.length > 0 && maxRefutingAuthority >= 95 && maxSupportingAuthority <= 50);
  const insufficientConfidenceGateApplied = Boolean(evidenceState === 'SUPPORTED' && confidence < 55);

  // 5. Fuzzy Engine & Plausibility Math Trace
  const fuzzy = audit.fuzzyMathTrace || {};
  const rawInputs = fuzzy.rawInputs || {};
  const defuzz = fuzzy.defuzzificationMath || {};

  // 6. Gemini LLM Raw Completion
  const gptCross = audit.gptCrossVerification || {};
  const rawCompletion = gptCross.rawCompletion || {};

  return {
    reportTimestamp: new Date().toISOString(),
    claimMetadata: {
      claimId,
      claimText,
      originalExcerpt,
      category,
      claimScope,
      importanceScore,
      isRecentBreaking,
      extractionMode
    },
    verdictOutcome: {
      canonicalVerdict: verdict,
      statusLabel: status,
      confidenceScore: confidence,
      veracityIndex: dualAxis.veracityIndex,
      evidentiaryCertainty: dualAxis.evidentiaryCertainty,
      evidenceState,
      claimStanceReason,
      summaryInterpretation: verdict === 'VERIFIED'
        ? 'Fully corroborated by consistent, authoritative primary evidence.'
        : verdict === 'FALSE'
        ? 'Directly contradicted or overridden by official authoritative evidence.'
        : verdict === 'PARTIALLY_VERIFIED'
        ? 'Conflicting or mixed evidence found across reporting sources.'
        : 'Insufficient or ambiguous evidence to definitively verify or refute.'
    },
    scoringFormulaBreakdown: {
      formula: 'Confidence = (EvidenceQuality × w_eq) + (SourceAuthority × w_sa) + (SourceAgreement × w_sag) + (SourceIndependence × w_si)',
      dualAxisMetrics: {
        veracityIndex: dualAxis.veracityIndex,
        evidentiaryCertainty: dualAxis.evidentiaryCertainty,
        independentCorporateCount: dualAxis.independentCorporateCount,
        epistemicFormula: 'V = 50 * (1 + NetStance), C = MeanAuth * (1 - e^(-0.4 * N_corp))'
      },
      activeWeights: {
        evidenceQualityWeight: wEq,
        sourceAuthorityWeight: wSa,
        sourceAgreementWeight: wSag,
        sourceIndependenceWeight: wSi
      },
      factorScores: {
        evidenceQuality: eqScore,
        sourceAuthority: saScore,
        sourceAgreement: sagScore,
        sourceIndependence: siScore
      },
      factorContributions: {
        evidenceQualityPoints: eqContribution,
        sourceAuthorityPoints: saContribution,
        sourceAgreementPoints: sagContribution,
        sourceIndependencePoints: siContribution,
        totalCalculatedScore: calculatedSum
      },
      decisionGuardrails: {
        tier0RefutationOverrideTriggered: tier0OverrideApplied,
        tier0OverrideExplanation: tier0OverrideApplied
          ? `Verdict forced to FALSE because a Tier-0 source (Authority ${maxRefutingAuthority} >= 95) contradicted the claim while supporting sources scored low (Authority ${maxSupportingAuthority} <= 50).`
          : 'None',
        unverifiedGateTriggered: insufficientConfidenceGateApplied,
        unverifiedGateExplanation: insufficientConfidenceGateApplied
          ? `Verdict locked to UNVERIFIED because confidence (${confidence}%) fell below the 55% threshold despite supporting sources.`
          : 'None'
      }
    },
    stanceDistribution: {
      totalSourcesEvaluated: sourcesList.length,
      supportingCount: supportingSources.length,
      refutingCount: refutingSources.length,
      qualifyingCount: qualifyingSources.length,
      neutralCount: neutralSources.length,
      irrelevantCount: irrelevantSources.length,
      maxSupportingAuthority,
      maxRefutingAuthority
    },
    perSourceEvaluations: sourcesList,
    fuzzyEngineTrace: {
      corroborationScore: rawInputs.corroborationScore ?? null,
      sourceCredibilityScore: rawInputs.sourceCredibilityScore ?? null,
      sentimentIntensity: rawInputs.sentimentIntensity ?? null,
      communitySkepticism: rawInputs.communitySkepticismScore ?? null,
      plausibilityFlag: merged.plausibilityFlag ?? rawInputs.plausibilityFlag ?? false,
      plausibilityReasoning: merged.plausibilityReasoning ?? null,
      activatedRules: fuzzy.activatedRules || [],
      defuzzifiedCrispScore: defuzz.crispScore ?? null,
      centroidNumerator: defuzz.numerator ?? null,
      centroidDenominator: defuzz.denominator ?? null
    },
    agent3LlmDiagnostics: {
      modelName: rawCompletion.model || 'Gemini Agent 3',
      rawClaimStanceReason: rawCompletion.claimStanceReason || null,
      rawOverallStance: rawCompletion.overallStance || null,
      rawExplanation: rawCompletion.explanation || null,
      promptSentSnippet: typeof gptCross.promptSent === 'string' ? gptCross.promptSent.slice(0, 300) + '...' : null
    }
  };
}
