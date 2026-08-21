const { validateMediaInput } = require('./mediaValidator');
const { extractMediaMetadata } = require('./mediaMetadata');
const { analyzeImage } = require('./imageAnalyzer');
const { analyzeVideo } = require('./videoAnalyzer');
const { extractOcrText } = require('./ocrService');
const { performReverseImageSearch } = require('./reverseImageSearch');
const { extractMediaClaims } = require('./mediaClaimExtractor');
const { verifyMediaClaims } = require('./mediaEvidenceService');

/**
 * Checks if a URL is a social video URL (YouTube, TikTok, X/Twitter) requiring dedicated provider adapters
 */
function isSocialVideoUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const lower = url.toLowerCase();
  return lower.includes('youtube.com') || lower.includes('youtu.be') || 
         lower.includes('tiktok.com') || lower.includes('x.com') || 
         lower.includes('twitter.com');
}

/**
 * Real Photo & Video Verification Orchestrator
 * Coordinates ingestion, magic-byte validation, EXIF/container metadata, keyframe sampling,
 * Whisper speech-to-text, multimodal vision, separate OCR, provider-isolated reverse search,
 * Agent 2 claim extraction, and Agent 3 evidence verification.
 */
async function processMediaAnalysis({ inputType, text, url, file }, options = {}) {
  const allLimitations = [];

  let mediaType = (inputType || '').toUpperCase();
  if (mediaType === 'IMAGE' || mediaType === 'PHOTO') mediaType = 'PHOTO';
  if (mediaType === 'VIDEO') mediaType = 'VIDEO';

  // PART 12 — SOCIAL VIDEO URLS: Return VIDEO_URL_PROVIDER_UNAVAILABLE if social URL without adapter
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
        limitations: ['Social video URLs (YouTube/TikTok/X) require a specialized video provider adapter (VIDEO_URL_PROVIDER_UNAVAILABLE)']
      };
    }
  }

  // 1. Ingestion & Magic-Byte Validation
  const validation = validateMediaInput({ file, url, inputType: mediaType });
  if (!validation.valid) {
    return {
      valid: false,
      error: validation.error,
      mediaType: validation.mediaType || mediaType || 'PHOTO',
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
      limitations: validation.limitations || [validation.error]
    };
  }

  allLimitations.push(...(validation.limitations || []));

  // 2. EXIF & Container Metadata Extraction
  const metaRes = extractMediaMetadata(validation.fileInfo, file?.buffer, options.mockMetadata || options.mockExif);
  allLimitations.push(...(metaRes.limitations || []));

  let visualDescription = '';
  let transcript = '';
  let transcriptSegments = [];
  let observed = { visibleText: '', entities: [], logos: [], signs: [], landmarks: [], flags: [], objects: [], visibleDates: [], visibleLocationClues: [] };
  let inferred = { possibleContext: '', possibleEvent: '', uncertainties: [] };
  let visualInconsistencies = [];
  let manipulationSignals = [];
  let ocrText = '';
  let rawOcrText = '';
  let reverseSearch = { status: 'UNAVAILABLE', matches: [] };
  let extractedFrames = [];
  let forensicRes = null;

  // 3. Multimodal Analysis (PHOTO vs VIDEO Pipeline)
  if (validation.mediaType === 'PHOTO') {
    const imgRes = await analyzeImage(validation.fileInfo, file?.buffer, url, options);
    visualDescription = imgRes.visualDescription || '';
    observed = imgRes.observed || observed;
    inferred = imgRes.inferred || inferred;
    visualInconsistencies = imgRes.visualInconsistencies || [];
    manipulationSignals = imgRes.manipulationSignals || [];
    allLimitations.push(...(imgRes.limitations || []));

    // 4. Separate OCR Extraction (Labeled model-extracted text)
    const ocrRes = await extractOcrText(validation.fileInfo, file?.buffer, {
      ...options,
      visionExtractedText: observed.visibleText || options.visionExtractedText
    });
    ocrText = ocrRes.ocrText || '';
    rawOcrText = ocrRes.rawOcrText || ocrText;
    allLimitations.push(...(ocrRes.limitations || []));

    // 5. Provider-Isolated Reverse Image Search & Real Image Forensics
    const { performImageForensics } = require('./imageForensics');
    forensicRes = await performImageForensics({
      fileInfo: validation.fileInfo,
      buffer: file?.buffer,
      url,
      options
    });

    reverseSearch = forensicRes.reverseSearch || { status: 'UNAVAILABLE', matches: [] };
    if (forensicRes.artifacts?.signals) {
      manipulationSignals.push(...forensicRes.artifacts.signals);
    }
  } else {
    // VIDEO PIPELINE: Metadata -> Keyframe Sampling -> Audio Extraction -> Whisper -> Visual Frame Analysis -> Frame OCR -> Temporal Consistency
    const vidRes = await analyzeVideo(validation.fileInfo, file?.buffer, url, options);
    visualDescription = vidRes.visualDescription || '';
    transcript = vidRes.transcript || '';
    transcriptSegments = vidRes.transcriptSegments || [];
    ocrText = vidRes.ocrText || '';
    rawOcrText = ocrText;
    extractedFrames = vidRes.extractedFrames || [];
    manipulationSignals = vidRes.manipulationSignals || [];
    observed.entities = vidRes.entities || [];
    forensicRes = vidRes.forensics || null;
    allLimitations.push(...(vidRes.limitations || []));
  }

  // Combine entities across metadata, vision observed entities, and user context
  const combinedEntities = Array.from(new Set([
    ...(observed.entities || []),
    ...(observed.landmarks || [])
  ]));

  // 6. Agent 2 Claim Extraction (User Notes + Audio Transcript + OCR Text + Visual Findings)
  const claimRes = await extractMediaClaims({
    userNotes: text || '',
    transcript,
    ocrText: rawOcrText || ocrText,
    visualDescription,
    entities: combinedEntities,
    isVideo: validation.mediaType === 'VIDEO'
  }, options);
  allLimitations.push(...(claimRes.limitations || []));

  let finalClaims = claimRes.claims || [];
  if (finalClaims.length === 0 && visualDescription) {
    finalClaims = [{
      id: 'media_claim_visual_1',
      claimText: `The submitted ${validation.mediaType === 'VIDEO' ? 'video' : 'image'} depicts ${visualDescription.replace(/\.$/, '')}.`,
      text: `The submitted ${validation.mediaType === 'VIDEO' ? 'video' : 'image'} depicts ${visualDescription.replace(/\.$/, '')}.`,
      entities: combinedEntities,
      searchQuery: visualDescription.substring(0, 120),
      scope: 'National',
      importance: 'High',
      verifiability: 'High',
      origin: 'VISUAL_SCENE_DESCRIPTION'
    }];
  }

  // 7. Optional Immediate Verification (for standalone test harnesses)
  if (options.verifyImmediately) {
    const verificationRes = await verifyMediaClaims(finalClaims, {
      mainTopic: validation.fileInfo.filename,
      location: (observed.visibleLocationClues || [])[0] || '',
      date: (observed.visibleDates || [])[0] || ''
    }, options);
    finalClaims = verificationRes.verifiedClaims || finalClaims;
    allLimitations.push(...(verificationRes.limitations || []));
  }

  const uniqueLimitations = Array.from(new Set(allLimitations));

  // Normalized MediaAnalysis Object
  const mediaAnalysis = {
    valid: true,
    mediaType: validation.mediaType,
    file: {
      filename: validation.fileInfo.filename,
      mimeType: validation.fileInfo.mimeType,
      sizeBytes: validation.fileInfo.sizeBytes,
      sha256: validation.fileInfo.sha256
    },
    metadata: metaRes.metadata,
    ocrText,
    rawOcrText,
    visualDescription,
    transcript,
    transcriptSegments,
    extractedFrames,
    observed,
    inferred,
    visualInconsistencies,
    entities: claimRes.entities && claimRes.entities.length > 0 ? claimRes.entities : combinedEntities,
    claims: finalClaims,
    manipulationSignals,
    reverseSearch,
    forensics: forensicRes,
    limitations: uniqueLimitations
  };

  return mediaAnalysis;
}

module.exports = {
  processMediaAnalysis,
  isSocialVideoUrl
};
