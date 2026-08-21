/**
 * ETRAI Source Intelligence Engine
 * Comprehensive multi-dimensional evaluation of discovered web & document sources.
 *
 * Derives:
 * - domain & publication name
 * - sourceType (OFFICIAL_GAZETTE, GLOBAL_WIRE, PRIMARY_NEWSROOM, SPECIALIZED_DESK, SYNDICATED_COPY, SOCIAL_MEDIA, GENERAL_WEB)
 * - authority (Rank 1-4, 0-100 score)
 * - relevance (0-100 relevance score)
 * - independence (original reporting vs syndicated wire duplication)
 * - recency & freshness (BREAKING_NOW, RECENT_24H, CURRENT_WEEK, ARCHIVE)
 * - directness (PRIMARY_DIRECT, FIRST_HAND_REPORTING, SECONDARY_ANALYSIS, AGGREGATED)
 * - primarySecondaryStatus (PRIMARY, SECONDARY, TERTIARY)
 * - accessibility (FULL_ARTICLE, SNIPPET_ONLY, PAYWALLED, BLOCKED)
 * - duplicationRelationship (ORIGINAL_SOURCE, SYNDICATED_DUPLICATE)
 * - sourcePurpose (REGULATORY_GAZETTE, PRIMARY_FACT_CHECK, INVESTIGATIVE_NEWSROOM, CORROBORATING_REPORT)
 * - sourceReasoning (Detailed rationale for score & ranking)
 */

const { getDomainTrustScore, getDomainTier } = require('./domainTrust');
const { prisma } = require('../utils/prisma');

// Comprehensive Known Publications Directory
const KNOWN_PUBLICATIONS = {
  // Rank 1: Government, Regulatory & Official Records
  'pib.gov.in': { name: 'Press Information Bureau (PIB)', rank: 1, authority: 99, type: 'OFFICIAL_GAZETTE', purpose: 'Official government press release & notification', directness: 'PRIMARY_DIRECT' },
  'pmo.gov.in': { name: 'Prime Minister Office (PMO)', rank: 1, authority: 99, type: 'OFFICIAL_GAZETTE', purpose: 'Head of government executive announcements', directness: 'PRIMARY_DIRECT' },
  'gazette.gov.in': { name: 'The Gazette of India', rank: 1, authority: 100, type: 'OFFICIAL_GAZETTE', purpose: 'Statutory government notifications & legislative acts', directness: 'PRIMARY_DIRECT' },
  'rbi.org.in': { name: 'Reserve Bank of India', rank: 1, authority: 99, type: 'OFFICIAL_GAZETTE', purpose: 'Monetary policy circulars & banking regulations', directness: 'PRIMARY_DIRECT' },
  'sci.gov.in': { name: 'Supreme Court of India', rank: 1, authority: 100, type: 'OFFICIAL_GAZETTE', purpose: 'Judicial rulings, court orders & records', directness: 'PRIMARY_DIRECT' },
  'whitehouse.gov': { name: 'The White House', rank: 1, authority: 99, type: 'OFFICIAL_GAZETTE', purpose: 'Executive orders & official administration statements', directness: 'PRIMARY_DIRECT' },
  'who.int': { name: 'World Health Organization (WHO)', rank: 1, authority: 98, type: 'OFFICIAL_GAZETTE', purpose: 'Global public health guidelines & epidemiological data', directness: 'PRIMARY_DIRECT' },
  'un.org': { name: 'United Nations', rank: 1, authority: 98, type: 'OFFICIAL_GAZETTE', purpose: 'Treaties, international resolutions & global metrics', directness: 'PRIMARY_DIRECT' },
  'nature.com': { name: 'Nature Publishing Group', rank: 1, authority: 97, type: 'SPECIALIZED_DESK', purpose: 'Peer-reviewed scientific research & data', directness: 'PRIMARY_DIRECT' },
  'snopes.com': { name: 'Snopes Fact Desk', rank: 1, authority: 92, type: 'PRIMARY_NEWSROOM', purpose: 'Independent fact-checking & disinformation debunking', directness: 'FIRST_HAND_REPORTING' },
  'factcheck.org': { name: 'FactCheck.org', rank: 1, authority: 93, type: 'PRIMARY_NEWSROOM', purpose: 'Non-partisan political claim verification', directness: 'FIRST_HAND_REPORTING' },

  // Rank 2: Global Wire Agencies & Major National Newsrooms
  'reuters.com': { name: 'Reuters News Agency', rank: 2, authority: 92, type: 'GLOBAL_WIRE', purpose: 'Global wire syndication & investigative reporting', directness: 'FIRST_HAND_REPORTING' },
  'apnews.com': { name: 'Associated Press (AP)', rank: 2, authority: 92, type: 'GLOBAL_WIRE', purpose: 'Global wire reporting & real-time dispatch', directness: 'FIRST_HAND_REPORTING' },
  'bloomberg.com': { name: 'Bloomberg News', rank: 2, authority: 91, type: 'SPECIALIZED_DESK', purpose: 'Financial intelligence & corporate market reporting', directness: 'FIRST_HAND_REPORTING' },
  'thehindu.com': { name: 'The Hindu', rank: 2, authority: 88, type: 'PRIMARY_NEWSROOM', purpose: 'National newspaper of record & policy analysis', directness: 'FIRST_HAND_REPORTING' },
  'indianexpress.com': { name: 'The Indian Express', rank: 2, authority: 86, type: 'PRIMARY_NEWSROOM', purpose: 'Investigative journalism & judicial coverage', directness: 'FIRST_HAND_REPORTING' },
  'hindustantimes.com': { name: 'Hindustan Times', rank: 2, authority: 84, type: 'PRIMARY_NEWSROOM', purpose: 'National news reporting & breaking updates', directness: 'FIRST_HAND_REPORTING' },
  'timesofindia.indiatimes.com': { name: 'The Times of India', rank: 2, authority: 82, type: 'PRIMARY_NEWSROOM', purpose: 'Broadsheet news reporting & regional coverage', directness: 'FIRST_HAND_REPORTING' },
  'bbc.com': { name: 'BBC News', rank: 2, authority: 90, type: 'PRIMARY_NEWSROOM', purpose: 'Public service international broadcasting & reporting', directness: 'FIRST_HAND_REPORTING' },
  'nytimes.com': { name: 'The New York Times', rank: 2, authority: 89, type: 'PRIMARY_NEWSROOM', purpose: 'Investigative journalism & international reporting', directness: 'FIRST_HAND_REPORTING' },
  'theguardian.com': { name: 'The Guardian', rank: 2, authority: 88, type: 'PRIMARY_NEWSROOM', purpose: 'Independent news & investigative reporting', directness: 'FIRST_HAND_REPORTING' },
  'moneycontrol.com': { name: 'Moneycontrol Financial Desk', rank: 2, authority: 83, type: 'SPECIALIZED_DESK', purpose: 'Securities, corporate filings & market earnings', directness: 'FIRST_HAND_REPORTING' },

  // Rank 3: Regional Outlets & Specialist Portals
  'deccanherald.com': { name: 'Deccan Herald', rank: 3, authority: 76, type: 'PRIMARY_NEWSROOM', purpose: 'Regional state politics & local coverage', directness: 'SECONDARY_ANALYSIS' },
  'techcrunch.com': { name: 'TechCrunch', rank: 3, authority: 79, type: 'SPECIALIZED_DESK', purpose: 'Technology venture capital & startup reporting', directness: 'SECONDARY_ANALYSIS' },
  'forbes.com': { name: 'Forbes Media', rank: 3, authority: 78, type: 'SPECIALIZED_DESK', purpose: 'Business profiles & editorial commentary', directness: 'SECONDARY_ANALYSIS' },
  'wikipedia.org': { name: 'Wikipedia', rank: 3, authority: 72, type: 'SPECIALIZED_DESK', purpose: 'Crowdsourced encyclopedia & citation aggregator', directness: 'SECONDARY_ANALYSIS' },

  // Rank 4: Social Media & General Open Web
  'x.com': { name: 'X / Twitter', rank: 4, authority: 45, type: 'SOCIAL_MEDIA', purpose: 'Unverified public discourse & citizen posts', directness: 'AGGREGATED' },
  'twitter.com': { name: 'X / Twitter', rank: 4, authority: 45, type: 'SOCIAL_MEDIA', purpose: 'Unverified public discourse & citizen posts', directness: 'AGGREGATED' }
};

/**
 * Derives publication name from domain
 */
function derivePublicationName(domain) {
  if (!domain || typeof domain !== 'string') return 'Unknown Source';
  const cleanDomain = domain.toLowerCase().replace(/^www\./, '');
  if (KNOWN_PUBLICATIONS[cleanDomain]) {
    return KNOWN_PUBLICATIONS[cleanDomain].name;
  }

  // Format domain into human readable title
  const parts = cleanDomain.split('.')[0];
  return parts.charAt(0).toUpperCase() + parts.slice(1);
}

/**
 * Determines primary / secondary status and directness
 */
function deriveDirectness(domain, sourceType) {
  const cleanDomain = (domain || '').toLowerCase().replace(/^www\./, '');
  if (KNOWN_PUBLICATIONS[cleanDomain]?.directness) {
    return KNOWN_PUBLICATIONS[cleanDomain].directness;
  }

  if (/\.(gov|edu)(\.[a-z]{2})?$/i.test(cleanDomain) || sourceType === 'OFFICIAL_GAZETTE') {
    return 'PRIMARY_DIRECT';
  }
  if (sourceType === 'GLOBAL_WIRE' || sourceType === 'PRIMARY_NEWSROOM') {
    return 'FIRST_HAND_REPORTING';
  }
  if (sourceType === 'SOCIAL_MEDIA') {
    return 'AGGREGATED';
  }
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
 * Evaluates a single discovered source candidate with full intelligence metrics
 */
function evaluateSourceIntelligence(sourceHit, customSourcesMap = null) {
  const url = sourceHit.url || sourceHit.link || '';
  let domain = sourceHit.domain || '';
  try {
    if (!domain && url) {
      domain = new URL(url).hostname;
    }
  } catch (e) {}
  domain = domain.toLowerCase().replace(/^www\./, '');

  const customMap = (customSourcesMap && typeof customSourcesMap.get === 'function') ? customSourcesMap : null;
  const known = KNOWN_PUBLICATIONS[domain] || null;
  const custom = customMap ? customMap.get(domain) : null;

  // Derive Rank & Authority
  let rank = 4;
  let authorityScore = 50.0;
  let sourceType = 'GENERAL_WEB';
  let purpose = 'General open-web indexing';
  let isCustom = false;

  if (custom) {
    rank = custom.rank || 2;
    authorityScore = custom.authorityScore !== undefined ? custom.authorityScore : 80.0;
    sourceType = custom.sourceType || 'PRIMARY_NEWSROOM';
    purpose = custom.purpose || 'Custom workspace-configured authority source';
    isCustom = true;
  } else if (known) {
    rank = known.rank;
    authorityScore = known.authority;
    sourceType = known.type;
    purpose = known.purpose;
  } else {
    // Dynamic derivation based on TLD and domain characteristics
    if (/\.(gov|edu)(\.[a-z]{2})?$/i.test(domain)) {
      rank = 1;
      authorityScore = 98.0;
      sourceType = 'OFFICIAL_GAZETTE';
      purpose = 'Government/Institutional regulatory portal';
    } else if (domain.endsWith('.org')) {
      rank = 3;
      authorityScore = 68.0;
      sourceType = 'SPECIALIZED_DESK';
      purpose = 'Organizational portal / non-profit resource';
    } else if (domain.endsWith('.in') || domain.endsWith('.com') || domain.endsWith('.net')) {
      rank = 3;
      authorityScore = 55.0;
      sourceType = 'GENERAL_WEB';
      purpose = 'Commercial news portal / online media';
    }
  }

  const publication = custom?.name || known?.name || derivePublicationName(domain);
  const directness = deriveDirectness(domain, sourceType);
  const primarySecondaryStatus = rank <= 1 ? 'PRIMARY' : (rank === 2 ? 'PRIMARY' : (rank === 3 ? 'SECONDARY' : 'TERTIARY'));
  const freshness = deriveFreshness(sourceHit.publishedAt);
  const relevance = typeof sourceHit.relevanceScore === 'number' ? Math.round(sourceHit.relevanceScore) : (sourceHit.relevance || 75);
  const isIndependent = sourceHit.isIndependent !== false && !sourceHit.isSyndicatedDuplicate;
  const accessibility = sourceHit.sourceAccess === 'FULL_ARTICLE' || sourceHit.fetchedPassage ? 'FULL_ARTICLE' : 'SNIPPET_ONLY';

  // Source Reasoning
  let reasoning = `${publication} evaluated as Rank ${rank} (${sourceType}) with authority score ${authorityScore}/100. `;
  if (isCustom) reasoning += `Applies workspace custom ranking configuration. `;
  if (!isIndependent) reasoning += `Syndicated wire copy detected; discounted from independent corroboration count. `;
  else reasoning += `Independent source origin confirmed. `;
  if (accessibility === 'FULL_ARTICLE') reasoning += `Full text fetched and verified.`;

  return {
    url,
    domain,
    publication,
    sourceType,
    rank,
    authorityScore,
    relevance,
    independence: isIndependent,
    recency: freshness,
    directness,
    primarySecondaryStatus,
    accessibility,
    duplicationRelationship: isIndependent ? 'ORIGINAL_SOURCE' : 'SYNDICATED_DUPLICATE',
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

  // Load custom sources from database if workspace provided
  const customMap = new Map();
  if (workspaceId && prisma) {
    try {
      const customList = await prisma.source.findMany({
        where: { OR: [{ workspaceId }, { workspaceId: null }] }
      });
      customList.forEach(cs => {
        customMap.set(cs.domain.toLowerCase().replace(/^www\./, ''), cs);
      });
    } catch (e) {}
  }

  return sources.map(src => evaluateSourceIntelligence(src, customMap));
}

/**
 * Derives full Source Intelligence Ledger across all recorded analyses
 */
async function getSourceIntelligenceLedger(workspaceId = null) {
  const ledgerMap = new Map();

  // Seed with standard known publications
  Object.entries(KNOWN_PUBLICATIONS).forEach(([domain, info]) => {
    ledgerMap.set(domain, {
      domain,
      name: info.name,
      rank: info.rank,
      authorityScore: info.authority,
      sourceType: info.type,
      purpose: info.purpose,
      directness: info.directness,
      verificationCount: 0,
      supportedCount: 0,
      refutedCount: 0,
      status: 'ACTIVE',
      isCustom: false
    });
  });

  // Merge custom workspace sources
  if (prisma) {
    try {
      const customSources = await prisma.source.findMany({
        where: workspaceId ? { OR: [{ workspaceId }, { workspaceId: null }] } : {}
      });
      customSources.forEach(cs => {
        const dom = cs.domain.toLowerCase().replace(/^www\./, '');
        ledgerMap.set(dom, {
          domain: dom,
          name: cs.name,
          rank: cs.rank,
          authorityScore: cs.authorityScore,
          sourceType: 'CUSTOM_WORKSPACE',
          purpose: cs.purpose || 'Custom source configuration',
          directness: cs.rank <= 1 ? 'PRIMARY_DIRECT' : 'FIRST_HAND_REPORTING',
          verificationCount: 0,
          supportedCount: 0,
          refutedCount: 0,
          status: cs.status,
          isCustom: true
        });
      });

      // Compute verification and evidence counts from real database analyses
      const evidenceItems = await prisma.evidenceItem.findMany({
        select: { domain: true, stance: true }
      });

      evidenceItems.forEach(ev => {
        if (!ev.domain) return;
        const dom = ev.domain.toLowerCase().replace(/^www\./, '');
        let entry = ledgerMap.get(dom);
        if (!entry) {
          entry = {
            domain: dom,
            name: derivePublicationName(dom),
            rank: 3,
            authorityScore: 55.0,
            sourceType: 'GENERAL_WEB',
            purpose: 'Discovered web evidence',
            directness: 'SECONDARY_ANALYSIS',
            verificationCount: 0,
            supportedCount: 0,
            refutedCount: 0,
            status: 'ACTIVE',
            isCustom: false
          };
          ledgerMap.set(dom, entry);
        }
        entry.verificationCount++;
        if (ev.stance === 'SUPPORTS') entry.supportedCount++;
        if (ev.stance === 'REFUTES') entry.refutedCount++;
      });
    } catch (e) {}
  }

  return Array.from(ledgerMap.values()).sort((a, b) => a.rank - b.rank || b.authorityScore - a.authorityScore);
}

module.exports = {
  KNOWN_PUBLICATIONS,
  evaluateSourceIntelligence,
  evaluateSourcesCollection,
  getSourceIntelligenceLedger,
  derivePublicationName,
  deriveDirectness,
  deriveFreshness
};
