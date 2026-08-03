# ETRAI — AI Fact-Checking & Verification Platform

A multi-agent AI verification platform built with **React**, **Node.js/Express**, **PostgreSQL (Prisma)**, **OpenAI GPT-4o**, and **Serper Web Search API**.

---

## 🚀 Key Features

1. **Multi-Modal Input Handling:** Submit Webpage URLs (with paywall/blocked fallback), Document Files (`.pdf`, `.docx`, `.txt`), or Pasted Text (minimum 35 words required).
2. **Multi-Select Analysis Types:**
   - **Fact Checking:** Verify claims against trusted news and research sources.
   - **Fake News Detection:** Identify clickbait, emotional loading, manipulation patterns, and source credibility.
   - **Business Report Verification:** Audit numerical data, financial figures, dates, and official filings.
3. **4-Agent Pipeline (Sequential Execution):**
   - **Agent 1 – Content Reader:** Text extraction & cleaning with token truncation guardrails.
   - **Agent 2 – Claim Extractor:** Identifies top claims (capped at 25 claims).
   - **Agent 3 – Fact Verification Agent:** Queries Serper Search API against trusted domains (`reuters.com`, `apnews.com`, `bbc.com`, `factcheck.org`, `snopes.com`, `.gov`, `.edu`) and labels claims as `Verified`, `Suspicious`, or `False`.
   - **Agent 4 – Report Generator:** Compiles per-category scores, Recharts payload, clickable source links, and AI executive summary.
4. **Real-Time Progress Streaming (SSE):** Pushes step-by-step progress updates (`20%` -> `45%` -> `75%` -> `90%` -> `100%`) with keep-alive heartbeats.
5. **Full History & Drilling Down:** Past analyses saved with complete claims, evidence, and scores stored in database history.

---

## 📂 Repository Monorepo Structure

```
etrai/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma         # Postgres models (User, Analysis) & Enums
│   ├── src/
│   │   ├── controllers/          # authController, verifyController, reportsController
│   │   ├── middleware/           # authMiddleware, uploadMiddleware (Multer)
│   │   ├── routes/               # /api/v1/auth, /verify, /reports, /health
│   │   ├── services/             # 4-Agent Pipeline & SSE Manager
│   │   │   ├── inputReader.js           # Agent 1
│   │   │   ├── claimExtractor.js        # Agent 2
│   │   │   ├── factVerifier.js          # Agent 3
│   │   │   ├── reportGenerator.js       # Agent 4
│   │   │   ├── verificationPipeline.js  # Orchestrator
│   │   │   └── sseManager.js            # SSE Streams & Heartbeats
│   │   └── server.js
│   └── tests/                    # runAuthTests.js, runInputReaderTests.js, runPipelineTests.js
├── frontend/
│   ├── src/
│   │   ├── components/           # Navbar.jsx
│   │   ├── context/              # AuthContext.jsx
│   │   ├── pages/                # Login, Signup, Dashboard, NewAnalysis, Results, History
│   │   ├── App.jsx & main.jsx
│   └── vite.config.js & tailwind.config.js
├── sample_reports/               # Real sample verification JSON reports
│   ├── sample_report_1.json
│   └── sample_report_2.json
├── agent_flow_diagram.html       # Standalone Interactive SVG Agent Flow Diagram
├── .env.example
├── package.json
└── README.md
```

---

## ⚙️ Environment Configuration

Copy `.env.example` to `backend/.env`:

```env
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173

# Database Connection (PostgreSQL)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/etrai_db?schema=public

# Authentication
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRES_IN=7d

# API Keys
OPENAI_API_KEY=sk-proj-your_openai_api_key_here
SERPER_API_KEY=your_serper_api_key_here

# Enable Mock Fallback for local testing without API keys / DB offline
ALLOW_MOCK_FALLBACK=true
```

---

## 🛠️ Running Locally

### 1. Install Dependencies
```bash
# Root monorepo
npm run prisma:generate

# Backend
cd backend && npm install

# Frontend
cd frontend && npm install
```

### 2. Start Backend Development Server
```bash
cd backend
npm run dev
```
*Backend API Server:* `http://localhost:5000`  
*Health Check:* `http://localhost:5000/api/v1/health`

### 3. Start Frontend Development Server
```bash
cd frontend
npm run dev
```
*Frontend Application:* `http://localhost:5173`

---

## 🧪 Running Automated Tests

```bash
# Run Auth Integration Tests
node backend/tests/runAuthTests.js

# Run Input Reader (Agent 1) Unit Tests
node backend/tests/runInputReaderTests.js

# Run 4-Agent Pipeline Integration Tests
node backend/tests/runPipelineTests.js
```

---

## 📊 Interactive Agent Flow Diagram

Open `agent_flow_diagram.html` in any web browser to view the interactive SVG-based Agent Flow Diagram, complete with node hover effects, animated pipeline indicators, and detailed prompt logic popups.

---

## 📡 API Endpoints Summary

| Method | Endpoint | Description | Protected |
|---|---|---|---|
| `POST` | `/api/v1/auth/signup` | User registration | No |
| `POST` | `/api/v1/auth/login` | User authentication & JWT cookie | No |
| `POST` | `/api/v1/auth/logout` | Clear authentication cookie | Yes |
| `GET` | `/api/v1/auth/me` | Current user profile | Yes |
| `POST` | `/api/v1/verify/analyze` | Submit URL, File, or Text for analysis | Yes |
| `GET` | `/api/v1/verify/stream/:jobId` | SSE Real-time progress updates | No |
| `GET` | `/api/v1/reports` | List user's analysis history | Yes |
| `GET` | `/api/v1/reports/:id` | Fetch full report details | Yes |
| `DELETE` | `/api/v1/reports/:id` | Delete history item | Yes |

---

## 📄 License
MIT License. Built for ETRAI AI Verification Platform MVP.
