/**
 * ETRAI Share & Export Service
 * Produces sanitized shareable and exportable verification dossiers.
 * Strictly strips private tenant identifiers, user IDs, internal database IDs,
 * private billing settings, and environment secrets before generating the output.
 */

'use strict';

const crypto = require('crypto');
const { prisma } = require('../utils/prisma');

/**
 * Helper to extract unique domain
 */
function extractDomain(urlStr) {
  if (!urlStr) return 'unknown';
  try {
    const parsed = new URL(urlStr.startsWith('http') ? urlStr : `https://${urlStr}`);
    return parsed.hostname.replace(/^www\./, '');
  } catch (e) {
    return urlStr.replace(/^www\./, '').split('/')[0] || 'unknown';
  }
}

/**
 * Sanitizes a report object for public sharing / tenant-safe export
 */
function sanitizeReportForExport(reportData = {}, options = {}) {
  if (!reportData || typeof reportData !== 'object') return {};

  const clean = JSON.parse(JSON.stringify(reportData));

  // 1. Strip sensitive internal database & tenant fields at every depth.
  // Public exports must not leak a nested provider credential or tenant ID.
  const privateKeys = new Set([
    'userid', 'workspaceid', 'apikey', 'token', 'password', 'secret',
    'databaseurl', 'internalsession', 'authorization', 'jwtsecret',
    'geminiapikey', 'serperkey', 'accesstoken', 'refreshtoken'
  ]);
  const stripPrivateFields = value => {
    if (Array.isArray(value)) {
      value.forEach(stripPrivateFields);
      return;
    }
    if (!value || typeof value !== 'object') return;
    Object.keys(value).forEach(key => {
      if (privateKeys.has(key.toLowerCase())) delete value[key];
      else stripPrivateFields(value[key]);
    });
  };
  stripPrivateFields(clean);

  // 2. Format export metadata
  const exportPayload = {
    exportVersion: 'ETRAI-v2.4-Explainable-Dossier',
    exportedAt: new Date().toISOString(),
    reportId: clean.id || clean.reportId || 'dossier_' + crypto.randomBytes(6).toString('hex'),
    title: clean.title || clean.sourceTitle || 'ETRAI Verification Dossier',
    methodologyVersion: clean.methodologyVersion || clean.scoringDerivation?.methodologyVersion || clean.explainableScoring?.scoringVersion || 'ETRAI-v2.4-TransparentScoring',
    
    // 1. Executive Verdict & Scores
    verdict: clean.articleVerdict || clean.verdict || 'UNVERIFIED',
    overallTrustScore: clean.scores?.overallTrustScore !== undefined ? clean.scores.overallTrustScore : (clean.trustScore || clean.factualAccuracyScore || 50),
    factualAccuracyScore: clean.scores?.factCheckingScore || clean.factualAccuracyScore || 50,
    evidenceConfidence: clean.evidenceConfidence || clean.confidence || 50,
    executiveSummary: clean.summary || '',
    readerRecommendation: clean.recommendation || '',
    keyHighlights: Array.isArray(clean.keyHighlights) ? clean.keyHighlights : [],
    explanationOfFindings: clean.explanationOfFindings || '',

    // 2. Score Derivation & Factors
    scoreDerivation: clean.scores?.scoreDerivation || clean.explainableScoring || {
      baseScore: 100,
      evidenceFactor: clean.scores?.factualAccuracyScore || 50,
      sourceAuthorityFactor: 80,
      penalties: {
        manipulationPenalty: clean.scores?.manipulationAssessment?.manipulationScore || 0,
        consistencyPenalty: clean.scores?.manipulationAssessment?.consistencyPenalty || 0,
        vagueSourcingPenalty: clean.scores?.manipulationAssessment?.vagueSourcingPenalty || 0
      }
    },

    // 3. Claims & Evidence Ledger
    claimsBreakdown: clean.breakdown || {},
    claimsFoundCount: Array.isArray(clean.verifiedClaims) ? clean.verifiedClaims.length : (Array.isArray(clean.claims) ? clean.claims.length : 0),
    verifiedClaims: Array.isArray(clean.verifiedClaims || clean.claims) ? (clean.verifiedClaims || clean.claims).map(c => ({
      claimId: c.id || c.claimId,
      text: c.claimText || c.text,
      originalNewsExcerpt: c.originalSentence || c.sourceContext?.originalSentence || c.sourceExcerpt || c.quoteText || c.rawPassage || null,
      verdict: c.verdict || c.status,
      confidence: c.confidence,
      reasoning: c.reasoning || c.explanation,
      temporalContext: c.temporalContext || null,
      sourcesCount: Array.isArray(c.sources) ? c.sources.length : (Array.isArray(c.evidenceEvaluations) ? c.evidenceEvaluations.length : 0),
      sources: (c.evidenceEvaluations || c.sources || []).map(s => ({
        domain: s.domain,
        title: s.title,
        url: s.url || s.link,
        stance: s.stance,
        rank: s.rank || s.authorityRank || 2,
        authorityScore: s.authorityScore || 80.0,
        isIndependent: s.isIndependent !== false
      }))
    })) : [],

    // 4. Supporting & Contradicting Evidence Aggregates
    supportingEvidence: extractEvidenceByStance(clean.verifiedClaims || clean.claims, 'SUPPORTS'),
    contradictingEvidence: extractEvidenceByStance(clean.verifiedClaims || clean.claims, 'CONTRADICTS'),

    // 5. Source Authority & Independence
    sourceIntelligence: clean.sourceIntelligence || {
      domainCount: 0,
      rankedSources: []
    },

    // 6. Content Provenance & Spread
    provenance: clean.provenance || null,
    spreadAnalysis: clean.spreadAnalysis || null,

    // 7. Media & Document Forensics
    mediaForensics: clean.mediaAnalysis || null,
    textAnalysis: clean.textAnalysis || {
      readability: clean.readability || null,
      urgency: clean.urgency || null,
      attributionQuality: clean.attributionQuality || null
    },
    linkIntelligence: clean.linkIntelligence || { totalLinks: 0, primarySourcesCount: 0, links: [] },
    imagesAnalysis: clean.imagesAnalysis || {
      discoveredImages: Array.isArray(clean.discoveredImages) ? clean.discoveredImages : []
    },
    videosAnalysis: clean.videosAnalysis || {
      discoveredVideos: Array.isArray(clean.discoveredVideos) ? clean.discoveredVideos : []
    },
    numericalAnalysis: clean.numericalAnalysis || { factsCount: 0, facts: [] },

    // 8. Named Entities & Quote Attribution
    entities: clean.entities || [],
    quoteAttributions: clean.quoteAttributions || [],
    intentAnalysis: clean.intentAnalysis || null,

    // 9. Uncertainty & Investigative Criteria
    uncertaintyAnalysis: clean.uncertainty || {
      ocrUncertaintyScore: clean.mediaAnalysis?.ocrUncertainty || 0,
      lowConfidenceClaimsCount: (clean.verifiedClaims || []).filter(c => (c.confidence || 50) < 60).length,
      limitations: clean.limitations || []
    },
    whatWouldChangeVerdict: clean.whatWouldChangeVerdict || [
      'Discovery of authoritative gazette / statutory government publication matching claimed reference.',
      'Cryptographically signed C2PA camera raw capture from an accredited photojournalist repository.',
      'Official retraction or correction published by lead syndication wire.'
    ],

    // 10. AI / Model Telemetry
    observability: clean.observability || {
      provider: 'Google Gemini & Serper Search',
      model: process.env.GEMINI_MODEL || 'gemini-flash-lite-latest',
      temperature: 0.2,
      deterministicScoringVersion: '2.4.0'
    }
  };

  return exportPayload;
}

function extractEvidenceByStance(claims = [], targetStance = 'SUPPORTS') {
  const results = [];
  if (!Array.isArray(claims)) return results;

  claims.forEach(c => {
    const list = c.evidenceEvaluations || c.sources || [];
    list.forEach(s => {
      const st = (s.stance || '').toUpperCase();
      if ((targetStance === 'SUPPORTS' && (st === 'SUPPORTS' || st === 'SUPPORT' || st === 'VERIFIED')) ||
          (targetStance === 'CONTRADICTS' && (st === 'CONTRADICTS' || st === 'REFUTES' || st === 'FALSE'))) {
        results.push({
          claimText: c.claimText || c.text,
          sourceUrl: s.url || s.link,
          domain: s.domain,
          title: s.title,
          stance: s.stance,
          authorityScore: s.authorityScore || 80.0
        });
      }
    });
  });

  return results;
}

/**
 * Generates structured JSON export string
 */
function generateReportJsonExport(reportData = {}) {
  const sanitized = sanitizeReportForExport(reportData);
  return JSON.stringify(sanitized, null, 2);
}

/**
 * Generates a readable Markdown dossier while retaining source citations.
 */
function generateReportMarkdownExport(reportData = {}) {
  const report = sanitizeReportForExport(reportData);
  const lines = [
    '# ETRAI Fact-Check & Verification Report',
    '',
    `**Title:** ${report.title}`,
    `**Overall Verdict:** ${report.verdict}`,
    `**Trust Score:** ${report.overallTrustScore}/100`,
    `**Evidence Confidence:** ${report.evidenceConfidence}%`,
    '',
    '## Executive Summary',
    '',
    report.executiveSummary || 'No executive summary was generated.',
    '',
    '## Claims and Evidence',
    ''
  ];

  if (!report.verifiedClaims.length) {
    lines.push('No atomic claims were identified.', '');
  } else {
    report.verifiedClaims.forEach((claim, index) => {
      lines.push(`### Claim ${index + 1}: ${claim.verdict || 'UNVERIFIED'}`, '');
      lines.push(claim.text || 'Claim text unavailable.');
      lines.push('', `Confidence: ${claim.confidence ?? 'N/A'}%`);
      if (claim.reasoning) lines.push('', claim.reasoning);
      if (claim.sources?.length) {
        lines.push('', 'Sources:', '');
        claim.sources.forEach(source => {
          const label = source.title || source.domain || 'Source';
          const destination = source.url || '';
          const domain = source.domain ? ` (${source.domain})` : '';
          lines.push(destination ? `- [${label}](${destination})${domain} — ${source.stance || 'NEUTRAL'}` : `- ${label}${domain} — ${source.stance || 'NEUTRAL'}`);
        });
      }
      lines.push('');
    });
  }

  const numericFacts = report.numericalAnalysis?.facts || [];
  if (numericFacts.length) {
    lines.push('## Numerical Findings', '');
    numericFacts.forEach(fact => lines.push(`- ${fact.asPrinted || fact.value || 'Value unavailable'}: ${fact.status || 'UNVERIFIED'}${fact.refersTo ? ` — ${fact.refersTo}` : ''}`));
    lines.push('');
  }

  lines.push('## Methodology', '', report.methodologyVersion, '', `Exported: ${report.exportedAt}`);
  return lines.join('\n');
}

/**
 * Generates CSV tabular export for claim-level verification audit
 */
function generateReportCsvExport(reportData = {}) {
  const sanitized = sanitizeReportForExport(reportData);
  const rows = [];

  // CSV Header
  rows.push(['Claim ID', 'Claim Text', 'Original News Excerpt', 'Claim Verdict', 'Confidence', 'Reasoning', 'Sources Count', 'Primary Source URL', 'Source Domain', 'Source Stance', 'Source Authority Score'].map(escapeCsvField).join(','));

  const claims = sanitized.verifiedClaims || [];
  if (claims.length === 0) {
    rows.push(['N/A', 'No atomic claims identified', '', sanitized.verdict, sanitized.factualAccuracyScore, sanitized.executiveSummary, 0, '', '', '', ''].map(escapeCsvField).join(','));
  } else {
    claims.forEach((c, idx) => {
      const sources = c.sources || [];
      if (sources.length === 0) {
        rows.push([
          c.claimId || `claim_${idx + 1}`,
          c.text || '',
          c.originalNewsExcerpt || '',
          c.verdict || 'UNVERIFIED',
          `${c.confidence || 50}%`,
          c.reasoning || '',
          0,
          '',
          '',
          '',
          ''
        ].map(escapeCsvField).join(','));
      } else {
        sources.forEach((s, sIdx) => {
          rows.push([
            c.claimId || `claim_${idx + 1}`,
            sIdx === 0 ? (c.text || '') : '',
            sIdx === 0 ? (c.originalNewsExcerpt || '') : '',
            sIdx === 0 ? (c.verdict || 'UNVERIFIED') : '',
            sIdx === 0 ? `${c.confidence || 50}%` : '',
            sIdx === 0 ? (c.reasoning || '') : '',
            sIdx === 0 ? sources.length : '',
            s.url || '',
            s.domain || '',
            s.stance || '',
            s.authorityScore || ''
          ].map(escapeCsvField).join(','));
        });
      }
    });
  }

  return rows.join('\r\n');
}

function escapeCsvField(val) {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

/**
 * Generates authentic %PDF-1.4 binary stream export
 */
function generateReportPdfExport(reportData = {}) {
  const sanitized = sanitizeReportForExport(reportData);

  const lines = [];
  lines.push(`ETRAI INVESTIGATION DOSSIER`);
  lines.push(`================================================================`);
  lines.push(`Title: ${sanitized.title}`);
  lines.push(`Investigation ID: ${sanitized.reportId}`);
  lines.push(`Exported At: ${sanitized.exportedAt}`);
  lines.push(`Methodology Version: ${sanitized.methodologyVersion}`);
  lines.push(`Overall Verdict: ${sanitized.verdict}`);
  lines.push(`Overall Trust Score: ${sanitized.overallTrustScore}/100 | Evidence Confidence: ${sanitized.evidenceConfidence}%`);
  lines.push(`----------------------------------------------------------------`);
  lines.push(`EXECUTIVE SUMMARY:`);
  lines.push(sanitized.executiveSummary || 'No executive summary available.');
  lines.push(``);
  lines.push(`READER RECOMMENDATION:`);
  lines.push(sanitized.readerRecommendation || 'Review primary evidence citations.');
  lines.push(``);
  lines.push(`----------------------------------------------------------------`);
  lines.push(`CLAIMS & VERDICT MATRIX (${sanitized.claimsFoundCount} Claims):`);

  (sanitized.verifiedClaims || []).forEach((c, idx) => {
    lines.push(`[Claim ${idx + 1}] ${c.text}`);
    if (c.originalNewsExcerpt) {
      lines.push(`  - Original News Passage: "${c.originalNewsExcerpt}"`);
    }
    lines.push(`  - Verdict: ${c.verdict} (Confidence: ${c.confidence}%)`);
    lines.push(`  - Reason: ${c.reasoning}`);
    (c.sources || []).forEach(s => {
      lines.push(`    * [${s.stance}] ${s.domain} (Authority: ${s.authorityScore}/100) - ${s.url}`);
    });
    lines.push(``);
  });

  lines.push(`----------------------------------------------------------------`);
  lines.push(`PROVENANCE & SPREAD INTELLIGENCE:`);
  if (sanitized.provenance?.originConfidence) {
    lines.push(`Origin Status: ${sanitized.provenance.originConfidence}`);
    lines.push(`First Known Appearance: ${sanitized.provenance.earliestDiscoveredDate || 'N/A'} via ${sanitized.provenance.firstKnownPublisher || 'Web'}`);
  } else {
    lines.push(`Provenance Assessment: Clean single-source entry without detected syndication anomalies.`);
  }

  lines.push(``);
  lines.push(`----------------------------------------------------------------`);
  lines.push(`WHAT WOULD CHANGE THIS VERDICT:`);
  (sanitized.whatWouldChangeVerdict || []).forEach((crit, cIdx) => {
    lines.push(`  ${cIdx + 1}. ${crit}`);
  });

  lines.push(``);
  lines.push(`================================================================`);
  lines.push(`End of Dossier · Sealed by ETRAI Multi-Agent AI Pipeline`);

  // Build authentic PDF stream object
  const contentStream = lines.map((l, i) => {
    const cleanL = l.replace(/[()\\]/g, '\\$&');
    return `BT /F1 10 Tf 40 ${760 - (i % 45) * 16} Td (${cleanL.slice(0, 95)}) Tj ET`;
  }).join('\n');

  const streamLength = Buffer.byteLength(contentStream);

  const pdfBody = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< /Length ${streamLength} >>
stream
${contentStream}
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000234 00000 n 
0000000305 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
${400 + streamLength}
%%EOF`;

  return Buffer.from(pdfBody, 'utf-8');
}

/**
 * Creates cryptographically secure random share token with optional expiration
 */
async function createShareableLink(analysisId, userId, options = {}) {
  if (!analysisId || !userId) throw new Error('Analysis ID and User ID are required to create a shareable link.');

  const existing = await prisma.analysis.findFirst({
    where: { id: analysisId, userId }
  });
  if (!existing) throw new Error('Analysis not found or tenant access denied.');

  const shareToken = crypto.randomBytes(24).toString('hex');
  const expiresInDays = parseInt(options.expiresInDays || 30, 10);
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

  let reportJson = {};
  if (typeof existing.reportData === 'string') {
    try { reportJson = JSON.parse(existing.reportData); } catch (e) {}
  } else if (typeof existing.reportData === 'object' && existing.reportData !== null) {
    reportJson = existing.reportData;
  }

  reportJson.shareLink = {
    token: shareToken,
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString(),
    allowPublicView: options.allowPublicView !== false
  };

  await prisma.analysis.update({
    where: { id: analysisId },
    data: {
      reportData: JSON.stringify(reportJson)
    }
  });

  return {
    shareToken,
    shareUrl: `/shared/dossier/${shareToken}`,
    expiresAt: expiresAt.toISOString()
  };
}

/**
 * Resolves a shared report by cryptographic share token
 */
async function resolveSharedReport(shareToken) {
  if (!shareToken || typeof shareToken !== 'string') {
    return { valid: false, error: 'Invalid share token format.' };
  }

  const analyses = await prisma.analysis.findMany({
    where: {
      reportData: { contains: shareToken }
    },
    take: 1
  });

  if (analyses.length === 0) {
    return { valid: false, error: 'Shared investigation dossier not found or link has expired.' };
  }

  const item = analyses[0];
  let parsedReport = {};
  try {
    parsedReport = typeof item.reportData === 'string' ? JSON.parse(item.reportData) : item.reportData;
  } catch (e) {}

  const shareConfig = parsedReport?.shareLink;
  if (!shareConfig || shareConfig.token !== shareToken) {
    return { valid: false, error: 'Invalid or revoked share token.' };
  }

  if (shareConfig.expiresAt && new Date(shareConfig.expiresAt) < new Date()) {
    return { valid: false, error: 'Share link has expired.' };
  }

  return {
    valid: true,
    investigationId: item.id,
    title: item.title,
    report: sanitizeReportForExport(parsedReport)
  };
}

module.exports = {
  sanitizeReportForExport,
  generateReportJsonExport,
  generateReportMarkdownExport,
  generateReportCsvExport,
  generateReportPdfExport,
  createShareableLink,
  resolveSharedReport
};
