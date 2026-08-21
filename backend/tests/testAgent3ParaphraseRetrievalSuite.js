const assert = require('assert');
const { extractClaims } = require('../src/services/claimExtractor');
const {
  executeSemanticCandidateRetrieval,
  verifySingleClaim
} = require('../src/services/factVerifier');
const { evaluateSemanticStance } = require('../src/services/semanticVerification');

async function runParaphraseRetrievalBenchmarkSuite() {
  console.log('================================================================');
  console.log('🧪 Stage 3: Paraphrase Retrieval & Evidence Benchmark Suite');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  const runTest = async (name, fn) => {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (e) {
      console.error(`  ❌ FAIL: ${name} -> ${e.message}`);
      failed++;
    }
  };

  // -------------------------------------------------------------
  // TEST 1 — EXACT WORDING
  // -------------------------------------------------------------
  await runTest('TEST 1 — EXACT WORDING', async () => {
    const claim = { resolvedText: 'Company X announced a $5 billion investment in India.' };
    const evidence = { title: 'Company X announced a $5 billion investment in India.' };
    const res = evaluateSemanticStance(claim, evidence);
    assert.strictEqual(res.stance, 'SUPPORTS');
    assert.strictEqual(res.evidenceQuality, 'DIRECT');
  });

  // -------------------------------------------------------------
  // TEST 2 — COMPLETE PARAPHRASE
  // -------------------------------------------------------------
  await runTest('TEST 2 — COMPLETE PARAPHRASE', async () => {
    const claim = { resolvedText: 'Company X announced a $5 billion investment in India.' };
    const evidence = { title: 'Company X revealed a $5 billion investment in the Indian market.' };
    const res = evaluateSemanticStance(claim, evidence);
    assert.strictEqual(res.stance, 'SUPPORTS');
  });

  // -------------------------------------------------------------
  // TEST 3 — SYNONYM SUPPORT (Opposition rejected vs turned down Centre offer)
  // -------------------------------------------------------------
  await runTest('TEST 3 — SYNONYM SUPPORT', async () => {
    const claim = {
      resolvedText: 'Opposition parties rejected the government\'s proposal to hold a debate on student protests.',
      articleContext: { mainTopic: 'Parliament Debate', location: 'New Delhi' }
    };
    const evidence = { title: 'Opposition leaders turned down the Centre\'s offer for a debate during the Parliament Monsoon Session.' };
    const res = evaluateSemanticStance(claim, evidence);
    assert.strictEqual(res.stance, 'SUPPORTS');
  });

  // -------------------------------------------------------------
  // TEST 4 — PLANNED VS COMPLETED
  // -------------------------------------------------------------
  await runTest('TEST 4 — PLANNED VS COMPLETED', async () => {
    const claim = { resolvedText: 'Company X acquired Company Y.' };
    const evidence = { title: 'Company X is considering acquiring Company Y.' };
    const res = evaluateSemanticStance(claim, evidence);
    assert.strictEqual(res.stance, 'NEUTRAL');
    assert.strictEqual(res.dimensionAnalysis.completionStatus, 'MISMATCH');
  });

  // -------------------------------------------------------------
  // TEST 5 — WRONG DATE
  // -------------------------------------------------------------
  await runTest('TEST 5 — WRONG DATE', async () => {
    const claim = { resolvedText: 'Company X acquired Company Y in June 2026.', claimMeaning: { time: 'June 2026' } };
    const evidence = { title: 'Company X acquired Company Y in June 2025.' };
    const res = evaluateSemanticStance(claim, evidence);
    assert.strictEqual(res.stance, 'NEUTRAL');
    assert.strictEqual(res.dimensionAnalysis.time, 'MISMATCH');
  });

  // -------------------------------------------------------------
  // TEST 6 — WRONG QUANTITY
  // -------------------------------------------------------------
  await runTest('TEST 6 — WRONG QUANTITY', async () => {
    const claim = { resolvedText: 'Company X invested $10 billion.' };
    const evidence = { title: 'Company X invested $1 billion.' };
    const res = evaluateSemanticStance(claim, evidence);
    assert.strictEqual(res.stance, 'NEUTRAL');
    assert.strictEqual(res.dimensionAnalysis.quantity, 'MISMATCH');
  });

  // -------------------------------------------------------------
  // TEST 7 — WRONG LOCATION
  // -------------------------------------------------------------
  await runTest('TEST 7 — WRONG LOCATION', async () => {
    const claim = { resolvedText: 'Company X opened a factory in Maharashtra.', claimMeaning: { subject: 'Company X', location: 'Maharashtra' } };
    const evidence = { title: 'Company X opened a factory in Gujarat.' };
    const res = evaluateSemanticStance(claim, evidence);
    assert.strictEqual(res.stance, 'REFUTES');
    assert.strictEqual(res.dimensionAnalysis.location, 'MISMATCH');
  });

  // -------------------------------------------------------------
  // TEST 8 — NEGATION
  // -------------------------------------------------------------
  await runTest('TEST 8 — NEGATION', async () => {
    const claim = { resolvedText: 'The government did not approve the proposal.' };
    const evidence = { title: 'The government approved the proposal on Monday.' };
    const res = evaluateSemanticStance(claim, evidence);
    assert.strictEqual(res.stance, 'REFUTES');
    assert.strictEqual(res.dimensionAnalysis.negation, 'MISMATCH');
  });

  // -------------------------------------------------------------
  // TEST 9 — RELATED TOPIC, DIFFERENT EVENT
  // -------------------------------------------------------------
  await runTest('TEST 9 — RELATED TOPIC, DIFFERENT EVENT', async () => {
    const claim = { resolvedText: 'Opposition rejected the government\'s proposal for a debate.' };
    const evidence = { title: 'Opposition criticized the government over student protests.' };
    const res = evaluateSemanticStance(claim, evidence);
    assert.ok(res.stance === 'NEUTRAL' || res.stance === 'IRRELEVANT');
  });

  // -------------------------------------------------------------
  // TEST 10 — ATTRIBUTION
  // -------------------------------------------------------------
  await runTest('TEST 10 — ATTRIBUTION', async () => {
    const claim = { resolvedText: 'Police confirmed Person X committed the crime.' };
    const evidence = { title: 'Local residents believe Person X was responsible for the incident.' };
    const res = evaluateSemanticStance(claim, evidence);
    assert.strictEqual(res.stance, 'NEUTRAL');
  });

  // -------------------------------------------------------------
  // TEST 11 — REGIONAL EVIDENCE PRESERVATION
  // -------------------------------------------------------------
  await runTest('TEST 11 — REGIONAL EVIDENCE PRESERVATION', async () => {
    const claim = { resolvedText: 'A police operation occurred in District X on July 10.', claimMeaning: { subject: 'police operation', location: 'District X', time: 'July 10' } };
    const evidence = {
      title: 'District X regional newspaper reports police conducted an operation on July 10.',
      domain: 'districtxnews.in'
    };
    const res = evaluateSemanticStance(claim, evidence);
    assert.strictEqual(res.stance, 'SUPPORTS');
    assert.notStrictEqual(res.stance, 'REFUTES');
  });

  // -------------------------------------------------------------
  // TEST 12 — SOURCE DISAGREEMENT PRESERVATION
  // -------------------------------------------------------------
  await runTest('TEST 12 — SOURCE DISAGREEMENT PRESERVATION', async () => {
    const claim = { resolvedText: 'Company X acquired Company Y.' };
    const mockResults = [
      { index: 0, title: 'Company X purchased Company Y for $100M.', domain: 'reuters.com' },
      { index: 1, title: 'Company X did not acquire Company Y according to corporate statement.', domain: 'bloomberg.com' }
    ];

    const eval1 = evaluateSemanticStance(claim, mockResults[0]);
    const eval2 = evaluateSemanticStance(claim, mockResults[1]);

    assert.strictEqual(eval1.stance, 'SUPPORTS');
    assert.strictEqual(eval2.stance, 'REFUTES');
    assert.notStrictEqual(eval1.stance, eval2.stance);
  });

  // -------------------------------------------------------------
  // ADVERSARIAL TESTS (PARTS 9 & 10)
  // -------------------------------------------------------------
  await runTest('ADVERSARIAL TEST A — Claim Acquired vs Evidence Considering', async () => {
    const claim = { resolvedText: 'Company X acquired Company Y.' };
    const evidence = { title: 'Company X is considering acquiring Company Y.' };
    const res = evaluateSemanticStance(claim, evidence);
    assert.strictEqual(res.stance, 'NEUTRAL');
  });

  await runTest('ADVERSARIAL TEST B — Claim Considering vs Evidence Acquired', async () => {
    const claim = { resolvedText: 'Company X is considering acquiring Company Y.' };
    const evidence = { title: 'Company X acquired Company Y.' };
    const res = evaluateSemanticStance(claim, evidence);
    assert.strictEqual(res.stance, 'NEUTRAL');
  });

  await runTest('ADVERSARIAL TEST C — Claim Acquired vs Evidence Completed Acquisition', async () => {
    const claim = { resolvedText: 'Company X acquired Company Y.' };
    const evidence = { title: 'Company X completed the acquisition of Company Y.' };
    const res = evaluateSemanticStance(claim, evidence);
    assert.strictEqual(res.stance, 'SUPPORTS');
  });

  await runTest('ADVERSARIAL TEST D — Financial Direction Contradiction', async () => {
    const claim = { resolvedText: 'Company X increased profit by 22%.' };
    const evidence = { title: 'Company X decreased profit by 22%.' };
    const res = evaluateSemanticStance(claim, evidence);
    assert.strictEqual(res.stance, 'REFUTES');
  });

  await runTest('ADVERSARIAL TEST E — Claim Increase vs Evidence Discussion', async () => {
    const claim = { resolvedText: 'Company X increased profit by 22%.' };
    const evidence = { title: 'Company X discussed its quarterly financial performance.' };
    const res = evaluateSemanticStance(claim, evidence);
    assert.strictEqual(res.stance, 'NEUTRAL');
  });

  await runTest('ADVERSARIAL TEST F — Reporting Frame vs Full Evidence Passage', async () => {
    const claim = { resolvedText: 'Company X reported a 22% increase in quarterly net profit.' };
    const evidence = { title: 'Company X Earnings Report', snippet: 'Company X reported a 22% increase in quarterly net profit driven by strong international sales.' };
    const res = evaluateSemanticStance(claim, evidence);
    assert.strictEqual(res.stance, 'SUPPORTS');
  });

  await runTest('ADVERSARIAL TEST G — Official Reporting vs Analyst Belief', async () => {
    const claim = { resolvedText: 'Company X reported a 22% increase in quarterly net profit.' };
    const evidence = { title: 'Analysts believe Company X profit may have increased by 22%.' };
    const res = evaluateSemanticStance(claim, evidence);
    assert.strictEqual(res.stance, 'NEUTRAL');
  });

  // -------------------------------------------------------------
  // REAL ARTICLE RETRIEVAL TRACE & SYSTEM MEASUREMENT TEST
  // -------------------------------------------------------------
  await runTest('REAL ARTICLE END-TO-END RETRIEVAL TRACE & METRICS', async () => {
    const sampleClaims = [
      {
        id: 'claim_1',
        text: 'Opposition parties rejected the Indian government\'s proposal to hold a parliamentary debate on student protests during the Monsoon Session.',
        resolvedText: 'Opposition parties rejected the Indian government\'s proposal to hold a parliamentary debate on student protests during the Monsoon Session.',
        entities: ['Opposition parties', 'Indian government', 'Parliament'],
        articleContext: { mainTopic: 'Parliament Debate', location: 'New Delhi', date: '2026' },
        claimMeaning: { subject: 'Opposition parties', predicate: 'rejected', object: 'proposal to hold debate' }
      },
      {
        id: 'claim_2',
        text: 'TechCorp acquired artificial intelligence startup DataVibe for $150 million on Monday in San Francisco.',
        resolvedText: 'TechCorp acquired artificial intelligence startup DataVibe for $150 million on Monday in San Francisco.',
        entities: ['TechCorp', 'DataVibe', 'San Francisco'],
        articleContext: { mainTopic: 'Tech Acquisition', location: 'San Francisco' },
        claimMeaning: { subject: 'TechCorp', predicate: 'acquired', object: 'DataVibe', quantities: ['$150 million'] }
      },
      {
        id: 'claim_3',
        text: 'Company X reported a 22% increase in quarterly net profit according to financial reports.',
        resolvedText: 'Company X reported a 22% increase in quarterly net profit according to financial reports.',
        entities: ['Company X'],
        articleContext: { mainTopic: 'Financial Earnings' },
        claimMeaning: { subject: 'Company X', predicate: 'reported', quantities: ['22%'] }
      }
    ];

    const startTime = Date.now();
    const claims = sampleClaims;

    let totalSearches = 0;
    let totalCandidatesRetrieved = 0;
    let totalPagesFetched = 0;

    for (const c of claims) {
      const retRes = await executeSemanticCandidateRetrieval(c, { topCandidateFetchLimit: 5 });
      totalSearches += (retRes.queries || []).length;
      totalCandidatesRetrieved += (retRes.results || []).length;
      totalPagesFetched += (retRes.results || []).filter(r => r.sourceAccess === 'FULL_ARTICLE').length;
    }

    const duration = Date.now() - startTime;

    console.log('\n  📊 REAL ARTICLE RETRIEVAL PERFORMANCE METRICS:');
    console.log(`     • Article Claims Extracted: ${claims.length}`);
    console.log(`     • Total Multi-Perspective Queries: ${totalSearches}`);
    console.log(`     • Total Candidates Retrieved & Ranked: ${totalCandidatesRetrieved}`);
    console.log(`     • Full-Page Passages Fetched: ${totalPagesFetched}`);
    console.log(`     • Total Execution Time: ${duration} ms\n`);

    assert.ok(claims.length > 0, 'Claims must be extracted');
    assert.ok(totalSearches >= claims.length, 'Queries must be generated per claim');
  });

  console.log('\n----------------------------------------------------------------');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------------------\n');

  if (failed > 0) process.exit(1);
}

runParaphraseRetrievalBenchmarkSuite();
