/**
 * Tiered Source Credibility Hierarchy & Multi-Source Cross-Corroboration Engine for ETRAI
 * Priority Hierarchy:
 *   1. Tier 0 (Government, Academic & International Bodies): Trust Score 0.98
 *   2. Tier 1 (Global Wire Services): Trust Score 0.90
 *   3. Tier 2 (Major Regional & National Outlets): Trust Score 0.75 (Boostable to 0.90)
 *   4. Tier 3 (Social Media Discourse & X): Trust Score 0.45
 */

const TIER_0_GOVERNMENT_ACADEMIC = [
  'gov',
  'edu',
  'who.int',
  'un.org',
  'pib.gov.in',
  'pmo.gov.in',
  'india.gov.in',
  'whitehouse.gov',
  'state.gov',
  'nih.gov',
  'cdc.gov',
  'nature.com',
  'sciencedirect.com',
  'factcheck.org',
  'snopes.com'
];

const TIER_1_GLOBAL_WIRES = [
  'reuters.com',
  'apnews.com',
  'bbc.com',
  'bbc.co.uk',
  'bloomberg.com',
  'wsj.com',
  'ft.com'
];

const TIER_2_REGIONAL_OUTLETS = [
  // India Major Regional Outlets
  'indiatoday.in',
  'ndtv.com',
  'timesofindia.indiatimes.com',
  'thehindu.com',
  'hindustantimes.com',
  'indianexpress.com',
  'deccanherald.com',
  'moneycontrol.com',
  
  // Western / International Major Outlets
  'theguardian.com',
  'nytimes.com',
  'washingtonpost.com',
  'aljazeera.com',
  'lemonde.fr',
  'dw.com',
  'express.co.uk',
  'news.sky.com',
  'telegraph.co.uk',
  'abc.net.au',
  'cbc.ca',
  'globeandmail.com',
  'smh.com.au',
  'nikkei.com',
  'forbes.com',
  'economist.com',
  'cnbc.com',
  'techcrunch.com',
  'wikipedia.org'
];

const TIER_3_SOCIAL_MEDIA = [
  'x.com',
  'twitter.com'
];

/**
 * Computes a continuous domain trust score between 0.0 and 1.0 for a given domain string or URL
 */
function getDomainTrustScore(domainOrUrl) {
  if (!domainOrUrl || typeof domainOrUrl !== 'string') return 0.50;

  let domain = domainOrUrl.toLowerCase().trim();
  try {
    if (domain.startsWith('http://') || domain.startsWith('https://')) {
      domain = new URL(domain).hostname;
    }
  } catch (e) {}

  domain = domain.replace(/^www\./, '');

  // Tier 0: Official Government & Educational TLDs / Portals (0.98)
  if (
    /\.(gov|edu)(\.[a-z]{2})?$/i.test(domain) ||
    domain.endsWith('.gov') || domain.endsWith('.edu') ||
    TIER_0_GOVERNMENT_ACADEMIC.some(t0 => domain === t0 || domain.endsWith('.' + t0))
  ) {
    return 0.98;
  }

  // Tier 1: Global Wires & High-Trust Archives (0.90)
  if (TIER_1_GLOBAL_WIRES.some(t1 => domain === t1 || domain.endsWith('.' + t1))) {
    return 0.90;
  }

  // Tier 2: Major Regional & National News Outlets (0.75)
  if (TIER_2_REGIONAL_OUTLETS.some(t2 => domain === t2 || domain.endsWith('.' + t2))) {
    return 0.75;
  }

  // Tier 3: Social Media (0.45)
  if (TIER_3_SOCIAL_MEDIA.some(t3 => domain === t3 || domain.endsWith('.' + t3))) {
    return 0.45;
  }

  // General mainstream TLD defaults
  if (domain.endsWith('.org')) return 0.65;
  if (domain.endsWith('.net') || domain.endsWith('.com') || domain.endsWith('.in')) return 0.55;

  // Unlisted unknown domain default (Neutral-Moderate)
  return 0.50;
}

/**
 * Evaluates Multi-Source Cross-Corroboration Boost
 * If news hits contain Tier 0/1/2 AND X social corroboration, applies a +0.15 boost to Tier 2 regional sources
 */
function evaluateMultiSourceBoost(sources, xDiscourse) {
  if (!sources || !Array.isArray(sources) || sources.length === 0) {
    return { hasMultiSourceBoost: false, boostedSources: sources };
  }

  const hasTier0 = sources.some(s => getDomainTrustScore(s.domain || s.url) >= 0.95);
  const hasTier1 = sources.some(s => getDomainTrustScore(s.domain || s.url) >= 0.88);
  const hasTier2 = sources.some(s => {
    const score = getDomainTrustScore(s.domain || s.url);
    return score >= 0.70 && score < 0.88;
  });
  const hasSocialCorrob = xDiscourse && (xDiscourse.socialCorroborationLabel === 'Strong' || xDiscourse.socialCorroborationLabel === 'Weak');

  // If claim is corroborated across Tier 0/1/2 AND X social media
  const hasMultiSourceBoost = (hasTier0 || hasTier1 || hasTier2) && hasSocialCorrob;

  const boostedSources = sources.map(s => {
    const baseScore = getDomainTrustScore(s.domain || s.url);
    // Apply +0.15 boost to Tier 2 regional sources when multi-source corroborated
    if (hasMultiSourceBoost && baseScore >= 0.70 && baseScore < 0.88) {
      return {
        ...s,
        trustScore: Math.min(0.90, baseScore + 0.15),
        boosted: true
      };
    }
    return { ...s, trustScore: baseScore, boosted: false };
  });

  return { hasMultiSourceBoost, boostedSources };
}

/**
 * Computes aggregate source credibility for an array of search result sources
 */
function evaluateSourceCredibility(sources, xDiscourse = null, primaryDomain = null) {
  let combinedSources = Array.isArray(sources) ? [...sources] : [];
  if (primaryDomain) {
    combinedSources.push({ domain: primaryDomain, url: primaryDomain });
  }

  if (combinedSources.length === 0) {
    return {
      averageTrustScore: 0.50,
      label: 'Mixed',
      trustedCount: 0,
      moderateCount: 0,
      untrustedCount: 0,
      hasMultiSourceBoost: false
    };
  }

  const { hasMultiSourceBoost, boostedSources } = evaluateMultiSourceBoost(combinedSources, xDiscourse);
  const scores = boostedSources.map(s => s.trustScore || getDomainTrustScore(s.domain || s.url));
  
  // Give extra weight to Tier 0 sources (1.5x multiplier in weighted average)
  let weightedSum = 0;
  let weightTotal = 0;

  boostedSources.forEach(src => {
    const score = src.trustScore || getDomainTrustScore(src.domain || src.url);
    const weight = score >= 0.95 ? 1.5 : 1.0; // Tier 0 receives 1.5x priority weight
    weightedSum += score * weight;
    weightTotal += weight;
  });

  const avg = Number((weightedSum / Math.max(weightTotal, 1)).toFixed(3));

  let label = 'Untrusted';
  if (avg >= 0.70) label = 'Trusted';
  else if (avg >= 0.50) label = 'Mixed';

  const trustedCount = scores.filter(s => s >= 0.75).length;
  const moderateCount = scores.filter(s => s >= 0.50 && s < 0.75).length;
  const untrustedCount = scores.filter(s => s < 0.50).length;

  return {
    averageTrustScore: avg,
    label,
    trustedCount,
    moderateCount,
    untrustedCount,
    hasMultiSourceBoost
  };
}

function getDomainTier(domainOrUrl) {
  if (!domainOrUrl || typeof domainOrUrl !== 'string') return 4;
  let domain = domainOrUrl.toLowerCase().trim();
  try {
    if (domain.startsWith('http://') || domain.startsWith('https://')) {
      domain = new URL(domain).hostname;
    }
  } catch (e) {}
  domain = domain.replace(/^www\./, '');

  if (
    /\.(gov|edu)(\.[a-z]{2})?$/i.test(domain) ||
    domain.endsWith('.gov') || domain.endsWith('.edu') ||
    TIER_0_GOVERNMENT_ACADEMIC.some(t0 => domain === t0 || domain.endsWith('.' + t0))
  ) {
    return 0;
  }

  if (TIER_1_GLOBAL_WIRES.some(t1 => domain === t1 || domain.endsWith('.' + t1))) {
    return 1;
  }

  if (TIER_2_REGIONAL_OUTLETS.some(t2 => domain === t2 || domain.endsWith('.' + t2))) {
    return 2;
  }

  if (TIER_3_SOCIAL_MEDIA.some(t3 => domain === t3 || domain.endsWith('.' + t3))) {
    return 3;
  }

  return 4;
}

module.exports = {
  getDomainTrustScore,
  getDomainTier,
  evaluateSourceCredibility,
  evaluateMultiSourceBoost,
  TIER_0_GOVERNMENT_ACADEMIC,
  TIER_1_GLOBAL_WIRES,
  TIER_2_REGIONAL_OUTLETS,
  TIER_3_SOCIAL_MEDIA
};
