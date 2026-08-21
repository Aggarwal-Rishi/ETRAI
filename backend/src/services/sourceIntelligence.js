/**
 * ETRAI Source Intelligence & Source Ranking Engine
 * Production-grade multi-dimensional source evaluation, corporate syndication grouping,
 * and persistent registry integration.
 */

'use strict';

const { prisma } = require('../utils/prisma');

// ── 1. Comprehensive Known Media & Authority Directory ──────────────────────
const KNOWN_PUBLICATIONS = {
  // Primary Authorities (Rank 1: 95-100)
  'pib.gov.in': { name: 'Press Information Bureau (PIB)', rank: 1, authority: 99, reliability: 98, type: 'OFFICIAL_GAZETTE', role: 'PRIMARY_AUTHORITY', parentCompany: 'Government of India', syndicationGroup: 'PIB_WIRE', purpose: 'Official government press release & notification', directness: 'PRIMARY_DIRECT' },
  'pmo.gov.in': { name: 'Prime Minister Office (PMO)', rank: 1, authority: 99, reliability: 98, type: 'OFFICIAL_GAZETTE', role: 'PRIMARY_AUTHORITY', parentCompany: 'Government of India', syndicationGroup: 'PMO_DIRECT', purpose: 'Head of government executive announcements', directness: 'PRIMARY_DIRECT' },
  'gazette.gov.in': { name: 'The Gazette of India', rank: 1, authority: 100, reliability: 100, type: 'OFFICIAL_GAZETTE', role: 'PRIMARY_AUTHORITY', parentCompany: 'Government of India', syndicationGroup: 'GAZETTE_OFFICIAL', purpose: 'Statutory government notifications & legislative acts', directness: 'PRIMARY_DIRECT' },
  'rbi.org.in': { name: 'Reserve Bank of India', rank: 1, authority: 99, reliability: 99, type: 'OFFICIAL_GAZETTE', role: 'PRIMARY_AUTHORITY', parentCompany: 'Reserve Bank of India', syndicationGroup: 'RBI_CENTRAL_BANK', purpose: 'Monetary policy circulars & banking regulations', directness: 'PRIMARY_DIRECT' },
  'sci.gov.in': { name: 'Supreme Court of India', rank: 1, authority: 100, reliability: 100, type: 'OFFICIAL_GAZETTE', role: 'PRIMARY_AUTHORITY', parentCompany: 'Judiciary of India', syndicationGroup: 'SCI_JUDICIARY', purpose: 'Judicial rulings, court orders & records', directness: 'PRIMARY_DIRECT' },
  'whitehouse.gov': { name: 'The White House', rank: 1, authority: 99, reliability: 98, type: 'OFFICIAL_GAZETTE', role: 'PRIMARY_AUTHORITY', parentCompany: 'US Federal Government', syndicationGroup: 'US_GOV', purpose: 'Executive orders & official administration statements', directness: 'PRIMARY_DIRECT' },
  'who.int': { name: 'World Health Organization (WHO)', rank: 1, authority: 98, reliability: 97, type: 'OFFICIAL_GAZETTE', role: 'PRIMARY_AUTHORITY', parentCompany: 'United Nations', syndicationGroup: 'UN_WHO', purpose: 'Global public health guidelines & epidemiological data', directness: 'PRIMARY_DIRECT' },
  'un.org': { name: 'United Nations', rank: 1, authority: 98, reliability: 97, type: 'OFFICIAL_GAZETTE', role: 'PRIMARY_AUTHORITY', parentCompany: 'United Nations', syndicationGroup: 'UN_OFFICIAL', purpose: 'Treaties, international resolutions & global metrics', directness: 'PRIMARY_DIRECT' },
  
  // Specialists & Peer-Reviewed Science (Rank 1/2: 92-98)
  'nature.com': { name: 'Nature Publishing Group', rank: 1, authority: 97, reliability: 96, type: 'SPECIALIZED_DESK', role: 'SPECIALIST', parentCompany: 'Springer Nature', syndicationGroup: 'NATURE_SPRINGER', purpose: 'Peer-reviewed scientific research & data', directness: 'PRIMARY_DIRECT' },
  'thelancet.com': { name: 'The Lancet', rank: 1, authority: 97, reliability: 96, type: 'SPECIALIZED_DESK', role: 'SPECIALIST', parentCompany: 'Elsevier', syndicationGroup: 'ELSEVIER_MED', purpose: 'Peer-reviewed clinical & medical journal', directness: 'PRIMARY_DIRECT' },
  'science.org': { name: 'Science (AAAS)', rank: 1, authority: 97, reliability: 96, type: 'SPECIALIZED_DESK', role: 'SPECIALIST', parentCompany: 'AAAS', syndicationGroup: 'SCIENCE_AAAS', purpose: 'Peer-reviewed academic research', directness: 'PRIMARY_DIRECT' },

  // Fact-Checkers (Rank 1/2: 90-95)
  'snopes.com': { name: 'Snopes Fact Desk', rank: 1, authority: 92, reliability: 93, type: 'FACT_CHECK_DESK', role: 'FACT_CHECKER', parentCompany: 'Snopes Media Group', syndicationGroup: 'SNOPES_INDEPENDENT', purpose: 'Independent fact-checking & disinformation debunking', directness: 'FIRST_HAND_REPORTING' },
  'factcheck.org': { name: 'FactCheck.org', rank: 1, authority: 93, reliability: 94, type: 'FACT_CHECK_DESK', role: 'FACT_CHECKER', parentCompany: 'Annenberg Public Policy Center', syndicationGroup: 'FACTCHECK_ANNENBERG', purpose: 'Non-partisan political claim verification', directness: 'FIRST_HAND_REPORTING' },
  'boomlive.in': { name: 'BOOM Live Fact Desk', rank: 1, authority: 92, reliability: 91, type: 'FACT_CHECK_DESK', role: 'FACT_CHECKER', parentCompany: 'Outliers Media', syndicationGroup: 'BOOM_LIVE', purpose: 'IFCN-certified verification & fake news debunking', directness: 'FIRST_HAND_REPORTING' },
  'altnews.in': { name: 'Alt News Verification Desk', rank: 1, authority: 91, reliability: 90, type: 'FACT_CHECK_DESK', role: 'FACT_CHECKER', parentCompany: 'Pravda Media Foundation', syndicationGroup: 'ALTNEWS', purpose: 'Digital forensic debunking & video verification', directness: 'FIRST_HAND_REPORTING' },

  // Global Wire Agencies (Rank 2: 90-94)
  'reuters.com': { name: 'Reuters News Agency', rank: 2, authority: 93, reliability: 94, type: 'GLOBAL_WIRE', role: 'PROVENANCE_SOURCE', parentCompany: 'Thomson Reuters', syndicationGroup: 'REUTERS_GLOBAL', purpose: 'Global wire syndication & investigative reporting', directness: 'FIRST_HAND_REPORTING' },
  'apnews.com': { name: 'Associated Press (AP)', rank: 2, authority: 92, reliability: 93, type: 'GLOBAL_WIRE', role: 'PROVENANCE_SOURCE', parentCompany: 'The Associated Press', syndicationGroup: 'AP_GLOBAL', purpose: 'Global wire reporting & real-time dispatch', directness: 'FIRST_HAND_REPORTING' },
  'afp.com': { name: 'Agence France-Presse (AFP)', rank: 2, authority: 91, reliability: 92, type: 'GLOBAL_WIRE', role: 'PROVENANCE_SOURCE', parentCompany: 'AFP Media', syndicationGroup: 'AFP_GLOBAL', purpose: 'International wire agency reporting', directness: 'FIRST_HAND_REPORTING' },
  'ptinews.com': { name: 'Press Trust of India (PTI)', rank: 2, authority: 90, reliability: 91, type: 'GLOBAL_WIRE', role: 'PROVENANCE_SOURCE', parentCompany: 'Press Trust of India', syndicationGroup: 'PTI_INDIA', purpose: 'National premier wire dispatch agency', directness: 'FIRST_HAND_REPORTING' },
  'aninews.in': { name: 'Asian News International (ANI)', rank: 2, authority: 86, reliability: 85, type: 'GLOBAL_WIRE', role: 'PROVENANCE_SOURCE', parentCompany: 'ANI Media', syndicationGroup: 'ANI_INDIA', purpose: 'Multimedia newsfeed & video wire provider', directness: 'FIRST_HAND_REPORTING' },

  // Primary Newsrooms (Rank 2: 82-90)
  'thehindu.com': { name: 'The Hindu', rank: 2, authority: 89, reliability: 90, type: 'PRIMARY_NEWSROOM', role: 'PRIMARY_REPORTING', parentCompany: 'Kasturi & Sons Ltd', syndicationGroup: 'KASTURI_GROUP', purpose: 'National newspaper of record & policy analysis', directness: 'FIRST_HAND_REPORTING' },
  'thehindubusinessline.com': { name: 'The Hindu BusinessLine', rank: 2, authority: 87, reliability: 89, type: 'PRIMARY_NEWSROOM', role: 'PRIMARY_REPORTING', parentCompany: 'Kasturi & Sons Ltd', syndicationGroup: 'KASTURI_GROUP', purpose: 'Financial & market reporting', directness: 'FIRST_HAND_REPORTING' },
  'indianexpress.com': { name: 'The Indian Express', rank: 2, authority: 87, reliability: 88, type: 'PRIMARY_NEWSROOM', role: 'PRIMARY_REPORTING', parentCompany: 'Express Group', syndicationGroup: 'EXPRESS_GROUP', purpose: 'Investigative journalism & judicial coverage', directness: 'FIRST_HAND_REPORTING' },
  'financialexpress.com': { name: 'The Financial Express', rank: 2, authority: 84, reliability: 86, type: 'PRIMARY_NEWSROOM', role: 'SECONDARY_REPORTING', parentCompany: 'Express Group', syndicationGroup: 'EXPRESS_GROUP', purpose: 'Macroeconomic analysis & corporate filings', directness: 'FIRST_HAND_REPORTING' },
  'timesofindia.indiatimes.com': { name: 'The Times of India', rank: 2, authority: 83, reliability: 82, type: 'PRIMARY_NEWSROOM', role: 'PRIMARY_REPORTING', parentCompany: 'Bennett, Coleman & Co. (Times Group)', syndicationGroup: 'TIMES_GROUP', purpose: 'Broadsheet news reporting & regional coverage', directness: 'FIRST_HAND_REPORTING' },
  'economictimes.indiatimes.com': { name: 'The Economic Times', rank: 2, authority: 86, reliability: 86, type: 'PRIMARY_NEWSROOM', role: 'PRIMARY_REPORTING', parentCompany: 'Bennett, Coleman & Co. (Times Group)', syndicationGroup: 'TIMES_GROUP', purpose: 'Corporate governance, economy & market updates', directness: 'FIRST_HAND_REPORTING' },
  'hindustantimes.com': { name: 'Hindustan Times', rank: 2, authority: 84, reliability: 84, type: 'PRIMARY_NEWSROOM', role: 'PRIMARY_REPORTING', parentCompany: 'HT Media Ltd', syndicationGroup: 'HT_MEDIA', purpose: 'National news reporting & breaking updates', directness: 'FIRST_HAND_REPORTING' },
  'livemint.com': { name: 'Mint Financial Daily', rank: 2, authority: 86, reliability: 87, type: 'PRIMARY_NEWSROOM', role: 'PRIMARY_REPORTING', parentCompany: 'HT Media Ltd', syndicationGroup: 'HT_MEDIA', purpose: 'Financial policy & securities reporting', directness: 'FIRST_HAND_REPORTING' },
  'bbc.com': { name: 'BBC News', rank: 2, authority: 91, reliability: 92, type: 'PRIMARY_NEWSROOM', role: 'PRIMARY_REPORTING', parentCompany: 'British Broadcasting Corporation', syndicationGroup: 'BBC_PUBLIC', purpose: 'Public service international broadcasting & reporting', directness: 'FIRST_HAND_REPORTING' },
  'nytimes.com': { name: 'The New York Times', rank: 2, authority: 90, reliability: 91, type: 'PRIMARY_NEWSROOM', role: 'PRIMARY_REPORTING', parentCompany: 'The New York Times Company', syndicationGroup: 'NYT_COMPANY', purpose: 'Investigative journalism & international reporting', directness: 'FIRST_HAND_REPORTING' },
  'theguardian.com': { name: 'The Guardian', rank: 2, authority: 89, reliability: 89, type: 'PRIMARY_NEWSROOM', role: 'PRIMARY_REPORTING', parentCompany: 'Scott Trust Limited', syndicationGroup: 'GUARDIAN_SCOTT', purpose: 'Independent investigative newsroom', directness: 'FIRST_HAND_REPORTING' },

  // Secondary Outlets & Aggregators (Rank 3: 65-79)
  'deccanherald.com': { name: 'Deccan Herald', rank: 3, authority: 77, reliability: 80, type: 'PRIMARY_NEWSROOM', role: 'SECONDARY_REPORTING', parentCompany: 'The Printers Mysore', syndicationGroup: 'DECCAN_HERALD', purpose: 'Regional state politics & local coverage', directness: 'SECONDARY_ANALYSIS' },
  'techcrunch.com': { name: 'TechCrunch', rank: 3, authority: 79, reliability: 82, type: 'SPECIALIZED_DESK', role: 'SPECIALIST', parentCompany: 'Yahoo', syndicationGroup: 'TECHCRUNCH_YAHOO', purpose: 'Technology venture capital & startup reporting', directness: 'SECONDARY_ANALYSIS' },
  'wikipedia.org': { name: 'Wikipedia', rank: 3, authority: 72, reliability: 74, type: 'SPECIALIZED_DESK', role: 'SECONDARY_REPORTING', parentCompany: 'Wikimedia Foundation', syndicationGroup: 'WIKIMEDIA', purpose: 'Crowdsourced encyclopedia & citation aggregator', directness: 'SECONDARY_ANALYSIS' },

  // Signal & Spread Tracking (Rank 4: 30-50)
  'x.com': { name: 'X / Twitter', rank: 4, authority: 40, reliability: 45, type: 'SOCIAL_MEDIA', role: 'SIGNAL_ONLY', parentCompany: 'X Corp', syndicationGroup: 'X_PLATFORM', purpose: 'Unverified public discourse & citizen posts', directness: 'AGGREGATED' },
  'twitter.com': { name: 'X / Twitter', rank: 4, authority: 40, reliability: 45, type: 'SOCIAL_MEDIA', role: 'SIGNAL_ONLY', parentCompany: 'X Corp', syndicationGroup: 'X_PLATFORM', purpose: 'Unverified public discourse & citizen posts', directness: 'AGGREGATED' },
  'facebook.com': { name: 'Facebook', rank: 4, authority: 38, reliability: 40, type: 'SOCIAL_MEDIA', role: 'SPREAD_TRACKING', parentCompany: 'Meta Platforms', syndicationGroup: 'META_PLATFORM', purpose: 'Social network discourse & post shares', directness: 'AGGREGATED' }
};

// ── 2. Source Roles Multipliers & Evidentiary Weights ───────────────────────
const SOURCE_ROLE_MULTIPLIERS = {
  PRIMARY_AUTHORITY: 1.25,
  FACT_CHECKER: 1.20,
  SPECIALIST: 1.15,
  PRIMARY_REPORTING: 1.00,
  PROVENANCE_SOURCE: 0.95,
  SECONDARY_REPORTING: 0.80,
  SPREAD_TRACKING: 0.40,
  SIGNAL_ONLY: 0.30,
  WATCHLIST: 0.10
};

/**
 * Normalizes and extracts canonical domain from URL or raw domain string
 */
function extractCanonicalDomain(rawUrlOrDomain) {
  if (!rawUrlOrDomain || typeof rawUrlOrDomain !== 'string') return '';
  let domain = rawUrlOrDomain.trim().toLowerCase();
  try {
    if (domain.startsWith('http://') || domain.startsWith('https://')) {
      domain = new URL(domain).hostname;
    }
  } catch (_) {}
  return domain.replace(/^www\./, '').split('/')[0].split('?')[0];
}

/**
 * Derives human-friendly publication name
 */
function derivePublicationName(domain) {
  const clean = extractCanonicalDomain(domain);
  if (KNOWN_PUBLICATIONS[clean]) return KNOWN_PUBLICATIONS[clean].name;
  const parts = clean.split('.')[0];
  return parts.charAt(0).toUpperCase() + parts.slice(1);
}

/**
 * Determines directness metric
 */
function deriveDirectness(domain, sourceType) {
  const clean = extractCanonicalDomain(domain);
  if (KNOWN_PUBLICATIONS[clean]?.directness) return KNOWN_PUBLICATIONS[clean].directness;
  if (/\.(gov|mil|edu)(\.[a-z]{2})?$/i.test(clean) || sourceType === 'OFFICIAL_GAZETTE') return 'PRIMARY_DIRECT';
  if (sourceType === 'GLOBAL_WIRE' || sourceType === 'PRIMARY_NEWSROOM' || sourceType === 'FACT_CHECK_DESK') return 'FIRST_HAND_REPORTING';
  if (sourceType === 'SOCIAL_MEDIA') return 'AGGREGATED';
  return 'SECONDARY_ANALYSIS';
}

/**
 * Determines recency freshness bucket
 */
function deriveFreshness(publishedDateStr) {
  if (!publishedDateStr) return 'CURRENT_WEEK';
  try {
    const pubDate = new Date(publishedDateStr);
    if (isNaN(pubDate.getTime())) return 'CURRENT_WEEK';
    const now = new Date();
    const diffHours = (now - pubDate) / (1000 * 60 * 60);

    if (diffHours <= 6) return 'BREAKING_NOW';
    if (diffHours <= 24) return 'RECENT_24H';
    if (diffHours <= 168) return 'CURRENT_WEEK';
    return 'ARCHIVE';
  } catch (e) {
    return 'CURRENT_WEEK';
  }
}

/**
 * Evaluates a single source with explainable authority, role, and independence metrics
 */
function evaluateSourceIntelligence(sourceHit = {}, customSourcesMap = null) {
  const url = sourceHit.url || sourceHit.link || '';
  const domain = extractCanonicalDomain(sourceHit.domain || url);
  
  let custom = null;
  if (customSourcesMap) {
    if (typeof customSourcesMap.get === 'function') custom = customSourcesMap.get(domain);
    else if (typeof customSourcesMap === 'object') custom = customSourcesMap[domain];
  }
  const known = KNOWN_PUBLICATIONS[domain] || null;

  let rank = 3;
  let authorityScore = 55.0;
  let reliabilityScore = 60.0;
  let sourceType = 'GENERAL_WEB';
  let sourceRole = 'SECONDARY_REPORTING';
  let parentCompany = 'Independent / Unknown';
  let syndicationGroup = domain;
  let purpose = 'General online content';
  let isCustom = false;

  if (custom) {
    rank = custom.rank ?? 2;
    authorityScore = custom.authorityScore !== undefined ? custom.authorityScore : 80.0;
    reliabilityScore = custom.reliabilityScore !== undefined ? custom.reliabilityScore : 85.0;
    sourceType = custom.sourceType || 'PRIMARY_NEWSROOM';
    sourceRole = custom.sourceRole || 'PRIMARY_REPORTING';
    parentCompany = custom.parentCompany || 'Custom Configured';
    syndicationGroup = custom.syndicationGroup || domain;
    purpose = custom.purpose || 'Workspace custom ranked source';
    isCustom = true;
  } else if (known) {
    rank = known.rank;
    authorityScore = known.authority;
    reliabilityScore = known.reliability;
    sourceType = known.type;
    sourceRole = known.role;
    parentCompany = known.parentCompany;
    syndicationGroup = known.syndicationGroup;
    purpose = known.purpose;
  } else {
    // Structural TLD & domain pattern heuristics
    if (/\.(gov|mil)(\.[a-z]{2})?$/i.test(domain)) {
      rank = 1;
      authorityScore = 98.0;
      reliabilityScore = 97.0;
      sourceType = 'OFFICIAL_GAZETTE';
      sourceRole = 'PRIMARY_AUTHORITY';
      purpose = 'Government statutory portal';
    } else if (/\.(edu|ac)(\.[a-z]{2})?$/i.test(domain)) {
      rank = 1;
      authorityScore = 94.0;
      reliabilityScore = 92.0;
      sourceType = 'SPECIALIZED_DESK';
      sourceRole = 'SPECIALIST';
      purpose = 'Academic and research institution';
    } else if (domain.endsWith('.org')) {
      rank = 2;
      authorityScore = 75.0;
      reliabilityScore = 78.0;
      sourceType = 'SPECIALIZED_DESK';
      sourceRole = 'SPECIALIST';
      purpose = 'Non-profit or organizational repository';
    }
  }

  const publication = custom?.name || known?.name || derivePublicationName(domain);
  const directness = deriveDirectness(domain, sourceType);
  const primarySecondaryStatus = rank <= 2 ? 'PRIMARY' : (rank === 3 ? 'SECONDARY' : 'TERTIARY');
  const freshness = deriveFreshness(sourceHit.publishedAt);
  const relevance = typeof sourceHit.relevanceScore === 'number' ? Math.round(sourceHit.relevanceScore) : (sourceHit.relevance || 75);
  
  const isSyndicated = Boolean(sourceHit.isSyndicatedDuplicate);
  const isIndependent = sourceHit.isIndependent !== false && !isSyndicated;
  
  const roleMultiplier = SOURCE_ROLE_MULTIPLIERS[sourceRole] ?? 1.0;
  const independenceContribution = isIndependent ? Math.min(100, Math.round(authorityScore * 1.0)) : Math.round(authorityScore * 0.35);
  const evidenceContribution = Math.min(100, Math.round((authorityScore * 0.4 + relevance * 0.4 + reliabilityScore * 0.2) * roleMultiplier * (isIndependent ? 1.0 : 0.4)));

  let reasoning = `${publication} (${domain}) evaluated as ${sourceRole} (Rank ${rank}, Authority ${authorityScore}/100, Reliability ${reliabilityScore}/100). ` +
    (isIndependent 
      ? `Original reporting by ${parentCompany}; provides full independent corroboration.` 
      : `Syndicated wire reprint (${syndicationGroup}); weighted at 35% to prevent duplication bias.`);

  return {
    url,
    domain,
    publication,
    sourceType,
    sourceRole,
    rank,
    authorityScore,
    reliabilityScore,
    parentCompany,
    syndicationGroup,
    relevance,
    isIndependent,
    isSyndicatedDuplicate: isSyndicated,
    independenceContribution,
    evidenceContribution,
    roleMultiplier,
    directness,
    primarySecondaryStatus,
    recency: freshness,
    sourcePurpose: purpose,
    isCustom,
    reasoning
  };
}

/**
 * Evaluates an entire collection of sources against workspace custom settings
 */
async function evaluateSourcesCollection(sources, workspaceId = null) {
  if (!Array.isArray(sources)) return [];
  const customMap = new Map();
  if (workspaceId && prisma) {
    try {
      const customList = await prisma.source.findMany({
        where: { OR: [{ workspaceId }, { workspaceId: null }] }
      });
      customList.forEach(cs => {
        customMap.set(extractCanonicalDomain(cs.domain), cs);
      });
    } catch (e) {}
  }
  return sources.map(src => evaluateSourceIntelligence(src, customMap));
}

/**
 * Groups discovered evidence sources by corporate ownership and syndication groups
 */
function analyzeSourceIndependence(evidenceList = [], customSourcesMap = null) {
  if (!Array.isArray(evidenceList) || evidenceList.length === 0) {
    return { independentGroups: [], totalSources: 0, independentCount: 0, syndicatedCount: 0 };
  }

  const groupMap = new Map();
  let syndicatedCount = 0;

  for (const item of evidenceList) {
    const evaluated = evaluateSourceIntelligence(item, customSourcesMap);
    const groupId = evaluated.syndicationGroup || evaluated.domain;

    if (!groupMap.has(groupId)) {
      groupMap.set(groupId, {
        groupId,
        parentCompany: evaluated.parentCompany,
        primarySource: { ...evaluated, isIndependent: true, isSyndicatedDuplicate: false },
        syndicatedDuplicates: []
      });
    } else {
      syndicatedCount++;
      const group = groupMap.get(groupId);
      group.syndicatedDuplicates.push({
        ...evaluated,
        isIndependent: false,
        isSyndicatedDuplicate: true,
        primaryOriginDomain: group.primarySource.domain
      });
    }
  }

  const independentGroups = Array.from(groupMap.values());
  return {
    independentGroups,
    totalSources: evidenceList.length,
    independentCount: independentGroups.length,
    syndicatedCount
  };
}

/**
 * Aggregates the persistent Source Intelligence Ledger across all database analyses and sources
 */
async function getSourceIntelligenceLedger(workspaceId = null) {
  const ledgerMap = new Map();

  Object.entries(KNOWN_PUBLICATIONS).forEach(([domain, info]) => {
    ledgerMap.set(domain, {
      domain,
      name: info.name,
      rank: info.rank,
      authorityScore: info.authority,
      reliabilityScore: info.reliability,
      sourceType: info.type,
      sourceRole: info.role,
      parentCompany: info.parentCompany,
      syndicationGroup: info.syndicationGroup,
      purpose: info.purpose,
      directness: info.directness,
      verificationCount: 0,
      supportedCount: 0,
      refutedCount: 0,
      status: 'ACTIVE',
      isCustom: false
    });
  });

  if (!prisma) return Array.from(ledgerMap.values());

  try {
    const dbSources = await prisma.source.findMany({
      where: workspaceId ? { OR: [{ workspaceId }, { workspaceId: null }] } : {}
    });

    dbSources.forEach(s => {
      const d = extractCanonicalDomain(s.domain);
      ledgerMap.set(d, {
        id: s.id,
        domain: d,
        name: s.name,
        rank: s.rank,
        authorityScore: s.authorityScore,
        reliabilityScore: s.reliabilityScore || 85.0,
        sourceType: s.sourceType || 'PRIMARY_NEWSROOM',
        sourceRole: s.sourceRole || 'PRIMARY_REPORTING',
        parentCompany: s.parentCompany || 'Custom Configured',
        syndicationGroup: s.syndicationGroup || d,
        purpose: s.purpose || 'Workspace ranked authority source',
        directness: deriveDirectness(d, s.sourceType),
        verificationCount: s.verifiedCount || 0,
        supportedCount: s.verifiedCount || 0,
        refutedCount: s.refutedCount || 0,
        status: s.status,
        isCustom: s.isCustom
      });
    });

    const evidenceItems = await prisma.evidenceItem.findMany({
      select: { domain: true, stance: true }
    });

    evidenceItems.forEach(item => {
      const d = extractCanonicalDomain(item.domain);
      if (ledgerMap.has(d)) {
        const entry = ledgerMap.get(d);
        entry.verificationCount = (entry.verificationCount || 0) + 1;
        if (item.stance === 'SUPPORTS') entry.supportedCount = (entry.supportedCount || 0) + 1;
        if (item.stance === 'REFUTES') entry.refutedCount = (entry.refutedCount || 0) + 1;
      }
    });

  } catch (err) {
    console.error('[Source Ledger DB Aggregate Error]:', err.message);
  }

  return Array.from(ledgerMap.values()).sort((a, b) => b.authorityScore - a.authorityScore);
}

module.exports = {
  KNOWN_PUBLICATIONS,
  SOURCE_ROLE_MULTIPLIERS,
  extractCanonicalDomain,
  derivePublicationName,
  deriveDirectness,
  deriveFreshness,
  evaluateSourceIntelligence,
  evaluateSourcesCollection,
  analyzeSourceIndependence,
  getSourceIntelligenceLedger
};
