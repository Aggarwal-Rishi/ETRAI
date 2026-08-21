/**
 * ETRAI Share & Export Service
 * Produces sanitized shareable and exportable verification reports.
 * Strictly strips private tenant identifiers, user IDs, internal database IDs,
 * private billing settings, and environment secrets before generating the output.
 */

/**
 * Sanitizes a report object for public sharing / tenant-safe export
 */
function sanitizeReportForExport(reportData = {}, options = {}) {
  if (!reportData || typeof reportData !== 'object') return {};

  const clean = JSON.parse(JSON.stringify(reportData));

  // 1. Strip sensitive internal database & tenant fields
  delete clean.userId;
  delete clean.workspaceId;
  delete clean.apiKey;
  delete clean.token;
  delete clean.password;
  delete clean.secret;
  delete clean.databaseUrl;
  delete clean.internalSession;

  // 2. Format export metadata
  const exportPayload = {
    exportVersion: 'ETRAI-v2.0-Explainable',
    exportedAt: new Date().toISOString(),
    reportId: clean.id || clean.reportId || 'anon_verification_report',
    title: clean.title || clean.sourceTitle || 'ETRAI Verification Report',
    verdict: clean.articleVerdict || clean.verdict || 'UNVERIFIED',
    factualAccuracyScore: clean.scores?.factCheckingScore || clean.factualAccuracyScore || 50,
    evidenceConfidence: clean.evidenceConfidence || clean.confidence || 50,
    executiveSummary: clean.summary || '',
    
    // Tab 1: Full Report & Claims
    claimsBreakdown: clean.breakdown || {},
    verifiedClaims: Array.isArray(clean.verifiedClaims) ? clean.verifiedClaims.map(c => ({
      claimId: c.id,
      text: c.claimText || c.text,
      verdict: c.verdict || c.status,
      confidence: c.confidence,
      reasoning: c.reasoning,
      sourcesCount: Array.isArray(c.sources) ? c.sources.length : 0,
      sources: (c.sources || []).map(s => ({
        domain: s.domain,
        title: s.title,
        stance: s.stance,
        rank: s.rank || s.authorityRank,
        authorityScore: s.authorityScore
      }))
    })) : [],

    // Tab 2: Text Analysis
    textAnalysis: clean.textAnalysis || {
      readability: clean.readability || {},
      urgency: clean.urgency || {},
      attributionQuality: clean.attributionQuality || {},
      sentenceHighlights: clean.sentenceHighlights || []
    },

    // Tab 3: Link Intelligence
    linkIntelligence: clean.linkIntelligence || {
      totalLinks: clean.links?.length || 0,
      primarySourcesCount: (clean.links || []).filter(l => l.isPrimarySource).length,
      links: clean.links || []
    },

    // Tab 4: Images & Forensics
    imagesAnalysis: {
      discoveredImages: clean.discoveredImages || clean.assetInventory?.images || [],
      forensics: clean.mediaAnalysis?.forensics || null
    },

    // Tab 5: Videos & Audio Forensics
    videosAnalysis: {
      discoveredVideos: clean.discoveredVideos || clean.assetInventory?.videos || [],
      videoForensics: clean.mediaAnalysis?.videoForensics || null
    },

    // Tab 6: Numbers & Scale Audits
    numericalAnalysis: clean.numericalAnalysis || {
      factsCount: clean.numericalFacts?.length || 0,
      facts: clean.numericalFacts || []
    },

    // Provenance & Source Intelligence
    provenance: clean.provenance || null,
    sourceIntelligence: clean.sourceIntelligence || null,
    entityIntent: {
      entities: clean.entities || [],
      intentAnalysis: clean.intentAnalysis || null
    }
  };

  return exportPayload;
}

/**
 * Generates a clean Markdown export representation of the verification report
 */
function generateReportMarkdownExport(reportData = {}) {
  const sanitized = sanitizeReportForExport(reportData);

  return `# ETRAI Fact-Check & Verification Report
**Title:** ${sanitized.title}  
**Overall Verdict:** ${sanitized.verdict}  
**Factual Accuracy Score:** ${sanitized.factualAccuracyScore}/100  
**Evidence Confidence:** ${sanitized.evidenceConfidence}%  
**Export Date:** ${sanitized.exportedAt}  

---

## Executive Summary
${sanitized.executiveSummary}

---

## Claims & Stance Verification Matrix
${sanitized.verifiedClaims.map((c, i) => `### Claim ${i + 1}: ${c.text}
- **Verdict:** \`${c.verdict}\` (Confidence: ${c.confidence}%)
- **Reasoning:** ${c.reasoning}
- **Sources (${c.sourcesCount}):**
${c.sources.map(s => `  - [${s.stance}] **${s.title}** (${s.domain}) — Rank ${s.rank || 2}`).join('\n')}
`).join('\n')}

---

## Text & Readability Metrics
- **Word Count:** ${sanitized.textAnalysis.readability?.wordCount || 'N/A'}
- **Flesch Reading Ease:** ${sanitized.textAnalysis.readability?.fleschReadingEase || 'N/A'}
- **Urgency Tier:** ${sanitized.textAnalysis.urgency?.urgencyTier || 'LOW_URGENCY'}
- **Attribution Quality:** ${sanitized.textAnalysis.attributionQuality?.attributionGrade || 'STANDARD'}

---

## Numerical & Scale Audit
- **Total Numbers Analyzed:** ${sanitized.numericalAnalysis.factsCount || 0}
${(sanitized.numericalAnalysis.facts || []).map(f => `- **${f.asPrinted}** (${f.refersTo || 'Metric'}): \`${f.status}\` — ${f.actualFinding || ''}`).join('\n')}

---
*Generated by ETRAI Canonical Verification Intelligence Engine.*
`;
}

module.exports = {
  sanitizeReportForExport,
  generateReportMarkdownExport
};
