const { v4: uuidv4 } = require('crypto'); // or custom uuid generator
const { runVerificationPipeline } = require('../services/verificationPipeline');
const { registerStream } = require('../services/sseManager');
const upload = require('../middleware/uploadMiddleware');
const { checkVerificationQuota } = require('../services/subscriptionBillingService');
const { operationalIntelligence } = require('../services/operationalIntelligenceService');
const { prisma } = require('../utils/prisma');

function generateJobId() {
  return `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function parseOptionalBoolean(value, defaultValue = true) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  return String(value).trim().toLowerCase() !== 'false';
}

/**
 * POST /api/v1/verify/analyze
 */
const analyze = async (req, res) => {
  try {
    const userId = req.user.id;
    let workspaceId = null;

    // Server-side Quota Guard: Enforce subscription verification limit
    if (prisma && userId) {
      const userWorkspace = await prisma.workspace.findFirst({
        where: {
          OR: [
            { ownerId: userId },
            { members: { some: { userId, status: 'ACTIVE' } } }
          ]
        }
      });
      if (userWorkspace) {
        workspaceId = userWorkspace.id;
        await checkVerificationQuota(userWorkspace.id);
      }
    }

    const { inputType, text, url } = req.body;
    const analysisOptions = {
      enableReverseSearch: parseOptionalBoolean(req.body.enableReverseSearch),
      allowExternalVisualSearch: parseOptionalBoolean(req.body.allowExternalVisualSearch, false),
      allowExternalTranscriptSearch: parseOptionalBoolean(req.body.allowExternalTranscriptSearch, false),
      traceProvenance: parseOptionalBoolean(req.body.traceProvenance),
      detectEntities: parseOptionalBoolean(req.body.detectEntities)
    };
    const file = req.file;

    // Operational Safeguards: Duplicate job & concurrency check
    const admission = operationalIntelligence.checkJobAdmission(userId, workspaceId, {
      inputType,
      text,
      url,
      fileHash: file?.buffer ? require('crypto').createHash('md5').update(file.buffer).digest('hex') : null
    });

    let selectedTypes = req.body.selectedTypes;

    // Parse selectedTypes if sent as JSON string (e.g. multipart form-data)
    if (typeof selectedTypes === 'string') {
      try {
        selectedTypes = JSON.parse(selectedTypes);
      } catch (e) {
        selectedTypes = [selectedTypes];
      }
    }

    if (!selectedTypes || !Array.isArray(selectedTypes) || selectedTypes.length === 0) {
      selectedTypes = ['FACT_CHECKING'];
    }

    const jobId = generateJobId();

    // Register job in Operational Intelligence Engine
    operationalIntelligence.registerJobStart(jobId, userId, workspaceId, admission.fingerprint);

    const { emitProgress } = require('../services/sseManager');
    emitProgress(jobId, {
      userId,
      status: 'PROCESSING',
      progress: 5,
      step: 'Verification analysis job initiated',
      stage: 'STARTING'
    });

    // Trigger asynchronous pipeline execution in background
    runVerificationPipeline({
      jobId,
      userId,
      inputType: inputType ? inputType.toUpperCase() : 'TEXT',
      text,
      url,
      file,
      selectedTypes,
      ...analysisOptions
    }).catch(err => {
      console.error(`[Background Job Execution Error ${jobId}]:`, err.message);
    });

    return res.status(202).json({
      success: true,
      jobId,
      status: 'PROCESSING',
      message: 'Verification analysis job initiated successfully.',
      streamUrl: `/api/v1/verify/stream/${jobId}`
    });
  } catch (err) {
    console.error('[Analyze Endpoint Error]:', err);
    return res.status(err.status || 500).json({
      error: err.message || 'Failed to initiate verification job.'
    });
  }
};

/**
 * GET /api/v1/verify/stream/:jobId
 */
const streamProgress = async (req, res) => {
  const { jobId } = req.params;
  if (!jobId) {
    return res.status(400).json({ error: 'Job ID parameter is required.' });
  }

  const requestingUserId = req.user?.id;
  await registerStream(jobId, res, req, requestingUserId);
};

/**
 * POST /api/v1/verify/claim-deep-research
 */
function mapResearchStatusToVerdict(status) {
  if (status === 'TRUSTED') return 'VERIFIED';
  if (status === 'FABRICATED') return 'FALSE';
  if (status === 'PARTIALLY_VERIFIED') return 'PARTIALLY_VERIFIED';
  return 'UNVERIFIED';
}

function mergeSourcesByUrl(existingSources = [], researchSources = []) {
  const merged = new Map();
  [...existingSources, ...researchSources].forEach((source, index) => {
    if (!source) return;
    const url = source.url || source.link || '';
    const key = url || `${source.domain || 'source'}:${source.title || index}`;
    merged.set(key, { ...(merged.get(key) || {}), ...source, url: url || source.url, link: url || source.link });
  });
  return Array.from(merged.values());
}

function buildClaimResearchUpdate(claim, deepRes, correctionData) {
  const claimObject = typeof claim === 'string' ? { claimText: claim } : (claim || {});
  const researchSources = Array.isArray(deepRes.evaluatedSources) ? deepRes.evaluatedSources : [];
  const hasNewEvidence = researchSources.length > 0;
  const nextStatus = hasNewEvidence ? deepRes.updatedStatus : (claimObject.status || deepRes.updatedStatus);
  const nextVerdict = hasNewEvidence
    ? mapResearchStatusToVerdict(deepRes.updatedStatus)
    : (claimObject.verdict || mapResearchStatusToVerdict(nextStatus));
  const nextConfidence = hasNewEvidence
    ? deepRes.updatedConfidence
    : (Number.isFinite(Number(claimObject.confidence)) ? Number(claimObject.confidence) : deepRes.updatedConfidence);
  return {
    ...claimObject,
    status: nextStatus,
    verdict: nextVerdict,
    confidence: nextConfidence,
    explanation: hasNewEvidence
      ? deepRes.reasoning
      : `${deepRes.reasoning} The previous claim verdict was preserved because no new evidence source was retrieved.`,
    sources: mergeSourcesByUrl(claimObject.sources || [], researchSources),
    evidenceEvaluations: researchSources,
    deepResearch: deepRes,
    hasCorrection: correctionData.hasCorrection,
    correctedClaim: correctionData.correctedClaim,
    correctionBasis: correctionData.correctionBasis,
    partiallyAccurate: correctionData.partiallyAccurate,
    lastResearchedAt: deepRes.searchedAt || new Date().toISOString()
  };
}

async function loadOwnedClaimForResearch(analysisId, userId, claimIndex) {
  if (!analysisId) return null;
  if (!userId) {
    const error = new Error('Authentication is required to update a report claim.');
    error.statusCode = 401;
    throw error;
  }
  if (!Number.isInteger(claimIndex) || claimIndex < 0) {
    const error = new Error('A valid claim index is required.');
    error.statusCode = 400;
    throw error;
  }
  const analysis = await prisma.analysis.findFirst({
    where: { id: analysisId, userId },
    include: { claims: { include: { evidenceItems: true } } }
  });
  if (!analysis) {
    const error = new Error('Report not found or access denied.');
    error.statusCode = 404;
    throw error;
  }
  let reportPayload = analysis.reportData;
  if (typeof reportPayload === 'string') {
    try { reportPayload = JSON.parse(reportPayload); } catch (_) { reportPayload = null; }
  }
  if (!reportPayload || !Array.isArray(reportPayload.claims) || !reportPayload.claims[claimIndex]) {
    const error = new Error('The selected claim no longer exists in this report.');
    error.statusCode = 404;
    throw error;
  }
  return { analysis, reportPayload, storedClaim: reportPayload.claims[claimIndex] };
}

async function persistClaimResearchResult(ownedClaim, claimIndex, updatedClaim) {
  if (!ownedClaim) return false;
  const { analysis, reportPayload, storedClaim } = ownedClaim;
  const updatedClaims = [...reportPayload.claims];
  updatedClaims[claimIndex] = updatedClaim;
  const updatedReport = {
    ...reportPayload,
    claims: updatedClaims,
    sources: mergeSourcesByUrl(reportPayload.sources || [], updatedClaim.sources || [])
  };

  const storedText = String(storedClaim.claimText || storedClaim.text || storedClaim.claim || '').trim();
  const relationalClaim = analysis.claims.find(item => item.claimText.trim() === storedText) || analysis.claims[claimIndex] || null;
  const operations = [
    prisma.analysis.update({
      where: { id: analysis.id },
      data: { reportData: JSON.stringify(updatedReport) }
    })
  ];

  if (relationalClaim) {
    operations.push(prisma.claim.update({
      where: { id: relationalClaim.id },
      data: {
        verdict: updatedClaim.verdict,
        status: updatedClaim.status,
        confidence: Number(updatedClaim.confidence || 0),
        reasoning: updatedClaim.explanation || null,
        hasCorrection: Boolean(updatedClaim.hasCorrection),
        correctedClaim: updatedClaim.correctedClaim || null,
        correctionBasis: updatedClaim.correctionBasis || null,
        partiallyAccurate: Boolean(updatedClaim.partiallyAccurate),
        rawJson: JSON.stringify(updatedClaim)
      }
    }));

    const existingUrls = new Set((relationalClaim.evidenceItems || []).map(item => item.url).filter(Boolean));
    (updatedClaim.deepResearch?.evaluatedSources || []).forEach((source, sourceIndex) => {
      const sourceUrl = source.url || source.link;
      if (!sourceUrl || existingUrls.has(sourceUrl)) return;
      existingUrls.add(sourceUrl);
      operations.push(prisma.evidenceItem.create({
        data: {
          claimId: relationalClaim.id,
          sourceIndex,
          url: sourceUrl,
          domain: source.domain || 'unknown',
          title: source.title || source.domain || 'Research source',
          snippet: source.snippet || '',
          content: source.fetchedPassage || null,
          excerpt: source.snippet || null,
          stance: source.stance || 'NEUTRAL',
          relationship: source.stance === 'SUPPORTS' ? 'SUPPORTS' : (source.stance === 'REFUTES' ? 'CONTRADICTS' : 'NEUTRAL'),
          evidenceType: 'PRIMARY_REPORTING',
          relevanceScore: Number(source.relevanceScore || 0),
          reliabilityContribution: Math.round(Number(source.domainTrust || 0.5) * 100),
          independenceGroup: source.domain || 'unknown',
          isIndependent: source.isIndependent !== false,
          isSyndicatedDuplicate: source.isIndependent === false,
          authorityRank: Number(source.domainTier ?? 4),
          authorityScore: Math.round(Number(source.domainTrust || 0.5) * 100),
          retrievalStatus: source.fetchedPassage ? 'SUCCESS' : 'PARTIAL',
          reason: `Individual claim research: ${updatedClaim.deepResearch?.reasoning || ''}`.slice(0, 2000)
        }
      }));
    });
  }

  await prisma.$transaction(operations);
  return true;
}

const deepResearchClaim = async (req, res) => {
  try {
    const { claim, articleResearchContext, analysisId } = req.body;
    const parsedClaimIndex = Number(req.body.claimIndex);
    const ownedClaim = analysisId
      ? await loadOwnedClaimForResearch(analysisId, req.user?.id, parsedClaimIndex)
      : null;
    const claimToResearch = ownedClaim?.storedClaim || claim;
    if (!claimToResearch) {
      return res.status(400).json({ error: 'Claim payload is required.' });
    }

    const { performPerClaimDeepResearch } = require('../services/articleResearch');
    const { generateClaimCorrection } = require('../services/correctionsService');

    const deepRes = await performPerClaimDeepResearch(claimToResearch, articleResearchContext, true);
    const researchSources = Array.isArray(deepRes.evaluatedSources) ? deepRes.evaluatedSources : [];
    const supportingSourceIndices = researchSources
      .map((source, index) => source.stance === 'SUPPORTS' ? index : -1)
      .filter(index => index >= 0);
    const refutingSourceIndices = researchSources
      .map((source, index) => source.stance === 'REFUTES' ? index : -1)
      .filter(index => index >= 0);
    
    // Evaluate Part A AI Corrections post Deep Research
    const correctionData = researchSources.length > 0
      ? await generateClaimCorrection(claimToResearch, {
        status: deepRes.updatedStatus,
        sources: researchSources,
        supportingSourceIndices,
        refutingSourceIndices
      }, articleResearchContext)
      : {
        hasCorrection: Boolean(claimToResearch.hasCorrection),
        correctedClaim: claimToResearch.correctedClaim || null,
        correctionBasis: claimToResearch.correctionBasis || null,
        partiallyAccurate: Boolean(claimToResearch.partiallyAccurate)
      };

    const updatedClaim = buildClaimResearchUpdate(claimToResearch, deepRes, correctionData);
    const persisted = await persistClaimResearchResult(ownedClaim, parsedClaimIndex, updatedClaim);

    return res.status(200).json({
      success: true,
      analysisId: analysisId || null,
      claimIndex: Number.isInteger(parsedClaimIndex) ? parsedClaimIndex : null,
      claimId: claimToResearch.id || claimToResearch.claimId || null,
      status: updatedClaim.status,
      verdict: updatedClaim.verdict,
      confidence: updatedClaim.confidence,
      deepResearch: deepRes,
      sources: updatedClaim.sources,
      updatedClaim,
      persisted,
      hasCorrection: correctionData.hasCorrection,
      correctedClaim: correctionData.correctedClaim,
      correctionBasis: correctionData.correctionBasis,
      partiallyAccurate: correctionData.partiallyAccurate
    });
  } catch (err) {
    console.error('[Manual Deep Research Controller Error]:', err);
    return res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'Failed to perform deep research on claim.' });
  }
};

/**
 * GET /api/v1/verify/job/:jobId
 * Polling and state recovery endpoint for interrupted or non-SSE clients
 */
const getJobStatus = async (req, res) => {
  try {
    const { jobId } = req.params;
    if (!jobId) {
      return res.status(400).json({ error: 'Job ID parameter is required.' });
    }

    const requestingUserId = req.user?.id;
    const { getJobState } = require('../services/sseManager');
    const jobState = await getJobState(jobId, requestingUserId);

    if (!jobState) {
      return res.status(404).json({ error: 'Job not found or access denied.' });
    }

    return res.status(200).json({
      success: true,
      job: jobState
    });
  } catch (err) {
    console.error('[Get Job Status Error]:', err);
    return res.status(500).json({ error: 'Failed to retrieve job status.' });
  }
};

/**
 * GET /api/v1/verify/proxy-image?url=...
 * CORS-safe, SSRF-guarded image proxy for reverse-search wire archive images
 */
const proxyImage = async (req, res) => {
  try {
    const { url } = req.query;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Image URL parameter is required.' });
    }

    const { fetchRemoteMediaBuffer } = require('../services/media/remoteMediaFetcher');
    const remote = await fetchRemoteMediaBuffer(url, {
      expectedKind: 'image',
      maxBytes: 10 * 1024 * 1024,
      timeoutMs: 8000,
      maxRedirects: 3
    });
    res.setHeader('Content-Type', remote.mimeType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(remote.buffer);
  } catch (err) {
    console.error('[Image Proxy Error]:', err.message);
    return res.status(502).json({ error: `Image proxy failed: ${err.message}` });
  }
};

module.exports = {
  analyze,
  streamProgress,
  getJobStatus,
  deepResearchClaim,
  proxyImage,
  mapResearchStatusToVerdict,
  mergeSourcesByUrl,
  buildClaimResearchUpdate
};
