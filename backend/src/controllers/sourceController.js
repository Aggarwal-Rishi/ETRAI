/**
 * ETRAI Source Intelligence & Source Management Controller
 * Persistent CRUD, search, role assignment, and on-demand evaluation endpoints.
 */

'use strict';

const { prisma, dbService } = require('../utils/prisma');
const {
  extractCanonicalDomain,
  evaluateSourceIntelligence,
  analyzeSourceIndependence,
  getSourceIntelligenceLedger
} = require('../services/sourceIntelligence');

/**
 * GET /api/v1/sources
 * List persistent sources with filtering, searching, and pagination
 */
const listSources = async (req, res) => {
  try {
    const { search, role, rank, status, page = 1, limit = 50 } = req.query;
    const workspace = await dbService.getWorkspaceForUser(req.user.id);
    const workspaceId = workspace?.id || null;

    const where = {
      ...(workspaceId ? { OR: [{ workspaceId }, { workspaceId: null }] } : {}),
      ...(role ? { sourceRole: role.toUpperCase() } : {}),
      ...(rank ? { rank: parseInt(rank, 10) } : {}),
      ...(status ? { status: status.toUpperCase() } : {}),
      ...(search ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { domain: { contains: search, mode: 'insensitive' } }
        ]
      } : {})
    };

    const take = Math.min(parseInt(limit, 10) || 50, 100);
    const skip = Math.max((parseInt(page, 10) - 1) * take, 0);

    const [sources, total] = await Promise.all([
      prisma.source.findMany({
        where,
        orderBy: [{ rank: 'asc' }, { authorityScore: 'desc' }],
        take,
        skip
      }),
      prisma.source.count({ where })
    ]);

    return res.status(200).json({
      status: 'success',
      total,
      page: parseInt(page, 10) || 1,
      limit: take,
      sources
    });
  } catch (err) {
    console.error('[List Sources Controller Error]:', err);
    return res.status(500).json({ error: 'Failed to list sources.' });
  }
};

/**
 * GET /api/v1/sources/ledger
 * Get full aggregated source intelligence ledger
 */
const getLedger = async (req, res) => {
  try {
    const workspace = await dbService.getWorkspaceForUser(req.user.id);
    const ledger = await getSourceIntelligenceLedger(workspace?.id || null);
    return res.status(200).json({
      status: 'success',
      count: ledger.length,
      ledger
    });
  } catch (err) {
    console.error('[Source Ledger Controller Error]:', err);
    return res.status(500).json({ error: 'Failed to retrieve source ledger.' });
  }
};

/**
 * GET /api/v1/sources/:id
 * Get single source by ID or Domain
 */
const getSourceById = async (req, res) => {
  try {
    const { id } = req.params;
    const source = await prisma.source.findFirst({
      where: {
        OR: [{ id }, { domain: extractCanonicalDomain(id) }]
      }
    });

    if (!source) {
      return res.status(404).json({ error: 'Source not found in registry.' });
    }

    const evaluation = evaluateSourceIntelligence({ domain: source.domain });
    return res.status(200).json({
      status: 'success',
      source,
      evaluation
    });
  } catch (err) {
    console.error('[Get Source Controller Error]:', err);
    return res.status(500).json({ error: 'Failed to retrieve source details.' });
  }
};

/**
 * POST /api/v1/sources
 * Create a new custom ranked source
 */
const createSource = async (req, res) => {
  try {
    const {
      name,
      domain,
      rank = 2,
      authorityScore = 80.0,
      reliabilityScore = 85.0,
      sourceType = 'PRIMARY_NEWSROOM',
      sourceRole = 'PRIMARY_REPORTING',
      purpose,
      parentCompany,
      syndicationGroup,
      status = 'ACTIVE'
    } = req.body;

    if (!name || !domain) {
      return res.status(400).json({ error: 'Source name and domain are required.' });
    }

    const cleanDomain = extractCanonicalDomain(domain);
    const workspace = await dbService.getWorkspaceForUser(req.user.id);

    const source = await prisma.source.create({
      data: {
        workspaceId: workspace?.id || null,
        name: name.trim(),
        domain: cleanDomain,
        rank: parseInt(rank, 10) || 2,
        authorityScore: parseFloat(authorityScore) || 80.0,
        reliabilityScore: parseFloat(reliabilityScore) || 85.0,
        sourceType,
        sourceRole: sourceRole.toUpperCase(),
        purpose: purpose ? purpose.trim() : null,
        parentCompany: parentCompany ? parentCompany.trim() : null,
        syndicationGroup: syndicationGroup ? syndicationGroup.trim() : cleanDomain,
        status: status.toUpperCase(),
        isCustom: true,
        lastEvaluatedAt: new Date()
      }
    });

    return res.status(201).json({
      status: 'success',
      message: 'Source created successfully.',
      source
    });
  } catch (err) {
    console.error('[Create Source Controller Error]:', err);
    return res.status(500).json({ error: 'Failed to create source.' });
  }
};

/**
 * PUT /api/v1/sources/:id
 * Update an existing source
 */
const updateSource = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      rank,
      authorityScore,
      reliabilityScore,
      sourceType,
      sourceRole,
      purpose,
      parentCompany,
      syndicationGroup,
      status
    } = req.body;

    const existing = await prisma.source.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Source not found.' });
    }

    const updated = await prisma.source.update({
      where: { id },
      data: {
        ...(name ? { name: name.trim() } : {}),
        ...(rank !== undefined ? { rank: parseInt(rank, 10) } : {}),
        ...(authorityScore !== undefined ? { authorityScore: parseFloat(authorityScore) } : {}),
        ...(reliabilityScore !== undefined ? { reliabilityScore: parseFloat(reliabilityScore) } : {}),
        ...(sourceType ? { sourceType } : {}),
        ...(sourceRole ? { sourceRole: sourceRole.toUpperCase() } : {}),
        ...(purpose !== undefined ? { purpose: purpose.trim() } : {}),
        ...(parentCompany !== undefined ? { parentCompany: parentCompany.trim() } : {}),
        ...(syndicationGroup !== undefined ? { syndicationGroup: syndicationGroup.trim() } : {}),
        ...(status ? { status: status.toUpperCase() } : {}),
        lastEvaluatedAt: new Date()
      }
    });

    return res.status(200).json({
      status: 'success',
      message: 'Source updated successfully.',
      source: updated
    });
  } catch (err) {
    console.error('[Update Source Controller Error]:', err);
    return res.status(500).json({ error: 'Failed to update source.' });
  }
};

/**
 * PATCH /api/v1/sources/:id/role
 * Assign source role
 */
const updateSourceRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!role) {
      return res.status(400).json({ error: 'Source role is required.' });
    }

    const validRoles = [
      'PRIMARY_AUTHORITY', 'PRIMARY_REPORTING', 'SECONDARY_REPORTING',
      'FACT_CHECKER', 'SPECIALIST', 'PROVENANCE_SOURCE',
      'SIGNAL_ONLY', 'SPREAD_TRACKING', 'WATCHLIST'
    ];

    const upperRole = role.toUpperCase();
    if (!validRoles.includes(upperRole)) {
      return res.status(400).json({ error: `Invalid role. Allowed: ${validRoles.join(', ')}` });
    }

    const updated = await prisma.source.update({
      where: { id },
      data: { sourceRole: upperRole, lastEvaluatedAt: new Date() }
    });

    return res.status(200).json({
      status: 'success',
      message: `Source role updated to ${upperRole}`,
      source: updated
    });
  } catch (err) {
    console.error('[Update Source Role Error]:', err);
    return res.status(500).json({ error: 'Failed to update source role.' });
  }
};

/**
 * PATCH /api/v1/sources/:id/status
 * Toggle source status (ACTIVE, DISABLED, FLAGGED, WATCHLIST)
 */
const updateSourceStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required.' });
    }

    const upperStatus = status.toUpperCase();
    const updated = await prisma.source.update({
      where: { id },
      data: { status: upperStatus, lastEvaluatedAt: new Date() }
    });

    return res.status(200).json({
      status: 'success',
      message: `Source status updated to ${upperStatus}`,
      source: updated
    });
  } catch (err) {
    console.error('[Update Source Status Error]:', err);
    return res.status(500).json({ error: 'Failed to update source status.' });
  }
};

/**
 * DELETE /api/v1/sources/:id
 * Delete custom source
 */
const deleteSource = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.source.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Source not found.' });
    }

    await prisma.source.delete({ where: { id } });
    return res.status(200).json({ status: 'success', message: 'Source deleted successfully.' });
  } catch (err) {
    console.error('[Delete Source Controller Error]:', err);
    return res.status(500).json({ error: 'Failed to delete source.' });
  }
};

/**
 * POST /api/v1/sources/evaluate
 * On-demand explainable source evaluation & independence analysis for a list of URLs or domains
 */
const evaluateSourcesOnDemand = async (req, res) => {
  try {
    const { sources } = req.body;
    if (!Array.isArray(sources) || sources.length === 0) {
      return res.status(400).json({ error: 'An array of sources or URLs is required.' });
    }

    const independenceAnalysis = analyzeSourceIndependence(sources);
    return res.status(200).json({
      status: 'success',
      ...independenceAnalysis
    });
  } catch (err) {
    console.error('[Evaluate Sources On-Demand Error]:', err);
    return res.status(500).json({ error: 'Failed to evaluate sources.' });
  }
};

module.exports = {
  listSources,
  getLedger,
  getSourceById,
  createSource,
  updateSource,
  updateSourceRole,
  updateSourceStatus,
  deleteSource,
  evaluateSourcesOnDemand
};
