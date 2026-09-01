const { GoogleGenAI } = require('@google/genai');
const { getProviderStatus, isKeyValid } = require('./providerManager');

/**
 * Single Source of Truth: Canonical Scoring Engine for ETRAI
 * Separates Factual Accuracy from Manipulation & Sensationalism Risk.
 */
function calculateCategoryScores(verifiedClaims, selectedTypes, articleSentiment = null, sourceTitle = '', internalConsistencyIssues = [], sourcingTransparency = null) {
  const claims = verifiedClaims || [];
  const total = claims.length;

  let verifiedCount = 0;
  let falseCount = 0;
  let unverifiedCount = 0;
  let partiallyVerifiedCount = 0;
  let totalConfidenceSum = 0;

  claims.forEach(c => {
    const v = c.verdict || (c.status === 'TRUSTED' || c.status === 'Verified' ? 'VERIFIED' : c.status === 'FABRICATED' || c.status === 'False' ? 'FALSE' : 'UNVERIFIED');
    const conf = typeof c.confidence === 'number' ? c.confidence : 50;
    totalConfidenceSum += conf;

    if (v === 'VERIFIED' || c.status === 'TRUSTED') verifiedCount++;
    else if (v === 'FALSE' || c.status === 'FABRICATED') falseCount++;
    else if (v === 'PARTIALLY_VERIFIED') partiallyVerifiedCount++;
    else unverifiedCount++;
  });

  const evidenceConfidence = total > 0 ? Math.round(totalConfidenceSum / total) : 0;

  // Factual Accuracy Score calculation (0 to 100)
  let factualAccuracyScore = 50;
  if (total > 0) {
    const rawWeightedSum = (verifiedCount * 100) + (partiallyVerifiedCount * 50) + (unverifiedCount * 45) + (falseCount * 0);
    factualAccuracyScore = Math.round(rawWeightedSum / total);
  }

  // Canonical Article Verdict determination
  let articleVerdict = 'UNVERIFIED';
  if (falseCount > 0 || (total > 0 && factualAccuracyScore < 35 && verifiedCount === 0 && partiallyVerifiedCount === 0)) {
    articleVerdict = 'FALSE';
  } else if (factualAccuracyScore >= 70 && verifiedCount > 0 && unverifiedCount === 0) {
    articleVerdict = 'VERIFIED';
  } else if (partiallyVerifiedCount > 0 && falseCount === 0) {
    articleVerdict = 'PARTIALLY_VERIFIED';
  } else if (verifiedCount > 0 && unverifiedCount > 0 && falseCount === 0) {
    articleVerdict = 'PARTIALLY_VERIFIED';
  } else {
    articleVerdict = 'UNVERIFIED';
  }

  // Manipulation & Sensationalism Assessment (SEPARATE from Factual Accuracy!)
  const sentimentIntensity = articleSentiment && typeof articleSentiment.intensity === 'number' ? articleSentiment.intensity : 0.0;
  const consistencyPenalty = Array.isArray(internalConsistencyIssues) ? Math.min(30, internalConsistencyIssues.length * 15) : 0;
  const vagueRatio = sourcingTransparency && typeof sourcingTransparency.vagueSourcingRatio === 'number' ? sourcingTransparency.vagueSourcingRatio : 0.0;
  const vagueSourcingPenalty = vagueRatio > 0.4 ? Math.round((vagueRatio - 0.4) * 35) : 0;

  const manipulationScore = Math.max(0, Math.min(100, Math.round(sentimentIntensity * 50 + consistencyPenalty + vagueSourcingPenalty)));
  let manipulationRisk = 'LOW';
  if (manipulationScore >= 60) manipulationRisk = 'HIGH';
  else if (manipulationScore >= 30) manipulationRisk = 'MEDIUM';

  const types = Array.isArray(selectedTypes) ? selectedTypes : ['FACT_CHECKING', 'FAKE_NEWS_DETECTION'];
  const scores = {};
  if (types.includes('FACT_CHECKING')) {
    scores.factCheckingScore = total === 0 ? "N/A — No claims of this type detected" : factualAccuracyScore;
  }
  if (types.includes('FAKE_NEWS_DETECTION')) {
    scores.fakeNewsScore = total === 0 ? "N/A — No claims of this type detected" : factualAccuracyScore;
    scores.manipulationAssessment = { manipulationScore, manipulationRisk, sentimentIntensity, consistencyPenalty, vagueSourcingPenalty };
  }
  if (types.includes('BUSINESS_REPORT')) {
    const businessClaims = claims.filter(c => (c.category && (c.category.includes('Metric') || c.category.includes('Financial') || c.category.includes('Business'))));
    if (businessClaims.length === 0) {
      scores.businessReportScore = "N/A — No claims of this type detected";
    } else {
      const bVerified = businessClaims.filter(c => (c.verdict === 'VERIFIED' || c.status === 'TRUSTED')).length;
      scores.businessReportScore = Math.round((bVerified / businessClaims.length) * 100);
    }
  }

  return {
    scores,
    factualAccuracyScore,
    evidenceConfidence,
    articleVerdict,
    manipulationRisk,
    manipulationScore,
    breakdown: {
      totalClaims: total,
      verified: verifiedCount,
      partiallyVerified: partiallyVerifiedCount,
      suspicious: unverifiedCount,
      unverified: unverifiedCount,
      false: falseCount
    }
  };
}

/**
 * Agent 4 – Report Generator Service
 * Grounded Report Synthesis Engine
 * 
 * IMPORTANT: Agent 4 is a REPORT GENERATOR, NOT a second fact verifier.
 * The verification results supplied to it are authoritative.
 * It does NOT invent claims, sources, corrections, confidence values, evidence, or verdicts.
 */
async function generateReport({
  inputType = null,
  sourceTitle,
  extractedText,
  verifiedClaims,
  selectedTypes,
  articleSentiment = null,
  truncated = false,
  internalConsistencyIssues = [],
  sourcingTransparency = null,
  mediaAnalysis = null,
  articleResearchContext = null,
  hasAttachedNews = false,
  traceProvenance = true
}) {
  const resolvedInputType = inputType === 'FILE' && mediaAnalysis?.mediaType
    ? mediaAnalysis.mediaType
    : (inputType || mediaAnalysis?.mediaType || (hasAttachedNews ? 'TEXT_MEDIA' : 'TEXT'));
  const canonicalData = calculateCategoryScores(verifiedClaims, selectedTypes, articleSentiment, sourceTitle, internalConsistencyIssues, sourcingTransparency);
  const { scores, factualAccuracyScore, evidenceConfidence, articleVerdict, manipulationRisk, manipulationScore, breakdown } = canonicalData;

  const providerStatus = getProviderStatus();
  const geminiKey = process.env.GEMINI_API_KEY;
  const hasGemini = isKeyValid(geminiKey);

  let aiSummaryMode = 'DETERMINISTIC_FALLBACK';
  let aiSummaryError = null;

  let summary = '';
  let recommendation = '';
  let keyHighlights = [];
  let explanationOfFindings = '';

  if (hasGemini && geminiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const modelName = (process.env.GEMINI_MODEL || 'gemini-flash-lite-latest').trim();

      const mediaPromptSection = mediaAnalysis ? `
Media Payload Verification Details:
- Media Type: ${mediaAnalysis.mediaType || 'Image/Video'}
- Visual Description: ${mediaAnalysis.visualDescription || 'N/A'}
- Audio Transcript: ${mediaAnalysis.transcript || 'N/A'}
- OCR Text: ${mediaAnalysis.ocrText || 'N/A'}
- Manipulation Signals: ${JSON.stringify(mediaAnalysis.manipulationSignals || [])}
- Has Attached News Text: ${hasAttachedNews ? 'YES (Verified against visual findings)' : 'NO (Standalone media submission)'}
- Related News Research Summary: ${articleResearchContext?.summary || 'N/A'}
- Matched Source Context Comparison: ${JSON.stringify(mediaAnalysis.imageSourceContextComparison || {})}
- Segment-Level Video Context Report: ${JSON.stringify(mediaAnalysis.videoContextReport || {})}
` : '';

      const prompt = `You are Agent 4 (Report Generator) in an AI Fact-Checking system.
Generate an executive summary, reader recommendation, key highlights, and explanation of major findings based strictly on the authoritative verification results below.

The verification results supplied to you are authoritative. Do not change verdicts, scores, source evidence, or confidence values.
Do NOT invent claims, sources, corrections, confidence values, evidence, or verdicts.

Document Title: ${sourceTitle}
Selected Analysis Types: ${(selectedTypes || []).join(', ')}
Authoritative Factual Accuracy Score: ${factualAccuracyScore}%
Authoritative Article Verdict: ${articleVerdict}
Authoritative Evidence Confidence: ${evidenceConfidence}%
Manipulation Risk Assessment: ${manipulationRisk} (${manipulationScore}%)
Claims Breakdown: ${JSON.stringify(breakdown)}
Article Sentiment: ${JSON.stringify(articleSentiment || {})}
${mediaPromptSection}
Verified Claims Data (Authoritative):
${JSON.stringify((verifiedClaims || []).map(c => ({
  claimText: c.claimText,
  verdict: c.verdict || c.status,
  confidence: c.confidence,
  evidenceState: c.evidenceState,
  explanation: c.explanation
})), null, 2)}

Return ONLY a JSON object with this exact structure:
{
  "summary": "2-3 sentence executive summary of overall accuracy, media verification, and related news findings",
  "recommendation": "Clear actionable advice for the reader",
  "keyHighlights": ["Highlight 1", "Highlight 2", "Highlight 3"],
  "explanationOfFindings": "Clear detailed explanation of verified vs false vs unverified findings and media authenticity"
}`;

      const res = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.2
        }
      });

      let rawText = null;
      if (typeof res.text === 'string') rawText = res.text;
      else if (typeof res.text === 'function') rawText = res.text();
      else if (res.candidates?.[0]?.content?.parts) {
        rawText = res.candidates[0].content.parts.map(p => p.text || '').join('');
      }

      const parsed = JSON.parse((rawText || '{}').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim());
      if (parsed.summary && parsed.recommendation) {
        summary = parsed.summary;
        recommendation = parsed.recommendation;
        keyHighlights = Array.isArray(parsed.keyHighlights) ? parsed.keyHighlights : [];
        explanationOfFindings = parsed.explanationOfFindings || '';
        aiSummaryMode = 'GEMINI';
        aiSummaryError = null;
      } else {
        throw new Error('Gemini returned malformed JSON missing required summary or recommendation fields.');
      }
    } catch (e) {
      aiSummaryMode = 'DETERMINISTIC_FALLBACK';
      aiSummaryError = e.message || 'Gemini API execution error';
    }
  } else {
    aiSummaryMode = 'DETERMINISTIC_FALLBACK';
    aiSummaryError = 'GEMINI_API_KEY absent or provider unavailable';
  }

  // Deterministic Fallback Synthesis
  if (!summary || aiSummaryMode === 'DETERMINISTIC_FALLBACK') {
    if (articleVerdict === 'VERIFIED') {
      summary = `Analysis of "${sourceTitle}" evaluated ${breakdown.totalClaims} factual assertions. Factual Accuracy Score: ${factualAccuracyScore}% (${articleVerdict}). ${breakdown.verified} out of ${breakdown.totalClaims} claims were independently verified against primary sources.`;
      recommendation = 'Verified Content: The factual claims in this document are supported by authoritative primary evidence.';
    } else if (articleVerdict === 'FALSE') {
      summary = `Analysis of "${sourceTitle}" evaluated ${breakdown.totalClaims} factual assertions. Factual Accuracy Score: ${factualAccuracyScore}% (${articleVerdict}). Content contains ${breakdown.false} contradicted assertion(s).`;
      recommendation = 'False / Misinformation Warning: This content contains false or contradicted assertions. Exercise high caution.';
    } else if (articleVerdict === 'PARTIALLY_VERIFIED') {
      summary = `Analysis of "${sourceTitle}" evaluated ${breakdown.totalClaims} factual assertions. Factual Accuracy Score: ${factualAccuracyScore}% (${articleVerdict}). ${breakdown.partiallyVerified} claim(s) contain partial factual support alongside minor discrepancies.`;
      recommendation = 'Partially Verified: Core statements are supported, but sub-details or numbers contain discrepancies requiring review.';
    } else {
      summary = `Analysis of "${sourceTitle}" evaluated ${breakdown.totalClaims} factual assertions. Factual Accuracy Score: ${factualAccuracyScore}% (${articleVerdict}). ${breakdown.unverified} claim(s) lack sufficient primary web coverage.`;
      recommendation = 'Unverified Content: Insufficient primary evidence exists in official archives to confirm these assertions. Do not treat as proven false.';
    }

    if (keyHighlights.length === 0) {
      keyHighlights = [
        `${breakdown.verified} claim(s) independently verified against primary evidence`,
        `${breakdown.unverified} claim(s) flagged for insufficient primary documentation`,
        `${breakdown.false} claim(s) contradicted across independent factual archives`
      ];
    }

    if (!explanationOfFindings) {
      explanationOfFindings = `Evaluated ${breakdown.totalClaims} claim(s): ${breakdown.verified} verified, ${breakdown.partiallyVerified} partially verified, ${breakdown.unverified} unverified due to insufficient evidence, and ${breakdown.false} false/contradicted.`;
    }

    const sourceComparison = mediaAnalysis?.imageSourceContextComparison;
    if (sourceComparison && sourceComparison.status !== 'UNAVAILABLE') {
      const sourceLabel = sourceComparison.source?.title || sourceComparison.source?.domain || 'matched image source';
      const contextHighlight = sourceComparison.status === 'MATCHED'
        ? `Matched source context supports the AI visual summary (${sourceLabel})`
        : sourceComparison.status === 'CONTRADICTED'
          ? `Matched source context contradicts the AI visual summary (${sourceLabel})`
          : `Matched image found, but source-page context is inconclusive (${sourceLabel})`;
      keyHighlights = [contextHighlight, ...keyHighlights.filter(item => item !== contextHighlight)].slice(0, 4);
      explanationOfFindings = `${explanationOfFindings} Source-context comparison: ${sourceComparison.rationale || sourceComparison.status}.`;
    }
  }

  const videoCompletenessSummary = mediaAnalysis?.videoContextReport?.completeness;
  if (videoCompletenessSummary) {
    const videoHighlight = `Video context: ${videoCompletenessSummary.label || String(videoCompletenessSummary.verdict || 'inconclusive').replaceAll('_', ' ')}`;
    keyHighlights = [videoHighlight, ...keyHighlights.filter(item => item !== videoHighlight)].slice(0, 4);
    explanationOfFindings = `${explanationOfFindings} Video originality/context assessment: ${videoCompletenessSummary.explanation || videoCompletenessSummary.verdict}.`;
  }

  const manipulationAnalysis = {
    verdict: articleVerdict,
    factualAccuracyScore,
    evidenceConfidence,
    manipulationRisk,
    manipulationScore,
    keyHighlights,
    explanationOfFindings
  };

  const chartData = [
    { name: 'Verified Claims', value: breakdown.verified, color: '#10B981' },
    { name: 'Unverified / Insufficient Evidence', value: breakdown.unverified, color: '#F59E0B' },
    { name: 'Contradicted / False Claims', value: breakdown.false, color: '#EF4444' }
  ];

  const { analyzeContentProvenance } = require('./provenanceEngine');
  const allDiscoveredSources = [];
  (verifiedClaims || []).forEach(c => {
    if (Array.isArray(c.sources)) {
      c.sources.forEach(s => allDiscoveredSources.push(s));
    }
  });
  const uniqueDiscoveredSources = Array.from(new Map(
    allDiscoveredSources.map((source, index) => [
      source.url || source.link || `${source.domain || 'source'}-${index}`,
      source
    ])
  ).values());

  const imageReportItem = mediaAnalysis?.images?.[0] || mediaAnalysis?.imageForensics?.reportItem || null;
  if (
    imageReportItem?.originalPageUrl &&
    ['FOUND', 'CANDIDATE'].includes(imageReportItem.originalFoundStatus) &&
    imageReportItem.originalImageUrl
  ) {
    let provenanceDomain = 'visual-source';
    try { provenanceDomain = new URL(imageReportItem.originalPageUrl).hostname.replace(/^www\./, ''); } catch (_) {}
    const alreadyIncluded = uniqueDiscoveredSources.some(source => (source.url || source.link) === imageReportItem.originalPageUrl);
    if (!alreadyIncluded) uniqueDiscoveredSources.push({
      title: imageReportItem.originalFoundStatus === 'FOUND'
        ? `Verified visual match · ${provenanceDomain}`
        : `Reverse-image candidate · ${provenanceDomain}`,
      url: imageReportItem.originalPageUrl,
      domain: provenanceDomain,
      evidenceType: imageReportItem.originalFoundStatus === 'FOUND' ? 'VERIFIED_VISUAL_MATCH' : 'VISUAL_CANDIDATE',
      visualSimilarity: imageReportItem.forensics?.reverseSearch?.bestCandidate?.similarity ?? null,
      sourceRole: 'IMAGE_PROVENANCE'
    });
  }

  const videoSegments = mediaAnalysis?.videoContextReport?.segments || [];
  for (const segment of videoSegments) {
    const source = segment?.source_evidence;
    if (!source?.url || uniqueDiscoveredSources.some(item => (item.url || item.link) === source.url)) continue;
    let domain = source.domain || 'segment-context-source';
    try { domain = new URL(source.url).hostname.replace(/^www\./, ''); } catch (_) {}
    uniqueDiscoveredSources.push({
      title: source.title || `Segment ${segment.segment_index} contextual source`,
      url: source.url,
      domain,
      evidenceType: 'VIDEO_SEGMENT_CONTEXT',
      sourceRole: 'SEGMENT_CORROBORATION',
      timestampRange: segment.timestamp_range,
      limitation: source.limitation || null
    });
  }

  const videoCompleteness = mediaAnalysis?.videoContextReport?.completeness;
  const originalVideoSource = videoCompleteness?.source;
  if (originalVideoSource?.url && !uniqueDiscoveredSources.some(item => (item.url || item.link) === originalVideoSource.url)) {
    uniqueDiscoveredSources.push({
      title: originalVideoSource.title || `Original-video candidate · ${originalVideoSource.domain || 'matched source'}`,
      url: originalVideoSource.url,
      domain: originalVideoSource.domain || null,
      publishedAt: originalVideoSource.publishedAt || null,
      evidenceType: videoCompleteness.verdict === 'COMPLETE_ORIGINAL_VIDEO' ? 'VERIFIED_ORIGINAL_VIDEO' : 'VIDEO_PROVENANCE_CANDIDATE',
      sourceRole: 'VIDEO_ORIGINALITY_AND_CONTEXT',
      confidence: videoCompleteness.confidence,
      limitation: (videoCompleteness.limitations || []).join(' ') || null
    });
  }

  const provenance = traceProvenance
    ? analyzeContentProvenance({
      claims: verifiedClaims,
      sources: uniqueDiscoveredSources,
      mediaAnalysis,
      inputSource: sourceTitle
    })
    : {
      status: 'DISABLED',
      originAnalysis: {
        originStatus: 'DISABLED',
        originConfidence: 0,
        rationale: 'Provenance tracing was disabled for this analysis.'
      },
      firstKnownAppearance: null,
      timeline: [],
      graph: { nodes: [], edges: [], lineagePath: [] },
      duplicateClusters: [],
      spreadAnalysis: {
        repostCount: 0,
        distinctDomainsCount: 0,
        domainsInvolved: [],
        chronologicalPropagation: [],
        velocityScore: 'DISABLED',
        amplificationPattern: 'DISABLED'
      },
      propagationMetrics: {
        totalDiscoveredVenues: 0,
        syndicatedCopyCount: 0,
        modifiedCopyCount: 0,
        velocityTrend: 'DISABLED'
      }
    };

  const { computeExplainableTrustScore } = require('./explainableScoringService');
  const explainableScoring = computeExplainableTrustScore({
    verifiedClaims,
    sources: uniqueDiscoveredSources,
    provenance,
    mediaAnalysis,
    textAnalysis: arguments[0].textAnalysis,
    numericalAnalysis: arguments[0].numericalAnalysis,
    linkIntelligence: arguments[0].linkIntelligence,
    inputType: resolvedInputType
  });

  scores.overallTrustScore = explainableScoring.finalTrustScore;
  scores.factualAccuracyScore = explainableScoring.finalTrustScore;
  scores.confidenceRating = explainableScoring.finalTrustScore;
  scores.evidenceConfidence = evidenceConfidence;
  scores.explainableScoring = explainableScoring;
  scores.methodologyVersion = 'ETRAI-v2.4-TransparentScoring';

  return {
    inputType: resolvedInputType,
    sourceTitle,
    selectedTypes,
    factualAccuracyScore: explainableScoring.finalTrustScore,
    evidenceConfidence,
    articleVerdict,
    verdict: articleVerdict,
    trustScore: explainableScoring.finalTrustScore,
    confidenceRating: explainableScoring.finalTrustScore,
    methodologyVersion: 'ETRAI-v2.4-TransparentScoring',
    explainableScoring,
    extractionMode: verifiedClaims?.[0]?.extractionMode || 'REAL_LLM',
    manipulationRisk,
    manipulationScore,
    scores,
    overallMetrics: scores,
    breakdown,
    summary,
    recommendation,
    keyHighlights,
    explanationOfFindings,
    manipulationAnalysis,
    aiSummaryMode,
    aiSummaryError,
    chartData,
    claims: verifiedClaims,
    sources: uniqueDiscoveredSources,
    mediaAnalysis: mediaAnalysis || null,
    images: mediaAnalysis?.images || (mediaAnalysis?.imageForensics?.reportItem ? [mediaAnalysis.imageForensics.reportItem] : []),
    articleResearchContext: articleResearchContext || null,
    provenance,
    provenanceGraph: provenance.graph,
    firstKnownAppearance: provenance.firstKnownAppearance,
    spreadAnalysis: provenance.spreadAnalysis,
    duplicateClusters: provenance.duplicateClusters,
    entities: arguments[0].entities || [],
    entityClaimConnections: arguments[0].entityClaimConnections || [],
    quotes: arguments[0].quotes || [],
    framingAnalysis: arguments[0].framingAnalysis || arguments[0].intentAnalysis,
    hasAttachedNews: !!hasAttachedNews,
    truncated: !!truncated,
    internalConsistencyIssues,
    sourcingTransparency,
    generatedAt: new Date().toISOString()
  };
}

module.exports = {
  calculateCategoryScores,
  generateReport
};
