# ETRAI — Database Scaling & PostgreSQL Migration Guide

This document outlines the architecture, evaluation criteria, and safe non-destructive migration pathway from single-node SQLite to high-concurrency PostgreSQL.

---

## 1. Single-Instance vs Multi-Instance Architecture

### SQLite WAL Mode (Current Single-Instance Deployment)
- **Engine**: SQLite with Write-Ahead Logging (`PRAGMA journal_mode = WAL;`) and synchronous normal mode (`PRAGMA synchronous = NORMAL;`).
- **Concurrency**: High single-node read throughput with serial write queuing. Handled reliably by SQLite's 5000ms busy timeout.
- **Appropriate For**:
  - Single VM (EC2, Droplet, Hetzner, Bare Metal)
  - Single container with persistent local SSD / Docker volume mount (`etrai_data`)
  - Workloads up to 50 concurrent active users / 500 verification jobs per hour.
- **Limitations**:
  - Cannot scale horizontally across multiple instances / Kubernetes replica pods sharing a network filesystem (NFS, EFS) due to SQLite file locking constraints.

---

## 2. When to Migrate to PostgreSQL
Migrate when:
1. Scaling ETRAI across 2+ backend application instances (Kubernetes Deployments, ECS Clustered Tasks, PM2 Cluster on multiple physical hosts).
2. Requiring distributed database replicas, read-pools, point-in-time recovery (PITR), or managed cloud databases (AWS RDS, Google Cloud SQL, Supabase, Neon).

---

## 3. Step-by-Step Safe PostgreSQL Migration

### Step 1: Create a Full SQLite WAL Snapshot
Before initiating migration, create a verifiable SQLite backup:
```bash
node -e "require('./backend/src/utils/backup').createDatabaseBackup('pre_postgres_migration')"
```

### Step 2: Provision PostgreSQL Database
Ensure a PostgreSQL 14+ database is provisioned and accessible:
```sql
CREATE DATABASE etrai_prod;
CREATE USER etrai_user WITH ENCRYPTED PASSWORD 'YourStrongPassword';
GRANT ALL PRIVILEGES ON DATABASE etrai_prod TO etrai_user;
```

### Step 3: Update Prisma Schema & Generate Client
In `backend/prisma/schema.prisma`:
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

In `backend/.env`:
```env
DATABASE_URL="postgresql://etrai_user:YourStrongPassword@postgres-host:5432/etrai_prod?schema=public"
```

Run schema deployment:
```bash
cd backend
npx prisma db push
npx prisma generate
```

### Step 4: Data Transfer (SQLite -> PostgreSQL)
Export records from SQLite JSON snapshot or use standard migration tools:
```bash
# Export from SQLite
npx prisma db pull
```

### Step 5: Verify Production Readiness Probe
Confirm that the backend connects and queries PostgreSQL:
```bash
curl http://localhost:5000/api/v1/health/ready
```
Expected response:
```json
{
  "status": "UP",
  "ready": true,
  "checks": {
    "database": {
      "status": "UP",
      "type": "postgresql/mysql",
      "latencyMs": 5
    }
  }
}
```
