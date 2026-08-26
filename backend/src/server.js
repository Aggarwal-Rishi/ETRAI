// Polyfill process.getBuiltinModule for compatibility across Node.js runtimes (e.g. Railway / Docker)
if (typeof process.getBuiltinModule !== 'function') {
  process.getBuiltinModule = (id) => {
    try {
      return require(id);
    } catch (_) {
      return undefined;
    }
  };
}

const app = require('./app');
const { prisma } = require('./utils/prisma');
const { config, getSanitizedConfigSummary } = require('./config/env');

const PORT = config.port || 5000;

// Global process error handlers to prevent unhandled crashes
process.on('uncaughtException', (err) => {
  console.error('[FATAL UNCAUGHT EXCEPTION]:', err.stack || err.message);
  // In production, keep running if recoverable, or gracefully restart
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED PROMISE REJECTION]:', reason instanceof Error ? reason.stack : reason);
});

const server = app.listen(PORT, () => {
  const summary = getSanitizedConfigSummary();
  console.log(`====================================================`);
  console.log(`🚀 ETRAI Backend Server listening on port ${PORT}`);
  console.log(`🌍 Environment: ${summary.env}`);
  console.log(`📦 Database: ${summary.databaseType}`);
  console.log(`🤖 Gemini Configured: ${summary.geminiConfigured} (${summary.geminiModel})`);
  console.log(`🔍 Serper Configured: ${summary.serperConfigured}`);
  console.log(`🔗 Health Check: http://localhost:${PORT}/api/v1/health`);
  console.log(`====================================================`);

  // Auto-seed demo accounts if user table is empty
  (async () => {
    try {
      if (!prisma || !prisma.user) return;
      const count = await prisma.user.count().catch(() => null);
      if (count === 0) {
        const bcrypt = require('bcryptjs');
        const hash = await bcrypt.hash('Password123!', 10);
        const accounts = [
          { email: 'demo@etrai.io', fullName: 'Demo Analyst', role: 'OWNER', company: 'ETRAI Newsroom' },
          { email: 'admin@etrai.io', fullName: 'ETRAI Administrator', role: 'OWNER', company: 'ETRAI HQ' },
          { email: 'demo@etrai.ai', fullName: 'Demo User', role: 'OWNER', company: 'ETRAI Labs' }
        ];
        for (const acc of accounts) {
          await prisma.user.create({
            data: {
              email: acc.email,
              fullName: acc.fullName,
              passwordHash: hash,
              role: acc.role,
              company: acc.company
            }
          }).catch(() => {});
        }
        console.log('✅ Demo accounts seeded automatically.');
      }
    } catch (err) {
      console.warn('[DB Auto-Seed]:', err.message);
    }
  })();
});

// Graceful Shutdown
function gracefulShutdown(signal) {
  console.log(`\n[Server Shutdown]: Received ${signal}. Starting graceful shutdown...`);
  server.close(async () => {
    console.log('[Server Shutdown]: HTTP server closed.');
    try {
      if (prisma && prisma.$disconnect) {
        await prisma.$disconnect();
        console.log('[Server Shutdown]: Database connections closed.');
      }
    } catch (e) {}
    process.exit(0);
  });

  // Force exit after 10s if connections refuse to close
  setTimeout(() => {
    console.error('[Server Shutdown]: Forcefully terminating process after 10s timeout.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = server;
