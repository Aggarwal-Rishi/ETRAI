const assert = require('assert');
const { searchGlobalIndex, highlightMatch, computeRelevanceScore } = require('../src/services/globalSearchService');
const { prisma, dbService } = require('../src/utils/prisma');

async function runStage30GlobalSearchTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING STAGE 30: GLOBAL SEARCH TEST SUITE');
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

  // Seed test users
  const userA = await dbService.createUser({
    email: `search_tenant_a_${Date.now()}@etrai.io`,
    passwordHash: '$2b$10$xyz',
    fullName: 'Search Analyst A',
    role: 'OWNER'
  });

  const userB = await dbService.createUser({
    email: `search_tenant_b_${Date.now()}@etrai.io`,
    passwordHash: '$2b$10$xyz',
    fullName: 'Search Analyst B',
    role: 'OWNER'
  });

  // Seed Analysis, Claims, Entities, Evidence for User A
  const analysisA = await prisma.analysis.create({
    data: {
      id: `ana_search_a_${Date.now()}`,
      userId: userA.id,
      title: 'Semiconductor Fabrication Ecosystem in Gujarat',
      summary: 'Government approves ₹76,000 Cr incentive scheme for semiconductor manufacturing units.',
      inputSource: 'Semiconductor Fabrication Ecosystem in Gujarat: Government approves ₹76,000 Cr incentive scheme for semiconductor manufacturing units.',
      selectedTypes: JSON.stringify(['FACT_CHECKING']),
      inputType: 'TEXT',
      verdict: 'VERIFIED',
      trustScore: 94
    }
  });

  const claimA = await prisma.claim.create({
    data: {
      id: `clm_search_a_${Date.now()}`,
      analysisId: analysisA.id,
      claimText: 'Micron Technology commenced construction of ATMP plant in Sanand',
      reasoning: 'Micron breaks ground on $2.75 Billion semiconductor facility in Sanand Gujarat announced by IT Minister Ashwini Vaishnaw',
      verdict: 'VERIFIED',
      confidence: 0.95
    }
  });

  await prisma.evidenceItem.create({
    data: {
      claimId: claimA.id,
      url: 'https://pib.gov.in/PressReleasePage.aspx?PRID=1959821',
      title: 'Press Information Bureau - Semiconductor Mission Update',
      domain: 'pib.gov.in',
      snippet: 'Sanand ATMP plant to generate over 5,000 direct high-tech engineering jobs.',
      stance: 'SUPPORTS',
      authorityScore: 98.0
    }
  });

  await prisma.namedEntity.create({
    data: {
      analysisId: analysisA.id,
      name: 'Micron Technology Inc.',
      type: 'ORGANIZATION',
      role: 'Semiconductor Manufacturer',
      finding: 'US memory and storage chip manufacturer establishing Sanand assembly testing facility.'
    }
  });

  // Seed Private Analysis for User B
  await prisma.analysis.create({
    data: {
      id: `ana_search_b_${Date.now()}`,
      userId: userB.id,
      title: 'Classified Defense Drone Procurement Report',
      summary: 'Confidential trial metrics on high-altitude surveillance UAV systems.',
      inputSource: 'Classified Defense Drone Procurement Report document payload',
      selectedTypes: JSON.stringify(['FACT_CHECKING']),
      inputType: 'FILE',
      verdict: 'VERIFIED',
      trustScore: 90
    }
  });

  // ----------------------------------------------------------------
  // Test 1: Omni-Search Across Multiple Models
  // ----------------------------------------------------------------
  await runTest('1. Omni-search finds matching Report, Claim, Evidence, and Entity in single query', async () => {
    const res = await searchGlobalIndex(userA.id, 'Sanand');

    assert.ok(res.totalMatches >= 3);
    assert.ok(res.items.some(i => i.type === 'CLAIM' && i.title.includes('Sanand')));
    assert.ok(res.items.some(i => i.type === 'EVIDENCE' && i.snippet.includes('Sanand')));
    assert.ok(res.items.some(i => i.type === 'ENTITY' && i.snippet.includes('Sanand')));
  });

  // ----------------------------------------------------------------
  // Test 2: Strict Tenant Isolation
  // ----------------------------------------------------------------
  await runTest('2. Tenant Isolation: User A cannot search or discover User B confidential reports', async () => {
    const resA = await searchGlobalIndex(userA.id, 'Defense Drone');
    const resB = await searchGlobalIndex(userB.id, 'Defense Drone');

    assert.strictEqual(resA.totalMatches, 0);
    assert.strictEqual(resA.items.length, 0);

    assert.strictEqual(resB.totalMatches, 1);
    assert.strictEqual(resB.items[0].title, 'Classified Defense Drone Procurement Report');
  });

  // ----------------------------------------------------------------
  // Test 3: Relevance Ranking & Match Scoring
  // ----------------------------------------------------------------
  await runTest('3. Relevance ranking prioritizes exact match titles over general body mentions', async () => {
    const res = await searchGlobalIndex(userA.id, 'Semiconductor');

    assert.ok(res.items.length >= 2);
    // Report title with exact word should rank highest
    const topItem = res.items[0];
    assert.ok(topItem.relevanceScore >= 60);
    assert.ok(topItem.title.includes('Semiconductor'));
  });

  // ----------------------------------------------------------------
  // Test 4: Match Substring Highlighting
  // ----------------------------------------------------------------
  await runTest('4. highlightMatch annotates search substrings with mark tags', async () => {
    const text = 'Micron breaks ground on $2.75 Billion semiconductor facility in Sanand';
    const highlighted = highlightMatch(text, 'semiconductor');

    assert.strictEqual(
      highlighted,
      'Micron breaks ground on $2.75 Billion <mark>semiconductor</mark> facility in Sanand'
    );
  });

  // ----------------------------------------------------------------
  // Test 5: Type-Specific Facet Filtering
  // ----------------------------------------------------------------
  await runTest('5. Type filter (type=CLAIMS) returns only claims and excludes other types', async () => {
    const claimsOnly = await searchGlobalIndex(userA.id, 'Sanand', { type: 'CLAIMS' });

    assert.ok(claimsOnly.items.length >= 1);
    assert.ok(claimsOnly.items.every(i => i.type === 'CLAIM'));
  });

  // Cleanup test records
  await prisma.evidenceItem.deleteMany({ where: { claim: { analysis: { userId: userA.id } } } });
  await prisma.namedEntity.deleteMany({ where: { analysis: { userId: userA.id } } });
  await prisma.claim.deleteMany({ where: { analysis: { userId: userA.id } } });
  await prisma.analysis.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });

  console.log('\n================================================================');
  console.log(`🏆 STAGE 30 TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runStage30GlobalSearchTests();
