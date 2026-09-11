// Shared contracts for extraction, retrieval, verification and saved-claim research.
function preserveParagraphs(value = '') {
  return String(value).replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function sentences(text = '') {
  if (typeof Intl.Segmenter === 'function') {
    return [...new Intl.Segmenter('en', { granularity: 'sentence' }).segment(text)]
      .map(item => item.segment.trim()).filter(Boolean);
  }
  return String(text).split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
}

function normalizeArticleContext(context = {}) {
  const c = context && typeof context === 'object' ? context : {};
  const list = value => (Array.isArray(value) ? value : value ? [value] : []).filter(v => typeof v === 'string' && v.trim());
  const locations = list(c.locations?.length ? c.locations : c.location);
  const dates = list(c.dates?.length ? c.dates : c.date);
  return { ...c, locations, dates, entities: list(c.entities),
    location: c.location || (locations.length === 1 ? locations[0] : null),
    date: c.date || (dates.length === 1 ? dates[0] : null),
    mainEvent: c.mainEvent || c.event || '', event: c.mainEvent || c.event || '' };
}

function searchText(value = '') {
  // Preserve Unicode names, dates, numbers, negation, attribution and search operators.
  return String(value).replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
}

function leadingSubject(text = '') {
  const match = String(text).match(/^([A-Z][\p{L}'’.-]*(?:\s+[\p{L}'’.-]+){0,12}?)\s+(?:was|were|is|are|has|have|had|said|reported|announced|appointed|opened|rejected|turned|bought|sold|acquired|sells|plans|approves|approved|recorded|produced|launched|employs|provides|operates|contains|supports)\b/u);
  return match && !/^(He|She|They|It|His|Her|Their|Its|The company|The incident)$/i.test(match[1]) ? match[1].replace(/\s+(?:chaired|led) by .+$/, '') : '';
}

function sourceContextFor(original, structure) {
  const normalize = text => String(text || '').replace(/\s+/g, ' ').trim();
  const key = normalize(original);
  const found = structure.find(s => normalize(s.text) === key);
  return found ? { originalSentence: found.text, paragraph: found.paragraph,
    previousSentence: found.previousSentence, nextSentence: found.nextSentence,
    sourcePosition: found.sourcePosition } : { originalSentence: original, paragraph: null,
    previousSentence: null, nextSentence: null, sourcePosition: null, lineageUnavailable: true };
}


function contextualClaimText(claim = {}) {
  const target = searchText(claim.resolvedText || claim.text || claim.claimText || '');
  // Search needs a self-contained event description even when the displayed
  // verification target remains one precise assertion.
  const dependent = claim.independentlySearchable === false || /^(?:he|she|they|it|his|her|their|its|the (?:chain|company|firm|group|operator|owner|building|hostel|PG|incident)|and yet)\b/i.test(target);
  const previous = searchText(claim.sourceContext?.previousSentence || '');
  const article = normalizeArticleContext(claim.articleContext);
  const group = searchText(claim.claimGroup?.topic || claim.groupTopic || '');
  const headline = searchText(article.headline || '');
  const event = searchText(article.mainEvent || article.event || '');
  const usefulArticleAnchor = [headline, event, group].find(value => value && !/^(?:reported factual event|event|topic|related facts)$/i.test(value));
  const needsArticleAnchor = dependent || /\b\d+(?:\.\d+)?\b/.test(target);
  const parts = [];
  if (needsArticleAnchor && usefulArticleAnchor && !target.toLowerCase().includes(usefulArticleAnchor.toLowerCase())) parts.push(usefulArticleAnchor);
  if (dependent && previous && !target.toLowerCase().includes(previous.toLowerCase())) parts.push(previous);
  parts.push(target);
  return searchText(parts.join(' ')).slice(0, 900);
}

function verificationContext(claim) {
  return JSON.stringify({ article: normalizeArticleContext(claim.articleContext),
    group: claim.claimGroup || null,
    contextualReading: contextualClaimText(claim),
    evaluationInstruction: 'Evaluate only the target assertion. Related group assertions and article context are unverified background, not independent evidence.',
    meaning: claim.claimMeaning || {}, source: claim.sourceContext || {},
    originalText: claim.originalText || claim.sourceSpan || null });
}

function selectEvidencePassage(text, claim, maxLength = 6000) {
  const paragraphs = preserveParagraphs(text).split(/\n+/).filter(Boolean);
  const windows = paragraphs.flatMap(p => {
    if (p.length <= maxLength) return [p];
    const parts = sentences(p), result = [];
    for (let i = 0; i < parts.length; i++) result.push(parts.slice(Math.max(0, i - 1), i + 3).join(' '));
    return result;
  });
  const terms = [...new Set(searchText(claim).toLowerCase().match(/[\p{L}\p{N}]+/gu) || [])]
    .filter(t => t.length > 3 || /\d/.test(t));
  let best = '', bestScore = -1;
  for (const passage of windows) {
    const lower = passage.toLowerCase();
    const score = terms.reduce((sum, t) => sum + (lower.includes(t) ? (/\d/.test(t) ? 3 : 1) : 0), 0);
    if (score > bestScore) { best = passage; bestScore = score; }
  }
  return best.slice(0, maxLength);
}

module.exports = { preserveParagraphs, sentences, normalizeArticleContext, searchText,
  leadingSubject, sourceContextFor, verificationContext, selectEvidencePassage, contextualClaimText };
