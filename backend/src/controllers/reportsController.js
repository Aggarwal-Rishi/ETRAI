const { dbService } = require('../utils/prisma');
const {
  listVerificationHistory,
  exportHistoryToCsv,
  getUsageAndCostReport,
  reverifyExistingAnalysis
} = require('../services/historyLedgerService');

/**
 * GET /api/v1/reports
 * Search, filter, sort, and paginate history with tenant isolation
 */
const getReports = async (req, res) => {
  try {
    const userId = req.user.id;
    const { search, verdict, inputType, startDate, endDate, sortBy, sortOrder, page, limit } = req.query;

    const historyResult = await listVerificationHistory(
      userId,
      { search, verdict, inputType, startDate, endDate, sortBy, sortOrder },
      { page, limit }
    );

    return res.status(200).json({
      success: true,
      ...historyResult,
      reports: historyResult.items
    });
  } catch (err) {
    console.error('[Get Reports Error]:', err);
    return res.status(500).json({ error: 'Failed to retrieve history reports.' });
  }
};

/**
 * GET /api/v1/reports/export-csv
 * Exports history ledger to downloadable RFC 4180 CSV
 */
const exportHistoryCsv = async (req, res) => {
  try {
    const userId = req.user.id;
    const { search, verdict, inputType, startDate, endDate } = req.query;

    const csvData = await exportHistoryToCsv(userId, { search, verdict, inputType, startDate, endDate });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="etrai-history-ledger-${Date.now()}.csv"`);
    return res.send(csvData);
  } catch (err) {
    console.error('[Export CSV Error]:', err);
    return res.status(500).json({ error: 'Failed to export history to CSV.' });
  }
};

/**
 * GET /api/v1/reports/usage-summary
 * Aggregates cost, token consumption, and model telemetry
 */
const getUsageSummary = async (req, res) => {
  try {
    const userId = req.user.id;
    const usage = await getUsageAndCostReport(userId);

    return res.status(200).json({
      success: true,
      usage
    });
  } catch (err) {
    console.error('[Get Usage Summary Error]:', err);
    return res.status(500).json({ error: 'Failed to retrieve usage telemetry.' });
  }
};

/**
 * POST /api/v1/reports/:id/reverify
 * Real pipeline re-verification execution
 */
const reverifyReport = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const result = await reverifyExistingAnalysis(id, userId);

    return res.status(200).json({
      success: true,
      message: 'Re-verification completed successfully.',
      ...result
    });
  } catch (err) {
    console.error('[Reverify Report Error]:', err);
    return res.status(500).json({ error: err.message || 'Failed to re-verify analysis.' });
  }
};

/**
 * GET /api/v1/reports/:id
 */
const getReportById = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const report = await dbService.findAnalysisById(id, userId);

    if (!report) {
      return res.status(404).json({ error: 'Report not found or access denied.' });
    }

    let reportPayload = report.reportData || report;
    if (typeof reportPayload === 'string') {
      try {
        reportPayload = JSON.parse(reportPayload);
      } catch (e) {}
    }

    return res.status(200).json({
      success: true,
      report: reportPayload
    });
  } catch (err) {
    console.error('[Get Report Detail Error]:', err);
    return res.status(500).json({ error: 'Failed to retrieve report details.' });
  }
};

/**
 * DELETE /api/v1/reports/:id
 */
const deleteReport = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const deleted = await dbService.deleteAnalysisById(id, userId);

    if (!deleted) {
      return res.status(404).json({ error: 'Report not found or already deleted.' });
    }

    return res.status(200).json({
      success: true,
      message: 'Report deleted successfully.'
    });
  } catch (err) {
    console.error('[Delete Report Error]:', err);
    return res.status(500).json({ error: 'Failed to delete report.' });
  }
};

/**
 * GET /api/v1/reports/:id/provenance
 */
const getReportProvenance = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const report = await dbService.findAnalysisById(id, userId);
    if (!report) {
      return res.status(404).json({ error: 'Report not found or access denied.' });
    }

    let reportPayload = report.reportData || report;
    if (typeof reportPayload === 'string') {
      try {
        reportPayload = JSON.parse(reportPayload);
      } catch (e) {}
    }

    const { analyzeContentProvenance } = require('../services/provenanceEngine');
    const provenance = reportPayload.provenance || analyzeContentProvenance({
      claims: reportPayload.claims || [],
      sources: reportPayload.claims?.flatMap(c => c.sources || []) || [],
      mediaAnalysis: reportPayload.mediaAnalysis,
      inputSource: reportPayload.sourceTitle || report.title
    });

    return res.status(200).json({
      success: true,
      reportId: id,
      title: report.title,
      provenance
    });
  } catch (err) {
    console.error('[Get Provenance Error]:', err);
    return res.status(500).json({ error: 'Failed to retrieve provenance details.' });
  }
};

/**
 * GET /api/v1/reports/:id/share
 * Generates a sanitized public shareable verification report payload
 */
const getReportShare = async (req, res) => {
  try {
    const { id } = req.params;
    const report = await dbService.findAnalysisById(id);
    if (!report) {
      return res.status(404).json({ error: 'Report not found.' });
    }

    let reportPayload = report.reportData || report;
    if (typeof reportPayload === 'string') {
      try {
        reportPayload = JSON.parse(reportPayload);
      } catch (e) {}
    }

    const { sanitizeReportForExport } = require('../services/shareExportService');
    const shareableReport = sanitizeReportForExport(reportPayload);

    return res.status(200).json({
      success: true,
      shareableUrl: `/share/${id}`,
      report: shareableReport
    });
  } catch (err) {
    console.error('[Get Report Share Error]:', err);
    return res.status(500).json({ error: 'Failed to generate shareable report.' });
  }
};

/**
 * GET /api/v1/reports/:id/export
 * Exports the report as sanitized JSON or Markdown
 */
const getReportExport = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const format = (req.query.format || 'json').toLowerCase();

    const report = await dbService.findAnalysisById(id, userId);
    if (!report) {
      return res.status(404).json({ error: 'Report not found or access denied.' });
    }

    let reportPayload = report.reportData || report;
    if (typeof reportPayload === 'string') {
      try {
        reportPayload = JSON.parse(reportPayload);
      } catch (e) {}
    }

    const { sanitizeReportForExport, generateReportMarkdownExport } = require('../services/shareExportService');

    if (format === 'markdown' || format === 'md') {
      const markdown = generateReportMarkdownExport(reportPayload);
      res.setHeader('Content-Type', 'text/markdown');
      res.setHeader('Content-Disposition', `attachment; filename="etrai-report-${id}.md"`);
      return res.send(markdown);
    }

    const sanitizedJson = sanitizeReportForExport(reportPayload);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="etrai-report-${id}.json"`);
    return res.status(200).json(sanitizedJson);
  } catch (err) {
    console.error('[Get Report Export Error]:', err);
    return res.status(500).json({ error: 'Failed to export report.' });
  }
};

/**
 * GET /api/v1/reports/public/recent-ticker
 * Retrieves real recent analyses from the database for the live trust ticker
 */
const getRecentTickerReports = async (req, res) => {
  try {
    const prisma = require('@prisma/client');
    const { dbService } = require('../utils/prisma');
    // Using prisma from dbService
    const { PrismaClient } = require('@prisma/client');
    const p = new PrismaClient();

    const reports = await p.analysis.findMany({
      where: {
        status: 'COMPLETED'
      },
      select: {
        id: true,
        title: true,
        trustScore: true,
        verdict: true,
        createdAt: true
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 8
    });

    return res.status(200).json({
      success: true,
      items: reports.map(r => ({
        id: r.id,
        title: r.title,
        trustScore: r.trustScore !== null ? Math.round(r.trustScore) : 50,
        verdict: r.verdict || (r.trustScore >= 75 ? 'Real' : r.trustScore >= 40 ? 'Suspicious' : 'Fake'),
        createdAt: r.createdAt
      }))
    });
  } catch (err) {
    console.error('[Ticker Reports Error]:', err.message);
    return res.status(200).json({ success: true, items: [] });
  }
};

module.exports = {
  getReports,
  getReportById,
  getReportProvenance,
  getReportShare,
  getReportExport,
  exportHistoryCsv,
  getUsageSummary,
  reverifyReport,
  deleteReport,
  getRecentTickerReports
};
