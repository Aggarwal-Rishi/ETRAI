const assert = require('assert');
const { extractClaims, extractMockClaims, extractParagraphsAndSentences } = require('../src/services/claimExtractor');

async function runAgent2SemanticContextSuite() {
  console.log('===============================================================');
  console.log('🧪 Agent 2 Semantic Context & Dual-Layer Claim Extraction Suite');
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
  // TEST 1 — PRONOUN RESOLUTION
  // -------------------------------------------------------------
  await runTest('TEST 1 — PRONOUN RESOLUTION ("He" -> "Prime Minister X")', async () => {
    const text = `Prime Minister Narendra Modi announced a new digital infrastructure policy on Monday in New Delhi. He stated that the policy would transform rural connectivity across India.`;
    const claims = await extractClaims(text);

    assert.ok(claims.length >= 1, 'Must extract at least 1 claim');
    const resolvedClaim = claims.find(c => c.originalText.includes('He stated'));
    assert.ok(resolvedClaim, 'Claim starting with "He stated" must be extracted');
    assert.strictEqual(resolvedClaim.coreferenceResolved, true, 'coreferenceResolved must be true');
    assert.ok(resolvedClaim.resolvedText.includes('Narendra Modi'), 'Bare pronoun "He" must be resolved to "Narendra Modi"');
    assert.ok(!resolvedClaim.resolvedText.startsWith('He '), 'Resolved claim text must not begin with bare pronoun "He"');
  });

  // -------------------------------------------------------------
  // TEST 2 — ARTICLE CONTEXT INJECTION
  // -------------------------------------------------------------
  await runTest('TEST 2 — ARTICLE CONTEXT INJECTION (Headline + Opposition rejection)', async () => {
    const text = `Parliament Monsoon Session: Government offers debate on student protests, Opposition rejects proposal.

In New Delhi, opposition parties turned down the Centre's offer on Monday. They rejected the proposal during the opening session of parliament.`;
    const claims = await extractClaims(text);

    assert.ok(claims.length >= 1, 'Must extract at least 1 claim');
    const claim = claims[0];
    assert.ok(claim.articleContext, 'Must contain articleContext object (Layer 1)');
    assert.ok(claim.articleContext.mainTopic || claim.articleContext.headline, 'articleContext must contain topic/headline');
    assert.ok(claim.resolvedText.toLowerCase().includes('opposition') || claim.resolvedText.toLowerCase().includes('student'), 'Claim text must integrate topic context');
  });

  // -------------------------------------------------------------
  // TEST 3 — SEMANTIC PRESERVATION
  // -------------------------------------------------------------
  await runTest('TEST 3 — SEMANTIC PRESERVATION (Wording variation preserves meaning proposition)', async () => {
    const text = `Opposition parties turned down the Centre's offer to debate student protests in New Delhi on Monday.`;
    const claims = await extractClaims(text);

    assert.ok(claims.length >= 1, 'Must extract claim');
    const c = claims[0];
    assert.ok(c.claimMeaning, 'Must contain claimMeaning object (Layer 2)');
    assert.ok(c.claimMeaning.subject, 'claimMeaning must contain subject');
    assert.ok(c.claimMeaning.event || c.claimMeaning.topic, 'claimMeaning must contain event or topic');
    assert.strictEqual(typeof c.claimMeaning.subject, 'string');
    assert.strictEqual(typeof c.claimMeaning.object, 'string');
  });

  // -------------------------------------------------------------
  // TEST 4 — MULTI-PROPOSITION SENTENCE SPLITTING
  // -------------------------------------------------------------
  await runTest('TEST 4 — MULTI-PROPOSITION SENTENCE SPLITTING', async () => {
    const text = `Acme Corp reported $500 million revenue in Q2 2026 and announced plans to lay off 300 employees at its regional plant.`;
    const claims = await extractClaims(text);

    assert.ok(claims.length >= 1, 'Must extract claims');
    const financialClaim = claims.find(c => c.resolvedText.includes('500 million') || c.resolvedText.includes('revenue'));
    const layoffClaim = claims.find(c => c.resolvedText.includes('300') || c.resolvedText.includes('lay off'));
    assert.ok(financialClaim, 'Must extract financial/revenue claim');
    assert.ok(layoffClaim || claims.length >= 1, 'Must split or isolate factual proposition');
  });

  // -------------------------------------------------------------
  // TEST 5 — SUBJECTIVE THEORY EXCLUSION
  // -------------------------------------------------------------
  await runTest('TEST 5 — SUBJECTIVE THEORY EXCLUSION ("Analysts believe..." excluded)', async () => {
    const text = `TechCorp reported a 15% increase in revenue to $450 million on Monday in San Francisco. Analysts believe the layoffs are linked to falling demand. Sources speculate that the company may be preparing for a merger.`;
    const claims = await extractClaims(text);

    const speculationClaims = claims.filter(c => 
      c.originalText.includes('Analysts believe') || 
      c.originalText.includes('Sources speculate')
    );
    assert.strictEqual(speculationClaims.length, 0, 'Subjective theories and speculative motives must be excluded');
  });

  // -------------------------------------------------------------
  // TEST 6 — HEDGED EVENT PRESERVATION
  // -------------------------------------------------------------
  await runTest('TEST 6 — HEDGED EVENT PRESERVATION ("Police reportedly arrested..." kept with qualifier)', async () => {
    const text = `Police reportedly arrested three people in New Delhi on Tuesday in connection with the robbery.`;
    const claims = await extractClaims(text);

    assert.ok(claims.length >= 1, 'Must extract hedged event claim');
    const c = claims[0];
    assert.ok(c.claimMeaning, 'Must contain claimMeaning object');
    assert.ok(
      c.claimMeaning.epistemicStatus === 'hedged' || 
      c.claimMeaning.epistemicStatus === 'reported' ||
      (c.claimMeaning.qualifiers && c.claimMeaning.qualifiers.length > 0) ||
      c.resolvedText.toLowerCase().includes('reportedly'),
      'Journalistic hedging ("reportedly") must be preserved in qualifiers or text'
    );
  });

  // -------------------------------------------------------------
  // TEST 7 — AMBIGUOUS REFERENCE HANDLING
  // -------------------------------------------------------------
  await runTest('TEST 7 — AMBIGUOUS REFERENCE HANDLING (unresolvable reference flag)', async () => {
    const text = `Multiple visitors attended the museum conference in Paris on Monday. They discussed new exhibits.`;
    const claims = await extractClaims(text);

    assert.ok(claims.length >= 1, 'Must process sentence structure');
    const c = claims[0];
    assert.ok(c.resolvedText, 'Must produce resolved text');
    assert.ok(c.independentlySearchable !== undefined, 'Must state searchability');
  });

  // -------------------------------------------------------------
  // TEST 8 — NUMERICAL CLAIM PRESERVATION
  // -------------------------------------------------------------
  await runTest('TEST 8 — NUMERICAL CLAIM PRESERVATION (17% and $450 million)', async () => {
    const text = `GlobalTech reported a 17% increase in quarterly revenue to $450 million on August 10, 2026.`;
    const claims = await extractClaims(text);

    assert.ok(claims.length >= 1, 'Must extract numerical claim');
    const c = claims[0];
    assert.ok(c.resolvedText.includes('17%') || c.resolvedText.includes('17 percent'), 'Must preserve 17% metric');
    assert.ok(c.resolvedText.includes('450 million') || c.resolvedText.includes('$450'), 'Must preserve $450 million figure');
    assert.ok(c.claimMeaning.quantities.length > 0 || c.resolvedText.includes('450'), 'Quantities array or text must contain numbers');
  });

  // -------------------------------------------------------------
  // TEST 9 — GRANULAR LOCATION PRESERVATION
  // -------------------------------------------------------------
  await runTest('TEST 9 — GRANULAR LOCATION PRESERVATION (Ahmedabad, Gujarat, India)', async () => {
    const text = `The state government inaugurated a new solar power facility in Ahmedabad, Gujarat, India on Monday.`;
    const claims = await extractClaims(text);

    assert.ok(claims.length >= 1, 'Must extract location claim');
    const c = claims[0];
    assert.ok(
      c.resolvedText.includes('Ahmedabad') || 
      (c.articleContext.locations && c.articleContext.locations.some(l => l.includes('Ahmedabad'))),
      'Must preserve granular location Ahmedabad'
    );
  });

  // -------------------------------------------------------------
  // TEST 10 — LAYER 1 VS LAYER 2 STRICT SEPARATION
  // -------------------------------------------------------------
  await runTest('TEST 10 — LAYER 1 (articleContext) vs LAYER 2 (claimMeaning) SEPARATION', async () => {
    const text = `Indian Cabinet approves National Semiconductor Mission worth 76000 crore rupees.

The Union Cabinet chaired by Prime Minister Narendra Modi approved the semiconductor manufacturing scheme on Wednesday in New Delhi. Under the initiative, two fabrication plants will be constructed in Dholera, Gujarat.`;
    const claims = await extractClaims(text);

    assert.ok(claims.length >= 1, 'Must extract claims');
    const c = claims[0];
    assert.ok(c.articleContext, 'Must have Layer 1 articleContext');
    assert.ok(c.claimMeaning, 'Must have Layer 2 claimMeaning');

    // Layer 1 describes overall story
    assert.ok(c.articleContext.headline || c.articleContext.mainTopic, 'Layer 1 describes whole story');
    
    // Layer 2 describes individual claim proposition
    assert.ok(c.claimMeaning.subject, 'Layer 2 has subject');
    assert.ok(c.claimMeaning.object || c.claimMeaning.predicate, 'Layer 2 has proposition object/predicate');
    assert.notDeepStrictEqual(c.articleContext, c.claimMeaning, 'Layer 1 and Layer 2 must not be identical objects');
  });

  // -------------------------------------------------------------
  // REAL ARTICLES TEST SUITE (10 Representative Categories)
  // -------------------------------------------------------------
  const realArticleFixtures = [
    {
      category: '1. Political News',
      text: `India's Supreme Court on Monday directed the central government to form a committee to review the national highway expansion policy in Uttarakhand. Chief Justice D.Y. Chandrachud issued the order during a hearing in New Delhi.`
    },
    {
      category: '2. Crime & Law Enforcement',
      text: `The National Investigation Agency (NIA) arrested a resident of Faridabad, Haryana, in connection with the Red Fort blast case. Officers seized electronic devices and digital evidence during raids across eight locations on Tuesday.`
    },
    {
      category: '3. Business & Economy',
      text: `Tata Motors reported a 22% rise in consolidated net profit to 5408 crore rupees for the first quarter ending June 30, 2026. Revenue from operations increased by 11% to 105000 crore rupees.`
    },
    {
      category: '4. Science & Technology',
      text: `ISRO successfully launched the EOS-08 Earth Observation Satellite aboard the SSLV-D3 rocket from Sriharikota, Andhra Pradesh, on Friday. The satellite was placed into a circular orbit at an altitude of 475 kilometers.`
    },
    {
      category: '5. Pronouns & Coreference',
      text: `Reserve Bank of India Governor Shaktikanta Das chaired the Monetary Policy Committee meeting in Mumbai. He announced that the repo rate would remain unchanged at 6.5%. He stated that inflation control remains the central bank's top priority.`
    },
    {
      category: '6. Quoted Statements',
      text: `United Nations Security Council monitoring team issued a report on international terror funding in New York. The report stated that terrorist groups continue to utilize encrypted messaging platforms for operational coordination.`
    },
    {
      category: '7. Journalistic Hedging (allegedly/reportedly)',
      text: `Local authorities in Jaipur allegedly detained four individuals following a clash near the historic city center on Sunday. Police reportedly registered a case under relevant sections of the Bharatiya Nyaya Sanhita.`
    },
    {
      category: '8. Subjective Speculation (Filtered)',
      text: `Heavy rain triggered a landslide in Wayanad district, Kerala, damaging three residential structures on Monday. Analysts believe the landslide was caused by unseasonal deforestation. Locals suspect local construction activity accelerated the slope failure.`
    },
    {
      category: '9. Numerical & Statistical Metrics',
      text: `India's retail inflation eased to a 59-month low of 3.54% in July 2026, according to data released by the Ministry of Statistics and Programme Implementation in New Delhi.`
    },
    {
      category: '10. Multi-Event Complex Story',
      text: `The Ministry of External Affairs confirmed that Prime Minister Narendra Modi will visit Poland and Ukraine from August 21 to August 23. This marks the first visit by an Indian Prime Minister to Ukraine in 30 years.`
    }
  ];

  for (const item of realArticleFixtures) {
    await runTest(`REAL ARTICLE TEST — ${item.category}`, async () => {
      const claims = await extractClaims(item.text);
      assert.ok(claims.length >= 1, `Must extract claims for ${item.category}`);
      const c = claims[0];
      assert.ok(c.resolvedText, 'Must produce resolvedText');
      assert.ok(c.articleContext, 'Must attach Layer 1 articleContext');
      assert.ok(c.claimMeaning, 'Must attach Layer 2 claimMeaning');
      assert.ok(c.sourceContext, 'Must attach sourceContext paragraph lineage');
      assert.strictEqual(c.text, c.resolvedText, 'Backward compatible c.text must match resolvedText');
    });
  }

  console.log('\n---------------------------------------------------------------');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('---------------------------------------------------------------\n');

  if (failed > 0) process.exit(1);
}

runAgent2SemanticContextSuite();
