const { getDashboardTelemetry } = require('../services/dashboardService');

/**
 * GET /api/v1/dashboard
 * Retrieves real computed dashboard metrics, verdict distribution, and queues
 */
const getDashboardStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const telemetry = await getDashboardTelemetry(userId);
    return res.status(200).json({ success: true, ...telemetry });
  } catch (err) {
    console.error('[Dashboard Stats Error]:', err);
    return res.status(500).json({ error: 'Failed to retrieve dashboard statistics.' });
  }
};

module.exports = {
  getDashboardStats
};
