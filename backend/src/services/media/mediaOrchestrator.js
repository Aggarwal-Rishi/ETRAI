const { validateMediaInput } = require('./mediaValidator');
const { extractMediaMetadata } = require('./mediaMetadata');
const { analyzeImage } = require('./imageAnalyzer');
const { analyzeVideo } = require('./videoAnalyzer');
const { extractOcrText } = require('./ocrService');
const { performImageForensicAnalysis } = require('./imageForensics');
const { performDocumentForensicAnalysis } = require('./documentForensics');
const { performVideoAndAudioForensics } = require('./videoAudioForensics');
const { extractMediaClaims } = require('./mediaClaimExtractor');
const { verifyMediaClaims, mapForensicFindingsToClaims } = require('./mediaEvidenceService');

/**
 * Checks if a URL is a social video URL requiring dedicated provider adapters
 */
function isSocialVideoUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const lower = url.toLowerCase();
  return lower.includes('youtube.com') || lower.includes('youtu.be') || 
         lower.includes('tiktok.com') || lower.includes('x.com') || 
         lower.includes('twitter.com');
}

/**
 * Real Media & Document Intelligence Orchestrator
 * Coordinates ingestion, magic-byte validation, EXIF/container metadata, keyframe sampling,
 * separate OCR with uncertainty, real forensic engines, and claim-evidence mapping.
 */
async function processMediaAnalysis({ inputType, text, url, file, buffer: rawBuffer }, options = {}) {
  const allLimitations = [];
  const buffer = file?.buffer || rawBuffer || null;

  let rawType = (inputType || '').toUpperCase();
  let mediaType = 'IMAGE';

  if (rawType.includes('PDF')) mediaType = 'PDF';
  else if (rawType.includes('DOC') || rawType.includes('WORD')) mediaType = 'DOCX';
  else if (rawType.includes('TXT') || rawType.includes('TEXT')) mediaType = 'TXT';
  else if (rawType.includes('VIDEO') || rawType.includes('CLIP')) mediaType = 'VIDEO';
  else if (rawType.includes('AUDIO') || rawType.includes('VOICE')) mediaType = 'AUDIO';
  else if (rawType.includes('PHOTO') || rawType.includes('IMAGE')) mediaType = 'IMAGE';

  // Social Video URLs
  if (url && isSocialVideoUrl(url)) {
    if (!options.socialVideoProvider || typeof options.socialVideoProvider.fetchVideo !== 'function') {
      return {
        valid: false,
        error: 'VIDEO_URL_PROVIDER_UNAVAILABLE',
        mediaType: 'VIDEO',
        file: { filename: url, mimeType: 'video/mp4', sizeBytes: 0, sha256: '' },
        metadata: {},
        ocrText: '',
        rawOcrText: '',
        visualDescription: '',
        transcript: '',
        transcriptSegments: [],
        observed: {},
        inferred: {},
        entities: [],
        claims: [],
        manipulationSignals: [],
        reverseSearch: { status: 'UNAVAILABLE', matches: [] },
        forensicEvidence: [],
        limitations: ['Social video URLs require a specialized video provider adapter (VIDEO_URL_PROVIDER_UNAVAILABLE)']
      };
    }
  }

  // 1. Ingestion & Magic-Byte Validation
  const validation = validateMediaInput({ file, url, inputType: mediaType, buffer });
  if (!validation.valid) {
    return {
      valid: false,
      error: validation.error,
      mediaType: validation.mediaType || mediaType,
      file: validation.fileInfo || {},
      metadata: {},
      ocrText: '',
      rawOcrText: '',
      visualDescription: '',
      transcript: '',
      transcriptSegments: [],
      observed: {},
      inferred: {},
      entities: [],
      claims: [],
      manipulationSignals: [],
      reverseSearch: { status: 'UNAVAILABLE', matches: [] },
      forensicEvidence: [],
      limitations: validation.limitations || [validation.error]
    };
  }

  allLimitations.push(...(validation.limitations || []));

  // 2. Metadata Extraction
  const metaRes = extractMediaMetadata(validation.fileInfo, buffer, options.mockMetadata || options.mockExif);
  allLimitations.push(...(metaRes.limitations || []));

  let visualDescription = '';
  let transcript = '';
  let translatedTranscript = '';
  let transcriptLanguage = null;
  let transcriptSegments = [];
  let videoKeyframes = [];
  let observed = { visibleText: '', entities: [], publicFigures: [], logos: [], signs: [], landmarks: [], flags: [], objects: [], vehicleMarkings: [], badges: [], uniforms: [], attire: [], securityDetails: [], visibleDates: [], visibleLocationClues: [] };
  let inferred = { possibleContext: '', possibleEvent: '', uncertainties: [] };
  let visualInconsistencies = [];
  let manipulationSignals = [];
  let ocrRes = { status: 'NO_TEXT_DETECTED', ocrText: '', rawOcrText: '', blocks: [] };
  let reverseSearch = { status: 'UNAVAILABLE', matches: [] };
  let imageSourceContextComparison = null;
  let imageForensics = null;
  let docForensics = null;
  let videoAudioForensics = null;
  let videoContextReport = null;
  let forensicEvidence = [];
  let forensicVerdict = 'NO_MANIPULATION_SIGNAL_FOUND';
  let forensicConfidence = 85;

  // 3. Category-Specific Processing
  if (validation.mediaType === 'IMAGE') {
    // A. Image Multimodal Scene Understanding
    const imgRes = await analyzeImage(validation.fileInfo, buffer, url, options);
    visualDescription = imgRes.visualDescription || '';
    observed = imgRes.observed || observed;
    inferred = imgRes.inferred || inferred;
    visualInconsistencies = imgRes.visualInconsistencies || [];
    manipulationSignals = imgRes.manipulationSignals || [];
    allLimitations.push(...(imgRes.limitations || []));

    // B. Structured OCR
    ocrRes = await extractOcrText(validation.fileInfo, buffer, {
      ...options,
      visionExtractedText: observed.visibleText || options.visionExtractedText
    });
    allLimitations.push(...(ocrRes.limitations || []));

    // C. Real Image Forensics Engine & deepTrust Asset Report Item
    const { generateStructuredImageForensicReport } = require('./imageForensics');
    const imageReportItem = await generateStructuredImageForensicReport(buffer, validation.fileInfo, {
      ...options,
      enableReverseSearch: options.enableReverseSearch !== false,
      visionObserved: observed,
      visualDescription,
      entities: observed.entities || [],
      ocrText: ocrRes.ocrText || observed.visibleText || '',
      // Visible text alone is not evidence that text was replaced. Only an
      // explicit comparison result may set this signal.
      ocrDifference: Boolean(options.ocrDifference)
    });
    
    imageForensics = {
      ...imageReportItem.forensics,
      reportItem: imageReportItem
    };
    
    forensicEvidence = imageForensics.forensicEvidence || [];
    forensicVerdict = imageForensics.verdict;
    forensicConfidence = imageForensics.confidence;
    reverseSearch = imageForensics.reverseSearch;
    const { verifyImageSourceContext } = require('./imageSourceContextVerifier');
    imageSourceContextComparison = await verifyImageSourceContext({
      imageReportItem,
      reverseSearch,
      visualSummary: visualDescription,
      ocrText: ocrRes.ocrText || observed.visibleText || '',
      entities: observed.entities || []
    }, options);
    imageReportItem.sourceContextComparison = imageSourceContextComparison;
    imageForensics.sourceContextComparison = imageSourceContextComparison;
    if (imageForensics.ela?.manipulationSignals) {
      manipulationSignals.push(...imageForensics.ela.manipulationSignals);
    }
  } else if (validation.mediaType === 'PDF' || validation.mediaType === 'DOCX') {
    // Document Forensics Engine
    docForensics = performDocumentForensicAnalysis(buffer, validation.fileInfo.mimeType, {
      text: text || '',
      ...options
    });
    forensicEvidence = docForensics.forensicEvidence || [];
    forensicVerdict = docForensics.verdict;
    forensicConfidence = docForensics.confidence;

    // Structured OCR on document payload
    ocrRes = await extractOcrText(validation.fileInfo, buffer, {
      ...options,
      visionExtractedText: text
    });
    allLimitations.push(...(ocrRes.limitations || []));
  } else if (validation.mediaType === 'VIDEO') {
    // Video Multimodal + Forensics Engine
    const vidRes = await analyzeVideo(validation.fileInfo, buffer, url, {
      ...options,
      userClaim: text || options.userClaim || ''
    });
    visualDescription = vidRes.visualDescription || '';
    transcript = vidRes.transcript || '';
    translatedTranscript = vidRes.translatedTranscript || '';
    transcriptLanguage = vidRes.transcriptLanguage || null;
    transcriptSegments = vidRes.transcriptSegments || [];
    videoKeyframes = vidRes.extractedFrames || [];
    observed = vidRes.observed || {
      ...observed,
      visibleText: vidRes.ocrText || '',
      entities: vidRes.entities || []
    };
    inferred = vidRes.inferred || inferred;
    allLimitations.push(...(vidRes.limitations || []));

    videoAudioForensics = vidRes.forensics || await performVideoAndAudioForensics(validation.fileInfo, buffer, {
      duration: vidRes.duration || metaRes.metadata?.durationSeconds || 10.0,
      keyframes: vidRes.extractedFrames || [],
      metadata: metaRes.metadata,
      audioBuffer: null
    });
    forensicEvidence = videoAudioForensics.forensicEvidence || [];
    videoContextReport = vidRes.videoContextReport || videoAudioForensics.contextReport || null;
    forensicVerdict = videoAudioForensics.verdict;
    forensicConfidence = videoAudioForensics.confidence;
  } else if (validation.mediaType === 'AUDIO') {
    videoAudioForensics = await performVideoAndAudioForensics(validation.fileInfo, buffer, {
      duration: options.duration || 10.0,
      ...options
    });
    forensicEvidence = videoAudioForensics.forensicEvidence || [];
    forensicVerdict = videoAudioForensics.verdict;
    forensicConfidence = videoAudioForensics.confidence;
  }

  // 4. Claim Extraction from Media Observations
  const claimExtraction = await extractMediaClaims({
    userNotes: text || '',
    visualDescription,
    ocrText: ocrRes.ocrText || '',
    transcript,
    translatedTranscript,
    transcriptLanguage,
    entities: observed.entities || [],
    isVideo: validation.mediaType === 'VIDEO'
  }, options);
  const extractedClaims = Array.isArray(claimExtraction?.claims) ? claimExtraction.claims : [];
  allLimitations.push(...(claimExtraction?.limitations || []));

  // Standalone media-analysis callers can request Agent 3 verification in the
  // same pass. The main four-agent pipeline verifies later, so it does not pay
  // for duplicate searches. Test/provider injections also use this path.
  let finalClaims = extractedClaims;
  if (options.verifyClaims === true || Array.isArray(options.mockSearchResults) || Array.isArray(options.mockVerifiedClaims)) {
    const verification = await verifyMediaClaims(extractedClaims, {
      sourceText: text || '',
      transcript,
      visualDescription,
      mediaType: validation.mediaType
    }, options);
    if (Array.isArray(verification.verifiedClaims) && verification.verifiedClaims.length > 0) {
      finalClaims = verification.verifiedClaims;
    }
    allLimitations.push(...(verification.limitations || []));
  }

  // 5. Connect Forensic Evidence to Claims
  const mappedForensicEvidence = mapForensicFindingsToClaims(finalClaims, forensicEvidence);

  return {
    valid: true,
    mediaType: inputType || validation.mediaType,
    file: validation.fileInfo,
    metadata: metaRes.metadata,
    ocrText: ocrRes.ocrText || '',
    rawOcrText: ocrRes.rawOcrText || '',
    ocrBlocks: ocrRes.blocks || [],
    ocrUncertainty: ocrRes.uncertaintyScore || 0,
    visualDescription,
    transcript,
    translatedTranscript,
    transcriptLanguage,
    transcriptSegments,
    keyframes: videoKeyframes,
    observed,
    inferred,
    entities: observed.entities || [],
    claims: finalClaims,
    manipulationSignals,
    reverseSearch,
    imageSourceContextComparison,
    forensics: imageForensics || docForensics || videoAudioForensics,
    imageForensics,
    images: imageForensics?.reportItem ? [imageForensics.reportItem] : [],
    docForensics,
    videoAudioForensics,
    videoContextReport,
    videoProvenance: videoContextReport?.provenance || null,
    forensicVerdict,
    forensicConfidence,
    forensicEvidence,
    mappedForensicEvidence,
    limitations: allLimitations
  };
}

module.exports = {
  processMediaAnalysis,
  isSocialVideoUrl
};
