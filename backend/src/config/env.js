/**
 * ETRAI Centralized Production Environment Configuration & Validation
 */

'use strict';

const path = require('path');
const fs = require('fs');

// Ensure .env is loaded
const envPath = path.resolve(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
    }
  }
}

const nodeEnv = (process.env.NODE_ENV || 'development').toLowerCase();
const isProduction = nodeEnv === 'production';
const isDevelopment = nodeEnv === 'development';
const isTest = nodeEnv === 'test';

const config = {
  env: nodeEnv,
  isProduction,
  isDevelopment,
  isTest,
  port: parseInt(process.env.PORT || '5000', 10),
  databaseUrl: process.env.DATABASE_URL || 'file:./dev.db',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET || 'etrai_default_dev_secret_change_in_production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: (process.env.GEMINI_MODEL || 'gemini-flash-lite-latest').trim()
  },
  serper: {
    apiKey: process.env.SERPER_API_KEY || ''
  },
  limits: {
    maxConcurrentJobs: parseInt(process.env.MAX_CONCURRENT_JOBS || '10', 10),
    maxSearchQueriesPerClaim: parseInt(process.env.MAX_SEARCH_QUERIES_PER_CLAIM || '4', 10),
    pipelineTimeoutMs: parseInt(process.env.PIPELINE_TIMEOUT_MS || '120000', 10),
    maxUploadSizeMb: parseInt(process.env.MAX_UPLOAD_SIZE_MB || '50', 10),
    rateLimits: {
      generalRpm: parseInt(process.env.RATE_LIMIT_GENERAL_RPM || '150', 10),
      authRpm: parseInt(process.env.RATE_LIMIT_AUTH_RPM || '30', 10),
      verifyRpm: parseInt(process.env.RATE_LIMIT_VERIFY_RPM || '25', 10)
    }
  }
};

/**
 * Validates the runtime configuration against environment constraints
 */
function validateConfig() {
  const errors = [];
  const warnings = [];

  if (isProduction) {
    if (!config.jwtSecret || config.jwtSecret.includes('default') || config.jwtSecret.length < 32) {
      errors.push('JWT_SECRET must be set to a strong, unique secret (at least 32 characters) in production mode.');
    }
    if (!config.gemini.apiKey) {
      warnings.push('GEMINI_API_KEY is not set. Agents 1-4 will run in deterministic fallback mode.');
    }
    if (!config.serper.apiKey) {
      warnings.push('SERPER_API_KEY is not set. Agent 3 web retrieval will run in fallback mode.');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Returns a sanitized configuration summary safe for logging and health checks
 */
function getSanitizedConfigSummary() {
  return {
    env: config.env,
    port: config.port,
    databaseType: config.databaseUrl.startsWith('file:') ? 'sqlite' : 'postgresql/mysql',
    clientUrl: config.clientUrl,
    geminiConfigured: Boolean(config.gemini.apiKey && config.gemini.apiKey.length > 5),
    geminiModel: config.gemini.model,
    serperConfigured: Boolean(config.serper.apiKey && config.serper.apiKey.length > 5)
  };
}

module.exports = {
  config,
  validateConfig,
  getSanitizedConfigSummary
};
