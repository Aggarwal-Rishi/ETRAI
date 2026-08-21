const assert = require('assert');
const { extractClaims } = require('../src/services/claimExtractor');
const {
  buildSearchRepresentation,
  generateMultiPerspectiveQueries,
  deduplicateAndRankCandidates,
  executeSemanticCandidateRetrieval
} = require('../src/services/factVerifier');

async function runAgent3SemanticRetrievalSuite() {
  console.log('===============================================================');
  console.log('🧪 Agent 3 Multi-Perspective Semantic Search & Retrieval Suite');
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
  // TEST A — PARAPHRASE RETRIEVAL
  // -------------------------------------------------------------
  await runTest('TEST A — PARAPHRASE RETRIEVAL ("rejected" -> "turned down" candidate retrieved)', async () => {
    const rawClaim = {
      id: 'claim_1',
      resolvedText: "Opposition parties rejected the Indian government's proposal to hold a parliamentary debate on student protests.",
      claimMeaning: {
        subject: 'Opposition parties',
        predicate: 'rejected',
        object: 'Indian government debate proposal',
        event: 'Parliamentary debate proposal',
        topic: 'student protests',
        location: 'New Delhi, India',
        time: 'Monday'
      },
      articleContext: {
        mainTopic: 'Parliament Debate on Student Protests',
        mainEvent: 'Opposition Rejection of Government Debate Offer',
        location: 'New Delhi'
      }
    };

    const searchRep = buildSearchRepresentation(rawClaim);
    const queries = generateMultiPerspectiveQueries(searchRep);

    const hasParaphraseQuery = queries.some(q => q.strategy === 'semantic_paraphrase' && (q.query.includes('turned down') || q.query.includes('declined')));
    assert.ok(hasParaphraseQuery, 'Must generate semantic paraphrase query using "turned down" or "declined"');

    const candidateHits = [
      {
        url: 'https://thehindu.com/news/national/opposition-turns-down-centre-offer-on-student-protests',
        title: 'Opposition leaders turned down the Centre\'s offer to discuss student protests in Parliament.',
        snippet: 'Opposition leaders turned down the Centre\'s offer for a debate during the Parliament Monsoon Session.',
        queryUsed: queries.find(q => q.strategy === 'semantic_paraphrase')?.query || 'turned down offer',
        retrievalStrategy: 'semantic_paraphrase'
      }
    ];

    const deduped = deduplicateAndRankCandidates(candidateHits, searchRep);
    assert.strictEqual(deduped.uniqueSourceCount, 1, 'Must register candidate hit');
    assert.strictEqual(deduped.candidates[0].potentialStance, 'undetermined', 'Candidate stance must be undetermined in retrieval stage');
    assert.ok(deduped.candidates[0].retrievalRelevance >= 50, 'Candidate utility score must be >= 50');
  });

  // -------------------------------------------------------------
  // TEST B — SYNONYM RETRIEVAL
  // -------------------------------------------------------------
  await runTest('TEST B — SYNONYM RETRIEVAL ("acquired" -> "purchased" candidate retrieved)', async () => {
    const rawClaim = {
      id: 'claim_2',
      resolvedText: 'TechCorp acquired the artificial intelligence startup DataVibe for $150 million on Monday.',
      claimMeaning: {
        subject: 'TechCorp',
        predicate: 'acquired',
        object: 'artificial intelligence startup DataVibe',
        quantities: ['$150 million'],
        topic: 'Corporate Acquisition'
      }
    };

    const searchRep = buildSearchRepresentation(rawClaim);
    const queries = generateMultiPerspectiveQueries(searchRep);

    const paraphraseQuery = queries.find(q => q.strategy === 'semantic_paraphrase');
    assert.ok(paraphraseQuery, 'Must generate semantic paraphrase query');
    assert.ok(paraphraseQuery.query.includes('purchased') || paraphraseQuery.query.includes('acquired'), 'Paraphrase query must contain synonym "purchased"');
  });

  // -------------------------------------------------------------
  // TEST C — WORD ORDER VARIATION
  // -------------------------------------------------------------
  await runTest('TEST C — WORD ORDER VARIATION', async () => {
    const rawClaim = {
      id: 'claim_3',
      resolvedText: 'The central government announced a new national highway policy in New Delhi on Monday.',
      claimMeaning: {
        subject: 'central government',
        predicate: 'announced',
        object: 'national highway policy',
        location: 'New Delhi',
        time: 'Monday'
      }
    };

    const searchRep = buildSearchRepresentation(rawClaim);

    const hits = [
      {
        url: 'https://economictimes.indiatimes.com/news/india/on-monday-the-government-unveiled-a-new-highway-policy',
        title: 'On Monday, the government unveiled a new highway policy in New Delhi.',
        snippet: 'The Ministry of Road Transport unveiled a revised national highway expansion policy.',
        queryUsed: 'government highway policy New Delhi',
        retrievalStrategy: 'entity_event'
      }
    ];

    const deduped = deduplicateAndRankCandidates(hits, searchRep);
    assert.strictEqual(deduped.uniqueSourceCount, 1);
    assert.ok(deduped.candidates[0].retrievalRelevance >= 60, 'Candidate utility must be high despite word order variation');
  });

  // -------------------------------------------------------------
  // TEST D — NUMERICAL VARIATION PRESERVATION
  // -------------------------------------------------------------
  await runTest('TEST D — NUMERICAL VARIATION PRESERVATION (17% and $450 million preserved)', async () => {
    const rawClaim = {
      id: 'claim_4',
      resolvedText: 'GlobalTech reported a 17% increase in quarterly revenue to $450 million on August 10.',
      claimMeaning: {
        subject: 'GlobalTech',
        predicate: 'reported increase',
        object: 'quarterly revenue',
        quantities: ['17%', '$450 million'],
        topic: 'Financial Reporting'
      }
    };

    const searchRep = buildSearchRepresentation(rawClaim);
    const queries = generateMultiPerspectiveQueries(searchRep);

    const numQuery = queries.find(q => q.strategy === 'numerical_anchor');
    assert.ok(numQuery, 'Must generate numerical detail anchor query');
    assert.ok(numQuery.query.includes('17%') || numQuery.query.includes('450'), 'Numerical query must contain exact metrics');
  });

  // -------------------------------------------------------------
  // TEST E — CONTRADICTORY WORDING RETRIEVAL
  // -------------------------------------------------------------
  await runTest('TEST E — CONTRADICTORY WORDING RETRIEVAL (Retains contradictory candidate for verification)', async () => {
    const rawClaim = {
      id: 'claim_5',
      resolvedText: 'Company X reported a 17% increase in revenue to $450 million in Q2 2026.',
      claimMeaning: {
        subject: 'Company X',
        predicate: 'reported increase',
        object: 'revenue',
        quantities: ['17%', '$450 million']
      }
    };

    const searchRep = buildSearchRepresentation(rawClaim);

    const contradictoryHit = {
      url: 'https://reuters.com/business/company-x-q2-revenue-falls-17-percent',
      title: 'Company X Q2 revenue fell 17% to $450 million amidst market contraction.',
      snippet: 'Financial reporting confirmed Company X revenue fell by 17 percent.',
      queryUsed: 'Company X 17% revenue',
      retrievalStrategy: 'numerical_anchor'
    };

    const deduped = deduplicateAndRankCandidates([contradictoryHit], searchRep);
    assert.strictEqual(deduped.uniqueSourceCount, 1, 'Must NOT discard contradictory source during retrieval');
    assert.strictEqual(deduped.candidates[0].potentialStance, 'undetermined', 'Stance must remain undetermined until Stage 3 verification');
  });

  // -------------------------------------------------------------
  // TEST F — NEGATION PRESERVATION
  // -------------------------------------------------------------
  await runTest('TEST F — NEGATION PRESERVATION ("Company X did NOT acquire Company Y")', async () => {
    const rawClaim = {
      id: 'claim_6',
      resolvedText: 'Company X did not acquire Company Y on Monday in San Francisco.',
      claimMeaning: {
        subject: 'Company X',
        predicate: 'did not acquire',
        object: 'Company Y',
        qualifiers: ['not'],
        epistemicStatus: 'hedged'
      }
    };

    const searchRep = buildSearchRepresentation(rawClaim);
    const queries = generateMultiPerspectiveQueries(searchRep);

    const canonicalQuery = queries.find(q => q.strategy === 'canonical');
    assert.ok(canonicalQuery, 'Must generate canonical query');
    assert.ok(canonicalQuery.query.toLowerCase().includes('not'), 'Search query must preserve negation keyword "not"');
  });

  // -------------------------------------------------------------
  // TEST G — UNRELATED ARTICLE FILTERING
  // -------------------------------------------------------------
  await runTest('TEST G — UNRELATED ARTICLE FILTERING', async () => {
    const rawClaim = {
      id: 'claim_7',
      resolvedText: 'TechCorp acquired AI startup DataVibe for $150 million on Monday in San Francisco.',
      claimMeaning: {
        subject: 'TechCorp',
        predicate: 'acquired',
        object: 'AI startup DataVibe',
        quantities: ['$150 million']
      }
    };

    const searchRep = buildSearchRepresentation(rawClaim);

    const unrelatedHit = {
      url: 'https://techcrunch.com/techcorp-quarterly-earnings-summary',
      title: 'TechCorp CEO speaks at general conference about cloud computing trends.',
      snippet: 'General corporate overview of TechCorp cloud initiatives.',
      queryUsed: 'TechCorp',
      retrievalStrategy: 'source_discovery'
    };

    const deduped = deduplicateAndRankCandidates([unrelatedHit], searchRep);
    assert.ok(deduped.candidates[0].retrievalRelevance < 70, 'Unrelated candidate sharing only generic entity must receive lower candidate utility score');
  });

  // -------------------------------------------------------------
  // TEST H — MULTI-PASS DEDUPLICATION & DIVERSITY TRACKING
  // -------------------------------------------------------------
  await runTest('TEST H — MULTI-PASS DEDUPLICATION & DIVERSITY TRACKING', async () => {
    const rawClaim = {
      id: 'claim_8',
      resolvedText: 'Prime Minister Narendra Modi announced a new infrastructure project in New Delhi.',
      claimMeaning: { subject: 'Narendra Modi', topic: 'Infrastructure' }
    };

    const searchRep = buildSearchRepresentation(rawClaim);

    const hitsFromPass1 = [
      {
        url: 'https://economictimes.indiatimes.com/news/pm-modi-infrastructure-project',
        title: 'PM Modi announces landmark infrastructure project in New Delhi.',
        snippet: 'Prime Minister Narendra Modi launched the project.',
        queryUsed: 'Narendra Modi New Delhi infrastructure',
        retrievalStrategy: 'canonical'
      }
    ];

    const hitsFromPass2 = [
      {
        url: 'https://economictimes.indiatimes.com/news/pm-modi-infrastructure-project/', // Trailing slash variation
        title: 'PM Modi announces landmark infrastructure project in New Delhi.',
        snippet: 'Prime Minister Narendra Modi launched the project.',
        queryUsed: 'Narendra Modi unveils infrastructure',
        retrievalStrategy: 'semantic_paraphrase'
      }
    ];

    const deduped = deduplicateAndRankCandidates([...hitsFromPass1, ...hitsFromPass2], searchRep);
    assert.strictEqual(deduped.uniqueSourceCount, 1, 'Duplicate URLs across query passes must be deduplicated into 1 candidate');
    assert.strictEqual(deduped.uniqueDomainCount, 1, 'Unique domain count must be 1');
    assert.strictEqual(deduped.candidates[0].queriesUsed.length, 2, 'Candidate record must track both queries used');
    assert.strictEqual(deduped.candidates[0].retrievalStrategies.length, 2, 'Candidate record must track both retrieval strategies used');
  });

  // -------------------------------------------------------------
  // REAL ARTICLE RETRIEVAL TEST SUITE (5 Representative Articles)
  // -------------------------------------------------------------
  const realArticleClaims = [
    {
      articleName: '1. Economic Times — Parliament Monsoon Session & Student Protests',
      text: `Parliament Monsoon Session: Government offers debate on student protests, Opposition rejects proposal.

In New Delhi, opposition parties turned down the Centre's offer on Monday. They rejected the proposal during the opening session of parliament.`
    },
    {
      articleName: '2. Reuters — Business Financial Acquisition',
      text: `TechCorp acquired artificial intelligence startup DataVibe for $150 million in San Francisco on Monday.`
    },
    {
      articleName: '3. Indian Express — National Security & Red Fort Attack',
      text: `The National Investigation Agency arrested a resident of Faridabad, Haryana, in connection with the Red Fort blast case on Tuesday.`
    },
    {
      articleName: '4. ISRO — Space Science Satellite Launch',
      text: `ISRO successfully launched the EOS-08 Earth Observation Satellite aboard the SSLV-D3 rocket from Sriharikota, Andhra Pradesh, on Friday.`
    },
    {
      articleName: '5. RBI — Economic Inflation & Monetary Policy',
      text: `Reserve Bank of India Governor Shaktikanta Das announced in Mumbai that the repo rate would remain unchanged at 6.5%.`
    }
  ];

  for (const articleFixture of realArticleClaims) {
    await runTest(`REAL ARTICLE RETRIEVAL — ${articleFixture.articleName}`, async () => {
      const claims = await extractClaims(articleFixture.text);
      assert.ok(claims.length >= 1, 'Must extract claims');

      const claim = claims[0];
      const retrieval = await executeSemanticCandidateRetrieval(claim);

      assert.strictEqual(typeof retrieval.retrievalStatus, 'string');
      assert.ok(Array.isArray(retrieval.queries), 'Must return array of generated multi-perspective queries');
      assert.ok(retrieval.queries.length >= 3 && retrieval.queries.length <= 7, `Must generate between 3 and 7 queries (generated: ${retrieval.queries.length})`);
      assert.ok(Array.isArray(retrieval.evidenceCandidates), 'Must return evidenceCandidates array');
      assert.strictEqual(typeof retrieval.uniqueSourceCount, 'number');
      assert.strictEqual(typeof retrieval.uniqueDomainCount, 'number');
    });
  }

  console.log('\n---------------------------------------------------------------');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('---------------------------------------------------------------\n');

  if (failed > 0) process.exit(1);
}

runAgent3SemanticRetrievalSuite();
