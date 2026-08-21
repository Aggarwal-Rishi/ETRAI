const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const { dbService } = require('../utils/prisma');
const { getSourceIntelligenceLedger, evaluateSourceIntelligence } = require('../services/sourceIntelligence');

/**
 * GET /api/v1/sources/ledger
 * Returns the comprehensive Source Intelligence Ledger across all analyses
 */
router.get('/ledger', authenticateToken, async (req, res) => {
  try {
    const workspace = await dbService.getWorkspaceForUser(req.user.id);
    const ledger = await getSourceIntelligenceLedger(workspace?.id || null);
    res.json({
      status: 'success',
      count: ledger.length,
      ledger
    });
  } catch (err) {
    console.error('[Sources Ledger Error]:', err.message);
    res.status(500).json({ error: 'Failed to retrieve source intelligence ledger' });
  }
});

/**
 * GET /api/v1/sources
 * List ranked sources with optional filter by rank or status
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const workspace = await dbService.getWorkspaceForUser(req.user.id);
    const sources = await dbService.listSources(workspace?.id || null);
    res.json({
      status: 'success',
      count: sources.length,
      sources
    });
  } catch (err) {
    console.error('[List Sources Error]:', err.message);
    res.status(500).json({ error: 'Failed to list sources' });
  }
});

/**
 * POST /api/v1/sources
 * Add custom ranked source for workspace
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, domain, rank, authorityScore, purpose, status } = req.body;
    if (!name || !domain) {
      return res.status(400).json({ error: 'Source name and domain are required' });
    }

    const workspace = await dbService.getWorkspaceForUser(req.user.id);
    const cleanDomain = domain.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];

    const source = await dbService.addSource(workspace.id, {
      name,
      domain: cleanDomain,
      rank: rank ? parseInt(rank, 10) : 2,
      authorityScore: authorityScore ? parseFloat(authorityScore) : 80.0,
      purpose,
      status: status || 'ACTIVE'
    });

    res.status(201).json({
      status: 'success',
      message: 'Custom ranked source added successfully',
      source
    });
  } catch (err) {
    console.error('[Add Source Error]:', err.message);
    res.status(500).json({ error: 'Failed to create source' });
  }
});

/**
 * DELETE /api/v1/sources/:id
 * Delete custom ranked source
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const workspace = await dbService.getWorkspaceForUser(req.user.id);
    const deleted = await dbService.deleteSource(req.params.id, workspace.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Custom source not found or not owned by your workspace' });
    }
    res.json({ status: 'success', message: 'Custom source deleted successfully' });
  } catch (err) {
    console.error('[Delete Source Error]:', err.message);
    res.status(500).json({ error: 'Failed to delete source' });
  }
});

module.exports = router;
