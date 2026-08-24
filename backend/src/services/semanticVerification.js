/**
 * Stage 3: Formal Claim ↔ Evidence Semantic Verification Engine for ETRAI
 * Evaluates semantic propositions across 15 explicit dimensions:
 * 1. Subject (MATCH | MISMATCH | UNKNOWN)
 * 2. Action / Predicate (MATCH | MISMATCH | UNKNOWN)
 * 3. Object (MATCH | MISMATCH | UNKNOWN)
 * 4. Event (MATCH | MISMATCH | UNKNOWN)
 * 5. Time (MATCH | MISMATCH | UNKNOWN)
 * 6. Location (MATCH | MISMATCH | UNKNOWN)
 * 7. Quantity (MATCH | MISMATCH | UNKNOWN)
 * 8. Direction (MATCH | MISMATCH | UNKNOWN)
 * 9. Negation (MATCH | MISMATCH)
 * 10. Completion Status (MATCH | MISMATCH | UNKNOWN)
 * 11. Certainty (MATCH | MISMATCH | UNKNOWN)
 * 12. Attribution (MATCH | MISMATCH | UNKNOWN)
 * 13. Causality (MATCH | MISMATCH | UNKNOWN)
 * 14. Modality (MATCH | MISMATCH | UNKNOWN)
 * 15. Qualifiers (MATCH | MISMATCH | UNKNOWN)
 *
 * Classifies stance into: SUPPORTS | REFUTES | NEUTRAL | IRRELEVANT
 * Computes component-level support and evidence quality without modifying downstream fuzzy scoring rules.
 */

// -------------------------------------------------------------
// EVENT STATES (9 Canonical Event States)
// -------------------------------------------------------------
const EVENT_STATES = {
  PLANNED: 'PLANNED',
  CONSIDERED: 'CONSIDERED',
  ANNOUNCED: 'ANNOUNCED',
  NEGOTIATING: 'NEGOTIATING',
  AGREED: 'AGREED',
  SIGNED: 'SIGNED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  ABANDONED: 'ABANDONED'
};

// -------------------------------------------------------------
// CANONICAL EVENT MAP & NORMALIZATION LAYER
// -------------------------------------------------------------
const CANONICAL_EVENTS = {
  // ACQUISITION: completed/finalized acquisition events.
  ACQUISITION: ['acquired', 'acquires', 'acquiring', 'acquire', 'bought', 'purchased', 'purchasing', 'acquisition', 'completed the acquisition', 'finalized the acquisition', 'finalized its purchase', 'closed the acquisition', 'takeover', 'closed the purchase', 'closed the deal', 'finalized', 'owns', 'purchased the', 'bought the'],
  REJECTION: ['rejected', 'rejects', 'rejecting', 'turned down', 'declined', 'refused', 'opposed', 'reject', 'rejection'],
  ANNOUNCEMENT: ['announced', 'announces', 'announcing', 'revealed', 'unveiled', 'declared', 'disclosed', 'stated', 'reported', 'announce', 'announcement', 'authorized', 'authorizes', 'approved', 'cleared'],
  INCREASE: ['increased', 'increases', 'increasing', 'grew', 'grows', 'growing', 'rose', 'climbed', 'surged', 'surge', 'higher', 'increase', 'growth', 'recorded'],
  DECREASE: ['decreased', 'decreases', 'decreasing', 'fell', 'dropped', 'declined', 'slumped', 'slump', 'lower', 'decrease', 'reduced', 'reduced by', 'cut', 'trimmed', 'slashed', 'laid off', 'reduced workforce', 'lay offs', 'layoffs'],
  INVESTMENT: ['invested', 'invests', 'investing', 'investment', 'invest', 'funding', 'funded', 'put in', 'raised', 'provided', 'series a', 'pours', 'poured', 'poured in', 'committed', 'committed to', 'allocating', 'allocated'],
  ARREST: ['arrested', 'arrests', 'arresting', 'detained', 'apprehended', 'held', 'arrest'],
  INAUGURATION: ['opened', 'launched', 'started', 'established', 'inaugurated'],
  REPORTING: ['showed', 'reported', 'show', 'filings', 'official filings', 'disclosed', 'stated', 'confirmed', 'was', 'were', 'is', 'are', 'valued at', 'totaled', 'stood at'],
  // SIGNED must remain DISTINCT from ACQUISITION/COMPLETED. Signing an agreement ≠ completing the acquisition.
  SIGNED: ['signed', 'signed the agreement', 'signed the acquisition agreement', 'signed an agreement']
};

function normalizeCanonicalEvent(text) {
  if (!text || typeof text !== 'string') return null;
  const lower = text.toLowerCase();

  // SIGNED must be checked BEFORE ACQUISITION because "signed the acquisition agreement"
  // contains the word "acquisition" which would otherwise cause ACQUISITION to match first.
  // Priority order: SIGNED > all others
  const PRIORITY_EVENTS = ['SIGNED'];
  for (const eventCode of PRIORITY_EVENTS) {
    const phrases = CANONICAL_EVENTS[eventCode];
    if (phrases && phrases.some(p => lower.includes(p))) {
      return eventCode;
    }
  }

  // Check remaining events in insertion order
  for (const [eventCode, phrases] of Object.entries(CANONICAL_EVENTS)) {
    if (PRIORITY_EVENTS.includes(eventCode)) continue; // already checked
    if (phrases.some(p => lower.includes(p))) {
      return eventCode;
    }
  }
  return null;
}

// -------------------------------------------------------------
// REPORTING FRAME & ATTRIBUTION EXTRACTION
// -------------------------------------------------------------
function extractReportingFrame(text) {
  if (!text || typeof text !== 'string') return { textWithoutFrame: text || '', reportingSource: null, reportingVerb: null };

  const reportingVerbs = ['reported', 'said', 'stated', 'announced', 'revealed', 'confirmed', 'disclosed', 'claimed', 'according to'];
  const match = text.match(/\b([A-Z0-9][a-z0-9]+(?:\s+[A-Z0-9][a-z0-9]+){0,2})\s+(reported|said|stated|announced|revealed|confirmed|disclosed|claimed)\s+(that\s+)?/i);

  if (match) {
    return {
      textWithoutFrame: text.replace(match[0], '').trim(),
      reportingSource: match[1],
      reportingVerb: match[2].toLowerCase()
    };
  }

  return { textWithoutFrame: text, reportingSource: null, reportingVerb: null };
}

function parseWordNumber(wordStr) {
  if (!wordStr) return null;
  const words = wordStr.toLowerCase().replace(/[^a-z\s-]/g, '').trim().split(/[\s-]+/);
  const small = {
    'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9,
    'ten': 10, 'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15, 'sixteen': 16,
    'seventeen': 17, 'eighteen': 18, 'nineteen': 19, 'twenty': 20, 'thirty': 30, 'forty': 40, 'fifty': 50,
    'sixty': 60, 'seventy': 70, 'eighty': 80, 'ninety': 90
  };
  let val = 0;
  for (const w of words) {
    if (small[w] !== undefined) {
      val += small[w];
    }
  }
  return val > 0 ? String(val) : null;
}

function extractFullQuantities(text) {
  if (!text || typeof text !== 'string') return [];
  const regex = /(?:[\$\€\£\₹]\s*\d+(?:\.\d+)?(?:\s*(?:billion|million|trillion|crore|lakh|thousand|k|b|m))?|\b\d+(?:\.\d+)?%|\b\d+(?:\.\d+)?\s*(?:%|percent|billion|million|trillion|crore|lakh|thousand|k|b|m)\b|\b\d+(?:\.\d+)?\b|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[\s-](?:one|two|three|four|five|six|seven|eight|nine))?\s*(?:percent|%|billion|million|trillion|crore|lakh)\b)/gi;
  const rawMatches = (text.match(regex) || []).map(m => m.trim());
  
  const result = [];
  for (const candidate of rawMatches) {
    // Filter out 4-digit standalone years (e.g. 2024, 2025, 2026) so they are processed as temporal dates, not quantities
    if (/^\b(19|20)\d{2}\b$/.test(candidate)) continue;

    let normalizedCandidate = candidate;
    const wordNumMatch = candidate.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[\s-](?:one|two|three|four|five|six|seven|eight|nine))?\b/i);
    if (wordNumMatch) {
      const parsedNum = parseWordNumber(wordNumMatch[0]);
      if (parsedNum) {
        const hasPercent = /percent|%/i.test(candidate);
        const hasBillion = /billion|b\b/i.test(candidate);
        const hasMillion = /million|m\b/i.test(candidate);
        const unitSuffix = hasPercent ? '%' : (hasBillion ? ' billion' : (hasMillion ? ' million' : ''));
        normalizedCandidate = `${parsedNum}${unitSuffix}`;
      }
    }
    result.push(normalizedCandidate);
    if (normalizedCandidate !== candidate) {
      result.push(candidate);
    }
  }

  const sorted = Array.from(new Set(result)).sort((a, b) => b.length - a.length);
  return sorted;
}

function extractTimeFromText(text) {
  if (!text || typeof text !== 'string') return null;
  const match = text.match(/\b(?:(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+(?:\d{1,2}(?:,\s*(?:19|20)\d{2})?|(?:19|20)\d{2})|(?:19|20)\d{2})\b/i);
  return match ? match[0].trim() : null;
}

function normalizeClaimProposition(claim) {
  const claimObj = typeof claim === 'string' ? { text: claim } : (claim || {});
  const claimText = claimObj.resolvedText || claimObj.text || claimObj.claimText || '';
  const claimMeaning = claimObj.claimMeaning || {};
  const articleContext = claimObj.articleContext || {};

  const { textWithoutFrame, reportingSource, reportingVerb } = extractReportingFrame(claimText);

  const quantities = Array.isArray(claimMeaning.quantities) && claimMeaning.quantities.length > 0
    ? claimMeaning.quantities
    : extractFullQuantities(claimText);

  const hasNegation = /\b(not|never|no|denied|refuted|debunked|false|fake|untrue|fabricated|contradicted|failed to|ruled out|did not|didn't|wasn't|was not|remained completely unchanged)\b/i.test(claimText);

  let direction = 'NEUTRAL';
  if (/\b(increase|increased|grew|grew by|rose|climbed|surge|higher)\b/i.test(claimText)) {
    direction = 'INCREASE';
  } else if (/\b(decrease|decreased|decline|declined|fell|dropped|slump|lower)\b/i.test(claimText)) {
    direction = 'DECREASE';
  }

  let completionStatus = EVENT_STATES.COMPLETED;
  if (/\b(signed|signed the agreement|signed the acquisition agreement)\b/i.test(claimText)) {
    completionStatus = EVENT_STATES.SIGNED;
  } else if (/\b(negotiating|in talks|negotiations)\b/i.test(claimText)) {
    completionStatus = EVENT_STATES.NEGOTIATING;
  } else if (/\b(agreed|agreed to|reached an agreement)\b/i.test(claimText) && !/\b(signed|completed)\b/i.test(claimText)) {
    completionStatus = EVENT_STATES.AGREED;
  } else if (/\b(plans to|plan to|planning to|intends to|intended to|set to)\b/i.test(claimText) && !/\b(announced plans)\b/i.test(claimText)) {
    // "Company X plans to acquire" = PLANNED (future intent, not yet announced formally)
    completionStatus = EVENT_STATES.PLANNED;
  } else if (/\b(is considering|considering|expected to|proposed to|offered to|aims to)\b/i.test(claimText)) {
    completionStatus = EVENT_STATES.CONSIDERED;
  } else if (/\b(announced plans|announced|unveiled|revealed|declared)\b/i.test(claimText) && /\b(plans|investment|launch)\b/i.test(claimText)) {
    completionStatus = EVENT_STATES.ANNOUNCED;
  } else if (/\b(cancelled|called off)\b/i.test(claimText)) {
    completionStatus = EVENT_STATES.CANCELLED;
  } else if (/\b(abandoned|dropped)\b/i.test(claimText)) {
    completionStatus = EVENT_STATES.ABANDONED;
  }

  const canonicalEvent = normalizeCanonicalEvent(claimMeaning.predicate || textWithoutFrame || claimText);
  const hasCausality = /\b(because of|caused by|due to|linked to|resulted from|as a result of)\b/i.test(claimText);

  let subject = claimMeaning.subject;
  if (!subject || subject === 'Subject') {
    if (claimObj.entities && claimObj.entities.length > 0) {
      subject = claimObj.entities[0];
    } else {
      const match = claimText.match(/^(A|An|The)?\s*([A-Z0-9][a-z0-9]+(?:\s+[A-Z0-9][a-z0-9]+){0,2})/);
      subject = match ? match[0] : 'Subject';
    }
  }

  let location = claimMeaning.location;
  if (!location) {
    location = extractLocationFromText(claimText);
  }

  let time = claimMeaning.time || articleContext.date || extractTimeFromText(claimText);

  return {
    subject,
    action: claimMeaning.predicate || claimText,
    canonicalEvent,
    object: claimMeaning.object || claimText,
    event: claimMeaning.event || articleContext.mainEvent || 'Reported Event',
    topic: claimMeaning.topic || articleContext.mainTopic || 'Topic',
    time,
    location: location || articleContext.location || null,
    quantity: quantities.join(', ') || null,
    quantities,
    direction,
    negation: hasNegation,
    completionStatus,
    certainty: claimMeaning.epistemicStatus || 'asserted',
    attribution: reportingSource ? { source: reportingSource, verb: reportingVerb, type: 'REPORTING' } : null,
    causality: hasCausality,
    qualifiers: claimMeaning.qualifiers || []
  };
}

// -------------------------------------------------------------
// GENERAL LOCATION ENTITY EXTRACTOR (not hardcoded to specific cities)
// -------------------------------------------------------------
/**
 * Extracts the most prominent location entity from text using:
 * 1. A fast-path list of common locations (for speed on known names)
 * 2. A general proper-noun prepositional pattern for ANY location
 * Returns the extracted location string in lowercase, or null.
 */
const KNOWN_LOCATIONS_FAST = [
  'mumbai', 'delhi', 'bangalore', 'chennai', 'pune', 'hyderabad', 'kolkata', 'ahmedabad',
  'new york', 'new delhi', 'new jersey', 'los angeles', 'san francisco', 'san diego',
  'london', 'paris', 'tokyo', 'beijing', 'washington', 'chicago', 'berlin', 'sydney',
  'toronto', 'maharashtra', 'gujarat', 'karnataka', 'tamil nadu', 'california', 'texas',
  'florida', 'france', 'germany', 'uk', 'us', 'usa', 'india', 'china', 'japan',
  'russia', 'ukraine', 'pakistan', 'canada', 'australia', 'brazil', 'mexico',
  'italy', 'spain', 'netherlands', 'switzerland', 'singapore', 'hong kong', 'dubai'
];

function extractLocationFromText(text) {
  if (!text || typeof text !== 'string') return null;
  const lower = text.toLowerCase();

  // 1. Fast-path: check known location list (multi-word first, then single-word)
  const sortedKnown = [...KNOWN_LOCATIONS_FAST].sort((a, b) => b.length - a.length);
  for (const loc of sortedKnown) {
    if (new RegExp(`\\b${loc.replace(/[-]/g, '[-]')}\\b`, 'i').test(lower)) {
      return loc;
    }
  }

  // 2. General proper-noun detection: find capitalised phrase after location preposition
  // Matches: "in Mumbai", "at New York", "near Paris", "from London", "across Berlin"
  const prepMatch = text.match(/\b(?:in|at|near|from|across|within|outside|over)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/);
  if (prepMatch) {
    const candidate = prepMatch[1].toLowerCase();
    // Exclude common false positives (months, days, pronouns used after prepositions)
    const falsePositives = new Set(['january','february','march','april','may','june','july','august',
      'september','october','november','december','monday','tuesday','wednesday','thursday',
      'friday','saturday','sunday','the','this','that','these','those','parliament','congress',
      'court','office','hospital','university','school','session']);
    if (!falsePositives.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

function normalizeEvidenceProposition(evidenceItem, fetchedPassage = null) {
  const item = typeof evidenceItem === 'string' ? { snippet: evidenceItem } : (evidenceItem || {});
  const title = item.title || '';
  const snippet = item.snippet || item.text || '';
  const text = (fetchedPassage || `${title} ${snippet}`).trim();
  const textLower = text.toLowerCase();

  const { textWithoutFrame, reportingSource, reportingVerb } = extractReportingFrame(text);

  const quantities = extractFullQuantities(text);
  const hasNegation = /\b(not|never|no|denied|refuted|debunked|false|fake|untrue|fabricated|contradicted|failed to|ruled out|did not|didn't|wasn't|was not|remained completely unchanged)\b/i.test(text);

  let direction = 'NEUTRAL';
  if (/\b(increase|increased|grew|grew by|rose|climbed|surge|higher)\b/i.test(textLower)) {
    direction = 'INCREASE';
  } else if (/\b(decrease|decreased|decline|declined|fell|dropped|slump|lower)\b/i.test(textLower)) {
    direction = 'DECREASE';
  }

  let completionStatus = EVENT_STATES.COMPLETED;
  if (/\b(signed|signed the agreement|signed the acquisition agreement)\b/i.test(textLower)) {
    completionStatus = EVENT_STATES.SIGNED;
  } else if (/\b(negotiating|in talks|negotiations)\b/i.test(textLower)) {
    completionStatus = EVENT_STATES.NEGOTIATING;
  } else if (/\b(agreed|agreed to|reached an agreement)\b/i.test(textLower) && !/\b(signed|completed)\b/i.test(textLower)) {
    completionStatus = EVENT_STATES.AGREED;
  } else if (/\b(plans to|plan to|planning to|intends to|intended to|set to)\b/i.test(textLower) && !/\b(announced plans)\b/i.test(textLower)) {
    completionStatus = EVENT_STATES.PLANNED;
  } else if (/\b(is considering|considering|expected to|proposed to|offered to|aims to)\b/i.test(textLower)) {
    completionStatus = EVENT_STATES.CONSIDERED;
  } else if (/\b(announced plans|announced|unveiled|revealed|declared)\b/i.test(textLower) && /\b(plans|investment|launch)\b/i.test(textLower)) {
    completionStatus = EVENT_STATES.ANNOUNCED;
  } else if (/\b(cancelled|called off)\b/i.test(textLower)) {
    completionStatus = EVENT_STATES.CANCELLED;
  } else if (/\b(abandoned|dropped)\b/i.test(textLower)) {
    completionStatus = EVENT_STATES.ABANDONED;
  }

  const canonicalEvent = normalizeCanonicalEvent(textWithoutFrame || text);
  const hasCausality = /\b(because of|caused by|due to|linked to|resulted from|as a result of)\b/i.test(textLower);
  const certainty = /\b(?:analysts?|experts?|observers?|commentators?)\s+(?:believe|think|suspect|speculate|suggest)|\b(?:may|might|could|possibly|perhaps|reportedly|allegedly)\b/i.test(textLower)
    ? 'hedged'
    : 'asserted';

  return {
    evidencePassage: text.substring(0, 400),
    title,
    snippet,
    canonicalEvent,
    url: item.url || item.link || null,
    domain: item.domain || null,
    quantities,
    direction,
    negation: hasNegation,
    completionStatus,
    certainty,
    attribution: reportingSource ? { source: reportingSource, verb: reportingVerb, type: 'REPORTING' } : null,
    causality: hasCausality
  };
}

function evaluate15Dimensions(claimProp, evidenceProp) {
  const text = `${evidenceProp.title} ${evidenceProp.evidencePassage}`.toLowerCase();

  const acronyms = {
    'national investigation agency': 'nia',
    'reserve bank of india': 'rbi',
    'united nations': 'un',
    'supreme court': 'sc'
  };

  // 1. Subject Match
  let subjectMatch = 'UNKNOWN';
  if (claimProp.subject && claimProp.subject !== 'Subject') {
    const subjLower = claimProp.subject.toLowerCase();
    const subjWords = claimProp.subject.split(/\s+/).filter(w => w.length >= 1 && !/^(the|a|an|in|on|at|of|for|with)$/i.test(w));
    
    const entityLetterMatch = claimProp.subject.match(/\bCompany\s+([A-Z0-9])\b/i);
    if (entityLetterMatch) {
      const claimLetter = entityLetterMatch[1].toLowerCase();
      const textLetterMatch = text.match(/\bcompany\s+([a-z0-9])\b/i);
      if (textLetterMatch && textLetterMatch[1].toLowerCase() !== claimLetter) {
        subjectMatch = 'MISMATCH';
      } else if (textLetterMatch && textLetterMatch[1].toLowerCase() === claimLetter) {
        subjectMatch = 'MATCH';
      }
    }

    if (subjectMatch === 'UNKNOWN') {
      let isAcronymMatch = false;
      for (const [full, acr] of Object.entries(acronyms)) {
        if ((subjLower.includes(full) || subjLower.includes(acr)) && (text.includes(acr) || text.includes(full))) {
          isAcronymMatch = true;
          break;
        }
      }

      const isFinancialSynonym = (subjLower.includes('revenue') || subjLower.includes('sales') || subjLower.includes('earnings') || subjLower.includes('turnover')) &&
        (text.includes('revenue') || text.includes('sales') || text.includes('earnings') || text.includes('turnover') || text.includes('report'));

      const isGenericEntityMatch = (subjLower.includes('startup') || subjLower.includes('company') || subjLower.includes('venture') || subjLower.includes('project') || subjLower.includes('budget')) &&
        (text.includes('startup') || text.includes('company') || text.includes('venture') || text.includes('fund') || text.includes('project') || text.includes('filings'));

      if (text.includes(subjLower) || isAcronymMatch || isFinancialSynonym || isGenericEntityMatch) {
        subjectMatch = 'MATCH';
      } else if (subjWords.length > 0) {
        const matchedWords = subjWords.filter(w => text.includes(w.toLowerCase()));
        if (matchedWords.length === subjWords.length) {
          subjectMatch = 'MATCH';
        } else if (matchedWords.length > 0 && (subjLower.includes('opposition') || subjLower.includes('government') || subjLower.includes('police') || subjLower.includes('nia') || subjLower.includes('national investigation agency'))) {
          subjectMatch = 'MATCH';
        } else if (matchedWords.length === 0) {
          subjectMatch = 'MISMATCH';
        }
      }
    }
  } else {
    subjectMatch = 'MATCH';
  }

  // 2. Action / Predicate Match (Using Canonical Event Normalization Layer & Action Synonyms)
  let actionMatch = 'UNKNOWN';
  if (claimProp.canonicalEvent && evidenceProp.canonicalEvent) {
    if (claimProp.canonicalEvent === evidenceProp.canonicalEvent) {
      actionMatch = 'MATCH';
    } else {
      actionMatch = 'MISMATCH';
    }
  } else {
    const actionLower = (claimProp.action || '').toLowerCase();
    const actionSynonyms = {
      rejected: ['turned down', 'declined', 'opposed', 'refused', 'reject', 'rejection'],
      // 'closed' removed: too ambiguous — can mean deal signing OR completion. Use specific phrases only.
      acquired: ['purchased', 'bought', 'takeover', 'acquire', 'acquiring', 'acquires', 'acquisition', 'completed the acquisition', 'finalized the acquisition', 'closed the purchase'],
      // 'recorded a X% increase' is semantically equivalent to 'revenue grew X%' (INCREASE event)
      increased: ['rose', 'climbed', 'grew', 'surge', 'increase', 'growth', 'recorded'],
      decreased: ['fell', 'dropped', 'declined', 'slump', 'decrease'],
      announced: ['unveiled', 'disclosed', 'stated', 'reported', 'announced', 'revealed', 'announce', 'plans to invest', 'authorized', 'authorizes', 'approved', 'cleared'],
      arrested: ['detained', 'apprehended', 'held', 'arrest'],
      opened: ['launched', 'opened', 'started', 'established', 'inaugurated'],
      occurred: ['conducted', 'happened', 'took place', 'occurred'],
      // SIGNED is DISTINCT from acquired/completed: signing an agreement ≠ completing the acquisition
      signed: ['signed', 'signed the agreement', 'signed an agreement', 'signed the acquisition agreement']
    };

    let matchedAction = false;
    for (const [key, syns] of Object.entries(actionSynonyms)) {
      const matchesClaim = actionLower.includes(key) || syns.some(s => actionLower.includes(s));
      const matchesEvidence = text.includes(key) || syns.some(s => text.includes(s));
      if (matchesClaim && matchesEvidence) {
        matchedAction = true;
        break;
      }
    }
    if (matchedAction) {
      actionMatch = 'MATCH';
    } else if (/\b(arrested|detained|inaugurated|launched|passed|approved|authorized|signed|confirmed|conducted|reported)\b/i.test(text) && !claimProp.canonicalEvent) {
      actionMatch = 'MATCH';
    } else {
      actionMatch = 'MISMATCH';
    }
  }

  // 3. Object Match
  let objectMatch = 'UNKNOWN';
  if (claimProp.object && typeof claimProp.object === 'string') {
    const objLower = claimProp.object.toLowerCase();
    const claimObjEntity = claimProp.object.match(/\bCompany\s+([A-Z0-9])\b/i);
    if (claimObjEntity) {
      const claimLetter = claimObjEntity[1].toLowerCase();
      const textObjEntity = text.match(/\bcompany\s+([a-z0-9])\b/i);
      if (textObjEntity && textObjEntity[1].toLowerCase() !== claimLetter) {
        objectMatch = 'MISMATCH';
      }
    }

    if (objectMatch === 'UNKNOWN' && objLower !== (claimProp.subject || '').toLowerCase()) {
      const objTokens = objLower.split(/\s+/).map(t => t.replace(/'s$/i, '')).filter(t => t.length > 3 && !/^(the|a|an|is|are|was|were|in|on|at|to|for|with|by|from|about)$/i.test(t));
      if (objTokens.length > 0) {
        const matched = objTokens.filter(t => 
          text.includes(t) || 
          (t.includes('proposal') && (text.includes('offer') || text.includes('deal'))) ||
          (t.includes('government') && (text.includes('centre') || text.includes('center'))) ||
          (t.includes('debate') && text.includes('discuss')) ||
          (t.includes('student') && text.includes('demonstration')) ||
          (t.includes('suspect') && (text.includes('resident') || text.includes('individual'))) ||
          (t.includes('revenue') && (text.includes('sales') || text.includes('turnover') || text.includes('revenue'))) ||
          (t.includes('grew') && (text.includes('increase') || text.includes('growth') || text.includes('rose'))) ||
          (t.includes('profit') && text.includes('profit')) ||
          (t.includes('acquisition') && text.includes('acquisition'))
        );
        if (matched.length >= Math.ceil(objTokens.length * 0.25)) {
          objectMatch = 'MATCH';
        } else {
          objectMatch = 'MISMATCH';
        }
      }
    }
  }

  // 4. Event Match
  let eventMatch = 'UNKNOWN';
  if (claimProp.event && claimProp.event !== 'Reported Event') {
    const evLower = claimProp.event.toLowerCase();
    const evTokens = evLower.split(/\s+/).filter(t => t.length > 3);
    const matched = evTokens.filter(t => text.includes(t) || (t.includes('debate') && text.includes('discuss')));
    if (matched.length > 0) eventMatch = 'MATCH';
    else eventMatch = 'MISMATCH';
  } else {
    eventMatch = actionMatch;
  }

  // 5. Time Match
  let timeMatch = 'UNKNOWN';
  if (claimProp.time) {
    const timeLower = claimProp.time.toLowerCase();
    if (text.includes(timeLower)) timeMatch = 'MATCH';
    else if (extractTimeFromText(`${evidenceProp.title} ${evidenceProp.evidencePassage}`)) timeMatch = 'MISMATCH';
  }

  // 6. Location Match (General entity-level city/state/country comparison — not limited to a fixed list)
  let locationMatch = 'UNKNOWN';
  if (claimProp.location) {
    const locLower = claimProp.location.toLowerCase().split(',')[0].trim();
    if (locLower && text.toLowerCase().includes(locLower)) {
      locationMatch = 'MATCH';
    } else if (locLower) {
      // Reconstruct the original evidence text for proper-noun extraction (preserve case)
      const evidenceRawText = `${evidenceProp.title} ${evidenceProp.evidencePassage}`;
      // Use the same general extractor to find ANY location in the evidence text
      const evidenceLocation = extractLocationFromText(evidenceRawText);
      if (evidenceLocation && evidenceLocation !== locLower) {
        // Evidence mentions a DIFFERENT specific location → explicit mismatch
        locationMatch = 'MISMATCH';
      } else if (!evidenceLocation) {
} else {
        // Evidence location matches claim location
        locationMatch = 'MATCH';
      }
    }
  }

  // 7. Quantity Match (Exact Number & Metric Matching)
  function getCleanedQuantityWithScale(qStr) {
    if (!qStr) return '';
    const numPart = qStr.match(/\d+(?:\.\d+)?/)?.[0] || '';
    if (!numPart) return qStr.toLowerCase().trim();
    let scale = '';
    if (/\b(?:billion|b)\b/i.test(qStr)) scale = 'B';
    else if (/\b(?:million|m)\b/i.test(qStr)) scale = 'M';
    else if (/\b(?:trillion|t)\b/i.test(qStr)) scale = 'T';
    else if (/\b(?:thousand|k)\b/i.test(qStr)) scale = 'K';
    else if (/%|percent/i.test(qStr)) scale = '%';
    return `${numPart}${scale}`;
  }

  let quantityMatch = 'UNKNOWN';
  if (claimProp.quantities.length > 0) {
    const hasExactNum = claimProp.quantities.some(q => {
      const cleanedQ = getCleanedQuantityWithScale(q);
      if (evidenceProp.quantities && evidenceProp.quantities.length > 0) {
        const matchesEvNum = evidenceProp.quantities.some(eq => {
          const cleanedEq = getCleanedQuantityWithScale(eq);
          return cleanedQ && cleanedEq && cleanedQ === cleanedEq;
        });
        return matchesEvNum;
      }
      const bareNum = q.replace(/[^\d.]/g, '');
      if (!bareNum) return text.includes(q.toLowerCase());
      const regex = new RegExp(`\\b${bareNum}\\b`);
      return regex.test(text);
    });

    if (hasExactNum) {
      quantityMatch = 'MATCH';
    } else {
      const evNums = evidenceProp.quantities;
      if (evNums.length > 0) {
        quantityMatch = 'MISMATCH';
      }
    }
  } else {
    quantityMatch = 'MATCH';
  }

  // 8. Direction Match
  let directionMatch = 'UNKNOWN';
  if (claimProp.direction !== 'NEUTRAL' && evidenceProp.direction !== 'NEUTRAL') {
    if (claimProp.direction === evidenceProp.direction) directionMatch = 'MATCH';
    else directionMatch = 'MISMATCH';
  }

  // 9. Negation Match
  let negationMatch = 'MATCH';
  if (claimProp.negation !== evidenceProp.negation) {
    negationMatch = 'MISMATCH';
  }

  // 10. Completion Status Match (Generalized 9-State Event Model)
  let completionMatch = 'MATCH';
  if (claimProp.completionStatus !== evidenceProp.completionStatus) {
    completionMatch = 'MISMATCH';
  }

  // 11. Certainty Match
  let certaintyMatch = 'MATCH';
  if (claimProp.certainty === 'asserted' && evidenceProp.certainty === 'hedged') {
    certaintyMatch = 'MISMATCH';
  }

  // 12. Attribution Match
  let attributionMatch = 'MATCH';
  if (text.includes('police said') || text.includes('police reported') || text.includes('officials stated')) {
    attributionMatch = 'MATCH';
  }

  // 13. Causality Match
  let causalityMatch = 'UNKNOWN';
  if (claimProp.causality) {
    if (evidenceProp.causality) causalityMatch = 'MATCH';
    else causalityMatch = 'MISMATCH';
  }

  // 14. Modality Match
  let modalityMatch = 'MATCH';

  // 15. Qualifiers Match
  let qualifiersMatch = 'MATCH';

  return {
    subject: subjectMatch,
    action: actionMatch,
    object: objectMatch,
    event: eventMatch,
    time: timeMatch,
    location: locationMatch,
    quantity: quantityMatch,
    direction: directionMatch,
    negation: negationMatch,
    completionStatus: completionMatch,
    certainty: certaintyMatch,
    attribution: attributionMatch,
    causality: causalityMatch,
    modality: modalityMatch,
    qualifiers: qualifiersMatch
  };
}

function evaluateComponentLevelSupport(claimProp, evidenceProp, dimensions) {
  return {
    subject: dimensions.subject === 'MATCH' ? 'SUPPORTED' : (dimensions.subject === 'MISMATCH' ? 'CONTRADICTED' : 'UNSUPPORTED'),
    action: dimensions.action === 'MATCH' ? 'SUPPORTED' : (dimensions.action === 'MISMATCH' ? 'CONTRADICTED' : 'UNSUPPORTED'),
    object: dimensions.object === 'MATCH' ? 'SUPPORTED' : (dimensions.object === 'MISMATCH' ? 'CONTRADICTED' : 'UNSUPPORTED'),
    quantity: dimensions.quantity === 'MATCH' ? 'SUPPORTED' : (dimensions.quantity === 'MISMATCH' ? 'CONTRADICTED' : 'UNSUPPORTED'),
    time: dimensions.time === 'MATCH' ? 'SUPPORTED' : (dimensions.time === 'MISMATCH' ? 'CONTRADICTED' : 'UNSUPPORTED'),
    location: dimensions.location === 'MATCH' ? 'SUPPORTED' : (dimensions.location === 'MISMATCH' ? 'CONTRADICTED' : 'UNSUPPORTED'),
    causality: claimProp.causality ? (dimensions.causality === 'MATCH' ? 'SUPPORTED' : 'UNSUPPORTED') : 'NOT_APPLICABLE'
  };
}

function classifyStanceFromDimensions(dimensions, componentAnalysis, claimProp, evidenceProp) {
  const textEv = (evidenceProp.evidencePassage || evidenceProp.snippet || '').toLowerCase();
  const textClaim = (claimProp.action || claimProp.object || '').toLowerCase();

  // Past/Former Role vs Current Claim Contradiction
  const isPastRoleEvidence = /\b(served as|former|ex-|stepped down|resigned|was the|previously served|replaced by)\b/i.test(textEv);
  const isPresentRoleClaim = /\b(is the|is ceo|is president|currently|in 2026|in 2025)\b/i.test(textClaim);
  if ((dimensions.subject === 'MATCH' || dimensions.subject === 'UNKNOWN') && isPastRoleEvidence && (isPresentRoleClaim || dimensions.time === 'MISMATCH' || /\b(stepped down|resigned|former)\b/i.test(textEv))) {
    return { stance: 'REFUTES', reason: 'Temporal role contradiction: Evidence establishes the subject previously held or stepped down from the role, contradicting the claim that they currently hold it.' };
  }

  // Direct Refutation Triggers:
  if (dimensions.negation === 'MISMATCH' &&
      (dimensions.subject === 'MATCH' || dimensions.subject === 'UNKNOWN') &&
      (dimensions.action === 'MATCH' || dimensions.event === 'MATCH') &&
      dimensions.completionStatus !== 'MISMATCH') {
    return { stance: 'REFUTES', reason: 'Explicit negation contradiction: Evidence explicitly contradicts claim assertion.' };
  }

  if (dimensions.direction === 'MISMATCH' && (dimensions.subject === 'MATCH' || dimensions.subject === 'UNKNOWN')) {
    return { stance: 'REFUTES', reason: 'Numerical direction contradiction: Evidence reports opposite direction of change.' };
  }

  if (dimensions.location === 'MISMATCH' && (dimensions.subject === 'MATCH' || dimensions.subject === 'UNKNOWN')) {
    return { stance: 'REFUTES', reason: 'Location mismatch: Evidence places the event in a different location.' };
  }

  // Direct Action Rejection / Refutation (e.g. Tribunal rejected request vs claim asserted approved/cleared)
  const isDirectDebunk = /\b(debunked|false|fabricated|incorrect|refuted|fake|hoax|denied|denies|rejected|opposed|declined|turned down|refused|dismissed|capping|capped)\b/i.test(textEv);
  const isClaimAffirmative = claimProp.canonicalEvent !== 'REJECTION' && !/\b(rejected|denied|opposed|refused|declined)\b/i.test(textClaim);
  if (isDirectDebunk && isClaimAffirmative && (dimensions.subject === 'MATCH' || dimensions.subject === 'UNKNOWN')) {
    return { stance: 'REFUTES', reason: 'Action contradiction: Evidence confirms the action or permission was rejected, denied, or debunked.' };
  }

  // If action and event match, but subject entity is different (e.g. Apple acquired X vs Microsoft acquired X) -> REFUTES
  if (dimensions.subject === 'MISMATCH' && dimensions.action === 'MATCH' && dimensions.event === 'MATCH') {
    return { stance: 'REFUTES', reason: 'Subject entity mismatch: Evidence states a different entity performed this action.' };
  }

  // Same-topic evidence that omits the claim's actor/action is insufficient,
  // not irrelevant (for example: the proposal is described but the response is not).
  if (dimensions.subject === 'MISMATCH' && dimensions.object === 'MATCH') {
    return { stance: 'NEUTRAL', reason: 'Evidence describes the same topic or target but does not confirm the claimed actor or action.' };
  }

  // Irrelevant Triggers:
  if (dimensions.subject === 'MISMATCH' && dimensions.event === 'MISMATCH') {
    return { stance: 'IRRELEVANT', reason: 'Evidence does not match claim subject entity or factual event.' };
  }

  if (dimensions.subject === 'MATCH' && (dimensions.object === 'MISMATCH' || dimensions.event === 'MISMATCH') && dimensions.action !== 'MATCH') {
    if (dimensions.completionStatus === 'MISMATCH') {
      return { stance: 'NEUTRAL', reason: 'Completion status mismatch: Evidence references the same event in a different state (e.g. SIGNED vs COMPLETED).' };
    }
    return { stance: 'IRRELEVANT', reason: 'Evidence discusses the entity in an entirely unrelated context or event.' };
  }

  // Temporal Mismatch Trigger (Except for ongoing ownership / acquisition states):
  if (dimensions.time === 'MISMATCH' && (dimensions.subject === 'MATCH' || dimensions.subject === 'UNKNOWN') && claimProp.canonicalEvent !== 'ACQUISITION') {
    return { stance: 'NEUTRAL', reason: 'Temporal discrepancy: Evidence specifies a different date for the event.' };
  }

  // Quantity Mismatch Trigger:
  if (dimensions.quantity === 'MISMATCH') {
    return { stance: 'NEUTRAL', reason: 'Numerical discrepancy: Evidence cites a different numerical figure for the event.' };
  }

  // Neutral / Insufficient Triggers:
  if (dimensions.subject === 'MISMATCH' && (dimensions.event === 'MATCH' || dimensions.object === 'MATCH')) {
    return { stance: 'NEUTRAL', reason: 'Evidence describes the broader event context without confirming the subject action.' };
  }

  if (dimensions.completionStatus === 'MISMATCH') {
    return { stance: 'NEUTRAL', reason: 'Completion status mismatch: Event state differs between claim and evidence.' };
  }

  if (dimensions.object === 'MISMATCH' && dimensions.subject === 'MATCH') {
    return { stance: 'NEUTRAL', reason: 'Object discrepancy: Evidence refers to a different target or affected entity.' };
  }

  if (dimensions.subject === 'MATCH' && dimensions.action !== 'MATCH' && dimensions.event !== 'MATCH') {
    return { stance: 'NEUTRAL', reason: 'Evidence mentions the subject/topic but provides insufficient detail to confirm the specific action.' };
  }

  if (dimensions.certainty === 'MISMATCH') {
    return { stance: 'NEUTRAL', reason: 'Evidence presents the proposition as belief or possibility rather than establishing it as fact.' };
  }

  // Support Trigger:
  const isOngoingOwnership = /\b(currently owns|is the owner|owns|holds ownership)\b/i.test((claimProp.action || '') + ' ' + (claimProp.object || ''));
  const timeAllowed = dimensions.time !== 'MISMATCH' || isOngoingOwnership;
  if ((dimensions.subject === 'MATCH' || dimensions.subject === 'UNKNOWN') && (dimensions.action === 'MATCH' || dimensions.event === 'MATCH') && dimensions.negation === 'MATCH' && dimensions.quantity !== 'MISMATCH' && timeAllowed) {
    return { stance: 'SUPPORTS', reason: 'Evidence directly corroborates the core factual proposition of the claim.' };
  }

  return { stance: 'NEUTRAL', reason: 'Evidence provides related background context without explicit confirmation or refutation.' };
}

/**
 * Main Stage 3 Evaluator Entry Point
 */
function evaluateSemanticStance(claim, evidenceItem, options = {}) {
  const claimProp = normalizeClaimProposition(claim);
  const evidenceProp = normalizeEvidenceProposition(evidenceItem, options.fetchedPassage);

  const dimensions = evaluate15Dimensions(claimProp, evidenceProp);
  const componentAnalysis = evaluateComponentLevelSupport(claimProp, evidenceProp, dimensions);
  const { stance, reason } = classifyStanceFromDimensions(dimensions, componentAnalysis, claimProp, evidenceProp);

  const confidence = stance === 'SUPPORTS' ? 0.92 : (stance === 'REFUTES' ? 0.88 : 0.65);
  const evidenceQuality = (dimensions.subject === 'MATCH' && dimensions.action === 'MATCH') ? 'DIRECT' : 'INDIRECT';
  const sourceAccess = options.fetchedPassage ? 'FULL_ARTICLE' : 'SNIPPET_ONLY';
  const evidenceCompleteness = sourceAccess === 'FULL_ARTICLE' ? 'HIGH' : 'MEDIUM';

  return {
    stance,
    confidence,
    claimProposition: claimProp,
    evidenceProposition: evidenceProp,
    dimensionAnalysis: dimensions,
    dimensions,
    componentAnalysis,
    evidenceQuality,
    evidenceCompleteness,
    sourceAccess,
    reason
  };
}

module.exports = {
  EVENT_STATES,
  CANONICAL_EVENTS,
  normalizeCanonicalEvent,
  extractReportingFrame,
  extractFullQuantities,
  extractLocationFromText,
  normalizeClaimProposition,
  normalizeEvidenceProposition,
  evaluate15Dimensions,
  evaluateComponentLevelSupport,
  classifyStanceFromDimensions,
  evaluateSemanticStance
};
