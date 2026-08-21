const express = require('express');
const router = express.Router();
const { getLiveNews, getNewsCategories, verifyNewsArticle } = require('../controllers/newsController');
const { optionalAuth, protect } = require('../middleware/authMiddleware');

router.get('/', optionalAuth, getLiveNews);
router.get('/categories', getNewsCategories);
router.post('/verify', protect, verifyNewsArticle);

module.exports = router;
