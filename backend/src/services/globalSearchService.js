/**
 * ETRAI Global Search Service
 * Deterministic multi-dimensional search index across Reports, Claims, Evidence,
 * Named Entities, Content Provenance, Sources, and Live News.
 * Respects strict tenant boundaries and provides relevance ranking with highlighting.
 */

const { prisma } = require('../utils/prisma');

/**
 * Highlights search matches within text snippets
 */
function highlightMatch(text, query) {
  if (!text || !query) return text || '';
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
}

/**
 * Computes deterministic relevance score for a search match
 */
function computeRelevanceScore(text, query, baseMultiplier = 1.0) {
  if (!text || !query) return 0;
  const t = text.toLowerCase();
  const q = query.toLowerCase();

  let score = 0;
  if (t === q) score += 100;
  else if (t.startsWith(q)) score += 80;
  else if (t.includes(` ${q} `) || t.startsWith(`${q} `) || t.endsWith(` ${q}`)) score += 60;
  else if (t.includes(q)) score += 40;

  // Word token overlap
  const queryWords = q.split(/\s+/).filter(w => w.length > 2);
  let matchedTokens = 0;
  for (const w of queryWords) {
    if (t.includes(w)) matchedTokens++;
  }
  if (queryWords.length > 0) {
    score += Math.round((matchedTokens / queryWords.length) * 30);
  }

  return Math.round(score * baseMultiplier);
}

/**
 * Executes unified multi-modal global search across all relational models
 */
async function searchGlobalIndex(userId, query, options = {}) {
  if (!userId) throw new Error('Tenant user ID is required.');
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return { query: '', totalMatches: 0, resultsByType: {}, items: [] };
  }

  const cleanQuery = query.trim();
  const limit = Math.max(1, Math.min(50, parseInt(options.limit || 25, 10)));
  const targetType = (options.type || 'ALL').toUpperCase();

  const results = [];

  // 1. Search Reports (Analysis)
  if (targetType === 'ALL' || targetType === 'REPORTS') {
    const analyses = await prisma.analysis.findMany({
      where: {
        userId,
        OR: [
          { title: { contains: cleanQuery } },
          { summary: { contains: cleanQuery } },
          { inputSource: { contains: cleanQuery } }
        ]
      },
      take: limit,
      select: {
        id: true,
        title: true,
        summary: true,
        inputType: true,
        verdict: true,
        trustScore: true,
        createdAt: true
      }
    });

    for (const a of analyses) {
      const score = Math.max(
        computeRelevanceScore(a.title, cleanQuery, 1.2),
        computeRelevanceScore(a.summary, cleanQuery, 0.9)
      );
      results.push({
        id: `report_${a.id}`,
        type: 'REPORT',
        title: a.title,
        highlightedTitle: highlightMatch(a.title, cleanQuery),
        snippet: a.summary || a.title,
        highlightedSnippet: highlightMatch(a.summary || a.title, cleanQuery),
        metadata: {
          reportId: a.id,
          verdict: a.verdict,
          trustScore: a.trustScore,
          inputType: a.inputType,
          date: a.createdAt
        },
        relevanceScore: score
      });
    }
  }

  // 2. Search Claims
  if (targetType === 'ALL' || targetType === 'CLAIMS') {
    const claims = await prisma.claim.findMany({
      where: {
        analysis: { userId },
        OR: [
          { claimText: { contains: cleanQuery } },
          { reasoning: { contains: cleanQuery } },
          { category: { contains: cleanQuery } }
        ]
      },
      take: limit,
      include: {
        analysis: { select: { id: true, title: true } }
      }
    });

    for (const c of claims) {
      const score = Math.max(
        computeRelevanceScore(c.claimText, cleanQuery, 1.1),
        computeRelevanceScore(c.reasoning, cleanQuery, 0.8)
      );
      results.push({
        id: `claim_${c.id}`,
        type: 'CLAIM',
        title: c.claimText,
        highlightedTitle: highlightMatch(c.claimText, cleanQuery),
        snippet: c.reasoning ? `Context: "${c.reasoning}"` : (c.analysis?.title || 'Claim assertion'),
        highlightedSnippet: highlightMatch(c.reasoning || c.claimText, cleanQuery),
        metadata: {
          claimId: c.id,
          reportId: c.analysisId,
          reportTitle: c.analysis?.title,
          verdict: c.verdict,
          confidence: c.confidenceScore
        },
        relevanceScore: score
      });
    }
  }

  // 3. Search Evidence Items
  if (targetType === 'ALL' || targetType === 'EVIDENCE') {
    const evidence = await prisma.evidenceItem.findMany({
      where: {
        claim: { analysis: { userId } },
        OR: [
          { title: { contains: cleanQuery } },
          { snippet: { contains: cleanQuery } },
          { domain: { contains: cleanQuery } }
        ]
      },
      take: limit,
      include: {
        claim: { select: { id: true, claimText: true, analysisId: true } }
      }
    });

    for (const e of evidence) {
      const score = Math.max(
        computeRelevanceScore(e.title, cleanQuery, 1.0),
        computeRelevanceScore(e.snippet, cleanQuery, 0.8)
      );
      results.push({
        id: `evidence_${e.id}`,
        type: 'EVIDENCE',
        title: e.title || e.domain || 'Evidence Source',
        highlightedTitle: highlightMatch(e.title || e.domain, cleanQuery),
        snippet: e.snippet || `Domain: ${e.domain}`,
        highlightedSnippet: highlightMatch(e.snippet || e.domain, cleanQuery),
        metadata: {
          evidenceId: e.id,
          claimId: e.claimId,
          reportId: e.claim?.analysisId,
          domain: e.domain,
          stance: e.stance,
          authorityScore: e.authorityScore
        },
        relevanceScore: score
      });
    }
  }

  // 4. Search Named Entities
  if (targetType === 'ALL' || targetType === 'ENTITIES') {
    const entities = await prisma.namedEntity.findMany({
      where: {
        analysis: { userId },
        OR: [
          { name: { contains: cleanQuery } },
          { role: { contains: cleanQuery } },
          { finding: { contains: cleanQuery } }
        ]
      },
      take: limit,
      include: {
        analysis: { select: { id: true, title: true } }
      }
    });

    for (const ent of entities) {
      const score = Math.max(
        computeRelevanceScore(ent.name, cleanQuery, 1.1),
        computeRelevanceScore(ent.finding, cleanQuery, 0.7)
      );
      results.push({
        id: `entity_${ent.id}`,
        type: 'ENTITY',
        title: `${ent.name} (${ent.type || 'ENTITY'})`,
        highlightedTitle: highlightMatch(`${ent.name} (${ent.type || 'ENTITY'})`, cleanQuery),
        snippet: ent.finding || ent.role || `Resolved entity: ${ent.name}`,
        highlightedSnippet: highlightMatch(ent.finding || ent.role || ent.name, cleanQuery),
        metadata: {
          entityId: ent.id,
          reportId: ent.analysisId,
          entityType: ent.type,
          canonicalName: ent.name
        },
        relevanceScore: score
      });
    }
  }

  // 5. Search Sources Directory
  if (targetType === 'ALL' || targetType === 'SOURCES') {
    const sources = await prisma.source.findMany({
      where: {
        OR: [
          { name: { contains: cleanQuery } },
          { domain: { contains: cleanQuery } },
          { purpose: { contains: cleanQuery } }
        ]
      },
      take: limit
    });

    for (const s of sources) {
      const score = Math.max(
        computeRelevanceScore(s.name, cleanQuery, 1.0),
        computeRelevanceScore(s.domain, cleanQuery, 1.1)
      );
      results.push({
        id: `source_${s.id}`,
        type: 'SOURCE',
        title: s.name,
        highlightedTitle: highlightMatch(s.name, cleanQuery),
        snippet: `${s.domain} • Authority Rank ${s.rank} (Score: ${s.authorityScore}/100) - ${s.purpose || 'Official publisher'}`,
        highlightedSnippet: highlightMatch(`${s.domain} • ${s.purpose || ''}`, cleanQuery),
        metadata: {
          sourceId: s.id,
          domain: s.domain,
          rank: s.rank,
          authorityScore: s.authorityScore
        },
        relevanceScore: score
      });
    }
  }

  // 6. Search Live News Items
  if (targetType === 'ALL' || targetType === 'NEWS') {
    const newsItems = await prisma.newsItem.findMany({
      where: {
        OR: [
          { title: { contains: cleanQuery } },
          { domain: { contains: cleanQuery } },
          { sourceName: { contains: cleanQuery } }
        ]
      },
      take: limit
    });

    for (const n of newsItems) {
      const score = Math.max(
        computeRelevanceScore(n.title, cleanQuery, 1.0),
        computeRelevanceScore(n.sourceName, cleanQuery, 0.8)
      );
      results.push({
        id: `news_${n.id}`,
        type: 'NEWS',
        title: n.title,
        highlightedTitle: highlightMatch(n.title, cleanQuery),
        snippet: `${n.sourceName} • ${n.domain} (${n.category})`,
        highlightedSnippet: highlightMatch(`${n.sourceName} • ${n.domain}`, cleanQuery),
        metadata: {
          newsId: n.id,
          sourceName: n.sourceName,
          category: n.category,
          status: n.status,
          publishedAt: n.publishedAt
        },
        relevanceScore: score
      });
    }
  }

  // Sort strictly by relevance score descending
  results.sort((a, b) => b.relevanceScore - a.relevanceScore);

  const finalItems = results.slice(0, limit);

  // Group by type for faceted counts
  const resultsByType = {
    REPORT: results.filter(r => r.type === 'REPORT').length,
    CLAIM: results.filter(r => r.type === 'CLAIM').length,
    EVIDENCE: results.filter(r => r.type === 'EVIDENCE').length,
    ENTITY: results.filter(r => r.type === 'ENTITY').length,
    SOURCE: results.filter(r => r.type === 'SOURCE').length,
    NEWS: results.filter(r => r.type === 'NEWS').length
  };

  return {
    query: cleanQuery,
    totalMatches: results.length,
    resultsByType,
    items: finalItems
  };
}

module.exports = {
  searchGlobalIndex,
  highlightMatch,
  computeRelevanceScore
};
