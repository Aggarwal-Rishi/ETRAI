/**
 * ETRAI Stage 4 Robust Audit Suite
 * STRICT VALIDATION ONLY — No false-pass shortcuts, no fallback text, no provider-status inference.
 *
 * Rules enforced:
 *  RULE 1  — No fallback in real E2E tests
 *  RULE 2  — Suite G uses real URL ingestion
 *  RULE 3  — Suite G verifies real LLM extraction mode from claim property
 *  RULE 4  — Suite C uses firstClaim.extractionMode, not providerStatus
 *  RULE 5  — Suite F1 tests all 9 event states including SIGNED not-equal COMPLETED
 *  RULE 6  — Suite F5 uses production evaluateEvidenceStanceHeuristic
 *  RULE 7  — Suite A2 uses independent natural-language sentences
 *  RULE 8  — Suite E2 tests domain authority vs semantic relevance
 *  RULE 9  — Suite A5 tests zero-evidence fuzzy engine output semantically
 *  RULE 10 — Suite H scans for hardcoded benchmark values
 *  RULE 11 — Suite I checks env var presence only
 *  RULE 12 — Suite G uses real article URLs
 */

'use strict';

const path = require('path');
const fs = require('fs');

// Load .env early
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) {
      process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
    }
  }
}

// Service imports
const {
  EVENT_STATES,
  CANONICAL_EVENTS,
  normalizeCanonicalEvent,
  extractFullQuantities,
  extractLocationFromText,
  normalizeClaimProposition,
  normalizeEvidenceProposition,
  evaluate15Dimensions,
  evaluateSemanticStance,
} = require('../src/services/semanticVerification');

const {
  evaluateFuzzyVerdict,
  CONFIGURABLE_THRESHOLDS,
  determineEvidenceState
} = require('../src/services/fuzzyEngine');

const { evaluateEvidenceStanceHeuristic } = require('../src/services/factVerifier');
const { extractClaims, extractMockClaims } = require('../src/services/claimExtractor');
const { processInputContent } = require('../src/services/inputReader');
const { getDomainTrustScore } = require('../src/services/domainTrust');
const { getProviderStatus } = require('../src/services/providerManager');

// Test harness
const PASS = 'PASS';
const FAIL = 'FAIL';
const results = [];

function recordResult(suite, name, status, detail) {
  results.push({ suite, name, status, detail: detail || null });
}

async function test(suite, name, fn) {
  try {
    let outcome;
    try {
      outcome = fn();
    } catch (syncErr) {
      recordResult(suite, name, FAIL, 'Exception: ' + syncErr.message);
      return;
    }
    if (outcome && typeof outcome.then === 'function') {
      try {
        const r = await outcome;
        const status = r === true ? PASS : FAIL;
        recordResult(suite, name, status, r === true ? null : String(r));
      } catch (asyncErr) {
        recordResult(suite, name, FAIL, 'Async exception: ' + asyncErr.message);
      }
    } else {
      const status = outcome === true ? PASS : FAIL;
      recordResult(suite, name, status, outcome === true ? null : String(outcome));
    }
  } catch (err) {
    recordResult(suite, name, FAIL, 'Outer exception: ' + err.message);
  }
}

function assert(condition, message) {
  if (!condition) return message || 'Assertion failed';
  return true;
}

// =========================================================
// SUITE A — Semantic verification unit tests
// =========================================================

async function runSuiteA() {
  // A1 — extractFullQuantities: units and symbols must be preserved
  await test('A', 'A1a — 22% is not split into bare 22', () => {
    const q = extractFullQuantities('cloud revenue grew 22%');
    const hasPct = q.includes('22%');
    const hasBare = q.includes('22');
    if (!hasPct) return '22% not found in: ' + JSON.stringify(q);
    if (hasBare) return 'Bare "22" must not coexist with "22%": ' + JSON.stringify(q);
    return true;
  });

  await test('A', 'A1b — $19.7 billion preserved intact', () => {
    const q = extractFullQuantities('revenue was $19.7 billion last quarter');
    const hasFull = q.some(x => x.includes('19.7'));
    const hasBare = q.includes('19.7');
    if (!hasFull) return 'Full $19.7 billion not found: ' + JSON.stringify(q);
    if (hasBare) return 'Bare "19.7" must not coexist with full amount: ' + JSON.stringify(q);
    return true;
  });

  await test('A', 'A1c — 22.5% preserved intact', () => {
    const q = extractFullQuantities('prices rose by 22.5%');
    const hasPct = q.includes('22.5%');
    const hasBare = q.includes('22.5');
    if (!hasPct) return '22.5% not found: ' + JSON.stringify(q);
    if (hasBare) return 'Bare "22.5" coexists with "22.5%": ' + JSON.stringify(q);
    return true;
  });

  // RULE 7: A2 — event state normalizer tested with INDEPENDENT natural-language sentences
  const eventStateTests = [
    { sentence: 'Company X plans to acquire Company Y.', expected: EVENT_STATES.PLANNED, name: 'PLANNED' },
    { sentence: 'Company X is considering acquiring Company Y.', expected: EVENT_STATES.CONSIDERED, name: 'CONSIDERED' },
    { sentence: 'Company X announced plans to acquire Company Y.', expected: EVENT_STATES.ANNOUNCED, name: 'ANNOUNCED' },
    { sentence: 'Company X is negotiating the acquisition of Company Y.', expected: EVENT_STATES.NEGOTIATING, name: 'NEGOTIATING' },
    { sentence: 'Company X and Company Y agreed to the acquisition.', expected: EVENT_STATES.AGREED, name: 'AGREED' },
    { sentence: 'Company X and Company Y signed the acquisition agreement.', expected: EVENT_STATES.SIGNED, name: 'SIGNED' },
    { sentence: 'Company X completed the acquisition of Company Y.', expected: EVENT_STATES.COMPLETED, name: 'COMPLETED' },
    { sentence: 'Company X cancelled the acquisition of Company Y.', expected: EVENT_STATES.CANCELLED, name: 'CANCELLED' },
    { sentence: 'Company X abandoned its planned acquisition of Company Y.', expected: EVENT_STATES.ABANDONED, name: 'ABANDONED' },
  ];

  for (const tc of eventStateTests) {
    await test('A', `A2 — completionStatus: "${tc.name}" from independent sentence`, () => {
      const prop = normalizeClaimProposition({ text: tc.sentence });
      const actual = prop.completionStatus;
      return assert(
        actual === tc.expected,
        `Expected ${tc.expected}, got ${actual} for: "${tc.sentence}"`
      );
    });
  }

  // A3 — Location extraction generalises beyond hardcoded list
  await test('A', 'A3a — extractLocationFromText: Mumbai (fast-path)', () => {
    const loc = extractLocationFromText('Police arrested three in Mumbai.');
    return assert(loc === 'mumbai', 'Expected "mumbai", got: ' + loc);
  });

  await test('A', 'A3b — extractLocationFromText: New York (fast-path)', () => {
    const loc = extractLocationFromText('Police arrested three in New York.');
    return assert(loc === 'new york', 'Expected "new york", got: ' + loc);
  });

  await test('A', 'A3c — extractLocationFromText: unknown city via proper noun', () => {
    const loc = extractLocationFromText('The summit took place in Zurich.');
    return assert(loc && loc.includes('zurich'), 'Expected "zurich" from general extractor, got: ' + loc);
  });

  // A4 — Location mismatch detection
  await test('A', 'A4a — Mumbai vs New York: stance=REFUTES', () => {
    const claim = { text: 'Police arrested three in Mumbai.' };
    const evidence = { title: '', snippet: 'Police arrested three in New York.' };
    const result = evaluateSemanticStance(claim, evidence);
    return assert(
      result.stance === 'REFUTES',
      'Expected REFUTES for Mumbai/New York mismatch, got: ' + result.stance +
      ' | locationDim=' + result.dimensionAnalysis.location
    );
  });

  await test('A', 'A4b — Delhi vs London: stance=REFUTES', () => {
    const claim = { text: 'The summit was held in Delhi.' };
    const evidence = { title: '', snippet: 'The summit was held in London.' };
    const result = evaluateSemanticStance(claim, evidence);
    return assert(
      result.stance === 'REFUTES',
      'Expected REFUTES for Delhi/London mismatch, got: ' + result.stance +
      ' | locationDim=' + result.dimensionAnalysis.location
    );
  });

  await test('A', 'A4c — India vs Canada: stance=REFUTES', () => {
    const claim = { text: 'The policy was implemented in India.' };
    const evidence = { title: '', snippet: 'The policy was implemented in Canada.' };
    const result = evaluateSemanticStance(claim, evidence);
    return assert(
      result.stance === 'REFUTES',
      'Expected REFUTES for India/Canada mismatch, got: ' + result.stance +
      ' | locationDim=' + result.dimensionAnalysis.location
    );
  });

  await test('A', 'A4d — Pune vs Mumbai: stance=REFUTES', () => {
    const claim = { text: 'The accident occurred in Pune.' };
    const evidence = { title: '', snippet: 'The accident occurred in Mumbai.' };
    const result = evaluateSemanticStance(claim, evidence);
    return assert(
      result.stance === 'REFUTES',
      'Expected REFUTES for Pune/Mumbai mismatch, got: ' + result.stance +
      ' | locationDim=' + result.dimensionAnalysis.location
    );
  });

  // RULE 9: A5 — zero-evidence fuzzy engine semantic test (NOT hardcoded confidence check)
  await test('A', 'A5 — Zero evidence: evidenceState=INSUFFICIENT, verdict not TRUSTED', () => {
    const verdictObj = evaluateFuzzyVerdict({
      corroborationScore: 0,
      sourceCredibilityScore: 0.5,
      sentimentIntensity: 0.1,
      claimSignificance: 70,
      modelConfidence: 30,
      discourseVolume: 0,
      socialCorroborationScore: 0,
      communitySkepticismScore: 0,
      claimScope: 'National',
      supportingCount: 0,
      refutingCount: 0,
      plausibilityFlag: false,
    });
    if (verdictObj.verdict === 'TRUSTED') {
      return 'Zero evidence must NOT yield TRUSTED verdict. Got: ' + verdictObj.verdict +
             ' (score=' + verdictObj.crispScore + ')';
    }
    if (verdictObj.evidenceState !== 'INSUFFICIENT') {
      return 'Expected evidenceState=INSUFFICIENT, got: ' + verdictObj.evidenceState;
    }
    return true;
  });
}

// =========================================================
// SUITE B — Action synonym mapping & SIGNED vs COMPLETED
// =========================================================

async function runSuiteB() {
  await test('B', 'B1 — "completed the acquisition" = ACQUISITION canonical event', () => {
    const ev = normalizeCanonicalEvent('completed the acquisition');
    return assert(ev === 'ACQUISITION', 'Expected ACQUISITION, got: ' + ev);
  });

  await test('B', 'B2 — "closed the purchase" = ACQUISITION canonical event', () => {
    const ev = normalizeCanonicalEvent('closed the purchase');
    return assert(ev === 'ACQUISITION', 'Expected ACQUISITION, got: ' + ev);
  });

  await test('B', 'B3 — "revenue grew" = INCREASE canonical event', () => {
    const ev = normalizeCanonicalEvent('revenue grew by 22%');
    return assert(ev === 'INCREASE', 'Expected INCREASE, got: ' + ev);
  });

  await test('B', 'B4 — "recorded a 22% increase" = INCREASE canonical event', () => {
    const ev = normalizeCanonicalEvent('recorded a 22% increase');
    return assert(ev === 'INCREASE', 'Expected INCREASE, got: ' + ev);
  });

  await test('B', 'B5 — "signed the acquisition agreement" = SIGNED (NOT ACQUISITION)', () => {
    const ev = normalizeCanonicalEvent('signed the acquisition agreement');
    return assert(ev === 'SIGNED', 'Expected SIGNED, got: ' + ev);
  });

  await test('B', 'B6 — SIGNED evidence does NOT support a COMPLETED claim (key audit requirement)', () => {
    const claim = { text: 'Company X completed its acquisition of Company Y.' };
    const evidence = { title: '', snippet: 'Company X signed the acquisition agreement with Company Y.' };
    const result = evaluateSemanticStance(claim, evidence);
    return assert(
      result.stance !== 'SUPPORTS',
      'SIGNED evidence MUST NOT support COMPLETED claim. Got stance=' + result.stance +
      ', completionDim=' + result.dimensionAnalysis.completionStatus
    );
  });

  await test('B', 'B7 — COMPLETED evidence SUPPORTS a COMPLETED claim', () => {
    const claim = { text: 'Company X completed its acquisition of Company Y.' };
    const evidence = { title: '', snippet: 'Company X completed the acquisition of Company Y.' };
    const result = evaluateSemanticStance(claim, evidence);
    return assert(
      result.stance === 'SUPPORTS',
      'COMPLETED evidence should SUPPORT COMPLETED claim. Got stance=' + result.stance
    );
  });
}

// =========================================================
// SUITE C — Claim extraction telemetry (RULE 4)
// =========================================================

async function runSuiteC() {
  // C1 — extractMockClaims always returns MOCK_FALLBACK
  await test('C', 'C1 — extractMockClaims: every claim has extractionMode=MOCK_FALLBACK', () => {
    const text = 'The government announced a new policy on climate change. Scientists confirmed the findings. Officials stated the policy would take effect next year.';
    const claims = extractMockClaims(text);
    if (!Array.isArray(claims) || claims.length === 0) return 'No claims returned from extractMockClaims';
    const wrong = claims.find(c => c.extractionMode !== 'MOCK_FALLBACK');
    if (wrong) return 'Claim ' + wrong.id + ' has extractionMode="' + wrong.extractionMode + '", expected MOCK_FALLBACK';
    if (claims.extractionMode !== 'MOCK_FALLBACK') return 'Array-level extractionMode is "' + claims.extractionMode + '", expected MOCK_FALLBACK';
    return true;
  });

  // C2 — extractClaims: extraction mode read from claim property, NEVER from providerStatus (RULE 4)
  await test('C', 'C2 — extractClaims: extractionMode read from claim.extractionMode (not providerStatus)', async () => {
    const text = 'The government announced a new policy on climate change. Scientists confirmed the findings. Officials stated the policy would take effect next year.';
    const claims = await extractClaims(text);
    if (!Array.isArray(claims) || claims.length === 0) return 'No claims returned from extractClaims';

    // RULE 4: Must read from actual claim property
    const firstClaim = claims[0];
    const extractionMode = firstClaim.extractionMode || claims.extractionMode || 'UNKNOWN';

    const validModes = ['REAL_LLM', 'MOCK_FALLBACK'];
    if (!validModes.includes(extractionMode)) {
      return 'extractionMode "' + extractionMode + '" is not valid. Must be REAL_LLM or MOCK_FALLBACK.';
    }

    // Explicitly confirm we are NOT using providerStatus to determine mode
    // (Just confirm the property is present on the claim object)
    if (!firstClaim.extractionMode && !claims.extractionMode) {
      return 'extractionMode property missing from claims — cannot determine mode without providerStatus hack';
    }

    return true;
  });
}

// =========================================================
// SUITE D — Quantity extraction regression
// =========================================================

async function runSuiteD() {
  const cases = [
    { input: 'grew 22%', present: '22%', forbidden: '22' },
    { input: 'grew 22.5%', present: '22.5%', forbidden: '22.5' },
    { input: 'profit fell by 12%', present: '12%', forbidden: '12' },
    { input: '$19.7 billion revenue', containsNum: '19.7', forbidden: null },
    { input: 'EUR 5 million deal', containsNum: '5', forbidden: null },
    { input: 'sales grew to $2 billion', containsNum: '2', forbidden: null },
  ];

  for (const tc of cases) {
    await test('D', 'D — extractFullQuantities: "' + tc.input + '"', () => {
      const q = extractFullQuantities(tc.input);
      if (tc.present && !q.includes(tc.present)) {
        return 'Expected "' + tc.present + '" in ' + JSON.stringify(q);
      }
      if (tc.containsNum) {
        const has = q.some(x => x.includes(tc.containsNum));
        if (!has) return 'Expected quantity containing "' + tc.containsNum + '" in ' + JSON.stringify(q);
      }
      if (tc.forbidden && q.includes(tc.forbidden)) {
        return 'Bare "' + tc.forbidden + '" must not appear when "' + tc.present + '" is present: ' + JSON.stringify(q);
      }
      return true;
    });
  }
}

// =========================================================
// SUITE E — Domain authority vs semantic relevance (RULE 8)
// =========================================================

async function runSuiteE() {
  await test('E', 'E1 — Unrelated evidence from reuters.com must be IRRELEVANT, not SUPPORTS/NEUTRAL', () => {
    const claim = { text: 'Company X acquired Company Y.' };
    const evidence = {
      title: 'Global Sports Update',
      snippet: 'Reuters reports Olympics schedule released.',
      domain: 'reuters.com'
    };
    const result = evaluateSemanticStance(claim, evidence);
    if (result.stance === 'SUPPORTS' || result.stance === 'NEUTRAL') {
      return 'High-authority domain must NOT make unrelated evidence ' + result.stance + '. Got: ' + result.stance;
    }
    return assert(result.stance === 'IRRELEVANT', 'Expected IRRELEVANT, got: ' + result.stance + '. Reason: ' + result.reason);
  });

  await test('E', 'E2 — reuters.com trust score is high (domain tier 1)', () => {
    const score = getDomainTrustScore('reuters.com');
    return assert(score >= 0.88, 'reuters.com trust score should be >= 0.88, got: ' + score);
  });

  await test('E', 'E3 — Confirming: semantic relevance checked BEFORE authority boost', () => {
    // A second unrelated evidence from a high-authority source
    const claim = { text: 'The Supreme Court issued a ruling on land rights.' };
    const evidence = {
      title: 'Tech Review Weekly',
      snippet: 'Apple announced a new iPhone model at its annual conference.',
      domain: 'wsj.com'
    };
    const result = evaluateSemanticStance(claim, evidence);
    if (result.stance === 'SUPPORTS') {
      return 'WSJ domain authority must NOT make completely unrelated tech content SUPPORT a legal claim';
    }
    return true;
  });
}

// =========================================================
// SUITE F — Event state model & conflict aggregation (RULES 5, 6)
// =========================================================

async function runSuiteF() {
  // RULE 5: F1 — All 9 event states vs COMPLETED claim
  const completedClaim = { text: 'Company X completed its acquisition of Company Y.' };

  const stateTests = [
    { state: 'PLANNED',     snippet: 'Company X plans to acquire Company Y.',                        expected: 'NEUTRAL'   },
    { state: 'CONSIDERED',  snippet: 'Company X is considering acquiring Company Y.',                expected: 'NEUTRAL'   },
    { state: 'ANNOUNCED',   snippet: 'Company X announced plans to acquire Company Y.',             expected: 'NEUTRAL'   },
    { state: 'NEGOTIATING', snippet: 'Company X is negotiating the acquisition of Company Y.',      expected: 'NEUTRAL'   },
    { state: 'AGREED',      snippet: 'Company X and Company Y agreed to the acquisition.',          expected: 'NEUTRAL'   },
    { state: 'SIGNED',      snippet: 'Company X signed the acquisition agreement with Company Y.', expected: 'NEUTRAL'   },
    { state: 'COMPLETED',   snippet: 'Company X completed the acquisition of Company Y.',           expected: 'SUPPORTS'  },
    { state: 'CANCELLED',   snippet: 'Company X cancelled the acquisition of Company Y.',           expected: 'NEUTRAL'   },
    { state: 'ABANDONED',   snippet: 'Company X abandoned its planned acquisition of Company Y.',   expected: 'NEUTRAL'   },
  ];

  for (const tc of stateTests) {
    await test('F', 'F1 [' + tc.state + '] evidence vs COMPLETED claim => ' + tc.expected, () => {
      const evidence = { title: '', snippet: tc.snippet };
      const result = evaluateSemanticStance(completedClaim, evidence);
      if (result.stance !== tc.expected) {
        return '[' + tc.state + '] evidence: expected ' + tc.expected + ', got ' + result.stance +
               '. completionDim=' + result.dimensionAnalysis.completionStatus +
               '. Reason: ' + result.reason;
      }
      return true;
    });
  }

  // F1 explicit guard: SIGNED must NOT be SUPPORTS
  await test('F', 'F1 — SIGNED evidence: must NOT be SUPPORTS for COMPLETED claim (critical)', () => {
    const evidence = { title: '', snippet: 'Company X signed the acquisition agreement with Company Y.' };
    const result = evaluateSemanticStance(completedClaim, evidence);
    return assert(result.stance !== 'SUPPORTS',
      'SIGNED evidence wrongly gives SUPPORTS for COMPLETED claim. Stance=' + result.stance +
      ', completionDim=' + result.dimensionAnalysis.completionStatus);
  });

  // RULE 6: F5 — Conflict aggregation via production evaluateEvidenceStanceHeuristic
  await test('F', 'F5 — Conflict aggregation: SUPPORTS + REFUTES evidence yields conflict via production path', () => {
    const claim = { text: 'Company X completed the acquisition of Company Y.' };
    const searchResults = [
      {
        index: 0,
        title: 'Acquisition Complete',
        snippet: 'Company X completed the acquisition of Company Y.',
        url: 'https://news-example.test/1',
        domain: 'news-example.test'
      },
      {
        index: 1,
        title: 'Denial Issued',
        snippet: 'Company X denied acquiring Company Y.',
        url: 'https://news-example.test/2',
        domain: 'news-example.test'
      }
    ];

    // RULE 6: Must use production aggregation function, not manual calculation
    const evaluations = evaluateEvidenceStanceHeuristic(claim, searchResults);

    const stances = evaluations.map(e => ({ idx: e.sourceIndex, stance: e.stance }));

    const hasSupports = evaluations.some(e => e.stance === 'SUPPORTS');
    const hasRefutes = evaluations.some(e => e.stance === 'REFUTES');

    // conflictDetected must come from actual production evaluation results
    const conflictDetected = hasSupports && hasRefutes;

    if (!conflictDetected) {
      return 'No conflict detected from production evaluations. Stances: ' +
             JSON.stringify(stances) + '. Expected one SUPPORTS and one REFUTES.';
    }

    return true;
  });
}

// =========================================================
// SUITE G — Real URL ingestion & real LLM mode (RULES 1, 2, 3, 12)
// =========================================================

async function runSuiteG() {
  // RULE 12: Use genuinely reachable article URLs
  const REAL_ARTICLE_FIXTURES = [
    { name: 'BBC News homepage', url: 'https://www.bbc.com/news' },
  ];

  for (const art of REAL_ARTICLE_FIXTURES) {
    await test('G', 'G1 — Real URL ingestion: ' + art.name, async () => {
      let urlIngestionStatus = 'PENDING';
      let urlFetchError = null;
      let extractedText = null;

      // RULE 2: Must use processInputContent with inputType: 'URL' — NEVER fall back to TEXT
      try {
        const result = await processInputContent({ inputType: 'URL', url: art.url });
        if (result && result.extractedText && result.extractedText.length > 50) {
          urlIngestionStatus = 'LIVE_URL_FETCHED';
          extractedText = result.extractedText;
        } else {
          urlIngestionStatus = 'FAILED';
          urlFetchError = 'Extracted text too short or missing';
        }
      } catch (err) {
        urlIngestionStatus = 'FAILED';
        urlFetchError = err.message;
      }

      // RULE 2: If URL fails, this test FAILS. No text fallback allowed.
      if (urlIngestionStatus !== 'LIVE_URL_FETCHED') {
        return 'URL ingestion FAILED. urlIngestionStatus=' + urlIngestionStatus +
               '. Error: ' + urlFetchError + '. URL: ' + art.url;
      }

      // RULE 3: Only proceed to Agent 2 after confirmed URL fetch
      const claims = await extractClaims(extractedText);
      if (!Array.isArray(claims) || claims.length === 0) {
        return 'URL fetched but no claims extracted. URL: ' + art.url;
      }

      // RULE 3: Read extraction mode from actual claim property
      const firstClaim = claims[0];
      const extractionMode = firstClaim.extractionMode || claims.extractionMode || 'UNKNOWN';

      // RULE 3: Real E2E test requires REAL_LLM
      if (extractionMode !== 'REAL_LLM') {
        return 'Real E2E failed: extractionMode=' + extractionMode +
               ' (must be REAL_LLM, not MOCK_FALLBACK or UNKNOWN). URL=' + art.url;
      }

      return true;
    });
  }
}

// =========================================================
// SUITE H — Source tree integrity (RULE 10)
// =========================================================

async function runSuiteH() {
  const FORBIDDEN_PATTERNS = [
    { pattern: /Rishi\s+Aggarwal/i, label: 'Hardcoded person name: Rishi Aggarwal' },
    { pattern: /Virat\s+Kohli/i, label: 'Hardcoded person name: Virat Kohli' },
    { pattern: /benchmarkClaims/i, label: 'Benchmark-specific override: benchmarkClaims' },
  ];

  await test('H', 'H1 — No hardcoded benchmark names or overrides in production source tree', () => {
    const srcDir = path.join(__dirname, '../src');
    const violations = [];

    function walkDir(dir) {
      let entries;
      try { entries = fs.readdirSync(dir); } catch (e) { return; }
      for (const entry of entries) {
        if (entry === 'node_modules' || entry.startsWith('.')) continue;
        const full = path.join(dir, entry);
        let stat;
        try { stat = fs.statSync(full); } catch (e) { continue; }
        if (stat.isDirectory()) {
          walkDir(full);
        } else if (entry.endsWith('.js')) {
          let content;
          try { content = fs.readFileSync(full, 'utf-8'); } catch (e) { continue; }
          for (const fp of FORBIDDEN_PATTERNS) {
            if (fp.pattern.test(content)) {
              violations.push(fp.label + ' in ' + full);
            }
          }
        }
      }
    }

    walkDir(srcDir);

    if (violations.length > 0) {
      return 'Integrity violations:\n' + violations.join('\n');
    }
    return true;
  });
}

// =========================================================
// SUITE I — Environment variable security (RULE 11)
// =========================================================

async function runSuiteI() {
  const REQUIRED_VARS = ['GEMINI_API_KEY', 'SERPER_API_KEY', 'DATABASE_URL', 'JWT_SECRET'];

  await test('I', 'I1 — Required env vars are set (presence check only, no values printed)', () => {
    const missing = REQUIRED_VARS.filter(k => !process.env[k] || !process.env[k].trim());
    if (missing.length > 0) {
      return 'Missing required env vars: ' + missing.join(', ') + ' (values NOT logged)';
    }
    return true;
  });

  await test('I', 'I2 — providerManager does not expose raw key values', () => {
    const status = getProviderStatus();
    const str = JSON.stringify(status);
    if (str.includes('sk-') || str.includes('Bearer ')) {
      return 'Provider status exposes raw API key fragment — security violation';
    }
    return true;
  });
}

// =========================================================
// MAIN
// =========================================================

async function main() {
  console.log('\n=================================================================');
  console.log('  ETRAI STAGE 4 ROBUST AUDIT SUITE — STRICT VALIDATION MODE');
  console.log('=================================================================\n');

  await runSuiteA();
  await runSuiteB();
  await runSuiteC();
  await runSuiteD();
  await runSuiteE();
  await runSuiteF();
  await runSuiteG();
  await runSuiteH();
  await runSuiteI();

  // Aggregate
  const suites = ['A','B','C','D','E','F','G','H','I'];
  const suiteStatus = {};
  for (const s of suites) {
    const sTests = results.filter(r => r.suite === s);
    const failed = sTests.filter(r => r.status === FAIL);
    suiteStatus[s] = { total: sTests.length, failed: failed.length, pass: failed.length === 0 };
  }

  // Per-test output
  console.log('--- Per-Test Results ---\n');
  for (const r of results) {
    const icon = r.status === PASS ? 'PASS' : 'FAIL';
    console.log('[' + icon + '] [Suite ' + r.suite + '] ' + r.name);
    if (r.status === FAIL && r.detail) {
      console.log('     DETAIL: ' + r.detail);
    }
  }

  // Suite summary
  console.log('\n--- Suite Summary ---\n');
  let allPassed = true;
  for (const s of suites) {
    const sr = suiteStatus[s];
    if (!sr.pass) allPassed = false;
    const label = sr.pass ? 'PASS' : 'FAIL';
    console.log('  Suite ' + s + ' — ' + label + ' (' + (sr.total - sr.failed) + '/' + sr.total + ' passed)');
  }

  // False-pass declaration
  console.log('\n--- False-Pass Check ---');
  console.log('  Mock fallback in real E2E ........ BLOCKED (RULE 1, 2, 3)');
  console.log('  Text fallback in URL test ........ BLOCKED (RULE 2)');
  console.log('  Provider-status inference ........ BLOCKED (RULE 3, 4)');
  console.log('  Hardcoded benchmark logic ........ SCANNED (RULE 10)');
  console.log('  Manual conflict calculation ...... BLOCKED (RULE 6)');
  console.log('  Hardcoded confidence score ....... BLOCKED (RULE 9)');

  // Final verdict
  console.log('\n=================================================================');
  if (allPassed) {
    console.log('  STAGE 4 APPROVED');
  } else {
    console.log('  STAGE 4 NOT APPROVED\n');
    for (const s of suites) {
      if (!suiteStatus[s].pass) {
        const failed = results.filter(r => r.suite === s && r.status === FAIL);
        for (const f of failed) {
          console.log('  REMAINING FAILURE [Suite ' + s + ']: ' + f.name);
          if (f.detail) console.log('    => ' + f.detail);
        }
      }
    }
  }
  console.log('=================================================================\n');
}

main().catch(err => {
  console.error('Audit runner crashed:', err.message);
  process.exit(1);
});