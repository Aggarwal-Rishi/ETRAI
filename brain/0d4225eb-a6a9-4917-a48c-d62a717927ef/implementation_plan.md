# Implementation Plan: Comprehensive 10-Category Adversarial Test Suite

This plan details the creation of a comprehensive, rigorous adversarial test suite in `backend/tests/runAdversarialTestSuite.js` to rigorously prove ETRAI's fact-checking integrity, dynamic evidence evaluation, media forensic architecture, security posture, and strict anti-hardcoding adherence.

## User Review Required

> [!IMPORTANT]
> **Adversarial Test Suite Directives**:
> 1. **10 Critical Test Categories**:
>    - **Category 1 — Provider Integrity**: OpenAI unavailable, Serper unavailable, both unavailable, real providers, mock provider mode. Proves zero synthetic/fake evidence fallbacks.
>    - **Category 2 — Evidence Stance**: Exact support, exact contradiction, unrelated result, same entity/different event, same event/different date, same event/different location, copied sources, neutral sources.
>    - **Category 3 — False News (Unseen Fabricated Stories)**: Completely new fabricated stories NOT present in existing benchmarks (`"ZenoTech announced anti-gravity elevators in April 2026"`). Must be evaluated by LLM/fuzzy engine, not hardcoded regexes.
>    - **Category 4 — True News (Grounded Real Articles)**: Verification of genuine public factual claims against corroborating sources, recording claim, sources, stance, final verdict, and confidence.
>    - **Category 5 — No Evidence (Zero Web Coverage)**: Regional/Local claims with zero web search hits (`"City X council approved a 5% local water tax"`). Proves zero coverage yields `UNVERIFIED`/`SUSPICIOUS`, NEVER automatically `FALSE`/`FABRICATED`.
>    - **Category 6 — Partial Accuracy**: Evaluates claims with mixed factual components (`"Company X announced $20B in 2026"` vs evidence `"Company X announced $10B in 2025"`). Proves output yields `PARTIALLY_VERIFIED`.
>    - **Category 7 — Media (Photo & Video)**:
>      - *Photo*: Real photo, photo with text, with/without EXIF metadata, manipulated-looking image, unavailable reverse search, false caption vs correct caption.
>      - *Video*: Video with/without speech, visible text, misleading caption, old video presented as new, incorrect location claim, incorrect event claim.
>    - **Category 8 — Score Consistency**: Verifies single canonical scoring engine agreement across overall verdict, factual accuracy score, and claim confidence.
>    - **Category 9 — Security & SSRF**: Unauthorized report access, unauthorized SSE stream access, SSRF URLs (localhost, private subnets, cloud metadata), malformed uploads, >50MB oversized files, invalid media types, malicious filenames.
>    - **Category 10 — No-Hardcoding Audit**: Greps production source (`backend/src/`) for benchmark names (`rishi aggarwal`, `bought the sun`), fake news test phrases, fake Reuters/BBC/factcheck URLs, fixed confidence hacks (`92.5%`), or hardcoded entity verdicts. Any occurrence fails the test suite.
> 2. **Summary Report Breakdown**:
>    Outputs a comprehensive summary containing:
>    - TOTAL TESTS
>    - PASSED / FAILED / SKIPPED
>    - REAL API TESTS / MOCK TESTS / SECURITY TESTS / MEDIA TESTS
>    - Representative evidence for every critical test assertion.

---

## Proposed Changes

### Test Automation

#### [NEW] [runAdversarialTestSuite.js](file:///c:/Users/acer/.gemini/antigravity-ide/scratch/etrai/backend/tests/runAdversarialTestSuite.js)
- Implements all 10 adversarial test categories.
- Performs automated grep audit on production source (`backend/src/`).
- Outputs detailed diagnostic evidence and category summary table.

---

## Verification Plan

### Automated Tests
- Run `node tests/runAdversarialTestSuite.js` in `backend` directory.
- Verify 100% pass rate with zero hardcoding audit failures.
- Verify security, media, stance, partial accuracy, and provider integrity tests pass with explicit evidence logs.
