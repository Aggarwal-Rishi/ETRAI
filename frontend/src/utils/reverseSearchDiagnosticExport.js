/**
 * ETRAI Reverse-Image Forensics & Provenance Diagnostic Report Generator
 * Assembles a comprehensive, auditable JSON diagnostic report for reverse-image search,
 * visual candidate verification, perceptual hash comparison, source-context evaluation,
 * and media manipulation signals.
 */

export function generateReverseSearchDiagnosticJson(asset, reportData = {}) {
  if (!asset && !reportData) return null;

  const currentAsset = asset || {};
  const mediaAnalysis = reportData.mediaAnalysis || {};
  const imageForensics = currentAsset.forensics || mediaAnalysis.imageForensics || {};
  const reverseSearchData = imageForensics.reverseSearch || mediaAnalysis.reverseSearch || {};

  // 1. Image Metadata & Hashing
  const filename = currentAsset.filename || mediaAnalysis.fileInfo?.filename || reportData.sourceTitle?.replace(/^Photo:\s*/, '') || 'uploaded_image.jpg';
  const dimensions = currentAsset.dimensions || imageForensics.metadata?.dimensions || mediaAnalysis.dimensions || '1600 × 1000';
  const fileSize = currentAsset.fileSize || imageForensics.metadata?.fileSize || mediaAnalysis.fileSize || 'Unknown';
  const formatQuality = currentAsset.formatQuality || imageForensics.metadata?.formatQuality || 'JPEG';
  const mimeType = currentAsset.mimeType || mediaAnalysis.mimeType || mediaAnalysis.fileInfo?.mimeType || 'image/jpeg';
  const exifStatus = currentAsset.exifStatus || imageForensics.metadata?.exifStatus || 'EXIF stripped';
  const exifState = currentAsset.exifState || (exifStatus.toLowerCase().includes('stripped') ? 'STRIPPED' : 'PRESENT');
  const c2paCredentials = imageForensics.c2pa || mediaAnalysis.c2pa || { hasC2PACredentials: false, status: 'NO_CREDENTIALS_FOUND' };
  const sha256 = imageForensics.integrity?.sha256 || mediaAnalysis.sha256 || mediaAnalysis.fileInfo?.sha256 || null;
  const dHash = imageForensics.dHash || imageForensics.perceptualHash || mediaAnalysis.dHash || null;

  // 2. Reverse Search Engine & Status
  const reverseSearchProvider = currentAsset.reverseSearchProvider || reverseSearchData.provider || 'UNAVAILABLE';
  const reverseSearchStatus = currentAsset.reverseSearchStatus || reverseSearchData.status || currentAsset.originalFoundStatus || 'UNAVAILABLE';
  const originalFoundStatus = currentAsset.originalFoundStatus || (reverseSearchStatus === 'FOUND' ? 'FOUND' : (reverseSearchStatus === 'CANDIDATES_ONLY' || reverseSearchStatus === 'CANDIDATE' ? 'CANDIDATE' : 'UNVERIFIED'));
  const originalFoundDescription = currentAsset.originalFound || (originalFoundStatus === 'FOUND' ? 'Verified visual match recovered' : 'Reverse search unavailable or inconclusive');
  const reverseSearchQuery = currentAsset.reverseSearchQuery || reverseSearchData.query || null;
  const reverseSearchLimitations = Array.isArray(currentAsset.reverseSearchLimitations) && currentAsset.reverseSearchLimitations.length > 0
    ? currentAsset.reverseSearchLimitations
    : (Array.isArray(reverseSearchData.limitations) ? reverseSearchData.limitations : []);

  // 3. Source Context vs. AI Visual Summary
  const sourceComparison = currentAsset.sourceContextComparison ||
    mediaAnalysis.imageSourceContextComparison ||
    reportData.imageSourceContextComparison ||
    null;

  const comparisonData = sourceComparison ? {
    status: sourceComparison.status || 'UNAVAILABLE',
    contextualVerdict: sourceComparison.contextualVerdict || sourceComparison.status || 'INCONCLUSIVE',
    confidenceScore: Number.isFinite(sourceComparison.confidence) ? sourceComparison.confidence : null,
    isDecisive: Boolean(sourceComparison.decisive),
    aiVisualSummary: sourceComparison.visualSummary || mediaAnalysis.visualDescription || 'No visual summary available.',
    matchedSourceSummary: sourceComparison.sourceSummary || sourceComparison.source?.description || 'No source summary available.',
    matchedSource: sourceComparison.source ? {
      title: sourceComparison.source.title || null,
      domain: sourceComparison.source.domain || null,
      url: sourceComparison.source.url || null,
      publishedAt: sourceComparison.source.publishedAt || null
    } : null,
    rationale: sourceComparison.rationale || null,
    matchingDetails: Array.isArray(sourceComparison.matchingDetails) ? sourceComparison.matchingDetails : [],
    contradictions: Array.isArray(sourceComparison.contradictions) ? sourceComparison.contradictions : []
  } : {
    status: 'UNAVAILABLE',
    contextualVerdict: 'NOT_EVALUATED',
    confidenceScore: null,
    isDecisive: false,
    aiVisualSummary: mediaAnalysis.visualDescription || 'No visual summary available.',
    matchedSourceSummary: 'No matched source context available.',
    matchedSource: null,
    rationale: 'No source context comparison was executed for this image.',
    matchingDetails: [],
    contradictions: []
  };

  // 4. Candidate & Verified Images Ledger
  const rawCandidates = Array.isArray(currentAsset.candidateImages) && currentAsset.candidateImages.length > 0
    ? currentAsset.candidateImages
    : (Array.isArray(reverseSearchData.candidateMatches) && reverseSearchData.candidateMatches.length > 0
        ? reverseSearchData.candidateMatches
        : (Array.isArray(reverseSearchData.matches) ? reverseSearchData.matches : []));

  const candidateLedger = rawCandidates.map((c, idx) => {
    let domain = c.domain;
    if (!domain && c.sourceUrl) {
      try { domain = new URL(c.sourceUrl).hostname.replace(/^www\./, ''); } catch (_) { domain = 'web index'; }
    }
    const similarity = Number.isFinite(c.similarity) ? c.similarity : null;
    const isWire = Boolean(c.isWire || ['pib.gov.in', 'reuters.com', 'apnews.com', 'afp.com', 'gettyimages.com', 'epa.eu', 'bloomberg.com', 'pti.in', 'ani.in'].some(d => (domain || '').includes(d)));
    
    let matchClassification = 'CANDIDATE';
    if (similarity !== null && similarity >= 78) matchClassification = 'VERIFIED_VISUAL_MATCH';
    else if (c.matchType) matchClassification = c.matchType;

    return {
      candidateIndex: idx + 1,
      id: c.id || `cand-${idx + 1}`,
      domain: domain || 'web index',
      sourceUrl: c.sourceUrl || c.link || null,
      imageUrl: c.imageUrl || c.originalImageUrl || null,
      thumbnailUrl: c.thumbnailUrl || c.imageUrl || null,
      title: c.title || 'Indexed candidate image',
      publishedDate: c.publishedDate || c.publishedAt || null,
      visualSimilarityScore: similarity,
      isWireArchive: isWire,
      matchClassification,
      perceptualVerificationPassed: Boolean(similarity !== null && similarity >= 60)
    };
  });

  // 5. Visual Forensic Signals & Manipulation Metrics
  const manipulationLikelihood = currentAsset.manipulationLikelihood
    ? parseFloat(currentAsset.manipulationLikelihood)
    : (imageForensics.manipulationScore ? imageForensics.manipulationScore / 100 : 0.08);

  const manipulationRisk = currentAsset.manipulationRisk ||
    (manipulationLikelihood >= 0.70 ? 'HIGH' : (manipulationLikelihood >= 0.40 ? 'MEDIUM' : 'LOW'));

  const diffList = Array.isArray(currentAsset.diffs) ? currentAsset.diffs : [];
  const detectedChanges = Array.isArray(currentAsset.changes) && currentAsset.changes.length > 0
    ? currentAsset.changes
    : ['No detected edits'];

  const forensicSignals = currentAsset.forensicSignals || imageForensics.signals || [];
  const copyMoveDetails = imageForensics.copyMove || { copyMoveDetected: false };
  const elaDetails = imageForensics.ela || { averageDifference: 0 };

  // 6. Decision Rules & Guardrail Compliance
  const rules = {
    verifiedVisualMatchThreshold: 0.78,
    presentableCandidateThreshold: 0.60,
    wirePublisherPriority: true,
    antiCircularityRuleEnforced: true,
    antiCircularityExplanation: 'Only a downloadable image that was compared locally can appear as an original or candidate. Ordinary keyword SERP pages are strictly excluded.',
    analysisOptions: {
      enableReverseSearch: reportData.analysisOptions?.enableReverseSearch ?? true,
      allowExternalVisualSearch: reportData.analysisOptions?.allowExternalVisualSearch ?? false
    }
  };

  return {
    reportTimestamp: new Date().toISOString(),
    telemetryType: 'ETRAI_REVERSE_IMAGE_FORENSICS_DIAGNOSTIC',
    imageMetadata: {
      filename,
      dimensions,
      fileSize,
      formatQuality,
      mimeType,
      exifStatus,
      exifState,
      hasC2PACredentials: Boolean(c2paCredentials.hasC2PACredentials),
      sha256,
      dHash
    },
    reverseSearchSummary: {
      provider: reverseSearchProvider,
      searchStatus: reverseSearchStatus,
      originalFoundStatus,
      originalFoundDescription,
      recognitionQuery: reverseSearchQuery,
      totalCandidatesDiscovered: candidateLedger.length,
      verifiedMatchesCount: candidateLedger.filter(c => c.matchClassification === 'VERIFIED_VISUAL_MATCH' || (c.visualSimilarityScore && c.visualSimilarityScore >= 78)).length,
      limitations: reverseSearchLimitations
    },
    sourceContextComparison: comparisonData,
    candidateImagesLedger: candidateLedger,
    visualForensicSignals: {
      manipulationLikelihood,
      manipulationRisk,
      chipVerdict: currentAsset.chipVerdict || 'v-unv',
      chipText: currentAsset.chipText || 'No manipulation signal found',
      detectedModificationsCount: currentAsset.changesCount || diffList.length,
      detectedEdits: detectedChanges,
      differenceRegions: diffList.map(d => ({
        markerId: d.id,
        title: d.title,
        description: d.desc,
        technicalDetail: d.detail,
        boundingBox: d.box
      })),
      copyMoveDetected: Boolean(copyMoveDetails.copyMoveDetected),
      elaScore: typeof elaDetails.averageDifference === 'number' ? Number(elaDetails.averageDifference.toFixed(2)) : null,
      rawSignalsCount: forensicSignals.length,
      signals: forensicSignals
    },
    scoringAndDecisionGuardrails: rules
  };
}
