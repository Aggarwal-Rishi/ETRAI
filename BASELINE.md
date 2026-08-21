# ETRAI Project Baseline Assessment

**Date:** 2026-08-12  
**Repository:** `Aggarwal-Rishi/ETRAI`  
**Branch:** `main` (Up to date with `origin/main`)

---

## 1. Current Git Status

- **Branch State:** `main` branch.
- **Staged Changes:** 33 files (modified services, controllers, docs, tests, and frontend components).
- **Unstaged Changes:** 18 files (`.gitignore`, services, controllers, routes, pages).
- **Untracked Files:** 11 files (service extensions `articleResearch.js`, `correctionsService.js`, and test scripts/fixtures in `backend/tests/`).
- **`.gitignore` Audit:** Updated to explicitly ignore `.env`, `backend/.env`, `node_modules`, SQLite database files (`*.db`, `backend/prisma/dev.db`), temporary uploads (`uploads/`), generated media (`sample_reports/`), and Vite build artifacts (`vite.config.js.timestamp*`).

---

## 2. Current Build Status

- **Frontend Build (`npm run build:frontend`):** **PASSED**
  - Tool: Vite v5.4.21
  - Output artifacts: `dist/index.html` (1.06 kB), `dist/assets/index-C2-naCJ2.css` (32.13 kB), `dist/assets/index-DenEWtNJ.js` (633.70 kB).
- **Backend Syntax Check (`node --check`):** **PASSED**
  - All `.js` files in `backend/src/` passed syntax validation with 0 errors.

---

## 3. Current Test Status

- **`npm test` (`runAuthTests.js`):** **11 PASSED, 0 FAILED**
  - Verifies signup, login, password validation, JWT HTTP-only cookies, protected `/me` endpoints, and logout.
- **`runInputReaderTests.js`:** **4 PASSED, 1 FAILED**
  - **Failing Test:** `Short text (<15 words) returns error` (Expected `status === 400`, received `undefined`).
- **`runPipelineTests.js`:** **4 PASSED, 1 FAILED**
  - **Failing Test:** `Agent 3 (Fact Verifier) verifies claims with strict grounding` (Fails on mock URL status validation fallback check and foreign key constraint handling during test user runs).

---

## 4. Known Runtime / Configuration Problems

1. **Missing API Keys in `backend/.env`:**
   - `OPENAI_API_KEY` and `SERPER_API_KEY` are not configured in `backend/.env`.
   - The application relies on heuristic fallback claim extraction (`extractMockClaims`), mock search hits, and rule-based summary generation.
2. **Database Provider & Schema Discrepancy:**
   - `.env.example` documents PostgreSQL (`postgresql://...`), whereas `backend/.env` and `backend/prisma/schema.prisma` use SQLite (`provider = "sqlite"`, `DATABASE_URL="file:./dev.db"`).

---

## 5. Current Database Provider

- **SQLite** (`DATABASE_URL="file:./dev.db"` using Prisma ORM v5.10.0).

---

## 6. Available AI / Search Providers

- **OpenAI GPT-4o:** Configured in code (`gpt-4o`, structured JSON mode), active when `OPENAI_API_KEY` is present.
- **Serper Web Search API:** Configured in code (`https://google.serper.dev/search`), active when `SERPER_API_KEY` is present.
- **VADER Sentiment Analyzer:** Local Node module (`vader-sentiment`), operational without external API keys.

---

## 7. Current Media Support Status

- **Text & Web Content:** Fully supported (Direct pasted text, URLs via `node-fetch` + Google Web Cache fallback).
- **Documents:** Fully supported (`.pdf` via `pdf-parse`, `.docx` via `mammoth`, `.txt` via UTF-8 buffer parsing).
- **Photo & Video:** Basic UI selection tabs (`PHOTO`, `VIDEO`) and preprocessor context string wrappers exist in `NewAnalysisPage.jsx` and `inputReader.js`, but computer vision OCR and deepfake analysis pipelines are not implemented.
