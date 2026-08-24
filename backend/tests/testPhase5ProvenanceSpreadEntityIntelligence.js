/**
 * ETRAI Phase 5 Comprehensive Verification Test Suite
 * Validates:
 * 1. URL Canonicalization & Content Hashing
 * 2. Duplicate / Syndication Detection & Non-Corroboration Isolation
 * 3. Provenance Graph Construction (ORIGINAL -> SOURCE -> REPOST -> ARTICLE -> SOCIAL POST -> CURRENT INPUT)
 * 4. First-Known Appearance vs Confirmed Origin vs PROVENANCE INSUFFICIENT
 * 5. Multi-Type Named Entity Extraction (People, Orgs, Governments, Companies, Products, Locations, Events, Documents)
 * 6. Entity-to-Claim Relational Connections
 * 7. Quote Attribution Verification & Alteration Detection (Unattributed Statements Guard)
 * 8. Potential Framing Signals Analysis with Calibrated Inference
 * 9. Spread Graph & Amplification Pattern Categorization
 * 10. End-to-End Prisma Database Persistence & Relational Querying
 */

'use strict';

const assert = require('assert');
const {
  canonicalizeUrl,
  computeContentHash,
  computeMediaHash,
  computeJaccardSimilarity,
  computeCosineSimilarity,
  clusterAndTagDuplicates
} = require('../src/services/canonicalizer');

const {
  analyzeContentProvenance,
  extractTimestamp,
  formatTimeLabel,
  detectModifications
} = require('../src/services/provenanceEngine');

const {
  performEntityAndIntentAnalysis,
  extractEntitiesDeterministic,
  extractQuotesAndAttributions,
  connectEntitiesToClaims,
  analyzePotentialFramingSignals
} = require('../src/services/entityIntentService');

const { generateReport } = require('../src/services/reportGenerator');
const { prisma, dbService } = require('../src/utils/prisma');

async function runPhase5TestSuite() {
  console.log('================================================================================');
  console.log('🚀 RUNNING ETRAI PHASE 5: PROVENANCE, SPREAD & ENTITY INTELLIGENCE TEST SUITE');
  console.log('================================================================================\n');

  let passed = 0;
  let failed = 0;

  const test = async (name, fn) => {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(`     Error: ${err.message}\n`, err.stack);
      failed++;
    }
  };

  // ---------------------------------------------------------------------------
  // 1. URL CANONICALIZATION & CONTENT HASHING
  // ---------------------------------------------------------------------------
  await test('1. URL Canonicalization: Strips tracking params, normalizes hosts, protocols, and trailing slashes', async () => {
    const rawUrl1 = 'HTTPS://WWW.Reuters.COM/world/india/article-123/?utm_source=twitter&utm_medium=social&fbclid=IwAR123&ref=feed#section-2';
    const canonical1 = canonicalizeUrl(rawUrl1);
    assert.strictEqual(canonical1, 'https://reuters.com/world/india/article-123', 'Must strip tracking parameters, www prefix, and hash fragment');

    const rawUrl2 = 'http://thehindu.com:80/news/national/?b=2&a=1&gclid=999/';
    const canonical2 = canonicalizeUrl(rawUrl2);
    assert.strictEqual(canonical2, 'http://thehindu.com/news/national?a=1&b=2', 'Must sort query parameters and strip trailing slash and default port');

    const hash1 = computeContentHash('Cabinet Approves New Semiconductor Scheme in New Delhi.');
    const hash2 = computeContentHash('  cabinet approves new semiconductor scheme in new delhi.  \n');
    assert.ok(hash1, 'Content hash must be non-empty string');
    assert.strictEqual(hash1, hash2, 'Normalized content hashes must match identically');
  });

  // ---------------------------------------------------------------------------
  // 2. DUPLICATE / SYNDICATION DETECTION & INDEPENDENT GROUPING
  // ---------------------------------------------------------------------------
  await test('2. Duplicate Detection: Groups syndicated wire copies and excludes them from independent corroboration', async () => {
    const rawSources = [
      {
        url: 'https://reuters.com/technology/semiconductor-policy-approved-2026-08-19',
        domain: 'reuters.com',
        title: 'India approves $10B semiconductor incentive package',
        snippet: 'The union cabinet chaired by Prime Minister approved the revised incentive structure for chipmakers.'
      },
      {
        url: 'https://timesofindia.indiatimes.com/business/india-business/chip-policy-2026?utm_source=rss',
        domain: 'timesofindia.indiatimes.com',
        title: 'India approves $10B semiconductor incentive package (via Reuters)',
        snippet: 'The union cabinet chaired by Prime Minister approved the revised incentive structure for chipmakers reported by Reuters.'
      },
      {
        url: 'https://unrelated-blog.com/tech-news/chip-policy',
        domain: 'unrelated-blog.com',
        title: 'India approves $10B semiconductor incentive package',
        snippet: 'The union cabinet chaired by Prime Minister approved the revised incentive structure for chipmakers according to Reuters.'
      },
      {
        url: 'https://thehindu.com/opinion/editorial/chip-manufacturing-analysis',
        domain: 'thehindu.com',
        title: 'Editorial: The long road to domestic semiconductor manufacturing',
        snippet: 'While the statutory financial outlays are promising, supply chain logistics and water infrastructure remain critical bottlenecks.'
      }
    ];

    const clusterRes = clusterAndTagDuplicates(rawSources);

    assert.strictEqual(clusterRes.sources.length, 4);
    assert.strictEqual(clusterRes.duplicateCount, 2, 'Two syndicated wire copies must be flagged as duplicates');
    assert.strictEqual(clusterRes.independentCount, 2, 'There must be only 2 independent clusters (Reuters Wire + The Hindu Editorial)');

    const reutersPrimary = clusterRes.sources.find(s => s.domain === 'reuters.com');
    const toiCopy = clusterRes.sources.find(s => s.domain === 'timesofindia.indiatimes.com');
    const hinduEditorial = clusterRes.sources.find(s => s.domain === 'thehindu.com');

    assert.strictEqual(reutersPrimary.isIndependent, true);
    assert.strictEqual(reutersPrimary.isSyndicatedDuplicate, false);

    assert.strictEqual(toiCopy.isIndependent, false, 'Syndicated copy must not be independent');
    assert.strictEqual(toiCopy.isSyndicatedDuplicate, true);
    assert.strictEqual(toiCopy.independenceGroup, reutersPrimary.independenceGroup, 'Duplicate must share independenceGroup with wire primary');

    assert.strictEqual(hinduEditorial.isIndependent, true);
    assert.notStrictEqual(hinduEditorial.independenceGroup, reutersPrimary.independenceGroup);
  });

  // ---------------------------------------------------------------------------
  // 3. PROVENANCE GRAPH & FIRST-KNOWN APPEARANCE
  // ---------------------------------------------------------------------------
  await test('3. Provenance Graph: Constructs nodes & edges (ORIGINAL -> SOURCE -> REPOST -> ARTICLE -> SOCIAL POST -> CURRENT INPUT)', async () => {
    const rawSources = [
      {
        url: 'https://pib.gov.in/PressReleasePage.aspx?PRID=12345',
        domain: 'pib.gov.in',
        title: 'Official Gazette Release: Semiconductor PLI Notification',
        publishedAt: '2026-08-19T04:00:00Z',
        authorityRank: 1,
        stance: 'SUPPORTS'
      },
      {
        url: 'https://thehindu.com/news/national/semiconductor-nod',
        domain: 'thehindu.com',
        title: 'India clears semiconductor outlay',
        publishedAt: '2026-08-19T05:30:00Z',
        authorityRank: 2,
        stance: 'SUPPORTS'
      },
      {
        url: 'https://tech-repost.net/news/india-chips',
        domain: 'tech-repost.net',
        title: 'India clears semiconductor outlay',
        publishedAt: '2026-08-19T06:00:00Z',
        authorityRank: 4,
        isSyndicatedDuplicate: true,
        stance: 'SUPPORTS'
      },
      {
        url: 'https://x.com/tech_leaks/status/987654321',
        domain: 'x.com',
        title: 'Viral discussion on chip scheme',
        publishedAt: '2026-08-19T08:00:00Z',
        sourceType: 'SOCIAL_MEDIA',
        authorityRank: 4,
        stance: 'SUPPORTS'
      }
    ];

    const prov = analyzeContentProvenance({
      sources: rawSources,
      inputSource: 'https://user-submission.local/check-claim',
      extractedText: 'Cabinet approves semiconductor incentive scheme.'
    });

    assert.strictEqual(prov.originAnalysis.originStatus, 'CONFIRMED_ORIGIN', 'Official PIB release must yield CONFIRMED_ORIGIN');
    assert.strictEqual(prov.originAnalysis.originPublisher, 'Press Information Bureau (PIB)');
    assert.ok(prov.originAnalysis.originConfidence >= 90);

    // Verify Graph structure
    assert.ok(prov.graph, 'Provenance graph object must exist');
    assert.strictEqual(prov.graph.nodes.length, 5, 'Must contain 4 source nodes + 1 Current Input node');
    assert.strictEqual(prov.graph.edges.length, 4, 'Must contain 4 connecting edges along the lineage path');

    const nodeTypes = prov.graph.nodes.map(n => n.nodeType);
    assert.strictEqual(nodeTypes[0], 'ORIGINAL');
    assert.strictEqual(nodeTypes[1], 'ARTICLE');
    assert.strictEqual(nodeTypes[2], 'REPOST');
    assert.strictEqual(nodeTypes[3], 'SOCIAL_POST');
    assert.strictEqual(nodeTypes[4], 'CURRENT_INPUT');

    // Verify Edges
    assert.strictEqual(prov.graph.edges[0].relationshipType, 'PROPAGATION');
    assert.strictEqual(prov.graph.edges[1].relationshipType, 'SYNDICATION');
    assert.strictEqual(prov.graph.edges[2].relationshipType, 'AMPLIFICATION');
    assert.strictEqual(prov.graph.edges[3].relationshipType, 'DERIVATIVE');
  });

  // ---------------------------------------------------------------------------
  // 4. UNCERTAIN PROVENANCE & "FIRST KNOWN APPEARANCE" TERMINOLOGY
  // ---------------------------------------------------------------------------
  await test('4. Uncertain Provenance: Uses "FIRST KNOWN APPEARANCE" when certainty is limited and "PROVENANCE INSUFFICIENT" when empty', async () => {
    // Scenario A: Non-official newsroom reporting -> MUST use FIRST KNOWN APPEARANCE without claiming certified original source
    const newsSources = [
      {
        url: 'https://thewire.in/tech/report-on-data-governance',
        domain: 'thewire.in',
        title: 'Investigation into proposed data governance amendments',
        publishedAt: '2026-08-18T10:00:00Z',
        authorityRank: 2,
        stance: 'SUPPORTS'
      },
      {
        url: 'https://news-aggregator.xyz/data-leak',
        domain: 'news-aggregator.xyz',
        title: 'Circulating copy of data governance report',
        publishedAt: '2026-08-18T14:00:00Z',
        authorityRank: 4,
        stance: 'SUPPORTS'
      }
    ];

    const provA = analyzeContentProvenance({ sources: newsSources, inputSource: 'Data Governance Report' });
    assert.strictEqual(provA.originAnalysis.originStatus, 'FIRST_KNOWN_APPEARANCE');
    assert.ok(provA.originAnalysis.rationale.includes('FIRST KNOWN APPEARANCE'), 'Rationale must use FIRST KNOWN APPEARANCE terminology');
    assert.ok(provA.firstKnownAppearance, 'firstKnownAppearance object must be present');
    assert.strictEqual(provA.firstKnownAppearance.status, 'FIRST_KNOWN_APPEARANCE');
    assert.ok(provA.firstKnownAppearance.terminologyNote.includes('does not imply certified original creator'));

    // Scenario B: Empty sources -> MUST report PROVENANCE INSUFFICIENT
    const provB = analyzeContentProvenance({ sources: [], inputSource: 'Anonymous unverified rumor' });
    assert.strictEqual(provB.originAnalysis.originStatus, 'PROVENANCE_INSUFFICIENT');
    assert.strictEqual(provB.originAnalysis.originConfidence, 0);
    assert.ok(provB.originAnalysis.rationale.includes('PROVENANCE INSUFFICIENT'));
    assert.strictEqual(provB.firstKnownAppearance, null);
  });

  // ---------------------------------------------------------------------------
  // 5. NAMED ENTITY EXTRACTION (8 TYPES)
  // ---------------------------------------------------------------------------
  await test('5. Named Entity Extraction: Accurately extracts People, Orgs, Governments, Companies, Products, Locations, Events, and Documents', async () => {
    const sampleProse = `
      Governor Shaktikanta Das and Finance Minister Nirmala Sitharaman attended the G20 Summit in New Delhi.
      The Ministry of Finance and Reserve Bank of India (RBI) reviewed the Unified Payments Interface (UPI) framework
      in collaboration with Tata Motors and Infosys Limited. According to The Gazette of India Notification No. 412,
      the World Health Organization (WHO) and United Nations (UN) endorsed the cross-border digital payment standard.
    `;

    const entities = extractEntitiesDeterministic(sampleProse);
    assert.ok(entities.length >= 6, 'Must extract comprehensive entity set');

    const byType = (type) => entities.filter(e => e.type === type);

    const people = byType('PERSON');
    const govBodies = byType('GOVERNMENT_BODY');
    const companies = byType('COMPANY');
    const products = byType('PRODUCT');
    const locations = byType('LOCATION');
    const events = byType('EVENT');
    const documents = byType('DOCUMENT');
    const orgs = byType('ORGANIZATION');

    assert.ok(govBodies.some(g => g.normalizedName.includes('Reserve Bank of India') || g.normalizedName.includes('Ministry of Finance')), 'Must identify Government Bodies');
    assert.ok(companies.some(c => c.normalizedName.includes('Tata Motors') || c.normalizedName.includes('Infosys')), 'Must identify Companies');
    assert.ok(products.some(p => p.normalizedName.includes('Unified Payments Interface')), 'Must identify Products');
    assert.ok(locations.some(l => l.normalizedName.includes('New Delhi') || l.name.includes('Delhi')), 'Must identify Locations');
    assert.ok(events.some(ev => ev.normalizedName.includes('G20')), 'Must identify Events');
    assert.ok(documents.some(d => d.normalizedName.includes('Gazette of India') || d.normalizedName.includes('Notification')), 'Must identify Documents');
    assert.ok(orgs.some(o => o.normalizedName.includes('World Health Organization') || o.normalizedName.includes('United Nations')), 'Must identify Organizations');
  });

  // ---------------------------------------------------------------------------
  // 6. ENTITY-TO-CLAIM CONNECTIONS
  // ---------------------------------------------------------------------------
  await test('6. Entity-to-Claim Mapping: Links entities to claims with relational roles (QUOTED_SPEAKER, TARGET, JURISDICTION, EVIDENCE_ANCHOR)', async () => {
    const entities = [
      { id: 'ent_1', name: 'GOVERNOR DAS', normalizedName: 'Governor Shaktikanta Das', type: 'PERSON', confidence: 95 },
      { id: 'ent_2', name: 'RBI', normalizedName: 'Reserve Bank of India (RBI)', type: 'GOVERNMENT_BODY', confidence: 95 },
      { id: 'ent_3', name: 'NEW DELHI', normalizedName: 'New Delhi', type: 'LOCATION', confidence: 90 },
      { id: 'ent_4', name: 'GAZETTE', normalizedName: 'The Gazette of India', type: 'DOCUMENT', confidence: 90 }
    ];

    const claims = [
      {
        id: 'claim_101',
        claimText: 'Governor Shaktikanta Das stated that RBI will maintain benchmark interest rates in New Delhi as per The Gazette of India order.'
      }
    ];

    const connections = connectEntitiesToClaims(entities, claims);

    assert.strictEqual(connections.length, 4);
    const speakerConn = connections.find(c => c.entityType === 'PERSON');
    const locConn = connections.find(c => c.entityType === 'LOCATION');
    const docConn = connections.find(c => c.entityType === 'DOCUMENT');

    assert.strictEqual(speakerConn.roleInClaim, 'QUOTED_SPEAKER');
    assert.strictEqual(locConn.roleInClaim, 'JURISDICTION');
    assert.strictEqual(docConn.roleInClaim, 'EVIDENCE_ANCHOR');
  });

  // ---------------------------------------------------------------------------
  // 7. QUOTE ATTRIBUTION & ALTERATION DETECTION
  // ---------------------------------------------------------------------------
  await test('7. Quote Attribution: Identifies claimed speakers, flags altered/spliced quotes, and marks unattributed assertions', async () => {
    const textWithQuotes = `
      Governor Shaktikanta Das stated "Benchmark repo rates will remain calibrated to domestic inflation trends."
      Meanwhile, an unverified social post asserted "Emergency bank lockup starting next Monday... all ATMs will run dry!"
      Another circulating quote claimed: "[The Ministry] has completely failed to control commodity prices."
    `;

    const quotes = extractQuotesAndAttributions(textWithQuotes, [
      { domain: 'rbi.org.in', title: 'Monetary Policy Statement', authorityRank: 1, stance: 'SUPPORTS' }
    ]);

    assert.strictEqual(quotes.length, 3);

    const attributedQuote = quotes[0];
    assert.strictEqual(attributedQuote.hasAttributedSpeaker, true);
    assert.ok(attributedQuote.claimedSpeaker.includes('Governor Shaktikanta Das'));
    assert.strictEqual(attributedQuote.isAuthoritative, true);

    const splicedQuote = quotes[1];
    assert.strictEqual(splicedQuote.hasAttributedSpeaker, false);
    assert.strictEqual(splicedQuote.verificationStatus, 'UNATTRIBUTED_ASSERTION', 'Unattributed quote must NOT be treated as verified');
    assert.strictEqual(splicedQuote.isAltered, true);
    assert.ok(splicedQuote.alterationDetails.includes('Ellipsis detected'));

    const bracketedQuote = quotes[2];
    assert.strictEqual(bracketedQuote.isAltered, true);
    assert.ok(bracketedQuote.alterationDetails.includes('Bracketed editorial interpolations'));
  });

  // ---------------------------------------------------------------------------
  // 8. POTENTIAL FRAMING SIGNALS ENGINE
  // ---------------------------------------------------------------------------
  await test('8. Framing Signals: Identifies Sensationalism, Engagement Bait, Urgency, and Monetization as "Potential framing signals"', async () => {
    const alarmistText = `
      URGENT EMERGENCY ALERT: Immediate nationwide blackout and catastrophic power grid failure will collapse all hospitals within 24 hours!
      You won't believe what the government is hiding! Share before deleted!
      Buy gold and crypto now for guaranteed 1000% returns using promo code PANIC2026.
    `;

    const framing = analyzePotentialFramingSignals(alarmistText, [], []);

    assert.strictEqual(framing.isAnalyticalInference, true, 'Must strictly be marked as analytical inference');
    assert.ok(framing.potentialFramingSignals.includes('SENSATIONAL_FRAMING'));
    assert.ok(framing.potentialFramingSignals.includes('ENGAGEMENT_BAIT'));
    assert.ok(framing.potentialFramingSignals.includes('URGENCY_PRESSURE'));
    assert.ok(framing.potentialFramingSignals.includes('MONETIZATION_PROMOTION'));
    assert.ok(framing.confidence >= 70);
    assert.ok(framing.reasoning.includes('analytical structural inference, not a definitive psychological claim'));
  });

  // ---------------------------------------------------------------------------
  // 9. SPREAD & AMPLIFICATION GRAPH
  // ---------------------------------------------------------------------------
  await test('9. Spread Graph: Computes domain diversity, propagation span, and coordinated reposting heuristics with calibrated confidence', async () => {
    const spreadSources = [
      { domain: 'wire.com', authorityRank: 2, publishedAt: '2026-08-19T01:00:00Z', isSyndicatedDuplicate: false },
      { domain: 'junk-portal1.info', authorityRank: 4, publishedAt: '2026-08-19T01:10:00Z', isSyndicatedDuplicate: true },
      { domain: 'junk-portal2.info', authorityRank: 4, publishedAt: '2026-08-19T01:12:00Z', isSyndicatedDuplicate: true },
      { domain: 'junk-portal3.info', authorityRank: 4, publishedAt: '2026-08-19T01:15:00Z', isSyndicatedDuplicate: true },
      { domain: 'junk-portal4.info', authorityRank: 4, publishedAt: '2026-08-19T01:18:00Z', isSyndicatedDuplicate: true },
      { domain: 'junk-portal5.info', authorityRank: 4, publishedAt: '2026-08-19T01:20:00Z', isSyndicatedDuplicate: true }
    ];

    const prov = analyzeContentProvenance({ sources: spreadSources, inputSource: 'Coordinated story check' });
    const spread = prov.spreadAnalysis;

    assert.strictEqual(spread.distinctDomainsCount, 6);
    assert.strictEqual(spread.repostCount, 5);
    assert.strictEqual(spread.coordinationAssessment.pattern, 'MEDIUM');
    assert.ok(spread.coordinationAssessment.confidence >= 60);
    assert.ok(spread.coordinationAssessment.rationale.includes('High-velocity synchronized republication'));
    assert.strictEqual(spread.amplificationPattern, 'COORDINATED_AMPLIFICATION_SUSPECTED');
  });

  // ---------------------------------------------------------------------------
  // 10. DATABASE PERSISTENCE & PRISMA RELATIONAL RETRIEVAL
  // ---------------------------------------------------------------------------
  await test('10. Database Persistence: Persists ProvenanceNodes, SpreadClusters, QuoteAttributions, and NamedEntities into Prisma models', async () => {
    const testUser = await dbService.createUser({
      email: `prov_p5_user_${Date.now()}@etrai.local`,
      passwordHash: 'hashed_pw_test',
      name: 'Phase 5 Provenance User'
    });

    const workspace = await dbService.getWorkspaceForUser(testUser.id);
    const jobId = `phase5_job_${Date.now()}`;

    const analysis = await prisma.analysis.create({
      data: {
        id: jobId,
        userId: testUser.id,
        workspaceId: workspace.id,
        title: 'Phase 5 Full Relational Test Run',
        inputType: 'TEXT',
        inputSource: 'Verified Gazette Notification',
        selectedTypes: JSON.stringify(['FACT_CHECKING', 'FAKE_NEWS_DETECTION']),
        summary: 'Provenance and Entity Intelligence full run',
        provenanceNodes: {
          create: [
            {
              url: 'https://pib.gov.in/release/1',
              domain: 'pib.gov.in',
              publishedAt: new Date('2026-08-19T04:00:00Z'),
              sourceRelationship: 'ORIGINAL_CREATION',
              nodeType: 'ORIGINAL',
              confidence: 95.0,
              isFirstKnownAppearance: true,
              sequenceOrder: 1,
              publisher: 'Press Information Bureau (PIB)'
            },
            {
              url: 'https://reuters.com/news/1',
              domain: 'reuters.com',
              publishedAt: new Date('2026-08-19T05:00:00Z'),
              sourceRelationship: 'NEWS_SYNDICATION',
              nodeType: 'ARTICLE',
              confidence: 85.0,
              isFirstKnownAppearance: false,
              sequenceOrder: 2,
              publisher: 'Reuters'
            }
          ]
        },
        spreadClusters: {
          create: [
            {
              clusterName: 'Organic Press Diffusion',
              clusterType: 'SYNDICATION',
              repostCount: 1,
              domainCount: 2,
              velocityLabel: '1.0h span',
              coordinationConfidence: 15.0,
              coordinationPattern: 'UNSUPPORTED',
              evidenceRationale: 'Standard organic press syndication observed.'
            }
          ]
        },
        entities: {
          create: [
            {
              name: 'RESERVE BANK OF INDIA',
              role: 'National',
              type: 'GOVERNMENT_BODY',
              status: 'VERIFIED',
              finding: 'Central statutory banking authority',
              confidence: 95.0,
              mentionsCount: 2
            }
          ]
        },
        quoteAttributions: {
          create: [
            {
              quoteText: 'Benchmark repo rates will remain calibrated to inflation trends.',
              claimedSpeaker: 'Governor Shaktikanta Das',
              claimedAffiliation: 'Reserve Bank of India',
              verificationStatus: 'VERIFIED_ATTRIBUTION',
              isAuthoritative: true,
              confidence: 92.0
            }
          ]
        }
      }
    });

    const retrieved = await dbService.findAnalysisById(analysis.id, testUser.id);
    assert.ok(retrieved, 'Retrieved record must exist');
    assert.strictEqual(retrieved.provenanceNodes.length, 2);
    assert.strictEqual(retrieved.provenanceNodes[0].domain, 'pib.gov.in');
    assert.strictEqual(retrieved.provenanceNodes[0].isFirstKnownAppearance, true);
    assert.strictEqual(retrieved.spreadClusters.length, 1);
    assert.strictEqual(retrieved.spreadClusters[0].clusterType, 'SYNDICATION');
    assert.strictEqual(retrieved.entities.length, 1);
    assert.strictEqual(retrieved.entities[0].type, 'GOVERNMENT_BODY');
    assert.strictEqual(retrieved.quoteAttributions.length, 1);
    assert.strictEqual(retrieved.quoteAttributions[0].verificationStatus, 'VERIFIED_ATTRIBUTION');

    // Clean up
    await dbService.deleteAnalysisById(analysis.id, testUser.id);
    await prisma.user.delete({ where: { id: testUser.id } });
  });

  console.log('\n================================================================================');
  console.log(`🏆 PHASE 5 TEST SUITE RESULTS: ${passed} passed, ${failed} failed`);
  console.log('================================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase5TestSuite().catch(e => {
  console.error('[Fatal Test Error]:', e);
  process.exit(1);
});
