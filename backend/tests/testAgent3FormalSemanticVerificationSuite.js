const assert = require('assert');
const { extractClaims } = require('../src/services/claimExtractor');
const {
  normalizeClaimProposition,
  normalizeEvidenceProposition,
  evaluate15Dimensions,
  evaluateComponentLevelSupport,
  classifyStanceFromDimensions,
  evaluateSemanticStance
} = require('../src/services/semanticVerification');

async function runFormalSemanticVerificationSuite() {
  console.log('===============================================================');
  console.log('🧪 Stage 3: Formal Claim ↔ Evidence Semantic Verification Suite');
  console.log('===============================================================\n');

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
  // TEST 1 — EXACT SUPPORT
  // -------------------------------------------------------------
  await runTest('TEST 1 — EXACT SUPPORT', async () => {
    const claim = { resolvedText: 'Company X acquired Company Y on Monday in San Francisco.' };
    const evidence = { title: 'Company X acquired Company Y on Monday in San Francisco.' };
    const res = evaluateSemanticStance(claim, evidence);
    assert.strictEqual(res.stance, 'SUPPORTS', 'Exact proposition match must return SUPPORTS');
    assert.strictEqual(res.evidenceQuality, 'DIRECT', 'Evidence quality must be DIRECT');
  });

  // -------------------------------------------------------------
  // TEST 2 — PARAPHRASED SUPPORT ("rejected" vs "turned down")
  // -------------------------------------------------------------
  await runTest('TEST 2 — PARAPHRASED SUPPORT (Different wording, same proposition)', async () => {
    const claim = {
      resolvedText: 'Opposition parties rejected the Indian government\'s proposal to hold a debate on student protests.',
      claimMeaning: { subject: 'Opposition parties', predicate: 'rejected', object: 'debate on student protests' }
    };
    const evidence = { title: 'Opposition leaders turned down the Centre\'s offer to discuss student protests in Parliament.' };
    const res = evaluateSemanticStance(claim, evidence);
    assert.strictEqual(res.stance, 'SUPPORTS', 'Paraphrased proposition match ("rejected" vs "turned down") must return SUPPORTS');
  });

  // -------------------------------------------------------------
  // TEST 3 — SYNONYM SUPPORT ("acquired" vs "purchased")
  // -------------------------------------------------------------
  await runTest('TEST 3 — SYNONYM SUPPORT ("acquired" vs "purchased")', async () => {
    const claim = { resolvedText: 'Company X acquired Company Y for $150 million.' };
    const evidence = { title: 'Company X purchased Company Y for $150 million.' };
    const res = evaluateSemanticStance(claim, evidence);
    assert.strictEqual(res.stance, 'SUPPORTS', 'Synonym match ("acquired" vs "purchased") must return SUPPORTS');
  });

  // -------------------------------------------------------------
  // TEST 4 — EXPLICIT NEGATION CONTRADICTION ("acquired" vs "did not acquire")
  // -------------------------------------------------------------
  await runTest('TEST 4 — EXPLICIT NEGATION CONTRADICTION', async () => {
    const claim = { resolvedText: 'Company X acquired Company Y.' };
    const evidence = { title: 'Company X did not acquire Company Y according to official statements.' };
    const res = evaluateSemanticStance(claim, evidence);
    assert.strictEqual(res.stance, 'REFUTES', 'Explicit negation mismatch must return REFUTES');
    assert.strictEqual(res.dimensionAnalysis.negation, 'MISMATCH', 'negation dimension must be MISMATCH');
  });

  // -------------------------------------------------------------
  // TEST 5 — OPPOSITE NUMERICAL DIRECTION ("increased 17%" vs "declined 17%")
  // -------------------------------------------------------------
  await runTest('TEST 5 — OPPOSITE NUMERICAL DIRECTION', async () => {
    const claim = { resolvedText: 'Company X reported a 17% increase in quarterly revenue.' };
    const evidence = { title: 'Company X reported a 17% decline in quarterly revenue.' };
    const res = evaluateSemanticStance(claim, evidence);
    assert.strictEqual(res.stance, 'REFUTES', 'Opposite numerical direction (increase vs decline) must return REFUTES');
    assert.strictEqual(res.dimensionAnalysis.direction, 'MISMATCH', 'direction dimension must be MISMATCH');
  });

  // -------------------------------------------------------------
  // TEST 6 — WRONG NUMBER ("17%" vs "71%")
  // -------------------------------------------------------------
  await runTest('TEST 6 — WRONG NUMBER ("17%" vs "71%")', async () => {
    const claim = { resolvedText: 'Company X reported a 17% increase in revenue.' };
    const evidence = { title: 'Company X reported a 71% increase in revenue.' };
    const res = evaluateSemanticStance(claim, evidence);
    assert.strictEqual(res.stance, 'NEUTRAL', 'Conflicting numerical quantity must return NEUTRAL (unsupported detail)');
    assert.strictEqual(res.dimensionAnalysis.quantity, 'MISMATCH', 'quantity dimension must be MISMATCH');
  });

  // -------------------------------------------------------------
  // TEST 7 — WRONG ENTITY ("Company X" vs "Company Z")
  // -------------------------------------------------------------
  await runTest('TEST 7 — WRONG ENTITY', async () => {
    const claim = { resolvedText: 'Company X acquired Company Y.', claimMeaning: { subject: 'Company X' } };
    const evidence = { title: 'Company Z acquired Company Y.' };
    const res = evaluateSemanticStance(claim, evidence);
    assert.notStrictEqual(res.stance, 'SUPPORTS', 'Different claim subject entity must NOT return SUPPORTS');
    assert.strictEqual(res.dimensionAnalysis.subject, 'MISMATCH');
  });

  // -------------------------------------------------------------
  // TEST 8 — WRONG OBJECT ("Company Y" vs "Company Z")
  // -------------------------------------------------------------
  await runTest('TEST 8 — WRONG OBJECT', async () => {
    const claim = { resolvedText: 'Company X acquired Company Y.', claimMeaning: { subject: 'Company X', object: 'Company Y' } };
    const evidence = { title: 'Company X acquired Company Z.' };
    const res = evaluateSemanticStance(claim, evidence);
    assert.strictEqual(res.stance, 'NEUTRAL', 'Different target object must return NEUTRAL');
    assert.strictEqual(res.dimensionAnalysis.object, 'MISMATCH');
  });

  // -------------------------------------------------------------
  // TEST 9 — PLANNED VS COMPLETED ("acquired" vs "announced plans to acquire")
  // -------------------------------------------------------------
  await runTest('TEST 9 — PLANNED VS COMPLETED', async () => {
    const claim = { resolvedText: 'Company X acquired Company Y.' };
    const evidence = { title: 'Company X announced plans to acquire Company Y.' };
    const res = evaluateSemanticStance(claim, evidence);
    assert.strictEqual(res.stance, 'NEUTRAL', 'Completion status mismatch (planned vs completed) must return NEUTRAL');
    assert.strictEqual(res.dimensionAnalysis.completionStatus, 'MISMATCH');
  });

  // -------------------------------------------------------------
  // TEST 10 — DATE MISMATCH ("June 10" vs "June 20")
  // -------------------------------------------------------------
  await runTest('TEST 10 — DATE MISMATCH', async () => {
    const claim = { resolvedText: 'Company X announced the acquisition on June 10.', claimMeaning: { subject: 'Company X', time: 'June 10' } };
    const evidence = { title: 'Company X announced the acquisition on June 20.' };
    const res = evaluateSemanticStance(claim, evidence);
    assert.strictEqual(res.stance, 'NEUTRAL', 'Date mismatch must return NEUTRAL');
    assert.strictEqual(res.dimensionAnalysis.time, 'MISMATCH');
  });

  // -------------------------------------------------------------
  // TEST 11 — LOCATION MISMATCH ("Mumbai" vs "Delhi")
  // -------------------------------------------------------------
  await runTest('TEST 11 — LOCATION MISMATCH', async () => {
    const claim = { resolvedText: 'The robbery occurred in Mumbai on Monday.', claimMeaning: { subject: 'robbery', action: 'occurred', location: 'Mumbai' } };
    const evidence = { title: 'The robbery occurred in Delhi on Monday.' };
    const res = evaluateSemanticStance(claim, evidence);
    assert.strictEqual(res.stance, 'REFUTES', 'Location mismatch on specific event must return REFUTES');
    assert.strictEqual(res.dimensionAnalysis.location, 'MISMATCH');
  });

  // -------------------------------------------------------------
  // TEST 12 — CAUSALITY SEPARATION (Event supported, causality unsupported)
  // -------------------------------------------------------------
  await runTest('TEST 12 — CAUSALITY SEPARATION', async () => {
    const claim = { resolvedText: 'Company X announced layoffs because of declining demand.' };
    const evidence = { title: 'Company X announced layoffs affecting 500 workers.' };
    const res = evaluateSemanticStance(claim, evidence);
    assert.strictEqual(res.componentAnalysis.action, 'SUPPORTED', 'Event action must be SUPPORTED');
    assert.strictEqual(res.componentAnalysis.causality, 'UNSUPPORTED', 'Unmentioned causality must be UNSUPPORTED');
  });

  // -------------------------------------------------------------
  // TEST 13 — ATTRIBUTION PRESERVATION ("Police reported...")
  // -------------------------------------------------------------
  await runTest('TEST 13 — ATTRIBUTION PRESERVATION', async () => {
    const claim = { resolvedText: 'Police reported that the suspect was arrested in New Delhi.' };
    const evidence = { title: 'Police said officers detained the suspect in New Delhi.' };
    const res = evaluateSemanticStance(claim, evidence);
    assert.strictEqual(res.stance, 'SUPPORTS', 'Attributed report match must return SUPPORTS');
    assert.strictEqual(res.dimensionAnalysis.attribution, 'MATCH');
  });

  // -------------------------------------------------------------
  // TEST 14 — BELIEF VS FACT ("Analysts believe...")
  // -------------------------------------------------------------
  await runTest('TEST 14 — BELIEF VS FACT', async () => {
    const claim = { resolvedText: 'Declining demand caused the corporate layoffs.' };
    const evidence = { title: 'Analysts believe declining demand caused the corporate layoffs.' };
    const res = evaluateSemanticStance(claim, evidence);
    assert.strictEqual(res.stance, 'NEUTRAL', 'Subjective belief ("Analysts believe") does not provide direct support for causal fact -> NEUTRAL');
  });

  // -------------------------------------------------------------
  // TEST 15 — ARTICLE CONTEXT CONTEXTUALIZATION
  // -------------------------------------------------------------
  await runTest('TEST 15 — ARTICLE CONTEXT CONTEXTUALIZATION', async () => {
    const claim = {
      resolvedText: 'Opposition parties rejected the government\'s proposal to debate student protests during the Parliament Monsoon Session.',
      articleContext: { mainTopic: 'Parliament Debate', location: 'New Delhi' }
    };
    const evidence = { title: 'Opposition leaders turned down the Centre\'s offer to discuss student demonstrations in Parliament.' };
    const res = evaluateSemanticStance(claim, evidence);
    assert.strictEqual(res.stance, 'SUPPORTS', 'Context-enriched claim must match semantic candidate');
  });

  // -------------------------------------------------------------
  // TEST 16 — RELATED BUT INSUFFICIENT
  // -------------------------------------------------------------
  await runTest('TEST 16 — RELATED BUT INSUFFICIENT', async () => {
    const claim = { resolvedText: 'Opposition parties rejected the government\'s proposal to debate student protests.' };
    const evidence = { title: 'The central government offered a parliamentary debate on student protests.' };
    const res = evaluateSemanticStance(claim, evidence);
    assert.strictEqual(res.stance, 'NEUTRAL', 'Source describing offer without opposition response must return NEUTRAL');
  });

  // -------------------------------------------------------------
  // TEST 17 — UNRELATED ARTICLE
  // -------------------------------------------------------------
  await runTest('TEST 17 — UNRELATED ARTICLE', async () => {
    const claim = { resolvedText: 'Company X acquired Company Y in June 2026.' };
    const evidence = { title: 'Company X reported quarterly financial earnings.' };
    const res = evaluateSemanticStance(claim, evidence);
    assert.ok(res.stance === 'IRRELEVANT' || res.stance === 'NEUTRAL', 'Unrelated article on different topic must return IRRELEVANT or NEUTRAL');
  });

  // -------------------------------------------------------------
  // TEST 18 — NEGATION REVERSAL ("did not acquire" vs "acquired")
  // -------------------------------------------------------------
  await runTest('TEST 18 — NEGATION REVERSAL', async () => {
    const claim = { resolvedText: 'Company X did not acquire Company Y.' };
    const evidence = { title: 'Company X acquired Company Y on Monday.' };
    const res = evaluateSemanticStance(claim, evidence);
    assert.strictEqual(res.stance, 'REFUTES', 'Negation reversal must return REFUTES');
  });

  // -------------------------------------------------------------
  // TEST 19 — PARTIAL COMPONENT SUPPORT
  // -------------------------------------------------------------
  await runTest('TEST 19 — PARTIAL COMPONENT SUPPORT ($2B in June unsupported)', async () => {
    const claim = { resolvedText: 'Company X acquired Company Y for $2 billion in June 2026.' };
    const evidence = { title: 'Company X acquired Company Y in a major tech deal.' };
    const res = evaluateSemanticStance(claim, evidence);
    assert.strictEqual(res.componentAnalysis.action, 'SUPPORTED', 'Action component must be SUPPORTED');
    assert.strictEqual(res.componentAnalysis.quantity, 'UNSUPPORTED', 'Unmentioned $2 billion must be UNSUPPORTED');
    assert.strictEqual(res.componentAnalysis.time, 'UNSUPPORTED', 'Unmentioned June 2026 date must be UNSUPPORTED');
  });

  // -------------------------------------------------------------
  // TEST 20 — TEMPORAL SEQUENCE (completed vs future plan)
  // -------------------------------------------------------------
  await runTest('TEST 20 — TEMPORAL SEQUENCE', async () => {
    const claim = { resolvedText: 'Company X completed the acquisition of Company Y.' };
    const evidence = { title: 'Company X plans to complete the acquisition of Company Y next month.' };
    const res = evaluateSemanticStance(claim, evidence);
    assert.strictEqual(res.stance, 'NEUTRAL', 'Future acquisition plan does not support completed acquisition -> NEUTRAL');
  });

  // -------------------------------------------------------------
  // REAL ARTICLE VERIFICATION SUITE (5 Real Claims)
  // -------------------------------------------------------------
  const realCases = [
    {
      name: '1. Economic Times — Parliament Monsoon Session',
      claim: 'Opposition parties rejected the Indian government\'s proposal to hold a parliamentary debate on student protests.',
      evidence: 'Opposition leaders turned down the Centre\'s offer for a debate during the Parliament Monsoon Session in New Delhi.',
      expectedStance: 'SUPPORTS'
    },
    {
      name: '2. Reuters — Tech Acquisition',
      claim: 'TechCorp acquired AI startup DataVibe for $150 million on Monday.',
      evidence: 'TechCorp purchased artificial intelligence firm DataVibe for $150 million in San Francisco.',
      expectedStance: 'SUPPORTS'
    },
    {
      name: '3. Indian Express — Red Fort Blast Case',
      claim: 'The National Investigation Agency arrested a suspect in Faridabad, Haryana.',
      evidence: 'NIA officers detained a Faridabad resident in connection with the Red Fort blast investigation.',
      expectedStance: 'SUPPORTS'
    },
    {
      name: '4. Financial Report Contradiction',
      claim: 'Company X reported a 22% increase in quarterly net profit.',
      evidence: 'Company X reported a 22% decline in quarterly net profit due to rising costs.',
      expectedStance: 'REFUTES'
    },
    {
      name: '5. Unrelated Topic',
      claim: 'ISRO launched the EOS-08 satellite aboard the SSLV-D3 rocket.',
      evidence: 'ISRO announced the annual budget allocation for space research in New Delhi.',
      expectedStance: 'NEUTRAL'
    }
  ];

  for (const c of realCases) {
    await runTest(`REAL ARTICLE VERIFICATION — ${c.name}`, async () => {
      const res = evaluateSemanticStance(c.claim, c.evidence);
      assert.strictEqual(res.stance, c.expectedStance, `Expected ${c.expectedStance} but got ${res.stance}`);
      assert.strictEqual(typeof res.confidence, 'number');
      assert.ok(res.dimensionAnalysis, 'Must return dimensionAnalysis');
      assert.ok(res.componentAnalysis, 'Must return componentAnalysis');
    });
  }

  console.log('\n---------------------------------------------------------------');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('---------------------------------------------------------------\n');

  if (failed > 0) process.exit(1);
}

runFormalSemanticVerificationSuite();
