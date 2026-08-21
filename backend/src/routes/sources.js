/**
 * ETRAI Source Intelligence & Source Management Routes
 */

'use strict';

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const {
  listSources,
  getLedger,
  getSourceById,
  createSource,
  updateSource,
  updateSourceRole,
  updateSourceStatus,
  deleteSource,
  evaluateSourcesOnDemand
} = require('../controllers/sourceController');

// Ledger & Aggregated Intelligence
router.get('/ledger', requireAuth, getLedger);

// On-demand explainable source & independence evaluation
router.post('/evaluate', requireAuth, evaluateSourcesOnDemand);

// CRUD & Search Operations
router.get('/', requireAuth, listSources);
router.get('/:id', requireAuth, getSourceById);
router.post('/', requireAuth, createSource);
router.put('/:id', requireAuth, updateSource);
router.patch('/:id/role', requireAuth, updateSourceRole);
router.patch('/:id/status', requireAuth, updateSourceStatus);
router.delete('/:id', requireAuth, deleteSource);

module.exports = router;
