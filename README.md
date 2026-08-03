# ETRAI — AI Fact-Checking & Content Verification Platform

A multi-agent AI verification platform built with **React**, **Node.js/Express**, **PostgreSQL (Prisma)**, **OpenAI GPT-4o**, and **Serper Web Search API**.

---

## 📌 Project Overview

**ETRAI** is an AI-powered verification engine designed to combat misinformation, audit financial/business claims, and assess media credibility. Users can submit content via **URL**, **file upload** (`.pdf`, `.docx`, `.txt`), or **pasted text**. The application processes documents through a sequential **4-Agent Pipeline**, streams real-time progress to the frontend via **Server-Sent Events (SSE)**, and presents per-category scores, claim evidence links, and executive AI recommendations.

---

## 🛠️ Technology Stack

- **Frontend:** React 18, Vite, Tailwind CSS, Recharts (visualizations), Lucide React (icons), React Router DOM v6
- **Backend:** Node.js, Express.js
- **Database:** PostgreSQL with Prisma ORM (includes in-memory fallback for local dev without active Postgres instance)
- **Authentication:** JSON Web Tokens (JWT) stored in `httpOnly` cookies with bcrypt password hashing
- **AI Agent Pipeline:** OpenAI GPT-4o (structured JSON mode & claim extraction)
- **Web Search Engine:** Serper API (Google Search API filtered by trusted news/fact-check domains)
- **Document Parsers:** `pdf-parse` (PDF), `mammoth` (DOCX), native UTF-8 string reading (`.txt`)
- **Real-Time Streaming:** Server-Sent Events (SSE) with 15s keep-alive heartbeat comments
- **Monorepo Structure:** `/frontend` and `/backend` with unified root scripts

---

## 🚀 Setup & Local Installation

### Prerequisites
- Node.js (v18 or higher)
- npm or pnpm
- (Optional) PostgreSQL database instance

### 1. Environment Configuration
Copy `.env.example` to `backend/.env`:

```bash
cp .env.example backend/.env
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
JWT_SECRET=etrai_super_secret_jwt_key_2026_change_in_production
JWT_EXPIRES_IN=7d

# Third-Party AI & Web Search API Keys
OPENAI_API_KEY=sk-proj-your_openai_api_key_here
SERPER_API_KEY=your_serper_api_key_here

# Enable Mock Fallback for local testing if API keys are unconfigured
ALLOW_MOCK_FALLBACK=true
```

### 2. Install Dependencies & Generate Prisma Client

```bash
# Generate Prisma Client
npm run prisma:generate

# Install Backend Dependencies
cd backend && npm install

# Install Frontend Dependencies
cd ../frontend && npm install
```

### 3. Run Development Servers

**Option A: Run Backend & Frontend Separately**

```bash
# Terminal 1: Start Backend Server (Port 5000)
cd backend && npm run dev

# Terminal 2: Start Frontend App (Port 5173)
cd frontend && npm run dev
```

**Option B: Run via Root Scripts**

```bash
# From repository root
npm run dev:backend
npm run dev:frontend
```

- **Frontend Application:** `http://localhost:5173`
- **Backend API Base:** `http://localhost:5000/api/v1`
- **Health Check Endpoint:** `http://localhost:5000/api/v1/health`

---

## 🏗️ Architecture Explanation

```
[ User Input (URL / File / Text) ]
             │
             ▼
    [ Express API Layer ] ── (JWT / Cookie Auth)
             │
             ▼
   [ 4-Agent AI Pipeline ] ── (SSE Progress Stream: 20% ➔ 45% ➔ 75% ➔ 90% ➔ 100%)
   ├── Agent 1: Content Reader (Text Extraction & 12k Token Truncation)
   ├── Agent 2: Claim Extractor (GPT-4o Structured Assertion Filtering, Max 25 Claims)
   ├── Agent 3: Fact Verification Agent (Serper Search API + Trusted Domain Filters)
   └── Agent 4: Report Generator (Per-Category Scoring & Executive AI Summary)
             │
             ▼
[ PostgreSQL / Memory DB ] ── (Saved Reports & History Drill-down)
```

### Key Architectural Decisions:
1. **Plain Sequential Backend Execution:** The pipeline runs as pure JS functions without agent framework overhead to ensure fast debugging, predictable execution, and minimal memory usage.
2. **Multi-Select Analysis Types:** Users can select 1 to 3 analysis types (`Fact Checking`, `Fake News Detection`, `Business Report Verification`). Each selected type computes its own independent 0–100% score without blending them into a single generic rating.
3. **Resilient Reconnection SSE:** If a browser drops connection during long steps, reconnecting to `/api/v1/verify/stream/:jobId` immediately retrieves current progress without restarting pipeline execution.

---

## 🤖 4-Agent Pipeline Workflow

| Agent | Module | Behavior & Responsibilities |
|---|---|---|
| **Agent 1: Content Reader** | `inputReader.js` | Parses URLs (with Google Cache paywall/blocked fallback), PDF documents (`pdf-parse`), DOCX files (`mammoth`), and raw text. Enforces 35-word minimums and applies 12,000-token (~48,000 character) truncation guardrails. |
| **Agent 2: Claim Extractor** | `claimExtractor.js` | Uses GPT-4o to extract verifiable factual claims, dates, and quantitative figures. Strictly capped at **top 25 claims**. |
| **Agent 3: Fact Verification Agent** | `factVerifier.js` | Queries Serper Search API for each claim against trusted domain filters (`reuters.com`, `apnews.com`, `bbc.com`, `factcheck.org`, `snopes.com`, `.gov`, `.edu`). Labels claims as **`Verified`**, **`Suspicious`** (unverifiable defaults here), or **`False`**. Attaches clickable source links with snippets. |
| **Agent 4: Report Generator** | `reportGenerator.js` | Calculates category trust scores (0-100%), formats Recharts pie chart payloads, and generates executive AI summaries and recommendations. |

---

## 📡 API Endpoint Documentation

### 1. Authentication Endpoints (`/api/v1/auth`)

#### `POST /api/v1/auth/signup`
- **Description:** Registers a new user account.
- **Request Body:**
  ```json
  {
    "email": "user@example.com",
    "password": "securepassword123"
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "success": true,
    "user": { "id": "uuid", "email": "user@example.com" },
    "token": "jwt_token_string"
  }
  ```

#### `POST /api/v1/auth/login`
- **Description:** Authenticates user and sets HTTP-only `token` cookie.
- **Request Body:**
  ```json
  {
    "email": "user@example.com",
    "password": "securepassword123"
  }
  ```
- **Response (200 OK):** Sets `token` cookie.

#### `POST /api/v1/auth/logout`
- **Description:** Clears session cookie.

#### `GET /api/v1/auth/me` *(Protected)*
- **Description:** Fetches authenticated user profile.

---

### 2. Verification Endpoints (`/api/v1/verify`)

#### `POST /api/v1/verify/analyze` *(Protected)*
- **Description:** Submits content for multi-agent verification analysis. Supports JSON body (for URL/Text) or `multipart/form-data` (for File uploads).
- **Request Body (JSON):**
  ```json
  {
    "inputType": "TEXT",
    "text": "Pasted text containing at least 35 words for verification...",
    "selectedTypes": ["FACT_CHECKING", "BUSINESS_REPORT"]
  }
  ```
- **Response (202 Accepted):**
  ```json
  {
    "success": true,
    "jobId": "job_1722672000000_abc123",
    "status": "PROCESSING",
    "streamUrl": "/api/v1/verify/stream/job_1722672000000_abc123"
  }
  ```

#### `GET /api/v1/verify/stream/:jobId`
- **Description:** Server-Sent Events (SSE) stream emitting live stage updates (`20%` ➔ `45%` ➔ `75%` ➔ `90%` ➔ `100%`) with keep-alive heartbeats.

---

### 3. Reports & History Endpoints (`/api/v1/reports`)

#### `GET /api/v1/reports` *(Protected)*
- **Description:** Retrieves the user's historical analysis summary list.

#### `GET /api/v1/reports/:id` *(Protected)*
- **Description:** Retrieves full analysis report details (claims, evidence links, per-category scores, AI summary).

#### `DELETE /api/v1/reports/:id` *(Protected)*
- **Description:** Deletes a report from user history.

---

## 🧪 Testing

Run all test suites:

```bash
# Auth Integration Tests
node backend/tests/runAuthTests.js

# Input Reader & Validation Tests
node backend/tests/runInputReaderTests.js

# 4-Agent Pipeline Integration Tests
node backend/tests/runPipelineTests.js
```

---

## 📄 License
MIT License. Built for the ETRAI AI Verification Platform.
