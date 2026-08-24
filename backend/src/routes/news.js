const express = require('express');
const router = express.Router();
const { getLiveNews, getNewsCategories, verifyNewsArticle, getMonitoringFeeds, triggerFeedPoll } = require('../controllers/newsController');
const { optionalAuth, protect } = require('../middleware/authMiddleware');

router.get('/', optionalAuth, getLiveNews);
router.get('/categories', getNewsCategories);
router.get('/monitoring/feeds', optionalAuth, getMonitoringFeeds);
router.post('/monitoring/poll', protect, triggerFeedPoll);
router.post('/verify', protect, verifyNewsArticle);

module.exports = router;
