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
