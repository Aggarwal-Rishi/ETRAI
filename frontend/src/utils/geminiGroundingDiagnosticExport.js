/**
 * ETRAI Gemini Live Search Grounding Diagnostic Report Generator
 * Assembles an auditable JSON diagnostic report for Gemini Google Search Grounding.
 * Contains executed search queries, live grounded web chunks/citations,
 * confidence ratings, and reasoning breakdowns.
 */

export function generateGeminiGroundingDiagnosticJson(groundingData = {}) {
  if (!groundingData) return null;

  const now = new Date().toISOString();
  const claims = Array.isArray(groundingData.claims) ? groundingData.claims : [];

  return {
    reportTimestamp: now,
    telemetryType: 'ETRAI_GEMINI_LIVE_SEARCH_GROUNDING_DIAGNOSTIC',
    engine: 'Gemini with Real-Time Google Search Grounding',
    methodology: groundingData.methodology || 'GEMINI_NATIVE_SEARCH_GROUNDING_SEQUENTIAL',
    status: groundingData.status || 'SUCCESS',
    overallVerdict: groundingData.overallVerdict || 'UNVERIFIED',
    summaryInterpretation: groundingData.summary || '',
    metrics: {
      totalClaimsEvaluated: groundingData.totalClaims || claims.length,
      verifiedCount: groundingData.verifiedCount ?? claims.filter(c => c.verdict === 'VERIFIED').length,
      partiallyVerifiedCount: groundingData.partialCount ?? claims.filter(c => c.verdict === 'PARTIALLY_VERIFIED').length,
      falseContradictedCount: groundingData.falseCount ?? claims.filter(c => c.verdict === 'FALSE').length,
      unverifiedCount: groundingData.unverifiedCount ?? claims.filter(c => c.verdict === 'UNVERIFIED').length,
      totalSearchQueriesExecuted: (groundingData.allSearchQueries || []).length,
      totalUniqueGroundedSourcesCited: (groundingData.allGroundedSources || []).length
    },
    executedSearchQueries: groundingData.allSearchQueries || [],
    allGroundedSources: (groundingData.allGroundedSources || []).map((s, idx) => ({
      citationIndex: idx + 1,
      title: s.title || `Source ${idx + 1}`,
      url: s.url,
      domain: s.domain || 'web-source',
      sourceRole: s.sourceRole || 'GROUNDED_CITATION'
    })),
    evaluatedClaims: claims.map((c, idx) => ({
      claimIndex: idx + 1,
      claimId: c.claimId || `claim_${idx + 1}`,
      claimText: c.claimText || c.text || '',
      verdictOutcome: {
        canonicalVerdict: c.verdict || 'UNVERIFIED',
        confidenceScore: c.confidence ?? 50,
        status: c.status || 'SUCCESS'
      },
      executiveAssessment: c.explanation || '',
      keyCorroboratingFindings: Array.isArray(c.keyFindings) ? c.keyFindings : [],
      claimSearchQueries: Array.isArray(c.searchQueries) ? c.searchQueries : [],
      groundedSourceCitations: (c.groundedSources || []).map((src, sIdx) => ({
        index: sIdx + 1,
        title: src.title || `Source ${sIdx + 1}`,
        url: src.url,
        domain: src.domain || 'web-source',
        sourceRole: src.sourceRole || 'GROUNDED_CITATION'
      }))
    }))
  };
}

export function generateSingleClaimGroundingDiagnosticJson(claim, index = 0, overallData = {}) {
  if (!claim) return null;

  return {
    reportTimestamp: new Date().toISOString(),
    telemetryType: 'ETRAI_GEMINI_SINGLE_CLAIM_GROUNDING_DIAGNOSTIC',
    claimIndex: index + 1,
    claimId: claim.claimId || `claim_${index + 1}`,
    claimText: claim.claimText || claim.text || '',
    engine: 'Gemini with Real-Time Google Search Grounding',
    verdictOutcome: {
      canonicalVerdict: claim.verdict || 'UNVERIFIED',
      confidenceScore: claim.confidence ?? 50,
      status: claim.status || 'SUCCESS'
    },
    executiveAssessment: claim.explanation || '',
    keyCorroboratingFindings: Array.isArray(claim.keyFindings) ? claim.keyFindings : [],
    claimSearchQueries: Array.isArray(claim.searchQueries) ? claim.searchQueries : [],
    groundedSourceCitations: (claim.groundedSources || []).map((src, sIdx) => ({
      index: sIdx + 1,
      title: src.title || `Source ${sIdx + 1}`,
      url: src.url,
      domain: src.domain || 'web-source',
      sourceRole: src.sourceRole || 'GROUNDED_CITATION'
    })),
    sessionContext: {
      overallSectionVerdict: overallData.overallVerdict || 'UNVERIFIED',
      totalClaimsInSubmission: overallData.totalClaims || 1
    }
  };
}
