const { getFakeNewsFeed, getDailyFakeNewsDigest } = require('../services/fakeNewsDesk');
const { dbService } = require('../utils/prisma');

/**
 * GET /api/v1/fake-news
 */
const getFakeNewsList = async (req, res) => {
  try {
    const {
      riskLevel = 'All',
      category = 'All',
      query = '',
      timeRange = '30d',
      page = 1,
      pageSize = 15
    } = req.query;

    const workspaceId = req.user ? (await dbService.getWorkspaceForUser(req.user.id))?.id : null;

    const feed = await getFakeNewsFeed({
      riskLevel,
      category,
      query,
      timeRange,
      page: parseInt(page, 10) || 1,
      pageSize: parseInt(pageSize, 10) || 15,
      workspaceId
    });

    return res.status(200).json({
      success: true,
      ...feed
    });
  } catch (err) {
    console.error('[Fake News List Error]:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve fake news feed.' });
  }
};

/**
 * GET /api/v1/fake-news/digest
 */
const getFakeNewsDailyDigest = async (req, res) => {
  try {
    const workspaceId = req.user ? (await dbService.getWorkspaceForUser(req.user.id))?.id : null;
    const digest = await getDailyFakeNewsDigest(workspaceId);
    return res.status(200).json({
      success: true,
      digest
    });
  } catch (err) {
    console.error('[Fake News Digest Error]:', err.message);
    return res.status(500).json({ error: 'Failed to generate daily intelligence digest.' });
  }
};

/**
 * GET /api/v1/fake-news/clusters
 */
const getFakeNewsClusters = async (req, res) => {
  try {
    const workspaceId = req.user ? (await dbService.getWorkspaceForUser(req.user.id))?.id : null;
    const feed = await getFakeNewsFeed({ pageSize: 50, workspaceId });
    return res.status(200).json({
      success: true,
      count: feed.clusters.length,
      clusters: feed.clusters
    });
  } catch (err) {
    console.error('[Fake News Clusters Error]:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve narrative clusters.' });
  }
};

/**
 * GET /api/v1/fake-news/:id
 */
const getFakeNewsDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const report = await dbService.findAnalysisById(id);
    if (!report) {
      return res.status(404).json({ error: 'Suspicious news item analysis not found.' });
    }

    let parsedReport = report.reportData || report;
    if (typeof parsedReport === 'string') {
      try { parsedReport = JSON.parse(parsedReport); } catch (e) {}
    }

    const { deriveSuspiciousReasoning } = require('../services/fakeNewsDesk');
    const reasoning = deriveSuspiciousReasoning({ ...report, claims: parsedReport.claims || report.claims || [] });

    return res.status(200).json({
      success: true,
      id: report.id,
      title: report.title,
      verdict: report.verdict,
      trustScore: report.trustScore,
      reasoning,
      report: parsedReport
    });
  } catch (err) {
    console.error('[Fake News Detail Error]:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve suspicious item detail.' });
  }
};

module.exports = {
  getFakeNewsList,
  getFakeNewsDailyDigest,
  getFakeNewsClusters,
  getFakeNewsDetail
};
