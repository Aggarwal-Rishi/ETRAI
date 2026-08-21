/**
 * ETRAI Stage 34: Operational Intelligence & Production Observability Controller
 */

const { operationalIntelligence } = require('../services/operationalIntelligenceService');
const { getProviderStatus } = require('../services/providerManager');

/**
 * GET /api/v1/observability/metrics
 */
const getSystemMetrics = async (req, res) => {
  try {
    const report = operationalIntelligence.getOperationalReport();
    const providerStatus = getProviderStatus();

    return res.status(200).json({
      success: true,
      providerStatus,
      ...report
    });
  } catch (err) {
    console.error('[Observability Metrics Controller Error]:', err);
    return res.status(500).json({ error: 'Failed to retrieve operational metrics.' });
  }
};

/**
 * GET /api/v1/observability/jobs
 */
const getJobQueueStatus = async (req, res) => {
  try {
    const report = operationalIntelligence.getOperationalReport();
    return res.status(200).json({
      success: true,
      queue: report.queue,
      safeguards: report.safeguards,
      recentJobs: report.recentJobs
    });
  } catch (err) {
    console.error('[Observability Queue Controller Error]:', err);
    return res.status(500).json({ error: 'Failed to retrieve job queue telemetry.' });
  }
};

/**
 * GET /api/v1/observability/workspaces/:workspaceId
 */
const getWorkspaceMetrics = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID is required.' });
    }

    const consumption = operationalIntelligence.getWorkspaceConsumption(workspaceId);
    return res.status(200).json({
      success: true,
      consumption
    });
  } catch (err) {
    console.error('[Workspace Consumption Controller Error]:', err);
    return res.status(500).json({ error: 'Failed to retrieve workspace consumption.' });
  }
};

module.exports = {
  getSystemMetrics,
  getJobQueueStatus,
  getWorkspaceMetrics
};
