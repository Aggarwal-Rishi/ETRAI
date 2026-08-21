const path = require('path');
const fs = require('fs');

// Ensure .env is loaded in any runtime context
if (!process.env.GEMINI_API_KEY) {
  const envPath = path.resolve(__dirname, '../../.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (m) {
        process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
      }
    }
  }
}

const { GoogleGenAI } = require('@google/genai');
const { analyzeSentiment } = require('./sentimentService');
const { getProviderStatus, isKeyValid } = require('./providerManager');

const MAX_CLAIMS = 25;

/**
 * Infer claim scope heuristically with strict regional/international/national pattern indicators
 */
function inferClaimScope(text) {
  const t = (text || '').toLowerCase();
  
  // Regional / Local scope indicators (generic local event/location keywords)
  if (/\b(district|village|local police|border|town|county|panchayat|municipal|assembly march|student protest|lathicharge|farm|worker|abduction|kidnapped)\b/i.test(t)) {
    return 'Regional';
  }

  // International scope indicators (generic global institutions/heads of state)
  if (/\b(prime minister|president|chancellor|declared war|military campaign|invaded|military operation|un|united nations|world health organization|who|buyout|trillion)\b/i.test(t)) {
    return 'International';
  }
  
  // National scope indicators (generic national governance/legal bodies)
  if (/\b(supreme court|parliament|federal|congress|national policy|tax|central bank|ministry|state department)\b/i.test(t)) {
    return 'National';
  }

  return 'Regional';
}

/**
 * Checks if claim text contains recency / breaking news indicators
 */
function checkRecency(text) {
  const t = (text || '').toLowerCase();
  return /\b(today|yesterday|saturday|sunday|monday|tuesday|wednesday|thursday|friday|breaking|latest news|just reported|recent|hours ago|this morning|this evening)\b/i.test(t);
}

function cleanClaimText(rawText) {
  if (!rawText) return '';
  let text = rawText;

  // 1. Convert literal string escape sequences (e.g. "\n", "\t", "\r") to real whitespace
  text = text
    .replace(/\\n/g, ' ')
    .replace(/\\t/g, ' ')
    .replace(/\\r/g, ' ')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'");

  // 2. Decode HTML Entities comprehensively
  text = text
    .replace(/&#0*39;/gi, "'")
    .replace(/&#x0*27;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#0*34;/gi, '"')
    .replace(/&#x0*22;/gi, '"')
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#0*160;/gi, ' ')
    .replace(/&#(\d+);/g, (m, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (m, hex) => String.fromCharCode(parseInt(hex, 16)));

  // 3. Strip HTML Tags comprehensively
  text = text.replace(/<[^>]+>/g, ' ');

  // 4. Strip MediaWiki / Structural Wikilinks & Template markup
  text = text.replace(/\[\[(?:Category|File|Image|Special):[^\]]+\]\]/gi, '');
  text = text.replace(/\[\[([^\]\|]+)\|([^\]]+)\]\]/g, '$2');
  text = text.replace(/\[\[([^\]]+)\]\]/g, '$1');
  text = text.replace(/\{\{[^\}]+\}\}/g, '');

  // 5. Strip Citation & Footnote Markers: [1], [2], [citation needed], [note 1], [edit]
  text = text.replace(/\[(?:\d+|citation needed|note\s*\d+|edit|src)\]/gi, '');

  // Fix missing space after punctuation before capital letters
  text = text.replace(/(?<=[.?!])(?=[A-Z])/g, ' ');

  // 6. Strip Screengrab, author headers, datelines, timestamps, and editor credits
  text = text
    .replace(/\(screengrab\)/gi, '')
    .replace(/UPDATED:\s*.*?\b(IST|UTC|EST|PST|GMT)\b/gi, '')
    .replace(/Edited By:\s*[A-Za-z\s]+/gi, '')
    .replace(/News Desk/gi, '')
    .replace(/^([A-Z\s]{3,25},\s*[A-Z\s]{3,25}\s*[\u2013\u2014:\-]\s*)/g, '')
    .replace(/^(\s*advertisement|\s*\<\>|\s*read full story|\s*click here|\s*subscribe|\s*sponsored)+/gi, '')
    .replace(/(\s*advertisement|\s*\<\>|\s*read full story|\s*click here|\s*subscribe)+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 7. Strip standalone leading section prefixes
  text = text.replace(/^(IN|INDIA|WORLD|CRIME|BUSINESS|POLITICS|TECH|ENTERTAINMENT|SPORTS|BREAKING|LIVE|WATCH|VIDEO|PHOTOS?|NEWS|UPDATE|STORIES)\s+(?=[A-Z])/i, '');

  // 8. Clean leading/trailing dangling punctuation or mismatched parens (e.g. ") University...", "Tech.]]")
  text = text.replace(/^[\s,:\-\u2013\u2014\)\}\]\.,;:?!]+/, '');
  text = text.replace(/[\(\{\[\s]+$/, '');

  // 9. Ensure first character is capitalized
  if (text.length > 0) {
    text = text.charAt(0).toUpperCase() + text.slice(1);
  }

  return text;
}

/**
 * Strict General Coherence & Quality Validation Gate
 */
function isCoherentClaimStatement(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim();

  // 1. Must have at least 5 words and less than 120 words
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 5 || words.length > 120) return false;

  // 2. Reject uncleaned structural markup debris (brackets, HTML tags, template symbols, literal escape sequences)
  if (/\[\[|\]\]|\{\{|\}\}|<[^>]+>|\\n|\\t|\\r|\[\d+\]/.test(t)) return false;

  // 3. Reject leading/trailing dangling punctuation or mismatched boundary parens
  if (/^[\)\}\]\.,;:?!]/.test(t)) return false;
  if (/[\(\{\[]$/.test(t)) return false;

  // 4. Reject key-value infobox concats or metadata dumps (e.g. "Occupations ... Spouse ... Born ...")
  const infoboxFieldHits = t.match(/\b(Occupations|Spouse|Alma mater|Born|Died|Nationality|Residence|Signature|Website|Office|Alma Mater)\b/gi) || [];
  if (infoboxFieldHits.length >= 2) return false;

  // 5. Must contain at least one verb / assertion structure
  if (!/\b([a-z]+ed|is|are|was|were|has|have|had|says|said|announces|announced|reports|reported|states|stated|claims|claimed|grew|fell|led|held|won|lost|built|became|rejected|declined|turned down|bought|sold|launched)\b/i.test(t)) {
    return false;
  }

  return true;
}

function inferClaimCategory(text) {
  const t = (text || '').toLowerCase();
  if (/\b(\$|€|£|₹|\d+%\s*|\d+\s*percent|billion|million|trillion|crore|lakh|\d+\s*k|\b\d{2,}\b)\b/i.test(t)) {
    if (/\b(\$|€|£|₹|revenue|profit|earning|market cap|quarterly|fiscal|economy|inflation|gdp|bankrupt)\b/i.test(t)) {
      return 'Financial Claim';
    }
    return 'Statistical Metric';
  }
  if (/\b(arrest|abducted|abduction|police|court|legal|judge|lawsuit|protest|banned|unconstitutional|video|father|alleging|murder|crime)\b/i.test(t)) {
    return 'Event Assertion';
  }
  if (/\b(prime minister|president|parliament|election|assembly|minister|policy|government)\b/i.test(t)) {
    return 'Political Claim';
  }
  if (/\b(study|discovered|nasa|scientific|research|vaccine|disease|virus|health)\b/i.test(t)) {
    return 'Scientific Claim';
  }
  return 'Factual Statement';
}

/**
 * PART B: Evaluates Vague vs Named Sourcing Density across full text
 */
function computeSourcingTransparency(rawText) {
  const text = rawText || '';
  
  const namedRegex = /\b(said|according to|stated by|announced by|reported by|spoke to|told reporters|briefed media)\s+([A-Z][a-z]+|\b(Dr\.|Mr\.|Ms\.|Prof\.|Governor|Director|Minister|Spokesperson|Chief|President|Officer|Secretary|Ministry|Department|Bank|Government|Police|Organization|Institute|Court|Commission|Agency)\b)/gi;
  const vagueRegex = /\b(sources say|sources claimed|sources told|experts believe|insiders claim|many believe|it is understood that|reportedly|allegedly|unnamed sources|sources close to|according to reports|rumors suggest|people familiar with the matter|sources who wished to remain anonymous|anonymous sources)\b/gi;

  const namedMatches = text.match(namedRegex) || [];
  const vagueMatches = text.match(vagueRegex) || [];

  const namedAttributionCount = namedMatches.length;
  const vagueAttributionCount = vagueMatches.length;
  const total = namedAttributionCount + vagueAttributionCount;
  const vagueSourcingRatio = total > 0 ? Number((vagueAttributionCount / total).toFixed(2)) : 0.0;

  return {
    namedAttributionCount,
    vagueAttributionCount,
    vagueSourcingRatio
  };
}

/**
 * PART A: Detects internal contradictions between extracted claims or article passages
 */
function computeInternalConsistency(rawText, claims) {
  const issues = [];
  const claimList = Array.isArray(claims) ? claims : [];
  
  for (let i = 0; i < claimList.length; i++) {
    for (let j = i + 1; j < claimList.length; j++) {
      const c1 = claimList[i];
      const c2 = claimList[j];
      const t1 = (c1.text || c1.resolvedText || '').toLowerCase();
      const t2 = (c2.text || c2.resolvedText || '').toLowerCase();

      const numMatch1 = t1.match(/\b(\d+)\s*(people|killed|dead|injured|fatalities|casualties|workers|students|protesters|bigha|percent|%)\b/i);
      const numMatch2 = t2.match(/\b(\d+)\s*(people|killed|dead|injured|fatalities|casualties|workers|students|protesters|bigha|percent|%)\b/i);

      if (numMatch1 && numMatch2 && numMatch1[2].toLowerCase() === numMatch2[2].toLowerCase()) {
        const val1 = parseInt(numMatch1[1], 10);
        const val2 = parseInt(numMatch2[1], 10);
        if (val1 !== val2) {
          issues.push({
            claimIds: [c1.id || `claim_${i + 1}`, c2.id || `claim_${j + 1}`],
            description: `Internal Contradiction: ${c1.id || 'Claim ' + (i+1)} states ${val1} ${numMatch1[2]}, while ${c2.id || 'Claim ' + (j+1)} states ${val2} ${numMatch2[2]} — these conflicting figures for the same event cannot both be correct.`
          });
        }
      }

      const dateMatch1 = t1.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})\b/i);
      const dateMatch2 = t2.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})\b/i);
      if (dateMatch1 && dateMatch2 && dateMatch1[1].toLowerCase() === dateMatch2[1].toLowerCase()) {
        const d1 = parseInt(dateMatch1[2], 10);
        const d2 = parseInt(dateMatch2[2], 10);
        if (d1 !== d2) {
          issues.push({
            claimIds: [c1.id || `claim_${i + 1}`, c2.id || `claim_${j + 1}`],
            description: `Inconsistent Timeline: ${c1.id || 'Claim ' + (i+1)} states the event occurred on ${dateMatch1[0]}, while ${c2.id || 'Claim ' + (j+1)} states it occurred on ${dateMatch2[0]}.`
          });
        }
      }
    }
  }

  return issues;
}

/**
 * Structural Source Extractor: Splits text into paragraphs & sentence positions for Lineage Tracing
 */
function extractParagraphsAndSentences(text) {
  const rawParagraphs = (text || '')
    .split(/\n\s*\n|\r\n\s*\r\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  const paragraphs = rawParagraphs.length > 0 ? rawParagraphs : [text || ''];
  const sentenceStructure = [];

  paragraphs.forEach((p, pIndex) => {
    const rawSentences = p.split(/(?<=[.?!])\s+/).map(s => s.trim()).filter(Boolean);
    const sentences = rawSentences.length > 0 ? rawSentences : [p];

    sentences.forEach((s, sIndex) => {
      sentenceStructure.push({
        text: s,
        paragraph: p,
        paragraphIndex: pIndex,
        previousSentence: sIndex > 0 ? sentences[sIndex - 1] : (pIndex > 0 ? paragraphs[pIndex - 1].split(/(?<=[.?!])\s+/).pop() : null),
        nextSentence: sIndex < sentences.length - 1 ? sentences[sIndex + 1] : (pIndex < paragraphs.length - 1 ? paragraphs[pIndex + 1].split(/(?<=[.?!])\s+/).shift() : null),
        sourcePosition: sentenceStructure.length + 1
      });
    });
  });

  return { paragraphs, sentenceStructure };
}

/**
 * Heuristic claim extraction fallback when OpenAI API key is unconfigured or in mock mode
 */
function extractMockClaims(text) {
  const { paragraphs, sentenceStructure } = extractParagraphsAndSentences(text);
  const normalizedText = (text || '').replace(/(?<=[.?!])(?=[A-Z])/g, ' ');
  const rawSentences = sentenceStructure.map(s => s.text).filter(s => s.length >= 15 && s.length <= 400);

  // Rule 9 Filter: Strictly exclude attributed subjective beliefs/suspicions/theories about motive or connection
  const cleanSentences = rawSentences.filter(s => {
    if (/\b(police stated|police reported|officials stated|officials reported|officers have detained|police registered)\b/i.test(s)) {
      return true;
    }
    if (/\b(police suspect|officials suspect|analysts believe|sources speculate|locals believe|locals suspect|family believes|theory is that|thought to be connected|politically motivated|motivated by|suspect the incident|suspect that|believes that|suspects that)\b/i.test(s)) {
      return false;
    }
    return true;
  });

  const leadSnippet = cleanSentences.slice(0, 3).join(' ');
  const fullText = cleanSentences.join(' ');
  const firstSentence = cleanSentences[0] || '';

  // 1. Dynamic Subject & Location Extraction
  let mainSubject = '';
  const orgMatch = leadSnippet.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\s+(?:Corp|Corporation|Inc|Limited|Ltd|Group|Ministry|Department|Agency|Organization|University|Institute|Bank|Court))\b/);
  if (orgMatch) {
    mainSubject = orgMatch[1];
  } else {
    const personMatch = leadSnippet.match(/\b(Mr\.|Ms\.|Dr\.|Prof\.|President|Prime Minister|Minister|Governor|Chief)?\s*([A-Z][a-z]+\s+[A-Z][a-z]+)\b/);
    if (personMatch) {
      mainSubject = personMatch[0];
    } else {
      const subjMatch = firstSentence.match(/^(A|An|The)\s+([A-Z][a-z\s]{3,30}?)\s+(was|is|has|announced|were|had|reported)/i);
      if (subjMatch) {
        mainSubject = subjMatch[0].replace(/\s+(was|is|has|announced|were|had|reported)$/i, '');
      }
    }
  }
  if (!mainSubject && firstSentence) {
    mainSubject = firstSentence.split(' ').slice(0, 4).join(' ');
  }

  let mainLocation = '';
  const prepLocMatch = fullText.match(/\b(?:in|at|near|from)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/);
  if (prepLocMatch) {
    mainLocation = prepLocMatch[1];
  }

  const articleScope = inferClaimScope(leadSnippet);

  // Layer 1 Article Context Object
  const articleContextObj = {
    headline: firstSentence.substring(0, 100) || mainSubject,
    summary: leadSnippet.substring(0, 250) || fullText.substring(0, 250),
    mainTopic: mainSubject || firstSentence.substring(0, 80),
    mainEvent: 'Reported Factual Event',
    entities: [mainSubject].filter(Boolean),
    organizations: orgMatch ? [orgMatch[1]] : [],
    locations: mainLocation ? [mainLocation] : [],
    dates: checkRecency(fullText) ? ['Recent'] : [],
    importantNumbers: (fullText.match(/\b(\d+(?:\.\d+)?%?|\$\d+|\d+\s*million|\d+\s*billion)\b/gi) || []).slice(0, 5),
    relatedEvents: []
  };

  const candidateItems = [];

  cleanSentences.forEach((s, idx) => {
    let resolved = s;
    let coreferenceResolved = false;

    // Multi-proposition sentence check: split if sentence contains independent clauses joined by "and announced/and reported"
    const splitMatch = s.match(/^(.+?\b(?:reported|announced|stated|produced|recorded)\b.+?)\s+and\s+((?:announced|plans|appointed|reported|launched)\b.+)$/i);
    const subSentences = splitMatch ? [splitMatch[1].trim(), splitMatch[2].trim()] : [s];

    subSentences.forEach(sub => {
      let rSub = sub;
      // Coreference resolution
      if (/^\b(The company's|The firm's|The corporation's)\b/i.test(rSub)) {
        if (mainSubject) { rSub = rSub.replace(/^\b(The company's|The firm's|The corporation's)\b/i, `${mainSubject}'s`); coreferenceResolved = true; }
      } else if (/^\b(The company|The firm|The corporation|The group)\b/i.test(rSub)) {
        if (mainSubject) { rSub = rSub.replace(/^\b(The company|The firm|The corporation|The group)\b/i, mainSubject); coreferenceResolved = true; }
      } else if (/^\b(The government|The administration|The ministry)\b/i.test(rSub)) {
        if (mainSubject) { rSub = rSub.replace(/^\b(The government|The administration|The ministry)\b/i, `${mainSubject}'s government`); coreferenceResolved = true; }
        else { rSub = rSub.replace(/^\b(The government|The administration|The ministry)\b/i, 'The government of India'); coreferenceResolved = true; }
      } else if (/^\b(His|Her|Their|Its)\b/i.test(rSub)) {
        if (mainSubject) { rSub = rSub.replace(/^\b(His|Her|Their|Its)\b/i, `${mainSubject}'s`); coreferenceResolved = true; }
      } else if (/^\b(He|She|They|The worker|The victim|The man|The woman)\b/i.test(rSub)) {
        if (mainSubject && mainLocation && !rSub.includes(mainLocation)) {
          rSub = rSub.replace(/^\b(He|She|They|The worker|The victim|The man|The woman)\b/i, `${mainSubject} in ${mainLocation}`);
          coreferenceResolved = true;
        } else if (mainSubject) {
          rSub = rSub.replace(/^\b(He|She|They|The worker|The victim|The man|The woman)\b/i, mainSubject);
          coreferenceResolved = true;
        }
      } else if (/^\b(The development|The incident|The situation|The event|This move)\b/i.test(rSub)) {
        if (mainSubject) { rSub = rSub.replace(/^\b(The development|The incident|The situation|The event|This move)\b/i, `Regarding ${mainSubject}, the development`); coreferenceResolved = true; }
      }

      const singleScope = inferClaimScope(rSub);
      if ((singleScope === 'Regional' || singleScope === 'Local') && mainLocation && !rSub.toLowerCase().includes(mainLocation.toLowerCase().split(',')[0])) {
        rSub = `${rSub.replace(/\.$/, '')} in ${mainLocation}.`;
      }

      const matchedStruct = sentenceStructure.find(st => st.text === s) || {
        paragraph: s,
        previousSentence: null,
        nextSentence: null,
        sourcePosition: idx + 1
      };

      candidateItems.push({
        originalText: s,
        resolvedText: cleanClaimText(rSub),
        sourceStruct: matchedStruct,
        coreferenceResolved
      });
    });
  });

  const validItems = candidateItems.filter(item => isCoherentClaimStatement(item.resolvedText));
  const selected = validItems.slice(0, MAX_CLAIMS);

  const claims = selected.map((item, index) => {
    const cleaned = item.resolvedText;
    const sentiment = analyzeSentiment(cleaned);
    let claimScope = inferClaimScope(cleaned);
    if (articleScope === 'International' || articleScope === 'National') {
      claimScope = articleScope;
    }
    const isRecentBreaking = checkRecency(cleaned);

    const keywordsOnly = cleaned
      .replace(/[^\w\s$%.-]/g, ' ')
      .replace(/\s+/g, ' ')
      .split(' ')
      .filter(w => w.length >= 3 && !/^(according|stated|announced|claims|claimed|reported|says|said|today|yesterday|advertisement|read|full|story|local|sources|allegedly|report|news|article|company|quarter|ending|supposedly|overnight)$/i.test(w))
      .slice(0, 7)
      .join(' ');

    const searchQuery = `${mainSubject || ''} ${mainLocation || ''} ${keywordsOnly}`.replace(/\s+/g, ' ').trim();

    // Extract Hedging / Qualifiers
    const qualifiers = [];
    if (/\breportedly\b/i.test(cleaned)) qualifiers.push('reportedly');
    if (/\ballegedly\b/i.test(cleaned)) qualifiers.push('allegedly');
    if (/\baccording to\b/i.test(cleaned)) qualifiers.push('according to');

    // Determine epistemic status
    let epistemicStatus = 'asserted';
    if (qualifiers.length > 0) epistemicStatus = 'hedged';
    if (/\b(stated|said|announced|claimed)\b/i.test(cleaned)) epistemicStatus = 'reported';

    // Layer 2 Claim Meaning Object
    const claimMeaning = {
      subject: mainSubject || 'Subject Entity',
      predicate: 'asserted proposition',
      object: cleaned,
      objectDetails: null,
      event: articleContextObj.mainEvent,
      topic: articleContextObj.mainTopic,
      time: isRecentBreaking ? 'Recent' : null,
      location: mainLocation || null,
      entities: [mainSubject].filter(Boolean),
      quantities: (cleaned.match(/\b(\d+(?:\.\d+)?%?|\$\d+|\d+\s*million|\d+\s*billion)\b/gi) || []),
      qualifiers,
      epistemicStatus
    };

    const sourceContext = {
      originalSentence: item.originalText,
      paragraph: item.sourceStruct.paragraph,
      previousSentence: item.sourceStruct.previousSentence,
      nextSentence: item.sourceStruct.nextSentence,
      sourcePosition: item.sourceStruct.sourcePosition
    };

      return {
        id: `claim_${index + 1}`,
        originalText: item.originalText,
        resolvedText: cleaned,
        searchReadyText: searchQuery,
        text: cleaned, // Backward compatible alias for Agent 3/4/DB
        claimText: cleaned, // Backward compatible alias for UI
        category: inferClaimCategory(cleaned),
        importanceScore: Math.round((1 - index / Math.max(selected.length, 1)) * 30 + 65),
        claimScope,
        sourceSpan: item.originalText,
        entities: [mainSubject].filter(Boolean),
        articleContext: articleContextObj, // Layer 1
        claimMeaning, // Layer 2
        sourceContext,
        searchQuery,
        isRecentBreaking,
        sentiment,
        coreferenceResolved: item.coreferenceResolved,
        independentlySearchable: true,
        verifiability: 'high',
        extractionMode: 'MOCK_FALLBACK'
      };
    });

    const internalConsistencyIssues = computeInternalConsistency(text, claims);
    const sourcingTransparency = computeSourcingTransparency(text);

    claims.internalConsistencyIssues = internalConsistencyIssues;
    claims.sourcingTransparency = sourcingTransparency;
    claims.extractionMode = 'MOCK_FALLBACK';

    return claims;
  }

/**
 * Agent 2 – Claim Extractor Service (Enhanced Dual-Layer Semantic Engine)
 * Provider: Google Gemini (migrated from OpenAI)
 */
async function extractClaims(extractedText) {
  const geminiKey = process.env.GEMINI_API_KEY;

  // Guard: if Gemini key is absent/invalid, skip to mock
  if (!isKeyValid(geminiKey)) {
    console.log('[Agent 2 Claim Extractor]: GEMINI_API_KEY absent or invalid. Using deterministic claim extraction.');
    return extractMockClaims(extractedText);
  }

  // Also honour MOCK mode (ETRAI_TEST_MODE=mock)
  const providerStatus = getProviderStatus();
  if (providerStatus.mode === 'MOCK') {
    console.log('[Agent 2 Claim Extractor]: MOCK mode active. Using deterministic claim extraction.');
    return extractMockClaims(extractedText);
  }

  const modelName = (process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim();

  const prompt = `You are Agent 2 (Claim Extractor) in an AI Fact-Checking system.

Your task is to analyze the ENTIRE article and extract up to 12 of the most important, specific, self-contained, context-enriched, searchable, and verifiable factual claims.

You must build TWO DISTINCT SEMANTIC CONTEXT LAYERS:
1. LAYER 1: ARTICLE-LEVEL CONTEXT (overall topic, headline, main event, entity roster, time frame, location, background).
2. LAYER 2: INDIVIDUAL CLAIM MEANING (subject, predicate, object, objectDetails, event, topic, time, location, entities, quantities, qualifiers, epistemicStatus).

═══════════════════════════════════════════════
EXTRACTION & SEMANTIC RULES
═══════════════════════════════════════════════

1. READ THE ENTIRE ARTICLE: First construct an internal article-level understanding (headline, summary, main topic, main event, entities, organizations, locations, dates, numbers).
2. COREFERENCE & PRONOUN RESOLUTION: Resolve unresolved pronouns ("he", "she", "they", "it", "the company", "the government", "the incident") using the actual named entities from the article. Set "coreferenceResolved": true if resolved. If ambiguous, do NOT guess; set "coreferenceResolved": false.
3. CONTEXT ENRICHMENT WITHOUT INVENTING: Add the MINIMUM necessary article context (main subject, location, time, topic) to make each claim independently searchable and understandable WITHOUT needing the rest of the article. Do NOT blindly copy the entire headline into every claim.
4. ATOMIC PROPOSITION EXTRACTION: Split sentences containing multiple independent factual propositions into separate atomic claims (e.g. "Company reported $500M revenue and announced 300 layoffs" -> 2 claims). Do not split indivisible single events.
5. EXCLUDE SUBJECTIVE SPECULATION & THEORIES: Do NOT extract claims whose core content is a person's or group's subjective belief, theory, speculation, or unconfirmed motive (e.g. "Analysts believe the layoffs are linked...").
6. PRESERVE JOURNALISTIC HEDGING & ATTRIBUTION: KEEP claims about events containing hedging like "reportedly", "allegedly", "according to police". Preserve these qualifiers in the "qualifiers" array and set "epistemicStatus": "hedged" or "reported".
7. SOURCE LINEAGE TRACING: Capture "originalSentence", "paragraph", "previousSentence", and "nextSentence" in "sourceContext".
8. SEARCHABILITY: Create a concise, high-precision "searchReadyText" (6-10 keywords max: entities + location + numbers + topic) for Google search.

═══════════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════════

Return ONLY a valid JSON object matching this schema:

{
  "claims": [
    {
      "id": "claim_1",
      "originalText": "Exact raw sentence from source text",
      "resolvedText": "Self-contained, context-enriched, search-ready factual claim",
      "searchReadyText": "Concise search formulation (entities + location + numbers)",
      "claimMeaning": {
        "subject": "Subject of the proposition",
        "predicate": "Action, verb, or state asserted",
        "object": "Affected object or entity",
        "event": "Specific event referenced",
        "topic": "Broader topic",
        "time": "Date or time anchor",
        "location": "Location anchor"
      },
      "category": "Event Assertion",
      "importanceScore": 95,
      "claimScope": "National"
    }
  ],
  "articleContext": {
    "headline": "Headline or lead sentence of the article",
    "summary": "2-3 sentence overview of the entire article",
    "mainTopic": "Primary subject/topic",
    "mainEvent": "Primary event reported",
    "entities": ["Entity 1", "Entity 2"],
    "organizations": ["Org 1"],
    "locations": ["Location 1"],
    "dates": ["Date 1"],
    "importantNumbers": ["$500 million", "17%"],
    "relatedEvents": []
  }
}

Allowed category values: "Statistical Metric", "Event Assertion", "Financial Claim", "Scientific Claim", "Political Claim", "Legal Claim", "Corporate Claim", "Historical Claim", "Factual Statement".
Allowed claimScope values: "International", "National", "Regional", "Local".

TEXT TO ANALYZE:
"""
${extractedText.substring(0, 8000)}
"""`;

  function safeParseGeminiJson(raw) {
    if (!raw || typeof raw !== 'string') return null;
    let text = raw.trim();
    
    // 1. Strip markdown code fences
    if (text.startsWith('```')) {
      text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    }

    // 2. Direct JSON.parse
    try {
      return JSON.parse(text);
    } catch (_) {}

    // 3. Regex extraction of outermost object
    const jsonMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (jsonMatch) {
      const candidate = jsonMatch[0];
      try {
        return JSON.parse(candidate);
      } catch (_) {}

      try {
        const sansTrailingCommas = candidate.replace(/,\s*([\}\]])/g, '$1');
        return JSON.parse(sansTrailingCommas);
      } catch (_) {}
    }

    // 4. Bracket & quote balancing for truncated outputs
    function balanceAndParse(str) {
      let stack = [];
      let inString = false;
      let escaped = false;

      for (let i = 0; i < str.length; i++) {
        const c = str[i];
        if (escaped) { escaped = false; continue; }
        if (c === '\\') { escaped = true; continue; }
        if (c === '"') { inString = !inString; continue; }
        if (!inString) {
          if (c === '{' || c === '[') stack.push(c);
          else if (c === '}' || c === ']') {
            const top = stack[stack.length - 1];
            if ((c === '}' && top === '{') || (c === ']' && top === '[')) {
              stack.pop();
            }
          }
        }
      }

      let repaired = str;
      if (inString) repaired += '"';
      while (stack.length > 0) {
        const top = stack.pop();
        if (top === '{') repaired += '}';
        else if (top === '[') repaired += ']';
      }

      try {
        return JSON.parse(repaired);
      } catch (_) {
        return null;
      }
    }

    return balanceAndParse(text);
  }

  async function callGeminiApi() {
    const ai = new GoogleGenAI({ apiKey: geminiKey });
    
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Gemini API call timed out after 25000ms')), 25000);
    });

    const apiPromise = ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.2,
        maxOutputTokens: 8192
      }
    });

    const geminiResponse = await Promise.race([apiPromise, timeoutPromise]);

    let rawText = null;
    if (typeof geminiResponse.text === 'string') {
      rawText = geminiResponse.text;
    } else if (typeof geminiResponse.text === 'function') {
      rawText = geminiResponse.text();
    } else {
      const parts = geminiResponse.candidates?.[0]?.content?.parts;
      if (Array.isArray(parts) && parts.length > 0) {
        rawText = parts.map(p => p.text || '').join('');
      }
    }
    return rawText;
  }

  try {
    const backoffDelays = [3000, 6000, 12000, 18000, 25000, 30000];
    let attempt = 0;
    while (attempt <= backoffDelays.length) {
      try {
        geminiRawText = await callGeminiApi();
        // If parsed cleanly, break immediately
        const testParse = safeParseGeminiJson(geminiRawText);
        if (testParse && (Array.isArray(testParse) || (typeof testParse === 'object' && testParse !== null))) {
          break;
        }
        if (attempt < backoffDelays.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          attempt++;
          continue;
        }
        break;
      } catch (err) {
        const errMsg = err.message || String(err);
        if (/429|quota|rate.?limit|RESOURCE_EXHAUSTED|timed.?out|ECONNRESET|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|fetch failed|socket|hang up|abort|network/i.test(errMsg) && attempt < backoffDelays.length) {
          const delay = backoffDelays[attempt];
          console.log(`[Agent 2 Gemini]: Transient network/rate-limit error (${errMsg.substring(0, 120)}). Retrying in ${delay}ms... (attempt ${attempt + 1}/${backoffDelays.length})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          attempt++;
        } else {
          console.error(`[Agent 2 Gemini API Exception]: ${errMsg}`);
          throw err;
        }
      }
    }

    if (!geminiRawText || geminiRawText.trim().length === 0) {
      throw new Error('Gemini returned an empty response body (no text in candidates or .text())');
    }

  } catch (geminiErr) {
    // Classify the error type for safe logging (never print the key)
    const msg = geminiErr.message || String(geminiErr);
    let safeReason = 'unknown error';
    if (/401|403|api.?key|unauthorized|forbidden/i.test(msg)) safeReason = 'authentication failure';
    else if (/429|quota|rate.?limit/i.test(msg)) safeReason = 'quota/rate-limit exceeded';
    else if (/timeout|ETIMEDOUT|ECONNRESET|network/i.test(msg)) safeReason = 'network/timeout';
    else if (/model|not.?found|invalid.?model/i.test(msg)) safeReason = 'invalid model name';
    console.error(`[Agent 2 Gemini Error]: Gemini extraction failed (${safeReason}). Falling back to heuristic claim extraction.`);
    return extractMockClaims(extractedText);
  }

  const parsed = safeParseGeminiJson(geminiRawText);
  if (!parsed) {
    console.error('[Agent 2 Gemini Error]: Gemini returned non-parseable JSON response. Raw snippet:', (geminiRawText || '').substring(0, 300));
    return extractMockClaims(extractedText);
  }

  // ── Validate parsed structure ─────────────────────────────────────────────
  if (!parsed || (typeof parsed !== 'object' && !Array.isArray(parsed))) {
    console.error('[Agent 2 Gemini Error]: Gemini response parsed to unexpected type. Falling back.');
    return extractMockClaims(extractedText);
  }

  // ── Normalize response into the same shape as the OpenAI path ────────────
  const topArticleContext = (typeof parsed.articleContext === 'object' && parsed.articleContext)
    ? parsed.articleContext
    : {
        headline: extractedText.split('\n')[0].substring(0, 100),
        summary: extractedText.substring(0, 250),
        mainTopic: 'Article Topic',
        mainEvent: 'Reported Event',
        entities: [],
        organizations: [],
        locations: [],
        dates: [],
        importantNumbers: [],
        relatedEvents: []
      };

  const rawClaims = Array.isArray(parsed) ? parsed : (parsed.claims || []);

  if (!Array.isArray(rawClaims) || rawClaims.length === 0) {
    console.warn('[Agent 2 Gemini Warning]: Gemini returned zero claims. Falling back.');
    return extractMockClaims(extractedText);
  }

  const internalConsistencyIssues = Array.isArray(parsed.internalConsistencyIssues)
    ? parsed.internalConsistencyIssues
    : computeInternalConsistency(extractedText, rawClaims);

  const sourcingTransparency = (typeof parsed.sourcingTransparency === 'object' && parsed.sourcingTransparency)
    ? parsed.sourcingTransparency
    : computeSourcingTransparency(extractedText);

  const { sentenceStructure } = extractParagraphsAndSentences(extractedText);

  const coherentRawClaims = rawClaims.filter(c => isCoherentClaimStatement(cleanClaimText(c.resolvedText || c.claimText || c.text || c.claim || c.originalText || '')));
  const candidateClaims = coherentRawClaims.length > 0 ? coherentRawClaims : rawClaims;

  const claims = candidateClaims.slice(0, MAX_CLAIMS).map((c, i) => {
    const originalText = c.originalText || c.sourceSpan || c.claimText || c.text || '';
    const resolvedText = cleanClaimText(c.resolvedText || c.claimText || c.text || c.claim || originalText);
    const searchReadyText = c.searchReadyText || c.searchQuery || resolvedText;
    const sentiment = analyzeSentiment(resolvedText);

    let claimScope = c.claimScope || inferClaimScope(resolvedText);
    if (/\b(district|village|border|local police|panchayat|farm|worker|town|county)\b/i.test(resolvedText)) {
      claimScope = 'Regional';
    }
    const isRecentBreaking = checkRecency(resolvedText);

    const matchedStruct = sentenceStructure.find(st => st.text === originalText) || {
      paragraph: originalText,
      previousSentence: null,
      nextSentence: null,
      sourcePosition: i + 1
    };

    const sourceContext = c.sourceContext || {
      originalSentence: originalText,
      paragraph: matchedStruct.paragraph,
      previousSentence: matchedStruct.previousSentence,
      nextSentence: matchedStruct.nextSentence,
      sourcePosition: matchedStruct.sourcePosition
    };

    const claimMeaning = c.claimMeaning || {
      subject: c.entities?.[0] || 'Subject Entity',
      predicate: 'asserted proposition',
      object: resolvedText,
      objectDetails: null,
      event: topArticleContext.mainEvent || 'Event',
      topic: topArticleContext.mainTopic || 'Topic',
      time: isRecentBreaking ? 'Recent' : null,
      location: topArticleContext.locations?.[0] || null,
      entities: c.entities || [],
      quantities: (resolvedText.match(/\b(\d+(?:\.\d+)?%?|\$\d+|\d+\s*million|\d+\s*billion)\b/gi) || []),
      qualifiers: [],
      epistemicStatus: 'asserted'
    };

    return {
      id: c.id || `claim_${i + 1}`,
      originalText,
      resolvedText,
      searchReadyText,
      text: resolvedText,        // Backward-compatible alias for Agent 3/4/DB
      claimText: resolvedText,   // Backward-compatible alias for UI
      category: c.category || inferClaimCategory(resolvedText),
      importanceScore: c.importanceScore || Math.round((1 - i / Math.max(coherentRawClaims.length, 1)) * 30 + 65),
      claimScope,
      sourceSpan: originalText,
      entities: c.entities || [],
      articleContext: topArticleContext,  // Layer 1
      claimMeaning,                       // Layer 2
      sourceContext,
      searchQuery: c.searchQuery || searchReadyText,
      isRecentBreaking,
      sentiment,
      coreferenceResolved: c.coreferenceResolved !== undefined ? c.coreferenceResolved : true,
      independentlySearchable: c.independentlySearchable !== undefined ? c.independentlySearchable : true,
      verifiability: c.verifiability || 'high',
      // extractionMode is set by the APPLICATION, never by the model output
      extractionMode: 'REAL_LLM'
    };
  });

  claims.internalConsistencyIssues = internalConsistencyIssues;
  claims.sourcingTransparency = sourcingTransparency;
  claims.articleContext = topArticleContext;
  claims.extractionMode = 'REAL_LLM';

  return claims;
}

module.exports = {
  extractClaims,
  extractMockClaims,
  cleanClaimText,
  inferClaimCategory,
  inferClaimScope,
  isCoherentClaimStatement,
  computeSourcingTransparency,
  computeInternalConsistency,
  extractParagraphsAndSentences
};
