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
const { compactReportMediaPayload } = require('../utils/reportMediaPayload');

const JOB_MAX_TIMEOUT_MS = 180000; // 3 minutes maximum timeout per verification job

function buildImageSourceEvidence(mediaAnalysis) {
  const comparison = mediaAnalysis?.imageSourceContextComparison;
  const source = comparison?.source;
  if (!source?.url) return [];
  return [{
    title: source.title || `Matched image source · ${source.domain || 'web source'}`,
    url: source.url,
    link: source.url,
    domain: source.domain || null,
    snippet: source.description || comparison.sourceSummary || '',
    publishedAt: source.publishedAt || null,
    evidenceType: comparison.decisive ? 'VERIFIED_IMAGE_SOURCE_CONTEXT' : 'IMAGE_SOURCE_CONTEXT_CANDIDATE',
    sourceRole: 'IMAGE_CONTEXT'
  }];
}

function verifyObservationClaimsAgainstImageSource(claims = [], mediaAnalysis = null) {
  const comparison = mediaAnalysis?.imageSourceContextComparison;
  const sources = buildImageSourceEvidence(mediaAnalysis);
  const baseConfidence = Math.max(0, Math.min(100, Number(comparison?.confidence) || 0));

  if (comparison?.decisive && comparison.status === 'MATCHED') {
    return claims.map(claim => ({
      ...claim,
      status: 'TRUSTED',
      verdict: 'VERIFIED',
      confidence: baseConfidence,
      sources,
      evidenceState: 'SUPPORTED',
      evidenceEvaluations: sources.map(source => ({
        source,
        stance: 'SUPPORTS',
        relevance: 'DIRECT_IMAGE_CONTEXT',
        explanation: comparison.rationale
      })),
      explanation: `A locally verified same-image source page supports the AI visual summary. ${comparison.rationale}`,
      verificationMode: 'VERIFIED_IMAGE_SOURCE_CONTEXT'
    }));
  }

  if (comparison?.decisive && comparison.status === 'CONTRADICTED') {
    return claims.map(claim => ({
      ...claim,
      status: 'FABRICATED',
      verdict: 'FALSE',
      confidence: baseConfidence,
      sources,
      evidenceState: 'CONTRADICTED',
      evidenceEvaluations: sources.map(source => ({
        source,
        stance: 'CONTRADICTS',
        relevance: 'DIRECT_IMAGE_CONTEXT',
        explanation: comparison.rationale
      })),
      explanation: `The locally verified same-image source page materially contradicts the AI-generated context. ${comparison.rationale}`,
      verificationMode: 'VERIFIED_IMAGE_SOURCE_CONTEXT'
    }));
  }

  return claims.map(claim => ({
    ...claim,
    status: 'SUSPICIOUS',
    verdict: 'OBSERVATION_ONLY',
    confidence: Math.max(0, 100 - (mediaAnalysis?.ocrUncertainty || 20)),
    sources,
    evidenceState: 'INSUFFICIENT',
    evidenceEvaluations: [],
    explanation: comparison?.rationale
      ? `Extracted from the submitted pixels, but source context is inconclusive. ${comparison.rationale}`
      : 'Extracted directly from the submitted pixels. This is a visual observation, not an independently verified real-world claim.',
    verificationMode: 'PIXEL_OBSERVATION_ONLY'
  }));
}

function buildImageSourceResearchContext(mediaAnalysis, topic) {
  const comparison = mediaAnalysis?.imageSourceContextComparison;
  const sources = buildImageSourceEvidence(mediaAnalysis);
  if (!comparison || comparison.status === 'UNAVAILABLE') {
    return {
      status: 'SKIPPED_FOR_VISUAL_OBSERVATIONS',
      topic,
      summary: '',
      sources: [],
      overallSources: [],
      articleEvidencePool: [],
      explanation: 'Pixel observations are not sent through generic article search unless the user supplies a factual caption or claim.'
    };
  }

  return {
    status: comparison.status,
    topic,
    summary: comparison.sourceSummary || comparison.rationale || '',
    sources,
    overallSources: sources,
    articleEvidencePool: sources.map(source => ({
      title: source.title,
      domain: source.domain,
      snippet: source.snippet,
      fullText: comparison.sourceSummary || source.snippet,
      url: source.url
    })),
    isCovered: comparison.status !== 'INCONCLUSIVE',
    comparison,
    explanation: comparison.rationale,
    timestamp: new Date().toISOString()
  };
}

/**
 * Orchestrates the authoritative 4-agent verification pipeline with Observability & Telemetry Instrumentation.
 * Unified Architecture: MEDIA/TEXT OBSERVATION (Agent 1) -> CLAIM (Agent 2) -> EXTERNAL EVIDENCE (Agent 3) -> REPORT (Agent 4)
 */
async function runVerificationPipeline({
  jobId,
  userId,
  inputType,
  text,
  url,
  file,
  selectedTypes,
  enableReverseSearch = true,
  traceProvenance = true,
  detectEntities = true
}) {
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
    const contentRes = await processInputContent(
      { inputType, text, url, file },
      { enableReverseSearch }
    );
    const mediaAnalysis = contentRes.mediaAnalysis || null;
    const hasAttachedNews = Boolean(text && text.trim().length > 10);
    const observationOnlyImage = mediaCategory === 'PHOTO' && !hasAttachedNews;

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
      if (Array.isArray(mediaAnalysis.claims) && mediaAnalysis.claims.length > 0) {
        claims = mediaAnalysis.claims;
      } else {
        const claimRes = await extractMediaClaims({
          userNotes: text || '',
          transcript: mediaAnalysis.transcript || '',
          ocrText: mediaAnalysis.ocrText || '',
          visualDescription: mediaAnalysis.visualDescription || '',
          entities: mediaAnalysis.entities || [],
          isVideo: mediaCategory === 'VIDEO'
        });
        claims = claimRes.claims || [];
      }

      // Guarantee fallback verifiable claim if empty
      if (claims.length === 0) {
        const fallbackTopic = mediaAnalysis.visualDescription || `Visual content verification for ${contentRes.sourceTitle}`;
        claims = [{
          id: 'media_claim_visual_primary',
          claimText: `The submitted ${mediaCategory === 'VIDEO' ? 'video' : 'image'} depicts: ${fallbackTopic}`,
          text: `The submitted ${mediaCategory === 'VIDEO' ? 'video' : 'image'} depicts: ${fallbackTopic}`,
          entities: mediaAnalysis.entities || [],
          searchQuery: fallbackTopic.substring(0, 120),
          scope: 'National',
          importance: 'High',
          verifiability: 'High',
          origin: 'VISUAL_SCENE_DESCRIPTION'
        }];
      }
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
    const articleResearchContext = observationOnlyImage
      ? buildImageSourceResearchContext(mediaAnalysis, mediaTopicStr)
      : await performArticleDeepResearch(firstArticleCtx, claims);

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

    const verifiedClaims = observationOnlyImage
      ? verifyObservationClaimsAgainstImageSource(claims, mediaAnalysis)
      : await verifyClaims(
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

    // Perform Entity, Attribution & Framing Analysis
    const { performEntityAndIntentAnalysis } = require('./entityIntentService');
    const allDiscoveredSources = [];
    (verifiedClaims || []).forEach(c => {
      if (Array.isArray(c.sources)) c.sources.forEach(s => allDiscoveredSources.push(s));
    });
    const entityIntentRes = detectEntities
      ? await performEntityAndIntentAnalysis(
        contentRes.extractedText || mediaAnalysis?.transcript || '',
        { claims: verifiedClaims, sources: allDiscoveredSources }
      )
      : {
        entities: [],
        entitiesCount: 0,
        quotes: [],
        entityClaimConnections: [],
        entityInconsistencies: [],
        intentAnalysis: { primaryIntent: 'DISABLED', confidence: 0 },
        framingAnalysis: { status: 'DISABLED' }
      };

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
      inputType,
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
      framingAnalysis: entityIntentRes.framingAnalysis,
      quotes: entityIntentRes.quotes,
      entityClaimConnections: entityIntentRes.entityClaimConnections,
      numericalAnalysis: numericalRes,
      textAnalysis: textAnalysisRes,
      linkIntelligence: linkAssetRes.linkIntelligence,
      assetInventory: linkAssetRes.assetInventory,
      traceProvenance
    });

    reportData.entities = entityIntentRes.entities;
    reportData.intentAnalysis = entityIntentRes.intentAnalysis;
    reportData.framingAnalysis = entityIntentRes.framingAnalysis;
    reportData.quotes = entityIntentRes.quotes;
    reportData.entityClaimConnections = entityIntentRes.entityClaimConnections;
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
    reportData.analysisOptions = { enableReverseSearch, traceProvenance, detectEntities };
    compactReportMediaPayload(reportData);

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

    const crypto = require('crypto');
    const sealedAt = new Date().toISOString();
    reportData.integritySeal = {
      algorithm: 'SHA-256',
      digest: crypto.createHash('sha256').update(JSON.stringify(reportData)).digest('hex'),
      sealedAt,
      scope: 'Complete report payload before persistence'
    };

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
        if (userExists) {
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
              user: { connect: { id: userExists.id } },
            ...(entityIntentRes.entities && entityIntentRes.entities.length > 0 ? {
              entities: {
                create: entityIntentRes.entities.slice(0, 20).map(e => ({
                  name: e.normalizedName || e.name,
                  role: e.jurisdiction || null,
                  type: e.type || 'ORGANIZATION',
                  status: 'VERIFIED',
                  finding: `Identified with ${e.confidence || 80}% confidence across ${e.mentionsCount || 1} mention(s)`,
                  confidence: e.confidence || 80.0,
                  mentionsCount: e.mentionsCount || 1
                }))
              }
            } : {}),
            ...(entityIntentRes.quotes && entityIntentRes.quotes.length > 0 ? {
              quoteAttributions: {
                create: entityIntentRes.quotes.slice(0, 15).map(q => ({
                  quoteText: q.quoteText,
                  claimedSpeaker: q.claimedSpeaker || null,
                  claimedAffiliation: q.claimedAffiliation || null,
                  verificationStatus: q.verificationStatus || 'UNATTRIBUTED_ASSERTION',
                  isAltered: Boolean(q.isAltered),
                  alterationDetails: q.alterationDetails || null,
                  isAuthoritative: Boolean(q.isAuthoritative),
                  confidence: q.confidence || 50.0,
                  originalSourceUrl: q.originalSourceUrl || null
                }))
              }
            } : {}),
            ...(verifiedClaims && verifiedClaims.length > 0 ? {
              claims: {
                create: verifiedClaims.slice(0, 20).map((c, cIdx) => ({
                  claimText: c.claimText || c.text || `Claim ${cIdx + 1}`,
                  normalizedClaim: c.normalizedClaim || c.searchReadyText || c.claimText || c.text,
                  claimType: (c.claimType || c.category || 'FACTUAL_STATEMENT').toUpperCase().replace(/ /g, '_'),
                  claimScope: c.claimScope || 'National',
                  category: c.category || 'Factual Statement',
                  verdict: c.claimVerificationResult?.verdict || c.verdict || 'INSUFFICIENT_EVIDENCE',
                  status: c.status || 'SUSPICIOUS',
                  confidence: c.confidence || c.claimVerificationResult?.confidence || 50.0,
                  importanceScore: c.importanceScore || 70.0,
                  extractionConfidence: c.extractionConfidence || 90.0,
                  verifiability: c.verifiability || 'DIRECTLY_VERIFIABLE',
                  attribution: c.attribution || null,
                  temporalContext: c.temporalContext || null,
                  entitiesJson: JSON.stringify(c.entities || []),
                  datesJson: JSON.stringify(c.dates || []),
                  numbersJson: JSON.stringify(c.numbers || []),
                  locationsJson: JSON.stringify(c.locations || []),
                  reasoning: c.explanation || c.reasoning || null,
                  hasCorrection: Boolean(c.hasCorrection),
                  correctedClaim: c.correctedClaim || null,
                  correctionBasis: c.correctionBasis || null,
                  rawJson: JSON.stringify(c),
                  evidenceItems: {
                    create: (c.evidenceEvaluations || c.sources || []).slice(0, 10).map((ev, sIdx) => ({
                      sourceIndex: ev.index !== undefined ? ev.index : sIdx,
                      url: ev.url || ev.link || 'https://google.com',
                      domain: ev.domain || 'unknown',
                      title: ev.title || `Evidence ${sIdx + 1}`,
                      snippet: ev.snippet || '',
                      content: ev.fetchedPassage || ev.content || null,
                      excerpt: ev.snippet || ev.reason || '',
                      surroundingContext: ev.surroundingContext || null,
                      stance: ev.stance || 'NEUTRAL',
                      relationship: ev.relationship || (ev.stance === 'SUPPORTS' ? 'SUPPORTS' : ev.stance === 'REFUTES' ? 'CONTRADICTS' : 'NEUTRAL'),
                      evidenceType: ev.evidenceType || 'PRIMARY_REPORTING',
                      relevanceScore: ev.relevanceScore || ev.retrievalRelevance || 50.0,
                      reliabilityContribution: ev.reliabilityContribution || 80.0,
                      independenceGroup: ev.syndicationGroup || ev.domain || 'default',
                      isIndependent: ev.isIndependent !== false && !ev.isSyndicatedDuplicate,
                      isSyndicatedDuplicate: Boolean(ev.isSyndicatedDuplicate),
                      authorityRank: ev.rank || 2,
                      authorityScore: ev.authorityScore || 80.0,
                      freshness: ev.recency || 'CURRENT_WEEK',
                      retrievalStatus: ev.retrievalStatus || 'SUCCESS',
                      reason: ev.reason || ev.reasoning || null
                    }))
                  }
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
                  ocrBlocksJson: JSON.stringify(mediaAnalysis.ocrBlocks || []),
                  transcriptJson: JSON.stringify(mediaAnalysis.transcript || null),
                  visualFindingsJson: JSON.stringify(mediaAnalysis.visualFindings || []),
                  perceptualHash: mediaAnalysis.imageForensics?.perceptualHash || mediaAnalysis.perceptualHash || null,
                  forensicVerdict: mediaAnalysis.forensicVerdict || 'NO_MANIPULATION_SIGNAL_FOUND',
                  forensicConfidence: mediaAnalysis.forensicConfidence || 85.0,
                  c2paJson: JSON.stringify(mediaAnalysis.imageForensics?.c2pa || {}),
                  documentForensicsJson: JSON.stringify(mediaAnalysis.docForensics || {}),
                  audioAnalysisJson: JSON.stringify(mediaAnalysis.videoAudioForensics || {}),
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
            } : {}),
            ...(reportData.provenance?.graph?.nodes && reportData.provenance.graph.nodes.length > 0 ? {
              provenanceNodes: {
                create: reportData.provenance.graph.nodes.slice(0, 20).map((n, idx) => ({
                  url: n.url || null,
                  domain: n.domain || 'unknown',
                  publishedAt: n.timestamp ? new Date(n.timestamp) : null,
                  contentHash: n.contentHash || null,
                  mediaHash: n.mediaHash || null,
                  sourceRelationship: n.sourceRelationship || 'REPOST',
                  nodeType: n.nodeType || 'ARTICLE',
                  confidence: n.confidence || 50.0,
                  isFirstKnownAppearance: Boolean(n.isFirstKnownAppearance),
                  sequenceOrder: n.sequenceOrder || idx + 1,
                  title: n.title || null,
                  publisher: n.publisher || null
                }))
              }
            } : {}),
            ...(reportData.spreadAnalysis ? {
              spreadClusters: {
                create: [
                  {
                    clusterName: reportData.spreadAnalysis.amplificationPattern || 'General Spread',
                    clusterType: reportData.spreadAnalysis.amplificationPattern === 'COORDINATED_AMPLIFICATION_SUSPECTED' ? 'COORDINATED_REPOSTING' : 'SYNDICATION',
                    repostCount: reportData.spreadAnalysis.repostCount || 0,
                    domainCount: reportData.spreadAnalysis.distinctDomainsCount || 0,
                    velocityLabel: reportData.spreadAnalysis.propagationSpanHours ? `${reportData.spreadAnalysis.propagationSpanHours}h span` : 'N/A',
                    coordinationConfidence: reportData.spreadAnalysis.coordinationAssessment?.confidence || 0.0,
                    coordinationPattern: reportData.spreadAnalysis.coordinationAssessment?.pattern || 'UNSUPPORTED',
                    evidenceRationale: reportData.spreadAnalysis.coordinationAssessment?.rationale || null,
                    domainsJson: JSON.stringify(reportData.spreadAnalysis.domainsInvolved || []),
                    timelineJson: JSON.stringify(reportData.spreadAnalysis.chronologicalPropagation || [])
                  }
                ]
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
      }
    } catch (dbErr) {
      console.error('[Pipeline DB Save Error]:', dbErr.message);
      // Nested forensic/evidence records must never make the completed dossier
      // disappear. Preserve the complete report payload even if a child model
      // is temporarily out of sync with the generated Prisma client.
      try {
        const userExists = await prisma.user.findUnique({ where: { id: userId } }).catch(() => null);
        if (userExists) {
          reportData.persistenceWarnings = [
            ...(reportData.persistenceWarnings || []),
            'Detailed relational records could not be saved; the complete dossier payload was preserved.'
          ];
          const fallbackScore = reportData.scores?.overallTrustScore !== undefined
            ? reportData.scores.overallTrustScore
            : 50;
          const fallbackVerdict = reportData.verdict ||
            (fallbackScore >= 75 ? 'Real' : fallbackScore >= 40 ? 'Suspicious' : 'Fake');
          const coreData = {
            title: contentRes.sourceTitle || sourceTitle,
            inputType: String(inputType),
            inputSource: inputSourceStr,
            selectedTypes: selectedTypesStr,
            status: 'COMPLETED',
            summary: reportData.summary,
            overallMetrics: overallMetricsStr,
            reportData: JSON.stringify(reportData),
            truncated: Boolean(contentRes.truncated),
            tokensConsumed: reportData.observability?.totalTokens || 0,
            costUsd: reportData.observability?.estimatedCostUsd || 0.0,
            trustScore: fallbackScore,
            verdict: fallbackVerdict
          };
          savedRecord = await prisma.analysis.upsert({
            where: { id: jobId },
            create: {
              id: jobId,
              ...coreData,
              runVersion: 1,
              user: { connect: { id: userExists.id } }
            },
            update: coreData
          });
        }
      } catch (fallbackErr) {
        console.error('[Pipeline Core Report Save Error]:', fallbackErr.message);
      }
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
        if (userExists) {
          await prisma.analysis.create({
            data: {
              id: jobId,
              userId: userExists.id,
              title: sourceTitle,
              inputType: String(inputType),
              inputSource: inputSourceStr,
              selectedTypes: typeof selectedTypes === 'string' ? selectedTypes : JSON.stringify(selectedTypes),
              status: 'FAILED',
              summary: `Analysis failed: ${error.message}`,
              overallMetrics: '{}',
              reportData: JSON.stringify({ error: error.message, status: 'FAILED' }),
              user: { connect: { id: userExists.id } }
            }
          });
        }
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
  runVerificationPipeline,
  buildImageSourceEvidence,
  verifyObservationClaimsAgainstImageSource,
  buildImageSourceResearchContext
};
