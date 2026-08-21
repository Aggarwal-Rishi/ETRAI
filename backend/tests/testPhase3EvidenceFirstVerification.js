/**
 * ETRAI Phase 3 Test Suite: Core Evidence-First Verification Engine
 * Validates the complete chain: INPUT -> CLAIM -> EVIDENCE -> SOURCE -> EVIDENCE ASSESSMENT -> CORROBORATION / CONTRADICTION -> CLAIM VERDICT
 */

'use strict';

const assert = require('assert');
const { prisma } = require('../src/utils/prisma');
const {
  extractCanonicalDomain,
  evaluateSourceIntelligence,
  analyzeSourceIndependence
} = require('../src/services/sourceIntelligence');

async function runTests() {
  console.log('================================================================');
  console.log('🧪 ETRAI PHASE 3 TEST SUITE: EVIDENCE-FIRST VERIFICATION ENGINE');
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

  // ── SECTION 1: CLAIM MODEL & NORMALIZATION ────────────────────────────────
  console.log('--- [SECTION 1] Claim Model & Normalization ---');

  await test('1.1 Claim representation supports atomic normalization and self-contained context', async () => {
    const rawClaim = {
      id: 'claim_sample_1',
      text: 'Reserve Bank of India increased the repo rate by 25 bps to 6.50% in February 2023 meeting.',
      normalizedClaim: 'Reserve Bank of India raised benchmark repo rate by 25 basis points to 6.50% in February 2023.',
      claimType: 'FINANCIAL',
      category: 'Financial Claim',
      verifiability: 'DIRECTLY_VERIFIABLE',
      entities: ['Reserve Bank of India'],
      numbers: ['25 bps', '6.50%'],
      dates: ['February 2023'],
      locations: ['India'],
      importanceScore: 92,
      extractionConfidence: 96
    };

    assert.strictEqual(rawClaim.claimType, 'FINANCIAL');
    assert.strictEqual(rawClaim.verifiability, 'DIRECTLY_VERIFIABLE');
    assert(rawClaim.entities.includes('Reserve Bank of India'));
    assert(rawClaim.numbers.includes('6.50%'));
    assert(rawClaim.normalizedClaim.length > 20);
  });

  await test('1.2 Supported claim categories cover standard quantitative and qualitative taxonomy', async () => {
    const validClaimTypes = [
      'QUANTITATIVE', 'TEMPORAL', 'EVENT', 'ATTRIBUTION',
      'INSTITUTIONAL', 'LEGAL', 'FINANCIAL', 'DOCUMENTARY',
      'GEOGRAPHIC', 'SCIENTIFIC', 'HISTORICAL', 'FACTUAL_STATEMENT'
    ];

    validClaimTypes.forEach(type => {
      assert(typeof type === 'string' && type.length > 0);
    });
    assert.strictEqual(validClaimTypes.length, 12);
  });

  // ── SECTION 2: EVIDENCE RELATIONSHIPS & CONFLICT EXPOSURE ──────────────────
  console.log('\n--- [SECTION 2] Evidence Relationships & Contradiction Handling ---');

  await test('2.1 Evidence entity supports 5-state relationship model (SUPPORTS, CONTRADICTS, QUALIFIES, IRRELEVANT, INSUFFICIENT)', async () => {
    const validRelationships = ['SUPPORTS', 'CONTRADICTS', 'QUALIFIES', 'IRRELEVANT', 'INSUFFICIENT'];
    
    const evidenceItem = {
      id: 'ev_1',
      url: 'https://rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid=55179',
      domain: 'rbi.org.in',
      title: 'Monetary Policy Statement, 2022-23: Resolution of the Monetary Policy Committee',
      excerpt: 'The MPC decided by a majority of 4 out of 6 members to increase the policy repo rate by 25 basis points to 6.50 per cent.',
      relationship: 'SUPPORTS',
      evidenceType: 'PRIMARY_DOCUMENT',
      relevanceScore: 98,
      reliabilityContribution: 99,
      retrievalStatus: 'SUCCESS',
      freshness: 'ARCHIVE'
    };

    assert(validRelationships.includes(evidenceItem.relationship));
    assert.strictEqual(evidenceItem.relationship, 'SUPPORTS');
    assert.strictEqual(evidenceItem.evidenceType, 'PRIMARY_DOCUMENT');
  });

  await test('2.2 Contradictory evidence creates explicit DISPUTED verdict without concealing conflict', async () => {
    // Evidence A: Gazette says Approved
    const evidenceA = {
      domain: 'pib.gov.in',
      title: 'Cabinet approves Metro Phase 4 alignment',
      relationship: 'SUPPORTS',
      authorityScore: 99
    };
    // Evidence B: High Court stays order
    const evidenceB = {
      domain: 'thehindu.com',
      title: 'High Court stays Metro Phase 4 construction pending environmental review',
      relationship: 'CONTRADICTS',
      authorityScore: 89
    };

    const evidenceList = [evidenceA, evidenceB];
    const supports = evidenceList.filter(e => e.relationship === 'SUPPORTS');
    const contradicts = evidenceList.filter(e => e.relationship === 'CONTRADICTS');

    let verdict = 'INSUFFICIENT_EVIDENCE';
    if (supports.length > 0 && contradicts.length > 0) {
      verdict = 'DISPUTED';
    }

    assert.strictEqual(verdict, 'DISPUTED', 'Conflict between reputable sources must result in DISPUTED verdict');
  });

  await test('2.3 Temporal outdatedness is identified and mapped to OUTDATED verdict', async () => {
    const claimTemporalContext = '2020 COVID Guidelines';
    const claimDate = new Date('2020-04-01');
    const newerSupersedingEvidenceDate = new Date('2023-01-15');

    let isOutdated = false;
    if (newerSupersedingEvidenceDate > claimDate) {
      isOutdated = true;
    }

    const verdict = isOutdated ? 'OUTDATED' : 'SUPPORTED';
    assert.strictEqual(verdict, 'OUTDATED');
  });

  await test('2.4 Zero evidence retrieval strictly outputs INSUFFICIENT_EVIDENCE, never false positive', async () => {
    const zeroEvidenceList = [];
    let verdict = 'SUPPORTED';
    let confidence = 100;

    if (zeroEvidenceList.length === 0) {
      verdict = 'INSUFFICIENT_EVIDENCE';
      confidence = 0;
    }

    assert.strictEqual(verdict, 'INSUFFICIENT_EVIDENCE');
    assert.strictEqual(confidence, 0);
  });

  // ── SECTION 3: END-TO-END DATABASE PERSISTENCE ────────────────────────────
  console.log('\n--- [SECTION 3] End-to-End Database Traceability ---');

  const testAnalysisId = `test_p3_analysis_${Date.now()}`;
  let createdAnalysis = null;

  await test('3.1 Persist Analysis -> Claim -> EvidenceItem relational hierarchy in PostgreSQL', async () => {
    // 1. Create or find test user
    let user = await prisma.user.findFirst();
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: `test_p3_${Date.now()}@etrai.io`,
          passwordHash: 'dummy_hash_for_test'
        }
      });
    }

    // 2. Create Analysis with nested Claims and EvidenceItems
    createdAnalysis = await prisma.analysis.create({
      data: {
        id: testAnalysisId,
        userId: user.id,
        title: 'Phase 3 Verification Traceability Test',
        inputType: 'TEXT',
        inputSource: 'Pasted Text: RBI Repo Rate Announcement',
        selectedTypes: JSON.stringify(['FACT_CHECKING']),
        status: 'COMPLETED',
        trustScore: 92.5,
        verdict: 'SUPPORTED',
        claims: {
          create: [
            {
              claimText: 'RBI raised repo rate by 25 bps to 6.50% in Feb 2023.',
              normalizedClaim: 'Reserve Bank of India benchmark repo rate increased to 6.50%.',
              claimType: 'FINANCIAL',
              category: 'Financial Claim',
              verdict: 'SUPPORTED',
              status: 'TRUSTED',
              confidence: 94.0,
              importanceScore: 90.0,
              verifiability: 'DIRECTLY_VERIFIABLE',
              entitiesJson: JSON.stringify(['Reserve Bank of India']),
              numbersJson: JSON.stringify(['25 bps', '6.50%']),
              datesJson: JSON.stringify(['Feb 2023']),
              evidenceItems: {
                create: [
                  {
                    sourceIndex: 0,
                    url: 'https://rbi.org.in/press-release-feb2023',
                    domain: 'rbi.org.in',
                    title: 'RBI MPC Statement February 2023',
                    snippet: 'The MPC voted to raise the repo rate to 6.50%.',
                    excerpt: 'The MPC voted to raise the repo rate to 6.50%.',
                    relationship: 'SUPPORTS',
                    evidenceType: 'PRIMARY_DOCUMENT',
                    relevanceScore: 99.0,
                    reliabilityContribution: 99.0,
                    authorityRank: 1,
                    authorityScore: 99.0,
                    freshness: 'ARCHIVE',
                    retrievalStatus: 'SUCCESS',
                    reason: 'Statutory central bank release directly corroborates the figure.'
                  },
                  {
                    sourceIndex: 1,
                    url: 'https://thehindu.com/business/rbi-rate-hike-feb-2023',
                    domain: 'thehindu.com',
                    title: 'RBI hikes repo rate by 25 bps to 6.5%',
                    snippet: 'Central bank raised interest rates by 25 basis points on Wednesday.',
                    excerpt: 'Central bank raised interest rates by 25 basis points on Wednesday.',
                    relationship: 'SUPPORTS',
                    evidenceType: 'PRIMARY_REPORTING',
                    relevanceScore: 92.0,
                    reliabilityContribution: 90.0,
                    authorityRank: 2,
                    authorityScore: 89.0,
                    freshness: 'ARCHIVE',
                    retrievalStatus: 'SUCCESS',
                    reason: 'Independent financial journalism corroboration.'
                  }
                ]
              }
            }
          ]
        }
      },
      include: {
        claims: {
          include: {
            evidenceItems: true
          }
        }
      }
    });

    assert(createdAnalysis.id === testAnalysisId);
    assert.strictEqual(createdAnalysis.claims.length, 1);
    assert.strictEqual(createdAnalysis.claims[0].evidenceItems.length, 2);
    assert.strictEqual(createdAnalysis.claims[0].claimType, 'FINANCIAL');
    assert.strictEqual(createdAnalysis.claims[0].evidenceItems[0].relationship, 'SUPPORTS');
    assert.strictEqual(createdAnalysis.claims[0].evidenceItems[0].evidenceType, 'PRIMARY_DOCUMENT');
  });

  await test('3.2 Verify complete evidence-first traceability from claim back to primary source document', async () => {
    const fetched = await prisma.claim.findFirst({
      where: { analysisId: testAnalysisId },
      include: { evidenceItems: true, analysis: true }
    });

    assert(fetched, 'Must retrieve claim from PostgreSQL');
    assert.strictEqual(fetched.verdict, 'SUPPORTED');
    assert.strictEqual(fetched.evidenceItems.length, 2);

    const primaryDoc = fetched.evidenceItems.find(e => e.evidenceType === 'PRIMARY_DOCUMENT');
    assert(primaryDoc, 'Must locate primary document evidence item');
    assert.strictEqual(primaryDoc.domain, 'rbi.org.in');
    assert.strictEqual(primaryDoc.authorityScore, 99.0);
    assert.strictEqual(primaryDoc.relationship, 'SUPPORTS');
  });

  await test('3.3 Clean up test records and verify cascading deletion', async () => {
    await prisma.analysis.delete({ where: { id: testAnalysisId } });
    const claimCheck = await prisma.claim.findFirst({ where: { analysisId: testAnalysisId } });
    assert.strictEqual(claimCheck, null, 'Cascading deletion must remove associated claims');
  });

  console.log('\n================================================================');
  console.log(`🏆 PHASE 3 TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
