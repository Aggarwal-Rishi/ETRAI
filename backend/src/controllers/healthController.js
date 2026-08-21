/**
 * Health & Readiness Probes for ETRAI Backend Server
 */

'use strict';

const os = require('os');
const { checkDatabaseHealth } = require('../utils/prisma');
const { getProviderStatus } = require('../services/providerManager');
const { activeJobs } = require('../services/sseManager');

const startTime = Date.now();

/**
 * Liveness Probe: GET /api/v1/health
 * Fast check confirming the Node.js process is active and accepting requests.
 */
const getHealthStatus = (req, res) => {
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  const memoryUsage = process.memoryUsage();

  return res.status(200).json({
    status: 'ok',
    service: 'ETRAI API Backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptimeSeconds,
    env: (process.env.NODE_ENV || 'development').toLowerCase(),
    system: {
      platform: process.platform,
      nodeVersion: process.version,
      memoryRssMb: Math.round(memoryUsage.rss / 1024 / 1024),
      memoryHeapUsedMb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      freeMemMb: Math.round(os.freemem() / 1024 / 1024)
    }
  });
};

/**
 * Readiness Probe: GET /api/v1/health/ready
 * Deep dependency check testing Database connectivity and AI provider configurations.
 */
const getReadinessStatus = async (req, res) => {
  const dbHealth = await checkDatabaseHealth();
  const providers = getProviderStatus();

  const isReady = dbHealth.healthy;
  const statusCode = isReady ? 200 : 503;

  return res.status(statusCode).json({
    ready: isReady,
    status: isReady ? 'READY' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    checks: {
      database: {
        status: dbHealth.healthy ? 'UP' : 'DOWN',
        latencyMs: dbHealth.latencyMs,
        message: dbHealth.message
      },
      geminiProvider: {
        configured: providers.geminiConfigured,
        model: providers.geminiModel,
        status: providers.geminiConfigured ? 'CONFIGURED' : 'NOT_CONFIGURED'
      },
      serperProvider: {
        configured: providers.serperConfigured,
        status: providers.serperConfigured ? 'CONFIGURED' : 'NOT_CONFIGURED'
      },
      concurrency: {
        activeJobsCount: activeJobs ? activeJobs.size : 0
      }
    }
  });
};

module.exports = {
  getHealthStatus,
  getReadinessStatus
};
