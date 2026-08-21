const { searchGlobalIndex } = require('../services/globalSearchService');

/**
 * GET /api/v1/search
 * Global omni-search across Reports, Claims, Evidence, Entities, Sources, and News
 */
const globalSearch = async (req, res) => {
  try {
    const userId = req.user.id;
    const { q, type, limit } = req.query;

    if (!q || !q.trim()) {
      return res.status(200).json({
        success: true,
        query: '',
        totalMatches: 0,
        resultsByType: {},
        items: []
      });
    }

    const searchResults = await searchGlobalIndex(userId, q, { type, limit });

    return res.status(200).json({
      success: true,
      ...searchResults
    });
  } catch (err) {
    console.error('[Global Search Error]:', err);
    return res.status(500).json({ error: 'Failed to execute global search query.' });
  }
};

module.exports = {
  globalSearch
};
