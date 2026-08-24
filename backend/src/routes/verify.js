const express = require('express');
const router = express.Router();
const { analyze, streamProgress, getJobStatus, deepResearchClaim, proxyImage } = require('../controllers/verifyController');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
const { analyzeLimiter } = require('../middleware/rateLimiter');

// Proxy image endpoint (SSRF guarded for reverse-search images)
router.get('/proxy-image', proxyImage);

// Initiate analysis job (supports single file upload with rate limiting)
router.post('/', protect, analyzeLimiter, upload.single('file'), analyze);
router.post('/analyze', protect, analyzeLimiter, upload.single('file'), analyze);

// Manual On-Demand Per-Claim Deep Research Endpoint
router.post('/claim-deep-research', protect, deepResearchClaim);

// SSE Stream for real-time progress updates (Protected & Authorized per user job)
router.get('/stream/:jobId', protect, streamProgress);

// Polling and state recovery endpoint (Protected & Authorized per user job)
router.get('/job/:jobId', protect, getJobStatus);

module.exports = router;
