const express = require('express');
const router = express.Router();
const {
  getSystemMetrics,
  getJobQueueStatus,
  getWorkspaceMetrics
} = require('../controllers/observabilityController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/metrics', getSystemMetrics);
router.get('/jobs', getJobQueueStatus);
router.get('/workspaces/:workspaceId', getWorkspaceMetrics);

module.exports = router;
