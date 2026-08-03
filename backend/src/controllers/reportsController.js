const { dbService } = require('../utils/prisma');

/**
 * GET /api/v1/reports
 */
const getReports = async (req, res) => {
  try {
    const userId = req.user.id;
    const reports = await dbService.listAnalysesByUser(userId);

    return res.status(200).json({
      success: true,
      count: reports.length,
      reports
    });
  } catch (err) {
    console.error('[Get Reports Error]:', err);
    return res.status(500).json({ error: 'Failed to retrieve history reports.' });
  }
};

/**
 * GET /api/v1/reports/:id
 */
const getReportById = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const report = await dbService.findAnalysisById(id, userId);

    if (!report) {
      return res.status(404).json({ error: 'Report not found or access denied.' });
    }

    return res.status(200).json({
      success: true,
      report
    });
  } catch (err) {
    console.error('[Get Report Detail Error]:', err);
    return res.status(500).json({ error: 'Failed to retrieve report details.' });
  }
};

/**
 * DELETE /api/v1/reports/:id
 */
const deleteReport = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const deleted = await dbService.deleteAnalysisById(id, userId);

    if (!deleted) {
      return res.status(404).json({ error: 'Report not found or already deleted.' });
    }

    return res.status(200).json({
      success: true,
      message: 'Report deleted successfully.'
    });
  } catch (err) {
    console.error('[Delete Report Error]:', err);
    return res.status(500).json({ error: 'Failed to delete report.' });
  }
};

module.exports = {
  getReports,
  getReportById,
  deleteReport
};
