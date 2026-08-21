const { fetchLiveNews, CATEGORY_QUERIES } = require('../services/liveNewsDesk');
const { runVerificationPipeline } = require('../services/verificationPipeline');
const { dbService } = require('../utils/prisma');

/**
 * GET /api/v1/news
 * Fetches real live news with source intelligence and verification cross-referencing
 */
const getLiveNews = async (req, res) => {
  try {
    const {
      category = 'All',
      source = '',
      query = '',
      mediaType = 'All',
      timeRange = '24h',
      page = 1,
      pageSize = 15
    } = req.query;

    const workspaceId = req.user ? (await dbService.getWorkspaceForUser(req.user.id))?.id : null;

    const results = await fetchLiveNews({
      category,
      source,
      query,
      mediaType,
      timeRange,
      page: parseInt(page, 10) || 1,
      pageSize: parseInt(pageSize, 10) || 15,
      workspaceId
    });

    return res.status(200).json({
      success: true,
      ...results
    });
  } catch (err) {
    console.error('[Live News Error]:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve live news feed.' });
  }
};

/**
 * GET /api/v1/news/categories
 * Returns supported news categories
 */
const getNewsCategories = async (req, res) => {
  return res.status(200).json({
    success: true,
    categories: Object.keys(CATEGORY_QUERIES)
  });
};

/**
 * POST /api/v1/news/verify
 * Direct verification invocation from News Desk
 */
const verifyNewsArticle = async (req, res) => {
  try {
    const { url, title, selectedTypes = ['FACT_CHECKING', 'FAKE_NEWS_DETECTION'] } = req.body;
    if (!url && !title) {
      return res.status(400).json({ error: 'Article URL or title is required for verification.' });
    }

    const userId = req.user?.id || null;
    const jobId = `news_verify_${Date.now()}`;

    // Run verification pipeline
    const verificationReport = await runVerificationPipeline({
      inputType: url ? 'URL' : 'TEXT',
      url: url || null,
      text: title || '',
      selectedTypes,
      userId,
      jobId
    });

    return res.status(200).json({
      success: true,
      jobId,
      report: verificationReport
    });
  } catch (err) {
    console.error('[News Verification Error]:', err.message);
    return res.status(500).json({ error: 'Failed to execute news verification.' });
  }
};

module.exports = {
  getLiveNews,
  getNewsCategories,
  verifyNewsArticle
};
