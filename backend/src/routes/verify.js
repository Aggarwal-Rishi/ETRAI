const express = require('express');
const router = express.Router();
const { analyze, streamProgress } = require('../controllers/verifyController');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

// Initiate analysis job (supports single file upload)
router.post('/analyze', protect, upload.single('file'), analyze);

// SSE Stream for real-time progress updates
router.get('/stream/:jobId', streamProgress);

module.exports = router;
