# ETRAI — Enterprise AI Content Verification & Intelligence Platform

A high-assurance, multimodal verification and investigative intelligence engine built with **React**, **Node.js/Express**, **PostgreSQL (Prisma)**, **Google Gemini (`@google/genai`)**, and **Serper News & Web Search API**.

---

## 📌 Platform Overview

**ETRAI** is an enterprise verification engine designed to detect misinformation, audit assertions, and evaluate media integrity with complete evidence-first transparency. Users can submit content via **URL**, **file upload** (`.pdf`, `.docx`, `.png`, `.jpg`, `.mp4`, `.mp3`, `.txt`), or **pasted text**. 

The platform processes inputs through a sequential **Multi-Agent Pipeline**, streams real-time progress via **Server-Sent Events (SSE)**, calculates explainable deterministic scores, generates a **20-Section Investigation Dossier**, and outputs authentic **PDF/JSON/CSV exports**.

---

## 🛠️ Technology Stack

- **Frontend:** React 18, Vite, Lucide React, Recharts, Custom Tailwind/Midnight CSS System
- **Backend:** Node.js, Express.js
- **Database:** PostgreSQL with Prisma ORM (full relational persistence across analyses, claims, evidence, entities, and audit events)
- **Authentication & RBAC:** JWT with `httpOnly` cookies, hashed API keys (`etrai_live_...`), and role-based permissions (`OWNER`, `CREATOR`, `REVIEWER`, `READER`)
- **AI Agent Pipeline:** Google Gemini 2.5 (`@google/genai`) with prompt-injection isolation boundaries
- **Search & Ingestion:** Serper News & Web Search API with domain intelligence, source ranking, and syndication deduplication
- **Media & Document Forensics:**
  - *Images:* EXIF/TIFF extraction, 64-bit dHash perceptual hashing, C2PA Content Credentials, ELA (Error Level Analysis), and copy-move forgery detection
  - *Documents:* PDF incremental update XREF tampering, embedded `/JS` detection, DOCX revision history & template verification
  - *Video/Audio:* MP4 atom container parsing, shot cut boundary detection, audio waveform RMS energy & splice jump analysis
- **Export Formats:** Pure binary `%PDF-1.4`, RFC 4180 CSV, sanitized JSON, and 32-byte cryptographic share tokens

---

## 🚀 Setup & Local Installation

### Prerequisites
- Node.js (v18 or higher)
- npm or pnpm
- PostgreSQL database instance

### 1. Environment Configuration
Copy `.env.example` to `backend/.env`:

```bash
cp backend/.env.example backend/.env
```

Ensure `backend/.env` contains the required environment variables:

```env
# Server Configuration
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173

# Database Connection (PostgreSQL)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/etrai_db?schema=public

# Authentication Secrets
JWT_SECRET=etrai_super_secret_jwt_key_2026_production
JWT_EXPIRES_IN=7d

# Third-Party AI & Web Search API Keys
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-flash-lite-latest
SERPER_API_KEY=your_serper_api_key_here
SERPAPI_API_KEY=your_serpapi_api_key_here
GOOGLE_VISION_API_KEY=your_google_vision_api_key_here
```

`GOOGLE_VISION_API_KEY` must belong to a Google Cloud project with billing enabled and the Cloud Vision API (`vision.googleapis.com`) enabled. Restrict the key to the Cloud Vision API and keep it in `backend/.env`; never expose it to the frontend.

`SERPAPI_API_KEY` enables transient image upload and Google Lens exact-match retrieval. It is a different service from `SERPER_API_KEY`. Keep both keys backend-only.

### 2. Install Dependencies & Generate Prisma Client

```bash
# Backend setup
cd backend
npm install
npx prisma generate
npx prisma db push

# Frontend setup
cd ../frontend
npm install
```

### 3. Run Development Servers

```bash
# Terminal 1: Backend Server (Port 5000)
cd backend && npm start

# Terminal 2: Frontend App (Port 5173)
cd frontend && npm run dev
```

- **Frontend Application:** `http://localhost:5173`
- **Backend API Base:** `http://localhost:5000/api/v1`
- **Health Check Endpoint:** `http://localhost:5000/api/v1/health`

---

## 🧪 Testing & Verification

Execute the complete automated test suites:

```bash
# Master Production Hardening & End-to-End Audit (14 Test Suites)
node backend/tests/testProductionHardeningEndToEnd.js

# SaaS Workspaces, RBAC, Webhooks & Quota Ledger (Phase 9)
node backend/tests/testPhase9SaaSWorkspaceLayer.js

# Product Dashboard, Monitoring & Narrative Clustering (Phase 8)
node backend/tests/testPhase8WorkspaceInvestigationProduct.js

# Investigation Lifecycle, 20-Section Dossier & PDF/CSV Export (Phase 7)
node backend/tests/testPhase7InvestigationReportSystem.js

# Media & Document Forensics (Phase 6)
node backend/tests/testPhase6MediaDocumentIntelligence.js

# Provenance, Spread Graph & Entity Intelligence (Phase 5)
node backend/tests/testPhase5ProvenanceSpreadEntityIntelligence.js
```

---

## 🔒 Security Guardrails

1. **SSRF Guard (`ssrfGuard.js`)**: Prohibits requests to loopback (`127.0.0.1`), private networks (`10.0.0.0/8`, `192.168.0.0/16`), and AWS/cloud metadata services (`169.254.169.254`).
2. **Prompt-Injection Defense**: Wraps all untrusted content in `<UNTRUSTED_CONTENT>` delimiters with strict system prompt boundaries.
3. **Magic Byte & Bomb Verification**: Validates file headers for PNG, JPEG, WEBP, TIFF, PDF, DOCX, WAV, MP3, MP4, and rejects zip bombs $>100$MB.
4. **Tenant Isolation**: Direct database scoping prevents cross-workspace Insecure Direct Object References (IDOR).
