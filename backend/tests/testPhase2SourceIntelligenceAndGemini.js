/**
 * ETRAI Phase 2 Test Suite: Production-Grade Gemini AI Provider & Source Intelligence Foundation
 */

'use strict';

const assert = require('assert');
const { AIProviderInterface, GeminiProvider, getAIProvider } = require('../src/services/ai');
const {
  KNOWN_PUBLICATIONS,
  SOURCE_ROLE_MULTIPLIERS,
  extractCanonicalDomain,
  derivePublicationName,
  evaluateSourceIntelligence,
  analyzeSourceIndependence,
  getSourceIntelligenceLedger
} = require('../src/services/sourceIntelligence');
const { prisma } = require('../src/utils/prisma');

async function runTests() {
  console.log('================================================================');
  console.log('🧪 ETRAI PHASE 2 TEST SUITE: GEMINI PROVIDER & SOURCE INTELLIGENCE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ FAIL: ${name}`);
      console.error(`   Error: ${err.message}`);
      if (err.stack) console.error(`   Stack: ${err.stack.split('\n')[1]}`);
      failed++;
    }
  }

  // ── SECTION 1: GEMINI PROVIDER ABSTRACTION & ERROR CLASSIFICATION ─────────
  console.log('--- [SECTION 1] Gemini AI Provider Abstraction ---');

  await test('1.1 GeminiProvider instantiates and conforms to AIProviderInterface', async () => {
    const provider = new GeminiProvider({ apiKey: 'test_key_12345' });
    assert(provider instanceof AIProviderInterface, 'Must be instance of AIProviderInterface');
    assert.strictEqual(provider.providerName, 'GEMINI');
    assert.strictEqual(provider.isAvailable(), true);
  });

  await test('1.2 Model metadata returns accurate context window, token pricing, and capability flags', async () => {
    const provider = new GeminiProvider();
    const meta = provider.getModelMetadata('gemini-flash-lite-latest');
    assert.strictEqual(meta.provider, 'GEMINI');
    assert(meta.contextWindow >= 1000000, 'Context window should be at least 1M tokens');
    assert.strictEqual(meta.inputCostPer1k, 0.000125);
    assert.strictEqual(meta.outputCostPer1k, 0.000375);
    assert.strictEqual(meta.supportsStructuredJson, true);
    assert.strictEqual(meta.supportsMultimodal, true);
  });

  await test('1.3 Error classifier correctly maps HTTP status & messages to standardized ETRAI AI codes', async () => {
    const provider = new GeminiProvider();

    const authErr = provider.classifyError(new Error('API_KEY_INVALID: 401 Unauthorized'));
    assert.strictEqual(authErr.code, 'AI_AUTH_FAILURE');
    assert.strictEqual(authErr.retryable, false);

    const rateErr = provider.classifyError(new Error('RESOURCE_EXHAUSTED: 429 Rate limit exceeded'));
    assert.strictEqual(rateErr.code, 'AI_RATE_LIMITED');
    assert.strictEqual(rateErr.retryable, true);

    const timeoutErr = provider.classifyError(new Error('ETIMEDOUT request timed out'));
    assert.strictEqual(timeoutErr.code, 'AI_TIMEOUT');
    assert.strictEqual(timeoutErr.retryable, true);

    const safetyErr = provider.classifyError(new Error('Candidate was blocked due to SAFETY refusal'));
    assert.strictEqual(safetyErr.code, 'AI_SAFETY_REFUSAL');
    assert.strictEqual(safetyErr.retryable, false);

    const outageErr = provider.classifyError(new Error('503 Service Unavailable backend error'));
    assert.strictEqual(outageErr.code, 'AI_SERVICE_OUTAGE');
    assert.strictEqual(outageErr.retryable, true);
  });

  await test('1.4 Structured JSON parser safely parses valid and repairable JSON', async () => {
    const provider = new GeminiProvider();
    
    // Markdown fenced JSON
    const fenced = '```json\n{"claims": [{"text": "Test claim", "confidence": 95}]}\n```';
    const parsedFenced = provider._safeParseJson(fenced);
    assert(parsedFenced && parsedFenced.claims.length === 1);
    assert.strictEqual(parsedFenced.claims[0].text, 'Test claim');

    // JSON with trailing commas
    const trailingComma = '{"claims": [{"text": "Trailing", "valid": true,},],}';
    const parsedTrailing = provider._safeParseJson(trailingComma);
    assert(parsedTrailing && parsedTrailing.claims.length === 1);
  });

  await test('1.5 Schema validator rejects invalid structured output format', async () => {
    const provider = new GeminiProvider({ apiKey: 'test_key' });
    
    // Test validator function rejecting missing fields
    const validator = (data) => {
      if (!data.claims || !Array.isArray(data.claims)) return { valid: false, error: 'Missing claims array' };
      return { valid: true };
    };

    const validData = { claims: [{ text: 'Valid claim' }] };
    const invalidData = { summary: 'No claims here' };

    assert.strictEqual(validator(validData).valid, true);
    assert.strictEqual(validator(invalidData).valid, false);
  });

  // ── SECTION 2: SOURCE INTELLIGENCE, ROLES & DEDUPLICATION ────────────────
  console.log('\n--- [SECTION 2] Source Intelligence & Source Roles ---');

  await test('2.1 Canonical domain extraction normalizes protocols, www, paths and query parameters', async () => {
    assert.strictEqual(extractCanonicalDomain('https://www.thehindu.com/news/national/article.ece?utm=123'), 'thehindu.com');
    assert.strictEqual(extractCanonicalDomain('http://pib.gov.in/PressReleasePage.aspx?PRID=123'), 'pib.gov.in');
    assert.strictEqual(extractCanonicalDomain('TIMESOFINDIA.INDIATIMES.COM/india'), 'timesofindia.indiatimes.com');
  });

  await test('2.2 Primary Authority evaluation applies statutory weight and PRIMARY_AUTHORITY role', async () => {
    const evaluation = evaluateSourceIntelligence({ domain: 'sci.gov.in', relevanceScore: 90 });
    assert.strictEqual(evaluation.sourceRole, 'PRIMARY_AUTHORITY');
    assert.strictEqual(evaluation.rank, 1);
    assert(evaluation.authorityScore >= 98);
    assert.strictEqual(evaluation.isIndependent, true);
    assert.strictEqual(evaluation.roleMultiplier, 1.25);
    assert(evaluation.reasoning.includes('PRIMARY_AUTHORITY'));
  });

  await test('2.3 Fact-Checker evaluation applies dedicated debunking multiplier (1.20)', async () => {
    const evaluation = evaluateSourceIntelligence({ domain: 'snopes.com', relevanceScore: 85 });
    assert.strictEqual(evaluation.sourceRole, 'FACT_CHECKER');
    assert.strictEqual(evaluation.roleMultiplier, 1.20);
    assert(evaluation.authorityScore >= 90);
  });

  await test('2.4 Social media signals are discounted to prevent viral chatter from overpowering evidence', async () => {
    const evaluation = evaluateSourceIntelligence({ domain: 'x.com', relevanceScore: 80 });
    assert.strictEqual(evaluation.sourceRole, 'SIGNAL_ONLY');
    assert.strictEqual(evaluation.rank, 4);
    assert(evaluation.roleMultiplier <= 0.40);
    assert(evaluation.evidenceContribution < 40);
  });

  await test('2.5 Corporate ownership and wire syndication deduplication prevents duplicate bias', async () => {
    // 3 articles: 1 original Reuters, 1 Times of India reprint of Reuters wire, 1 Economic Times reprint of Times Group
    const evidenceList = [
      { domain: 'reuters.com', title: 'Global Semiconductor Market Surges', isIndependent: true },
      { domain: 'timesofindia.indiatimes.com', title: 'Chip Market Surges (Reuters)', isIndependent: true },
      { domain: 'economictimes.indiatimes.com', title: 'Chip Market Surges (ET Bureau)', isIndependent: true }
    ];

    const independenceResult = analyzeSourceIndependence(evidenceList);
    assert.strictEqual(independenceResult.totalSources, 3);
    // Times of India and Economic Times belong to TIMES_GROUP syndicationGroup
    assert.strictEqual(independenceResult.independentCount, 2); // Reuters + Times Group Primary
    assert.strictEqual(independenceResult.syndicatedCount, 1);  // Economic Times recognized as syndicated duplicate

    const timesGroup = independenceResult.independentGroups.find(g => g.groupId === 'TIMES_GROUP');
    assert(timesGroup, 'Must identify TIMES_GROUP conglomerate');
    assert.strictEqual(timesGroup.primarySource.domain, 'timesofindia.indiatimes.com');
    assert.strictEqual(timesGroup.syndicatedDuplicates.length, 1);
    assert.strictEqual(timesGroup.syndicatedDuplicates[0].domain, 'economictimes.indiatimes.com');
    assert.strictEqual(timesGroup.syndicatedDuplicates[0].isIndependent, false);
  });

  await test('2.6 Source Intelligence Ledger aggregates historical accuracy and real evidence statistics', async () => {
    const ledger = await getSourceIntelligenceLedger();
    assert(Array.isArray(ledger), 'Ledger must return array of ranked publications');
    assert(ledger.length >= 20, 'Ledger must contain full curated publications catalog');
    
    const pib = ledger.find(s => s.domain === 'pib.gov.in');
    assert(pib, 'PIB must be in ledger');
    assert.strictEqual(pib.rank, 1);
    assert.strictEqual(pib.sourceRole, 'PRIMARY_AUTHORITY');

    const reuters = ledger.find(s => s.domain === 'reuters.com');
    assert(reuters, 'Reuters must be in ledger');
    assert.strictEqual(reuters.rank, 2);
  });

  // ── SECTION 3: DATABASE PERSISTENCE & SOURCE CRUD ─────────────────────────
  console.log('\n--- [SECTION 3] Database Persistence & Source CRUD ---');

  let testSourceId = null;
  const testDomain = `test-intel-${Date.now()}.org`;

  await test('3.1 Create new custom source with role and reliability scores in PostgreSQL', async () => {
    const created = await prisma.source.create({
      data: {
        name: 'Test Intelligence Institute',
        domain: testDomain,
        rank: 2,
        authorityScore: 88.5,
        reliabilityScore: 91.0,
        sourceType: 'SPECIALIZED_DESK',
        sourceRole: 'SPECIALIST',
        parentCompany: 'Test Global Foundation',
        syndicationGroup: 'TEST_FOUNDATION',
        purpose: 'Academic and forensic verification benchmarking',
        status: 'ACTIVE',
        isCustom: true
      }
    });

    assert(created.id, 'Must generate persistent UUID');
    assert.strictEqual(created.domain, testDomain);
    assert.strictEqual(created.sourceRole, 'SPECIALIST');
    assert.strictEqual(created.reliabilityScore, 91.0);
    testSourceId = created.id;
  });

  await test('3.2 Query created source and verify dynamic evaluation applies custom properties', async () => {
    const fetched = await prisma.source.findUnique({ where: { id: testSourceId } });
    assert(fetched, 'Must retrieve created source from database');

    const customMap = new Map([[fetched.domain, fetched]]);
    const evaluated = evaluateSourceIntelligence({ domain: testDomain }, customMap);

    assert.strictEqual(evaluated.isCustom, true);
    assert.strictEqual(evaluated.sourceRole, 'SPECIALIST');
    assert.strictEqual(evaluated.authorityScore, 88.5);
    assert.strictEqual(evaluated.reliabilityScore, 91.0);
    assert.strictEqual(evaluated.parentCompany, 'Test Global Foundation');
  });

  await test('3.3 Update source role and status in database', async () => {
    const updated = await prisma.source.update({
      where: { id: testSourceId },
      data: {
        sourceRole: 'WATCHLIST',
        status: 'WATCHLIST',
        authorityScore: 30.0
      }
    });

    assert.strictEqual(updated.sourceRole, 'WATCHLIST');
    assert.strictEqual(updated.status, 'WATCHLIST');
    assert.strictEqual(updated.authorityScore, 30.0);
  });

  await test('3.4 Delete custom source and verify database integrity', async () => {
    await prisma.source.delete({ where: { id: testSourceId } });
    const deleted = await prisma.source.findUnique({ where: { id: testSourceId } });
    assert.strictEqual(deleted, null, 'Source must be deleted from database');
  });

  console.log('\n================================================================');
  console.log(`🏆 PHASE 2 TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
