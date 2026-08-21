const express = require('express');
const router = express.Router();
const {
  getReports,
  getReportById,
  getReportProvenance,
  getReportShare,
  getReportExport,
  exportHistoryCsv,
  getUsageSummary,
  reverifyReport,
  deleteReport
} = require('../controllers/reportsController');
const { protect } = require('../middleware/authMiddleware');

router.get('/', protect, getReports);
router.get('/export-csv', protect, exportHistoryCsv);
router.get('/usage-summary', protect, getUsageSummary);
router.get('/:id', protect, getReportById);
router.get('/:id/provenance', protect, getReportProvenance);
router.get('/:id/share', getReportShare); // Publicly accessible with sanitization
router.get('/:id/export', protect, getReportExport);
router.post('/:id/reverify', protect, reverifyReport); // Real verification pipeline execution
router.delete('/:id', protect, deleteReport);

module.exports = router;
