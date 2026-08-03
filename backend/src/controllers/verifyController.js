const { v4: uuidv4 } = require('crypto'); // or custom uuid generator
const { runVerificationPipeline } = require('../services/verificationPipeline');
const { registerStream } = require('../services/sseManager');
const upload = require('../middleware/uploadMiddleware');

function generateJobId() {
  return `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * POST /api/v1/verify/analyze
 */
const analyze = async (req, res) => {
  try {
    const userId = req.user.id;
    const { inputType, text, url } = req.body;
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

    const file = req.file;
    const jobId = generateJobId();

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
const streamProgress = (req, res) => {
  const { jobId } = req.params;
  if (!jobId) {
    return res.status(400).json({ error: 'Job ID parameter is required.' });
  }

  registerStream(jobId, res, req);
};

module.exports = {
  analyze,
  streamProgress
};
