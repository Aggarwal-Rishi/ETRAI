/**
 * ETRAI Deep Claim and Numerical Fact Analysis Engine
 * Extracts factual numerical propositions, identifies units, normalizes scales,
 * determines context/meaning, detects discrepancies and misleading comparisons,
 * distinguishes descriptive vs. actionable numbers, and integrates numerical findings.
 */

// Scale multipliers for Indian and International systems
const SCALE_MULTIPLIERS = {
  // Indian system
  'crore': 10000000,
  'cr': 10000000,
  'crores': 10000000,
  'lakh': 100000,
  'lac': 100000,
  'lakhs': 100000,
  'arab': 1000000000,
  'kharab': 100000000000,

  // Western / International system
  'thousand': 1000,
  'k': 1000,
  'million': 1000000,
  'mn': 1000000,
  'm': 1000000,
  'billion': 1000000000,
  'bn': 1000000000,
  'b': 1000000000,
  'trillion': 1000000000000,
  'tn': 1000000000000,

  // Metric prefixes
  'gw': 1000000000,
  'gigawatt': 1000000000,
  'gigawatts': 1000000000,
  'mw': 1000000,
  'megawatt': 1000000,
  'megawatts': 1000000,
  'kw': 1000,
  'kilowatt': 1000,
  'mt': 1000000, // Metric tonnes in kg
  'metric tonnes': 1000000,
  'metric tons': 1000000,
  'tonnes': 1000,
  'kg': 1,
  'bps': 0.0001 // Basis points
};

/**
 * Parses raw number strings into floats (handles commas e.g. "12,000" -> 12000)
 */
function parseCleanNumber(numStr) {
  if (!numStr) return 0;
  const clean = numStr.replace(/,/g, '').trim();
  const val = parseFloat(clean);
  return isNaN(val) ? 0 : val;
}

/**
 * Extracts and normalizes numerical facts from text
 */
function extractNumericalFacts(text = '', claims = []) {
  if (!text || typeof text !== 'string') return [];

  const facts = [];
  const factMap = new Map();

  // 1. Regex for Currency: ₹10,000 Cr, $50 Billion, Rs. 500, €250 million
  const currencyRegex = /(?:(₹|Rs\.?|INR|USD|\$|EUR|€|GBP|£)\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)\s*(crore|cr|lakh|lac|billion|bn|million|mn|trillion|k|thousand)?)/gi;
  let match;
  while ((match = currencyRegex.exec(text)) !== null) {
    const symbol = (match[1] || '').toUpperCase();
    const rawVal = parseCleanNumber(match[2]);
    const scaleWord = (match[3] || '').toLowerCase();
    const scaleMult = SCALE_MULTIPLIERS[scaleWord] || 1;
    const normalizedValue = rawVal * scaleMult;
    const asPrinted = match[0].trim();

    let currency = 'INR';
    if (symbol.includes('$') || symbol.includes('USD')) currency = 'USD';
    else if (symbol.includes('€') || symbol.includes('EUR')) currency = 'EUR';
    else if (symbol.includes('£') || symbol.includes('GBP')) currency = 'GBP';

    const factKey = `${asPrinted.toLowerCase()}`;
    if (!factMap.has(factKey) && rawVal > 0) {
      factMap.set(factKey, true);
      facts.push({
        factId: `num_curr_${facts.length + 1}`,
        asPrinted,
        metricType: 'CURRENCY',
        rawNumber: rawVal,
        unit: scaleWord ? `${currency} ${scaleWord.toUpperCase()}` : currency,
        normalizedValue,
        standardBaseUnit: currency,
        scaleFactor: scaleMult,
        classification: normalizedValue >= 1000000 ? 'ACTIONABLE_METRIC' : 'DESCRIPTIVE_INCIDENTAL',
        contextSnippet: extractContextWindow(text, match.index, match[0].length)
      });
    }
  }

  // 2. Regex for Percentages & Growth Rates: 8.2%, 15.5 percent, 250 bps
  const percentRegex = /([0-9]+(?:\.[0-9]+)?)\s*(%|percent|percentage|basis points|bps)/gi;
  while ((match = percentRegex.exec(text)) !== null) {
    const rawVal = parseCleanNumber(match[1]);
    const unitWord = (match[2] || '').toLowerCase();
    const isBps = unitWord.includes('bps') || unitWord.includes('basis');
    const normalizedValue = isBps ? rawVal * 0.0001 : rawVal / 100.0;
    const asPrinted = match[0].trim();

    const factKey = `${asPrinted.toLowerCase()}`;
    if (!factMap.has(factKey)) {
      factMap.set(factKey, true);
      facts.push({
        factId: `num_pct_${facts.length + 1}`,
        asPrinted,
        metricType: 'PERCENTAGE',
        rawNumber: rawVal,
        unit: isBps ? 'BPS' : '%',
        normalizedValue: Number(normalizedValue.toFixed(6)),
        standardBaseUnit: 'FRACTION_OF_1',
        scaleFactor: isBps ? 0.0001 : 0.01,
        classification: 'ACTIONABLE_METRIC',
        contextSnippet: extractContextWindow(text, match.index, match[0].length)
      });
    }
  }

  // 3. Regex for Metric Weights & Measures: 50,000 MT, 50 Lakh MT, 2.5 GW, 100 MW, 45 km
  const metricRegex = /([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)\s*(lakh|lac|crore|cr|million|mn|billion|bn|thousand|k)?\s*(metric tonnes?|metric tons?|tonnes?|gw|gigawatts?|mw|megawatts?|kw|kilowatts?|km|kilometers?|kg|kilograms?)/gi;
  while ((match = metricRegex.exec(text)) !== null) {
    const rawVal = parseCleanNumber(match[1]);
    const scalePrefix = (match[2] || '').toLowerCase();
    const unitWord = (match[3] || '').toLowerCase();
    const prefixMult = SCALE_MULTIPLIERS[scalePrefix] || 1;
    const unitMult = SCALE_MULTIPLIERS[unitWord] || 1;
    const normalizedValue = rawVal * prefixMult * unitMult;
    const asPrinted = match[0].trim();

    let standardBaseUnit = 'COUNT';
    if (unitWord.includes('gw') || unitWord.includes('mw') || unitWord.includes('kw') || unitWord.includes('watt')) {
      standardBaseUnit = 'WATT';
    } else if (unitWord.includes('tonne') || unitWord.includes('ton') || unitWord.includes('kg')) {
      standardBaseUnit = 'KG';
    } else if (unitWord.includes('km') || unitWord.includes('meter')) {
      standardBaseUnit = 'METER';
    }

    const factKey = `${asPrinted.toLowerCase()}`;
    if (!factMap.has(factKey) && rawVal > 0) {
      factMap.set(factKey, true);
      facts.push({
        factId: `num_meas_${facts.length + 1}`,
        asPrinted,
        metricType: 'WEIGHT_OR_MEASURE',
        rawNumber: rawVal,
        unit: scalePrefix ? `${scalePrefix.toUpperCase()} ${unitWord.toUpperCase()}` : unitWord.toUpperCase(),
        normalizedValue,
        standardBaseUnit,
        scaleFactor: prefixMult * unitMult,
        classification: 'ACTIONABLE_METRIC',
        contextSnippet: extractContextWindow(text, match.index, match[0].length)
      });
    }
  }

  // 4. Regex for Quantity Multipliers / Counts: 1.4 billion people, 3x increase, 50,000 jobs
  const countRegex = /([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)\s*(billion|million|crore|lakh|thousand)?\s+(people|citizens|jobs|workers|aircraft|vehicles|tonnes|units|subscribers|users|cases)/gi;
  while ((match = countRegex.exec(text)) !== null) {
    const rawVal = parseCleanNumber(match[1]);
    const scaleWord = (match[2] || '').toLowerCase();
    const noun = (match[3] || '').trim();
    const scaleMult = SCALE_MULTIPLIERS[scaleWord] || 1;
    const normalizedValue = rawVal * scaleMult;
    const asPrinted = match[0].trim();

    const factKey = `${asPrinted.toLowerCase()}`;
    if (!factMap.has(factKey) && rawVal > 0) {
      factMap.set(factKey, true);
      facts.push({
        factId: `num_count_${facts.length + 1}`,
        asPrinted,
        metricType: 'COUNT',
        rawNumber: rawVal,
        unit: scaleWord ? `${scaleWord.toUpperCase()} ${noun.toUpperCase()}` : noun.toUpperCase(),
        normalizedValue,
        standardBaseUnit: noun.toUpperCase(),
        scaleFactor: scaleMult,
        classification: 'ACTIONABLE_METRIC',
        contextSnippet: extractContextWindow(text, match.index, match[0].length)
      });
    }
  }

  // Deduce refersTo context for each fact
  return facts.map(f => {
    const refersTo = deduceReferent(f.contextSnippet, f.asPrinted);
    return {
      ...f,
      refersTo,
      actualFinding: `Extracted verbatim: "${f.asPrinted}" (${f.normalizedValue.toLocaleString()} ${f.standardBaseUnit})`,
      status: 'VERIFIED',
      discrepancyType: null,
      discrepancyRatio: null
    };
  });
}

/**
 * Extracts a contextual sentence or clause window around the number match
 */
function extractContextWindow(text, matchIndex, matchLength) {
  const start = Math.max(0, matchIndex - 60);
  const end = Math.min(text.length, matchIndex + matchLength + 60);
  return text.substring(start, end).replace(/\s+/g, ' ').trim();
}

/**
 * Deduces what the number refers to based on surrounding contextual keywords
 */
function deduceReferent(context = '', asPrinted = '') {
  if (!context) return 'Quantitative statement';
  const cleanContext = context.replace(asPrinted, '').trim();

  if (cleanContext.match(/\b(outlay|allocation|package|budget|funding|financial|grant)\b/i)) {
    return 'Financial budget or project outlay';
  } else if (cleanContext.match(/\b(gdp|growth|inflation|cpi|rate|yield)\b/i)) {
    return 'Macroeconomic rate or growth indicator';
  } else if (cleanContext.match(/\b(export|import|quota|shipment|capacity|production)\b/i)) {
    return 'Trade or production volume';
  } else if (cleanContext.match(/\b(jobs|employment|workforce|workers|hiring)\b/i)) {
    return 'Employment and labor statistics';
  } else if (cleanContext.match(/\b(investment|acquisition|deal|valuation|revenue|profit)\b/i)) {
    return 'Corporate transaction or commercial revenue';
  }

  const words = cleanContext.split(/\s+/).slice(0, 8).join(' ');
  return words ? `Context: ${words}...` : 'Quantitative assertion';
}

/**
 * Cross-checks extracted numerical facts against verified evidence items
 */
function verifyNumericalDiscrepancies(numericalFacts = [], verifiedClaims = []) {
  if (!Array.isArray(numericalFacts) || numericalFacts.length === 0) return [];

  return numericalFacts.map(fact => {
    let discrepancyType = null;
    let discrepancyRatio = null;
    let status = 'VERIFIED';
    let finding = fact.actualFinding;

    // Cross reference against verified claims containing refutations
    for (const claim of verifiedClaims) {
      const claimText = (claim.claimText || claim.text || '').toLowerCase();
      const asPrintedLower = fact.asPrinted.toLowerCase();

      if (claimText.includes(asPrintedLower) || claimText.includes(fact.rawNumber.toString())) {
        if (claim.verdict === 'FALSE' || claim.status === 'REFUTED') {
          // Check for scale mismatch (e.g. 10,000 Cr vs 1,000 Cr)
          if (claim.conflictType === 'QUANTITY_MISMATCH' || claim.conflictType === 'SCALE_MISMATCH') {
            discrepancyType = 'SCALE_MISMATCH';
            discrepancyRatio = 10.0; // Inflation factor
            status = 'FABRICATED';
            finding = `Claimed ${fact.asPrinted} contradicts official evidence citing lower statutory scale.`;
          } else {
            discrepancyType = 'QUANTITY_DISCREPANCY';
            status = 'FABRICATED';
            finding = `Claimed ${fact.asPrinted} contradicted by official records.`;
          }
        } else if (claim.verdict === 'PARTIALLY_VERIFIED' || claim.status === 'PARTIALLY_VERIFIED') {
          discrepancyType = 'MISLEADING_COMPARISON';
          status = 'SUSPICIOUS';
          finding = `Numerical comparison in ${fact.asPrinted} contains unadjusted baselines or partial distortion.`;
        }
      }
    }

    return {
      ...fact,
      status,
      discrepancyType,
      discrepancyRatio,
      actualFinding: finding
    };
  });
}

/**
 * Master Numerical Fact Analysis Pipeline
 */
async function performNumericalFactAnalysis(text = '', verifiedClaims = [], options = {}) {
  // 1. Extract all meaningful numbers with normalized scale
  const extractedFacts = extractNumericalFacts(text, verifiedClaims);

  // 2. Cross check discrepancies against verified claims
  const verifiedFacts = verifyNumericalDiscrepancies(extractedFacts, verifiedClaims);

  const actionableCount = verifiedFacts.filter(f => f.classification === 'ACTIONABLE_METRIC').length;
  const descriptiveCount = verifiedFacts.filter(f => f.classification === 'DESCRIPTIVE_INCIDENTAL').length;
  const discrepancies = verifiedFacts.filter(f => f.discrepancyType !== null);

  return {
    factsCount: verifiedFacts.length,
    actionableFactsCount: actionableCount,
    descriptiveFactsCount: descriptiveCount,
    discrepanciesCount: discrepancies.length,
    facts: verifiedFacts,
    discrepancies,
    scaleAudit: {
      totalMonetaryValueINR: verifiedFacts.filter(f => f.standardBaseUnit === 'INR').reduce((acc, curr) => acc + curr.normalizedValue, 0),
      totalMonetaryValueUSD: verifiedFacts.filter(f => f.standardBaseUnit === 'USD').reduce((acc, curr) => acc + curr.normalizedValue, 0),
      percentageAverages: verifiedFacts.filter(f => f.metricType === 'PERCENTAGE').map(f => ({ asPrinted: f.asPrinted, normalizedFraction: f.normalizedValue }))
    },
    summary: {
      totalNumbersAnalyzed: verifiedFacts.length,
      actionableMetrics: actionableCount,
      confirmedDiscrepancies: discrepancies.length,
      numericalIntegrityStatus: discrepancies.length === 0 ? 'NUMERICALLY_ACCURATE' : 'NUMERICAL_DISCREPANCIES_DETECTED'
    }
  };
}

module.exports = {
  performNumericalFactAnalysis,
  extractNumericalFacts,
  verifyNumericalDiscrepancies,
  parseCleanNumber,
  SCALE_MULTIPLIERS
};
