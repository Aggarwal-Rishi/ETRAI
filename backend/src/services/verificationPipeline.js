const { processInputContent } = require('./inputReader');
const { extractClaims } = require('./claimExtractor');
const { extractMediaClaims } = require('./media/mediaClaimExtractor');
const { verifyClaims } = require('./factVerifier');
const { generateReport } = require('./reportGenerator');
const sseManager = require('./sseManager');
const PipelineLogger = require('./pipelineLogger');
const { dbService, prisma } = require('../utils/prisma');
const { getProviderStatus } = require('./providerManager');
const { incrementVerificationUsage } = require('./subscriptionBillingService');
const { operationalIntelligence } = require('./operationalIntelligenceService');

const JOB_MAX_TIMEOUT_MS = 180000; // 3 minutes maximum timeout per verification job

/**
 * Orchestrates the authoritative 4-agent verification pipeline with Observability & Telemetry Instrumentation.
 * Unified Architecture: MEDIA/TEXT OBSERVATION (Agent 1) -> CLAIM (Agent 2) -> EXTERNAL EVIDENCE (Agent 3) -> REPORT (Agent 4)
 */
async function runVerificationPipeline({ jobId, userId, inputType, text, url, file, selectedTypes }) {
  const logger = new PipelineLogger(jobId);
  const providerStatus = getProviderStatus();

  let mediaCategory = (inputType || '').toUpperCase();
  if (mediaCategory === 'IMAGE' || mediaCategory === 'PHOTO') mediaCategory = 'PHOTO';
  if (mediaCategory === 'VIDEO') mediaCategory = 'VIDEO';
  const isMediaJob = mediaCategory === 'PHOTO' || mediaCategory === 'VIDEO';

  const inputSourceStr = inputType === 'URL' 
    ? url 
    : inputType === 'FILE' 
      ? (file ? file.originalname : 'Uploaded file') 
      : text 
        ? text.substring(0, 150) 
        : 'Input Source';
        
  const sourceTitle = inputType === 'URL' 
    ? `URL: ${url}` 
    : inputType === 'FILE' 
      ? `File: ${file ? file.originalname : 'Document'}` 
      : isMediaJob
        ? `${mediaCategory === 'VIDEO' ? 'Video' : 'Photo'} Verification: ${file ? file.originalname : (url || 'Media Payload')}`
        : 'Pasted Text Analysis';

  const pipelinePromise = (async () => {
    // ----------------------------------------------------
    // Phase 1: Content & Media Reader (Agent 1)
    // ----------------------------------------------------
    logger.startPhase('phase1_contentReader', { inputType, inputSource: inputSourceStr, selectedTypes, providerStatus });

    if (mediaCategory === 'PHOTO') {
      sseManager.emitProgress(jobId, { status: 'PROCESSING', progress: 10, step: 'Agent 1: Validating photo binary & file signature...', stage: 'MEDIA_VALIDATION' });
      sseManager.emitProgress(jobId, { status: 'PROCESSING', progress: 20, step: 'Agent 1: Extracting EXIF & image dimensions...', stage: 'MEDIA_METADATA' });
      sseManager.emitProgress(jobId, { status: 'PROCESSING', progress: 35, step: 'Agent 1: Analyzing visual scene context & anomalies...', stage: 'VISUAL_ANALYSIS' });
    } else if (mediaCategory === 'VIDEO') {
      sseManager.emitProgress(jobId, { status: 'PROCESSING', progress: 10, step: 'Agent 1: Validating video container magic-bytes...', stage: 'MEDIA_VALIDATION' });
      sseManager.emitProgress(jobId, { status: 'PROCESSING', progress: 20, step: 'Agent 1: Parsing video container & audio metadata...', stage: 'MEDIA_METADATA' });
      sseManager.emitProgress(jobId, { status: 'PROCESSING', progress: 30, step: 'Agent 1: Sampling keyframes across video timeline...', stage: 'KEYFRAME_EXTRACTION' });
    } else {
      sseManager.emitProgress(jobId, { status: 'PROCESSING', progress: 20, step: 'Agent 1: Reading and extracting document content...', stage: 'READING' });
    }

    // Process Input via Agent 1
    const contentRes = await processInputContent({ inputType, text, url, file });
    const mediaAnalysis = contentRes.mediaAnalysis || null;

    if (mediaCategory === 'VIDEO') {
      if (mediaAnalysis?.transcript) {
        sseManager.emitProgress(jobId, { status: 'PROCESSING', progress: 40, step: 'Agent 1: Transcribing speech-to-text via Whisper API...', stage: 'AUDIO_TRANSCRIPTION' });
      }
      sseManager.emitProgress(jobId, { status: 'PROCESSING', progress: 50, step: 'Agent 1: Analyzing keyframes with vision model...', stage: 'FRAME_ANALYSIS' });
      if (mediaAnalysis?.ocrText) {
        sseManager.emitProgress(jobId, { status: 'PROCESSING', progress: 60, step: 'Agent 1: Extracting visible text from keyframes...', stage: 'OCR' });
      }
    } else if (mediaCategory === 'PHOTO') {
      if (mediaAnalysis?.ocrText) {
        sseManager.emitProgress(jobId, { status: 'PROCESSING', progress: 50, step: 'Agent 1: Extracting visible text via OCR...', stage: 'OCR' });
      }
    }

    const { analyzeSentiment } = require('./sentimentService');
    const articleSentiment = analyzeSentiment(contentRes.extractedText || mediaAnalysis?.transcript || '');

    logger.log('phase1_contentReader', 'INFO', `Completed Agent 1 observation extraction`, {
      wordCount: contentRes.wordCount,
      charCount: contentRes.extractedText ? contentRes.extractedText.length : 0,
      hasMediaAnalysis: !!mediaAnalysis,
      hasOcrText: !!(mediaAnalysis && mediaAnalysis.ocrText),
      hasTranscript: !!(mediaAnalysis && mediaAnalysis.transcript),
      frameCount: mediaAnalysis?.extractedFrames ? mediaAnalysis.extractedFrames.length : 0,
      manipulationSignalsCount: mediaAnalysis?.manipulationSignals ? mediaAnalysis.manipulationSignals.length : 0,
      articleSentiment
    });

    logger.endPhase('phase1_contentReader', {
      sourceTitle: contentRes.sourceTitle || sourceTitle,
      wordCount: contentRes.wordCount,
      truncated: !!contentRes.truncated,
      mediaAnalysis
    });

    // ----------------------------------------------------
    // Phase 2: Claim Extractor Agent (Agent 2)
    // ----------------------------------------------------
    logger.startPhase('phase2_claimExtractor', { extractedWordCount: contentRes.wordCount, isMediaJob });

    const extractionProgress = mediaCategory === 'VIDEO' ? 70 : (mediaCategory === 'PHOTO' ? 65 : 45);
    sseManager.emitProgress(jobId, {
      status: 'PROCESSING',
      progress: extractionProgress,
      step: `Agent 2: Extracting verifiable claims from ${isMediaJob ? 'media context' : 'document text'}...`,
      stage: 'CLAIM_EXTRACTION'
    });

    let claims = [];
    if (isMediaJob && mediaAnalysis) {
      const claimRes = await extractMediaClaims({
        userNotes: text || '',
        transcript: mediaAnalysis.transcript || '',
        ocrText: mediaAnalysis.ocrText || '',
        visualDescription: mediaAnalysis.visualDescription || '',
        entities: mediaAnalysis.entities || [],
        isVideo: mediaCategory === 'VIDEO'
      });
      claims = claimRes.claims || [];
    } else {
      claims = await extractClaims(contentRes.extractedText);
    }

    const scopeCounts = {
      International: claims.filter(c => c.claimScope === 'International').length,
      National: claims.filter(c => c.claimScope === 'National').length,
      Regional: claims.filter(c => c.claimScope === 'Regional').length,
      Local: claims.filter(c => c.claimScope === 'Local').length
    };

    logger.log('phase2_claimExtractor', 'INFO', `Extracted ${claims.length} claims with scope distribution`, {
      totalClaims: claims.length,
      scopeCounts,
      recentBreakingCount: claims.filter(c => c.isRecentBreaking).length
    });

    logger.endPhase('phase2_claimExtractor', { claims }, { totalClaims: claims.length, scopeCounts });

    // ----------------------------------------------------
    // Article-Level Deep Research & Related News Search
    // ----------------------------------------------------
    const { performArticleDeepResearch } = require('./articleResearch');
    const hasAttachedNews = !!(text && text.trim().length > 10);
    const mediaTopicStr = isMediaJob 
      ? (hasAttachedNews ? text.trim().substring(0, 100) : (mediaAnalysis?.visualDescription || mediaAnalysis?.ocrText || mediaAnalysis?.transcript || contentRes.sourceTitle))
      : contentRes.sourceTitle;

    sseManager.emitProgress(jobId, {
      status: 'PROCESSING',
      progress: 75,
      step: isMediaJob 
        ? (hasAttachedNews ? 'Stage 2: Cross-checking attached news claims against web evidence...' : 'Stage 2: Searching & synthesizing related news coverage for media payload...') 
        : 'Part 0: Performing Deep Research across overall story entities...',
      stage: 'ARTICLE_DEEP_RESEARCH'
    });

    const firstArticleCtx = claims[0]?.articleContext || { mainTopic: mediaTopicStr };
    const articleResearchContext = await performArticleDeepResearch(firstArticleCtx, claims);

    // ----------------------------------------------------
    // Phase 3: Fact Verification Agent (Agent 3) with Parallel Concurrency & Progress Callback
    // ----------------------------------------------------
    logger.startPhase('phase3_factVerifier', { claimCount: claims.length });

    sseManager.emitProgress(jobId, {
      status: 'PROCESSING',
      progress: 80,
      step: `Agent 3: Verifying ${claims.length} claims via web search & fuzzy engine...`,
      stage: 'WEB_VERIFICATION'
    });

    const progressCallback = (completedCount, total) => {
      const startPct = 40;
      const endPct = 85;
      const pct = Math.min(85, Math.round(startPct + (completedCount / Math.max(1, total)) * (endPct - startPct)));
      sseManager.emitProgress(jobId, {
        status: 'PROCESSING',
        progress: pct,
        step: `Agent 3: Verifying claim ${completedCount} of ${total} via web search & fuzzy engine...`,
        stage: 'WEB_VERIFICATION'
      });
    };

    const verifiedClaims = await verifyClaims(
      claims,
      { onProgress: progressCallback },
      articleResearchContext,
      inputType === 'URL' ? url : null,
      progressCallback
    );

    const verifiedCount = verifiedClaims.filter(c => c.status === 'TRUSTED' || c.status === 'Verified').length;
    const suspiciousCount = verifiedClaims.filter(c => c.status === 'SUSPICIOUS' || c.status === 'Suspicious').length;
    const falseCount = verifiedClaims.filter(c => c.status === 'FABRICATED' || c.status === 'False').length;

    logger.log('phase3_factVerifier', 'INFO', `Verified ${claims.length} claims: ${verifiedCount} TRUSTED, ${suspiciousCount} SUSPICIOUS, ${falseCount} FABRICATED`, {
      verifiedCount,
      suspiciousCount,
      falseCount
    });

    logger.endPhase('phase3_factVerifier', { verifiedClaims }, { verifiedCount, suspiciousCount, falseCount });

    // ----------------------------------------------------
    // Phase 4: Report Generator Agent (Agent 4)
    // ----------------------------------------------------
    logger.startPhase('phase4_reportGenerator', { selectedTypes, totalVerifiedClaims: verifiedClaims.length });

    sseManager.emitProgress(jobId, {
      status: 'PROCESSING',
      progress: 90,
      step: 'Agent 4: Generating per-category scores & executive summary...',
      stage: 'REPORT_GENERATION'
    });

    // Perform Entity & Intent Analysis
    const { performEntityAndIntentAnalysis } = require('./entityIntentService');
    const entityIntentRes = await performEntityAndIntentAnalysis(contentRes.extractedText || mediaAnalysis?.transcript || '');

    // Perform Deep Numerical Fact Analysis
    const { performNumericalFactAnalysis } = require('./numericalFactService');
    const numericalRes = await performNumericalFactAnalysis(contentRes.extractedText || mediaAnalysis?.transcript || '', verifiedClaims);

    // Perform Advanced Text & Document Analysis
    const { performAdvancedTextAnalysis } = require('./advancedTextService');
    const textAnalysisRes = await performAdvancedTextAnalysis(
      contentRes.extractedText || mediaAnalysis?.transcript || '',
      contentRes.metadata,
      verifiedClaims
    );

    // Perform Link & Asset Intelligence
    const { performLinkAndAssetIntelligence } = require('./linkAssetService');
    const linkAssetRes = await performLinkAndAssetIntelligence(
      contentRes.extractedText || '',
      contentRes.discoveredAssets || {},
      contentRes.metadata?.canonicalUrl || ''
    );

    const reportData = await generateReport({
      sourceTitle: contentRes.sourceTitle || sourceTitle,
      extractedText: contentRes.extractedText,
      verifiedClaims,
      selectedTypes,
      articleSentiment,
      truncated: contentRes.truncated,
      internalConsistencyIssues: claims.internalConsistencyIssues || [],
      sourcingTransparency: claims.sourcingTransparency || null,
      mediaAnalysis,
      articleResearchContext,
      hasAttachedNews,
      entities: entityIntentRes.entities,
      intentAnalysis: entityIntentRes.intentAnalysis,
      quotes: entityIntentRes.quotes,
      numericalAnalysis: numericalRes,
      textAnalysis: textAnalysisRes,
      linkIntelligence: linkAssetRes.linkIntelligence,
      assetInventory: linkAssetRes.assetInventory
    });

    reportData.entities = entityIntentRes.entities;
    reportData.intentAnalysis = entityIntentRes.intentAnalysis;
    reportData.quotes = entityIntentRes.quotes;
    reportData.entityInconsistencies = entityIntentRes.entityInconsistencies;
    reportData.numericalAnalysis = numericalRes;
    reportData.numericalFacts = numericalRes.facts;
    reportData.textAnalysis = textAnalysisRes;
    reportData.readability = textAnalysisRes.readability;
    reportData.urgency = textAnalysisRes.urgency;
    reportData.attributionQuality = textAnalysisRes.attribution;
    reportData.sentenceHighlights = textAnalysisRes.highlights;
    reportData.linkIntelligence = linkAssetRes.linkIntelligence;
    reportData.assetInventory = linkAssetRes.assetInventory;
    reportData.links = linkAssetRes.linkIntelligence.links;
    reportData.discoveredImages = linkAssetRes.assetInventory.images;
    reportData.discoveredVideos = linkAssetRes.assetInventory.videos;
    reportData.discoveredDocuments = linkAssetRes.assetInventory.documents;

    logger.log('phase4_reportGenerator', 'INFO', `Calculated deterministic category scores`, {
      scores: reportData.scores,
      summary: reportData.summary,
      entitiesCount: entityIntentRes.entitiesCount,
      primaryIntent: entityIntentRes.intentAnalysis.primaryIntent,
      numericalFactsCount: numericalRes.factsCount,
      totalLinksDiscovered: linkAssetRes.linkIntelligence.totalLinks,
      totalMediaAssets: linkAssetRes.assetInventory.totalAssets
    });

    logger.endPhase('phase4_reportGenerator', { scores: reportData.scores });

    reportData.providerStatus = providerStatus;
    const telemetry = logger.getTelemetryPayload();
    telemetry.providerStatus = providerStatus;
    reportData.observability = telemetry;

    // ----------------------------------------------------
    // Step 5: Save Full Analysis Record to Database
    // ----------------------------------------------------
    let savedRecord = null;
    const selectedTypesStr = typeof selectedTypes === 'string' ? selectedTypes : JSON.stringify(selectedTypes);
    const overallMetricsStr = typeof reportData.scores === 'string' ? reportData.scores : JSON.stringify(reportData.scores);
    const reportDataStr = typeof reportData === 'string' ? reportData : JSON.stringify(reportData);

    if (prisma && userId) {
      try {
        const userExists = await prisma.user.findUnique({ where: { id: userId } }).catch(() => null);
        const finalTokens = reportData.observability?.totalTokens || 0;
        const finalCost = reportData.observability?.estimatedCostUsd || 0.0;
        const finalScore = reportData.scores?.overallTrustScore !== undefined ? reportData.scores.overallTrustScore : 50;
        const finalVerdict = reportData.verdict || (finalScore >= 75 ? 'Real' : finalScore >= 40 ? 'Suspicious' : 'Fake');

        savedRecord = await prisma.analysis.create({
          data: {
            id: jobId,
            title: contentRes.sourceTitle || sourceTitle,
            inputType: String(inputType),
            inputSource: inputSourceStr,
            selectedTypes: selectedTypesStr,
            status: 'COMPLETED',
            summary: reportData.summary,
            overallMetrics: overallMetricsStr,
            reportData: reportDataStr,
            truncated: Boolean(contentRes.truncated),
            tokensConsumed: finalTokens,
            costUsd: finalCost,
            trustScore: finalScore,
            verdict: finalVerdict,
            runVersion: 1,
            ...(userExists ? { user: { connect: { id: userId } } } : {}),
            ...(entityIntentRes.entities && entityIntentRes.entities.length > 0 ? {
              entities: {
                create: entityIntentRes.entities.slice(0, 15).map(e => ({
                  name: e.normalizedName || e.name,
                  role: e.jurisdiction || null,
                  type: e.type,
                  status: 'VERIFIED',
                  finding: `Identified with ${e.confidence}% confidence across ${e.mentionsCount} mention(s)`
                }))
              }
            } : {}),
            ...(numericalRes.facts && numericalRes.facts.length > 0 ? {
              numericalFacts: {
                create: numericalRes.facts.slice(0, 15).map(f => ({
                  asPrinted: f.asPrinted,
                  refersTo: f.refersTo || 'Quantitative statement',
                  actualFinding: f.actualFinding || '',
                  status: f.status || 'UNVERIFIED'
                }))
              }
            } : {}),
            ...(mediaAnalysis ? {
              mediaAnalysis: {
                create: {
                  mediaType: mediaAnalysis.mediaType || (mediaCategory === 'VIDEO' ? 'VIDEO' : 'PHOTO'),
                  filename: mediaAnalysis.file?.filename || sourceTitle,
                  mimeType: mediaAnalysis.file?.mimeType || 'application/octet-stream',
                  sizeBytes: mediaAnalysis.file?.sizeBytes || 0,
                  sha256: mediaAnalysis.file?.sha256 || '',
                  width: mediaAnalysis.metadata?.width || null,
                  height: mediaAnalysis.metadata?.height || null,
                  duration: mediaAnalysis.metadata?.duration || null,
                  fps: mediaAnalysis.metadata?.fps || null,
                  codec: mediaAnalysis.metadata?.codec || null,
                  metadataJson: JSON.stringify(mediaAnalysis.metadata || {}),
                  ocrText: mediaAnalysis.ocrText || '',
                  transcriptJson: JSON.stringify(mediaAnalysis.transcript || null),
                  visualFindingsJson: JSON.stringify(mediaAnalysis.visualFindings || []),
                  manipulationSignalsJson: JSON.stringify(mediaAnalysis.manipulationSignals || []),
                  reverseSearchJson: JSON.stringify(mediaAnalysis.reverseSearch || {})
                }
              }
            } : {}),
            ...(reportData.provenance?.timeline && reportData.provenance.timeline.length > 0 ? {
              provenance: {
                create: reportData.provenance.timeline.map((t, idx) => ({
                  timeLabel: t.timeLabel,
                  platform: t.platform || 'Web',
                  description: t.description || '',
                  status: t.status || 'UNVERIFIED',
                  sequenceIndex: t.sequenceIndex !== undefined ? t.sequenceIndex : idx + 1
                }))
              }
            } : {})
          }
        });

        // Record workspace usage quota & telemetry
        try {
          const userWorkspace = await prisma.workspace.findFirst({
            where: {
              OR: [
                { ownerId: userId },
                { members: { some: { userId, status: 'ACTIVE' } } }
              ]
            }
          });
          if (userWorkspace) {
            await incrementVerificationUsage(userWorkspace.id, userId, {
              analysisId: jobId,
              tokensConsumed: reportData.observability?.totalTokens || 2400,
              costUsd: reportData.observability?.estimatedCostUsd || 0.015
            });
          }
        } catch (usageErr) {
          console.error('[Usage Telemetry Recording Error]:', usageErr.message);
        }
      } catch (dbErr) {
        console.error('[Pipeline DB Save Error]:', dbErr.message);
      }
    }

    sseManager.emitProgress(jobId, {
      status: 'COMPLETED',
      progress: 100,
      step: 'Verification completed successfully!',
      stage: 'DONE',
      reportId: jobId,
      reportData
    });

    // Register Operational Intelligence telemetry
    operationalIntelligence.registerJobEnd(jobId, {
      status: 'COMPLETED',
      tokensConsumed: reportData.observability?.totalTokens || 2400,
      costUsd: reportData.observability?.estimatedCostUsd || 0.015
    });

    return reportData;
  })();

  const timeoutPromise = new Promise((_, reject) => {
    const timer = setTimeout(() => {
      const err = new Error(`Verification job timed out after ${JOB_MAX_TIMEOUT_MS / 1000} seconds.`);
      err.isTimeout = true;
      reject(err);
    }, JOB_MAX_TIMEOUT_MS);
    if (timer.unref) timer.unref();
  });

  try {
    return await Promise.race([pipelinePromise, timeoutPromise]);
  } catch (error) {
    logger.failPhase('phase1_contentReader', error);
    console.error(`[Pipeline Job Error ${jobId}]:`, error.stack || error.message);
    
    // Register Operational Intelligence failure telemetry
    operationalIntelligence.registerJobEnd(jobId, {
      status: 'FAILED',
      error: error.message
    });

    if (prisma && userId) {
      try {
        const userExists = await prisma.user.findUnique({ where: { id: userId } }).catch(() => null);
        await prisma.analysis.create({
          data: {
            id: jobId,
            title: sourceTitle,
            inputType: String(inputType),
            inputSource: inputSourceStr,
            selectedTypes: typeof selectedTypes === 'string' ? selectedTypes : JSON.stringify(selectedTypes),
            status: 'FAILED',
            summary: `Analysis failed: ${error.message}`,
            overallMetrics: '{}',
            reportData: JSON.stringify({ error: error.message, status: 'FAILED' }),
            ...(userExists ? { user: { connect: { id: userId } } } : {})
          }
        });
      } catch (e) {}
    }

    sseManager.emitProgress(jobId, {
      status: 'FAILED',
      progress: 100,
      step: `Verification failed: ${error.message}`,
      stage: 'ERROR',
      error: error.message,
      observability: logger.getTelemetryPayload()
    });

    throw error;
  }
}

module.exports = {
  runVerificationPipeline
};
