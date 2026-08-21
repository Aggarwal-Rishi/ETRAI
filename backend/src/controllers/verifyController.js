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
      selectedTypes
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
const deepResearchClaim = async (req, res) => {
  try {
    const { claim, articleResearchContext } = req.body;
    if (!claim) {
      return res.status(400).json({ error: 'Claim payload is required.' });
    }

    const { performPerClaimDeepResearch } = require('../services/articleResearch');
    const { generateClaimCorrection } = require('../services/correctionsService');

    const deepRes = await performPerClaimDeepResearch(claim, articleResearchContext, true);
    
    // Evaluate Part A AI Corrections post Deep Research
    const correctionData = await generateClaimCorrection(claim, {
      status: deepRes.updatedStatus,
      sources: deepRes.deepResearchHits,
      supportingSourceIndices: deepRes.deepResearchHits.map((_, i) => i),
      refutingSourceIndices: []
    }, articleResearchContext);

    return res.status(200).json({
      success: true,
      claimId: claim.id || claim.claimId,
      status: deepRes.updatedStatus,
      verdict: deepRes.updatedStatus,
      confidence: deepRes.updatedConfidence,
      deepResearch: deepRes,
      hasCorrection: correctionData.hasCorrection,
      correctedClaim: correctionData.correctedClaim,
      correctionBasis: correctionData.correctionBasis,
      partiallyAccurate: correctionData.partiallyAccurate
    });
  } catch (err) {
    console.error('[Manual Deep Research Controller Error]:', err);
    return res.status(500).json({ error: 'Failed to perform deep research on claim.' });
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

module.exports = {
  analyze,
  streamProgress,
  getJobStatus,
  deepResearchClaim
};
