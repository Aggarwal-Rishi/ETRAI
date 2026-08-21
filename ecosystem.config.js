/**
 * ETRAI PM2 Production Process Management Configuration
 */

module.exports = {
  apps: [
    {
      name: 'etrai-server',
      script: './src/server.js',
      cwd: './backend',
      instances: 1, // Single instance for SQLite WAL concurrency; use 'max' for PostgreSQL
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000
      },
      kill_timeout: 10000,
      listen_timeout: 10000
    }
  ]
};
