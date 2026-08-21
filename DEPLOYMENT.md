# ETRAI — Production Deployment & Operations Guide

This guide details how to deploy, configure, and maintain the **ETRAI Fact-Checking & AI Verification Platform** in production environments.

---

## 1. System Architecture

```
                      +-----------------------------+
                      |   Client Web Browser (SPA)  |
                      |   React 18 + Vite + Tailwind|
                      +--------------+--------------+
                                     |
                          HTTPS / SSE Stream
                                     |
                      +--------------v--------------+
                      |    Nginx / Cloudflare CDN   |
                      | (SSL Termination & Caching) |
                      +--------------+--------------+
                                     |
                                 Reverse Proxy
                                     |
                      +--------------v--------------+
                      |    ETRAI Express Backend    |
                      |   Node.js 18+ Process       |
                      +-------+--------------+------+
                              |              |
           +------------------+              +------------------+
           |                                                    |
+----------v-----------+                             +----------v-----------+
| Google Gemini API    |                             | Serper Search API    |
| (Agent 2 Extraction) |                             | (Agent 3 Retrieval)  |
+----------------------+                             +----------------------+
           |                                                    |
           +------------------+              +------------------+
                              |              |
                      +-------v--------------v------+
                      |      Prisma ORM Layer       |
                      |   SQLite / PostgreSQL DB    |
                      +-----------------------------+
```

---

## 2. Environment Variables Reference

All production settings are configured via environment variables. Copy `.env.example` to `.env` in the `backend/` directory.

| Variable | Description | Required | Default / Example |
|---|---|---|---|
| `PORT` | Backend HTTP listening port | No | `5000` |
| `NODE_ENV` | Environment mode (`production`, `development`, `test`) | Yes | `production` |
| `DATABASE_URL` | Database connection URI (Prisma) | Yes | `"file:./dev.db"` (SQLite) or `"postgresql://..."` |
| `JWT_SECRET` | Secret key for signing session tokens (min 32 chars) | Yes | 64-char random hex string |
| `JWT_EXPIRES_IN` | Session token validity duration | No | `7d` |
| `CLIENT_URL` | Frontend URL allowed for CORS | Yes | `https://your-domain.com` |
| `GEMINI_API_KEY` | Google Gemini API key for Agent 2 | Yes | `AIzaSy...` |
| `GEMINI_MODEL` | Gemini Model ID | No | `gemini-flash-lite-latest` |
| `SERPER_API_KEY` | Serper Google Search API key for Agent 3 | Yes | `3900b9...` |
| `OPENAI_API_KEY` | Optional OpenAI key for auxiliary fallbacks | No | `sk-...` |

---

## 3. Database Deployment Options

### Option A: Single-Node Deployment (SQLite with WAL mode)
The default setup uses SQLite with Write-Ahead Logging (`WAL`) and a 5000ms busy timeout enabled automatically.
- **Best For**: Small to medium deployments, single VM / container with persistent disk volume.
- **Limitation**: Cannot be scaled horizontally across multiple instances sharing a network filesystem.

### Option B: Multi-Node Scalable Deployment (PostgreSQL)
To scale ETRAI across multiple worker nodes or Kubernetes pods:
1. Update `backend/prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
2. Set `DATABASE_URL="postgresql://user:password@db-host:5432/etrai?schema=public"` in `backend/.env`.
3. Run migrations:
   ```bash
   npx prisma migrate deploy
   ```

---

## 4. Production Build & Start Commands

### Backend
```bash
cd backend
npm ci --only=production
npx prisma generate
node src/server.js
```

### Frontend (Static SPA Build)
```bash
cd frontend
npm ci
npm run build
# Output in frontend/dist/ can be served by Nginx, Caddy, or Cloudflare Pages
```

---

## 5. Process Management with PM2

For resilient production execution with automatic restarts and clustering:

### `ecosystem.config.js`
```javascript
module.exports = {
  apps: [
    {
      name: 'etrai-backend',
      script: './src/server.js',
      cwd: './backend',
      instances: 1, // Keep 1 for SQLite; use 'max' for PostgreSQL
      autorestart: true,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 5000
      }
    }
  ]
};
```

### PM2 Commands
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

---

## 6. Health & Readiness Monitoring

ETRAI exposes standard Kubernetes / cloud probe endpoints:

### Liveness Probe
```http
GET /api/v1/health
```
- Returns `200 OK` with uptime, memory RSS/heap stats, and system platform.

### Readiness Probe
```http
GET /api/v1/health/ready
```
- Performs live database ping and verifies AI provider configurations.
- Returns `200 OK` (`ready: true`) when all systems are operational, or `503 Service Unavailable` if database is down.

---

## 7. Security Hardening Checklist

- [x] **SSRF Protection**: All ingested URLs and reverse search requests pass through `ssrfGuard.js`, rejecting loopback (`127.0.0.1`), private subnets (`10.0.0.0/8`, `192.168.0.0/16`), and AWS metadata (`169.254.169.254`).
- [x] **Rate Limiting**: Sliding window rate limiter enforces 150 req/min for general API, 30 req/min for auth, and 25 req/min for verification jobs.
- [x] **File Size & Type Bounds**: Multer enforces 50MB max file size with magic-byte and MIME validation.
- [x] **Secret Redaction**: `PipelineLogger` and status endpoints recursively redact API keys, JWT tokens, and passwords from telemetry logs.
- [x] **Search Engine Isolation**: SERP URLs (`google.com/search`, `bing.com/search`) are explicitly filtered from evidence citation trees.
- [x] **Security Headers**: Standard HTTP headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1; mode=block`, `Strict-Transport-Security`) applied to all responses.
