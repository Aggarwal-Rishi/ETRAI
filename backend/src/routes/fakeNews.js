const express = require('express');
const router = express.Router();
const {
  getFakeNewsList,
  getFakeNewsDailyDigest,
  getFakeNewsClusters,
  getFakeNewsDetail
} = require('../controllers/fakeNewsController');
const { optionalAuth } = require('../middleware/authMiddleware');

router.get('/', optionalAuth, getFakeNewsList);
router.get('/digest', optionalAuth, getFakeNewsDailyDigest);
router.get('/clusters', optionalAuth, getFakeNewsClusters);
router.get('/:id', optionalAuth, getFakeNewsDetail);

module.exports = router;
