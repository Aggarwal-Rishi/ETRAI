const express = require('express');
const router = express.Router();
const { getReports, getReportById, deleteReport } = require('../controllers/reportsController');
const { protect } = require('../middleware/authMiddleware');

router.get('/', protect, getReports);
router.get('/:id', protect, getReportById);
router.delete('/:id', protect, deleteReport);

module.exports = router;
