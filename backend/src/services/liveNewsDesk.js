/**
 * ETRAI Live News Desk Engine
 * Retrieves live real news, applies semantic source enrichment, clustering,
 * deduplication, category filtering, and direct ETRAI verification integration.
 */

const { evaluateSourceIntelligence, derivePublicationName } = require('./sourceIntelligence');
const { getProviderStatus } = require('./providerManager');
const { prisma, dbService } = require('../utils/prisma');

const CATEGORY_QUERIES = {
  All: 'latest breaking news policy india world',
  National: 'national news policy parliament government india',
  Business: 'business financial markets RBI economy policy',
  Technology: 'technology artificial intelligence semiconductor software computing',
  Science: 'science space research ISRO astronomy climate',
  Health: 'public health medical research healthcare pharmaceuticals',
  World: 'international world news diplomacy global affairs'
};

/**
 * Fetches real live news articles via Serper News API with source intelligence enrichment
 */
async function fetchLiveNews({
  category = 'All',
  source = '',
  query = '',
  mediaType = 'All', // All | Image | Video | Text
  timeRange = '24h', // 1h | 24h | 7d | 30d | all
  page = 1,
  pageSize = 15,
  workspaceId = null,
  mockNews = null
}) {
  let rawNewsList = [];

  if (Array.isArray(mockNews)) {
    rawNewsList = mockNews;
  } else {
    const serperKey = process.env.SERPER_API_KEY;
    const baseQuery = CATEGORY_QUERIES[category] || CATEGORY_QUERIES.All;
    let searchQuery = query ? `${query} ${baseQuery}` : baseQuery;
    if (source) {
      searchQuery += ` site:${source.replace(/^https?:\/\//, '').replace(/^www\./, '')}`;
    }

    let tbs = 'qdr:d';
    if (timeRange === '1h') tbs = 'qdr:h';
    else if (timeRange === '7d') tbs = 'qdr:w';
    else if (timeRange === '30d') tbs = 'qdr:m';

    if (serperKey) {
      try {
        const res = await fetch('https://google.serper.dev/news', {
          method: 'POST',
          headers: {
            'X-API-KEY': serperKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            q: searchQuery,
            gl: 'in',
            hl: 'en',
            tbs: tbs,
            num: 40
          })
        });

        if (res.ok) {
          const data = await res.json();
          rawNewsList = Array.isArray(data.news) ? data.news : [];
        }
      } catch (err) {
        console.warn('[LiveNewsDesk Fetch Error]:', err.message);
      }
    }
  }

  // Deduplicate by URL and Title similarity
  const seenUrls = new Set();
  const seenTitles = new Set();
  const dedupedRaw = [];

  for (const item of rawNewsList) {
    const url = item.link || item.url || '';
    const title = (item.title || '').trim();
    const titleKey = title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30);

    if (url && seenUrls.has(url)) continue;
    if (titleKey && seenTitles.has(titleKey)) continue;

    if (url) seenUrls.add(url);
    if (titleKey) seenTitles.add(titleKey);
    dedupedRaw.push(item);
  }

  // Enrich with Source Intelligence & Verification Status
  const enrichedArticles = [];

  for (let idx = 0; idx < dedupedRaw.length; idx++) {
    const raw = dedupedRaw[idx];
    const url = raw.link || raw.url || '';
    let domain = raw.domain || '';
    try {
      if (!domain && url) domain = new URL(url).hostname;
    } catch (e) {}
    domain = domain.toLowerCase().replace(/^www\./, '');

    const intel = evaluateSourceIntelligence({
      url,
      domain,
      title: raw.title,
      snippet: raw.snippet
    });

    const publication = raw.source || raw.sourceName || intel.publication || derivePublicationName(domain);
    const hasImage = !!(raw.imageUrl || raw.image);
    const itemMediaType = hasImage ? 'Image' : 'Text';

    // Parse published date
    let publishedAt = new Date();
    if (raw.date) {
      if (raw.date.includes('hour') || raw.date.includes('min')) {
        publishedAt = new Date(Date.now() - 3600000);
      } else if (raw.date.includes('day')) {
        publishedAt = new Date(Date.now() - 86400000);
      } else {
        const d = new Date(raw.date);
        if (!isNaN(d.getTime())) publishedAt = d;
      }
    } else if (raw.publishedAt) {
      const d = new Date(raw.publishedAt);
      if (!isNaN(d.getTime())) publishedAt = d;
    }

    // Check verification status from existing database analyses
    let verificationStatus = raw.status || 'UNVERIFIED';
    let trustScore = raw.trustScore !== undefined ? raw.trustScore : null;
    let existingAnalysisId = raw.analysisId || null;

    if (prisma && url) {
      try {
        const existing = await prisma.analysis.findFirst({
          where: { inputSource: url },
          select: { id: true, verdict: true, trustScore: true }
        });
        if (existing) {
          existingAnalysisId = existing.id;
          verificationStatus = existing.verdict || 'VERIFIED';
          trustScore = existing.trustScore || null;
        }
      } catch (e) {}
    }

    enrichedArticles.push({
      id: raw.id || `news_${idx + 1}_${Date.now()}`,
      title: raw.title,
      url,
      snippet: raw.snippet || '',
      sourceName: publication,
      domain,
      category: raw.category || category !== 'All' ? category : 'National',
      mediaType: itemMediaType,
      imageUrl: raw.imageUrl || raw.image || null,
      publishedAt: publishedAt.toISOString(),
      timeAgoLabel: raw.date || 'Recently published',
      status: verificationStatus,
      trustScore,
      analysisId: existingAnalysisId,
      authorityRank: intel.rank,
      authorityScore: intel.authorityScore,
      sourceType: intel.sourceType,
      isLead: idx === 0,
      isHero: idx === 0 && hasImage,
      isSyndicatedDuplicate: intel.duplicationRelationship === 'SYNDICATED_DUPLICATE'
    });
  }

  // Apply Media Filter
  let filtered = enrichedArticles;
  if (mediaType === 'Image') {
    filtered = filtered.filter(a => a.mediaType === 'Image');
  } else if (mediaType === 'Text') {
    filtered = filtered.filter(a => a.mediaType === 'Text');
  }

  // Apply Pagination
  const total = filtered.length;
  const startIndex = (page - 1) * pageSize;
  const paginated = filtered.slice(startIndex, startIndex + pageSize);
  const hasMore = startIndex + pageSize < total;

  return {
    items: paginated,
    total,
    page: parseInt(page, 10),
    pageSize: parseInt(pageSize, 10),
    hasMore,
    lastUpdated: new Date().toISOString(),
    filtersApplied: {
      category,
      source,
      query,
      mediaType,
      timeRange
    }
  };
}

module.exports = {
  fetchLiveNews,
  CATEGORY_QUERIES
};
