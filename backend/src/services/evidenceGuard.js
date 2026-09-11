// Conservative checks shared by model evaluation, heuristic evaluation and re-search.
const WORDS = ['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty'];
const numeral = `(?:\\d+(?:\\.\\d+)?|${WORDS.join('|')})`;
const metric = 'rooms?|beds?|floors?|students?|people|workers?|deaths?|fatalities|injuries|facilit(?:y|ies)|hostels?|PGs?';
const value = str => /^\d/.test(str) ? Number(str) : WORDS.indexOf(str.toLowerCase());
const unit = str => ({ pg: 'facility', pgs: 'facility', hostel: 'facility', hostels: 'facility', facilities: 'facility', people: 'people', fatalities: 'deaths', deaths: 'deaths', injuries: 'injuries' }[str] || str.replace(/s$/, ''));
function measurements(text = '') {
  const totals = new Map(), rates = [];
  const regex = new RegExp(`\\b(${numeral})\\s+(${metric})(?:\\s+(?:on|in|per)\\s+(?:each\\s+)?(rooms?|floors?)|\\s+(?:on|in)\\s+each\\s+(room|floor))?`, 'gi');
  for (const m of String(text).matchAll(regex)) {
    const item = { amount: value(m[1]), unit: unit(m[2].toLowerCase()) };
    const per = m[3] || m[4];
    if (per) rates.push({ ...item, per: unit(per.toLowerCase()) });
    else if (!/\s+each\b/i.test(text.slice(m.index + m[0].length, m.index + m[0].length + 12))) {
      if (!totals.has(item.unit)) totals.set(item.unit, item.amount);
      else if (totals.get(item.unit) !== item.amount) totals.set(item.unit, null);
    } else rates.push({ ...item, per: null });
  }
  for (let pass = 0; pass < 3; pass++) for (const rate of rates) {
    if (rate.per && totals.get(rate.per) != null) totals.set(rate.unit, rate.amount * totals.get(rate.per));
  }
  return { totals, rates };
}

function guardEvidence(claim, evidence, evaluation) {
  const sourceUrl = typeof claim === 'object' ? claim.articleContext?.sourceUrl : null;
  const articleKey = raw => {
    try {
      const url = new URL(raw);
      url.hostname = url.hostname.replace(/^www\./i,'');
      url.pathname = url.pathname.replace(/^\/amp\//i,'/').replace(/\/amp\/?$/i,'/');
      if(url.searchParams.get('output') === 'amp')url.searchParams.delete('output');
      for (const key of [...url.searchParams.keys()]) if (/^(?:utm_|ref$|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
      url.hash = ''; url.searchParams.sort();
      return url.href.replace(/\/$/, '');
    } catch (_) { return null; }
  };
  if (sourceUrl && articleKey(sourceUrl) && articleKey(sourceUrl) === articleKey(evidence.url || evidence.link)) {
    return { ...evaluation, stance: 'NEUTRAL', isInputSource: true, reason: 'This is the submitted article itself; it provides context but cannot independently corroborate its own claim.' };
  }
  const c = typeof claim === 'string' ? claim : claim.resolvedText || claim.text || claim.claimText || '';
  const e = [evidence.title, evidence.snippet, evidence.fetchedPassage].filter(Boolean).join(' ');
  const normalize = s => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const exact = normalize(c) && (normalize(evidence.snippet || '') === normalize(c) || (!evidence.snippet && normalize(evidence.title || '') === normalize(c)));
  if (exact) return { ...evaluation, stance: 'SUPPORTS', reason: 'Evidence explicitly states the same proposition, including its qualifiers.' };
  const result = { ...evaluation };
  if (result.requiresCitation && result.stance === 'REFUTES') {
    const quote = normalize(result.supportingPassage || '');
    if (!quote || !normalize(e).includes(quote)) return {...result,stance:'NEUTRAL',reason:'No traceable same-event refuting passage was supplied.'};
  }
  if (result.stance === 'IRRELEVANT') return result;
  const years = s => [...s.matchAll(/\b(?:19|20)\d{2}\b/g)].map(m => m[0]);
  const cy = years(c), ey = years(e);
  const explicitContrast = /\b(?:contrary to|rather than|not .{1,70} but|incorrectly reported|debunked|false (?:rumou?r|claims?)|claim .{0,50}(?:false|incorrect))\b/i.test(e);
  if (cy.length && ey.length && !cy.some(y => ey.includes(y)) && !explicitContrast) {
    return { ...result, stance: 'NEUTRAL', temporalMatch: false, reason: 'Evidence concerns a different time window and does not establish a contradiction.' };
  }
  if ((evaluation.entityMatch === false || evaluation.locationMatch === false || evaluation.eventMatch === false) && !explicitContrast) {
    return { ...result, stance: 'NEUTRAL', reason: 'The same actor, event and location have not been established; a different event does not refute this claim.' };
  }
  const cq = measurements(c), eq = measurements(e);
  if (result.stance === 'SUPPORTS') {
    const missing = [...cq.totals].filter(([u,n]) => n != null && eq.totals.get(u) !== n);
    if (missing.length) return { ...result, stance: 'NEUTRAL', missingDetails: missing.map(([u,n]) => n + ' ' + u), reason: 'Evidence does not establish the required quantities with the same units: ' + missing.map(([u,n]) => n + ' ' + u).join(', ') };
    if (evaluation.requiresCitation) {
      const passage = normalize(evaluation.supportingPassage || '');
      if (!passage || !normalize(e).includes(passage) || evaluation.allEssentialDetailsSupported !== true) {
        return { ...result, stance: 'NEUTRAL', reason: 'The assessment lacks a traceable passage establishing all essential details.' };
      }
    }
  }
  if (result.stance === 'REFUTES' && cq.totals.size && eq.rates.length) {
    const comparable = [...cq.totals].filter(([u, n]) => n != null && eq.totals.get(u) != null);
    if (!comparable.some(([u, n]) => eq.totals.get(u) !== n)) {
      return { ...result, stance: 'NEUTRAL', reason: 'Per-unit figures are compatible with the reported totals; these rates do not establish a numerical contradiction.' };
    }
  }
  return result;
}
module.exports = { guardEvidence, measurements };
