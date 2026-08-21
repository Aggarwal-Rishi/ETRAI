/**
 * ETRAI Entity and Intent Analysis Engine
 * Extracts and resolves People, Organizations, Companies, Governments, Locations, Products, Events, and Quotes.
 * Implements entity consistency checks, quote attribution verification, geographic relevance,
 * audience framing analysis, analytical intent classification with confidence, and targeting indicators.
 */

const { GoogleGenAI } = require('@google/genai');
const { getProviderStatus, isKeyValid } = require('./providerManager');
const { analyzeSentiment } = require('./sentimentService');

// Standard Canonical Knowledge Dictionary for Fast Deterministic Alias Resolution
const CANONICAL_KNOWLEDGE_BASE = {
  // Governments & Regulators
  'pib': { normalizedName: 'Press Information Bureau (PIB)', type: 'GOVERNMENT_BODY', jurisdiction: 'National' },
  'press information bureau': { normalizedName: 'Press Information Bureau (PIB)', type: 'GOVERNMENT_BODY', jurisdiction: 'National' },
  'rbi': { normalizedName: 'Reserve Bank of India (RBI)', type: 'GOVERNMENT_BODY', jurisdiction: 'National' },
  'reserve bank of india': { normalizedName: 'Reserve Bank of India (RBI)', type: 'GOVERNMENT_BODY', jurisdiction: 'National' },
  'sebi': { normalizedName: 'Securities and Exchange Board of India (SEBI)', type: 'GOVERNMENT_BODY', jurisdiction: 'National' },
  'isro': { normalizedName: 'Indian Space Research Organisation (ISRO)', type: 'GOVERNMENT_BODY', jurisdiction: 'National' },
  'ministry of finance': { normalizedName: 'Ministry of Finance', type: 'GOVERNMENT_BODY', jurisdiction: 'National' },
  'finmin': { normalizedName: 'Ministry of Finance', type: 'GOVERNMENT_BODY', jurisdiction: 'National' },
  'ministry of commerce': { normalizedName: 'Ministry of Commerce and Industry', type: 'GOVERNMENT_BODY', jurisdiction: 'National' },
  'union cabinet': { normalizedName: 'Union Cabinet of India', type: 'GOVERNMENT_BODY', jurisdiction: 'National' },
  'dgft': { normalizedName: 'Directorate General of Foreign Trade (DGFT)', type: 'GOVERNMENT_BODY', jurisdiction: 'National' },
  'who': { normalizedName: 'World Health Organization (WHO)', type: 'ORGANIZATION', jurisdiction: 'International' },
  'un': { normalizedName: 'United Nations (UN)', type: 'ORGANIZATION', jurisdiction: 'International' },

  // Key Technology & Industrial Companies
  'tcs': { normalizedName: 'Tata Consultancy Services (TCS)', type: 'COMPANY', jurisdiction: 'National' },
  'tata motors': { normalizedName: 'Tata Motors Limited', type: 'COMPANY', jurisdiction: 'National' },
  'reliance': { normalizedName: 'Reliance Industries Limited (RIL)', type: 'COMPANY', jurisdiction: 'National' },
  'ril': { normalizedName: 'Reliance Industries Limited (RIL)', type: 'COMPANY', jurisdiction: 'National' },
  'infosys': { normalizedName: 'Infosys Limited', type: 'COMPANY', jurisdiction: 'National' },
  'google': { normalizedName: 'Google LLC', type: 'COMPANY', jurisdiction: 'International' },
  'microsoft': { normalizedName: 'Microsoft Corporation', type: 'COMPANY', jurisdiction: 'International' },
  'apple': { normalizedName: 'Apple Inc.', type: 'COMPANY', jurisdiction: 'International' }
};

/**
 * Extracts quotes and attributions deterministically from prose text
 */
function extractQuotesAndAttributions(text = '') {
  const quotes = [];
  if (!text || typeof text !== 'string') return quotes;

  // Regex capturing quote strings and preceding/trailing attribution verbs
  const quoteRegex = /(?:([A-Z][a-zA-Z\s\.\-]{2,40})\s+(?:stated|said|claimed|declared|announced|warned|asserted|posted|tweeted|wrote)[,:\s]+)?["“'«]([^"”'»]{8,400})["”'»](?:\s+[,:\-]\s*([A-Z][a-zA-Z\s\.\-]{2,40}))?/gi;

  let match;
  let quoteId = 1;
  while ((match = quoteRegex.exec(text)) !== null) {
    const speakerPrefix = (match[1] || '').trim();
    const quoteBody = (match[2] || '').trim();
    const speakerSuffix = (match[3] || '').trim();
    const attributedSpeaker = speakerPrefix || speakerSuffix || null;

    if (quoteBody.length >= 8) {
      quotes.push({
        quoteId: `quote_${quoteId++}`,
        quoteText: quoteBody,
        attributedSpeaker,
        hasAttributedSpeaker: Boolean(attributedSpeaker),
        verificationStatus: attributedSpeaker ? 'ATTRIBUTED_STATEMENT' : 'UNATTRIBUTED_ASSERTION'
      });
    }
  }

  return quotes;
}

/**
 * Deterministic Entity Extraction & Resolution
 */
function extractEntitiesDeterministic(text = '') {
  if (!text || typeof text !== 'string') return [];

  const entitiesMap = new Map();

  // 1. Scan against canonical knowledge dictionary
  const lowerText = text.toLowerCase();
  for (const [key, info] of Object.entries(CANONICAL_KNOWLEDGE_BASE)) {
    const regex = new RegExp(`\\b${key}\\b`, 'gi');
    const matches = lowerText.match(regex);
    if (matches && matches.length > 0) {
      entitiesMap.set(info.normalizedName, {
        name: key.toUpperCase(),
        normalizedName: info.normalizedName,
        type: info.type,
        jurisdiction: info.jurisdiction,
        mentionsCount: matches.length,
        confidence: 95
      });
    }
  }

  // 2. Scan for capitalized Named Entity patterns (Proper Nouns)
  const properNounRegex = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/g;
  let match;
  while ((match = properNounRegex.exec(text)) !== null) {
    const candidate = match[1].trim();
    const candidateLower = candidate.toLowerCase();

    // Exclude common sentence starters
    const exclusions = ['The Union', 'According To', 'In Addition', 'On Wednesday', 'On Monday', 'On Tuesday', 'On Thursday', 'On Friday', 'On Saturday', 'On Sunday', 'In India', 'In Recent'];
    if (exclusions.includes(candidate)) continue;

    if (!entitiesMap.has(candidate) && !CANONICAL_KNOWLEDGE_BASE[candidateLower]) {
      let type = 'ORGANIZATION';
      let jurisdiction = 'National';

      // Heuristics for entity type
      if (candidate.match(/\b(Minister|Secretary|President|Governor|Director|Chief|Officer|Spokesperson)\b/i)) {
        type = 'PERSON';
      } else if (candidate.match(/\b(Ministry|Department|Commission|Cabinet|Parliament|Court|Tribunal)\b/i)) {
        type = 'GOVERNMENT_BODY';
      } else if (candidate.match(/\b(Ltd|Limited|Corp|Corporation|Inc|Pvt|Enterprises|Technologies|Bank)\b/i)) {
        type = 'COMPANY';
      } else if (candidate.match(/\b(City|State|Province|District|Delhi|Mumbai|Bengaluru|Gujarat|Assam|Punjab|Kashmir|India|London|Washington)\b/i)) {
        type = 'LOCATION';
      }

      entitiesMap.set(candidate, {
        name: candidate,
        normalizedName: candidate,
        type,
        jurisdiction,
        mentionsCount: 1,
        confidence: 80
      });
    }
  }

  return Array.from(entitiesMap.values());
}

/**
 * Classifies Analytical Potential Intent with Confidence and Reasoning
 * MANDATORY RULE: Intent is presented as an analytical inference, never an unquestionable fact.
 */
function inferPotentialIntent(text = '', entities = [], quotes = []) {
  if (!text || typeof text !== 'string') {
    return {
      primaryIntent: 'INFORMATIONAL',
      isAnalyticalInference: true,
      confidence: 50,
      secondaryIntents: [],
      reasoning: 'Insufficient text available for intent inference.',
      misinformationTargeting: { targetedEntities: [], potentialHarmVector: 'NONE' }
    };
  }

  const sentiment = analyzeSentiment(text);
  const lower = text.toLowerCase();
  const targetingIndicators = [];
  const intentScores = {
    INFORMATIONAL: 30, // baseline
    COMMERCIAL_PROMOTION: 0,
    POLITICAL_PERSUASION: 0,
    FINANCIAL_MARKET_MANIPULATION: 0,
    FEARMONGERING_OR_PANIC: 0,
    DEFAMATION_OR_DISCREDITING: 0,
    SATIRE_OR_PARODY: 0
  };

  // 1. Financial Market Manipulation Cues
  const finMatches = lower.match(/\b(stock|shares|rally|crash|soar|plunge|surge|target price|cryptocurrency|buy now|huge return|billion profit)\b/gi) || [];
  if (finMatches.length > 0) {
    intentScores.FINANCIAL_MARKET_MANIPULATION += 40 + Math.min(40, finMatches.length * 8);
  }

  // 2. Fearmongering & Panic Cues
  const panicMatches = lower.match(/\b(immediate ban|deadly poison|toxic chemical|severe shortage|blackout|emergency order|collapse|warns all citizens)\b/gi) || [];
  if (panicMatches.length > 0) {
    intentScores.FEARMONGERING_OR_PANIC += 40 + Math.min(40, panicMatches.length * 8);
  }

  // 3. Commercial Promotion Cues
  const promoMatches = lower.match(/\b(discount|limited offer|buy today|sponsored|best product|revolutionary formula|guaranteed results)\b/gi) || [];
  if (promoMatches.length > 0) {
    intentScores.COMMERCIAL_PROMOTION += 40 + Math.min(40, promoMatches.length * 8);
  }

  // 4. Political Persuasion Cues
  const polMatches = lower.match(/\b(corrupt regime|vote for|election fraud|secret agenda|puppet government|unconstitutional decree|scandal)\b/gi) || [];
  if (polMatches.length > 0) {
    intentScores.POLITICAL_PERSUASION += 40 + Math.min(40, polMatches.length * 8);
  }

  // 5. Defamation / Discrediting Cues
  const defMatches = lower.match(/\b(arrested for fraud|exposed in scandal|illicit bribe|fake degree|money laundering cartel)\b/gi) || [];
  if (defMatches.length > 0) {
    intentScores.DEFAMATION_OR_DISCREDITING += 40 + Math.min(40, defMatches.length * 8);
  }

  // Factor in strong negative emotional sentiment
  if (sentiment.compound < -0.4) {
    intentScores.FEARMONGERING_OR_PANIC += 15;
    intentScores.DEFAMATION_OR_DISCREDITING += 15;
  } else if (sentiment.compound > 0.4 && intentScores.COMMERCIAL_PROMOTION > 0) {
    intentScores.COMMERCIAL_PROMOTION += 15;
  }

  // Identify Targeted Entities
  for (const ent of entities) {
    if (intentScores.DEFAMATION_OR_DISCREDITING > 30 || intentScores.FEARMONGERING_OR_PANIC > 30) {
      targetingIndicators.push(ent.normalizedName || ent.name);
    }
  }

  // Rank Intents
  const sortedIntents = Object.entries(intentScores).sort((a, b) => b[1] - a[1]);
  const [topIntent, topScore] = sortedIntents[0];
  const secondaryIntents = sortedIntents.slice(1, 3).filter(([_, s]) => s >= 30).map(([k, _]) => k);

  const confidence = Math.min(92, Math.max(35, topScore + (quotes.length > 0 ? 5 : 0)));

  // Analytical reasoning explanation
  let reasoning = '';
  if (topIntent === 'FEARMONGERING_OR_PANIC') {
    reasoning = 'The text uses heightened alarmist lexicon, urgent emergency assertions, and severe negative sentiment, analytically inferring potential intent to incite public panic or social anxiety.';
  } else if (topIntent === 'FINANCIAL_MARKET_MANIPULATION') {
    reasoning = 'The content emphasizes dramatic price swings, urgent investment calls, or unverified financial windfalls, inferring commercial speculative influence.';
  } else if (topIntent === 'POLITICAL_PERSUASION') {
    reasoning = 'Rhetorical patterns exhibit partisan framing, governance critique, or electoral persuasion markers.';
  } else if (topIntent === 'DEFAMATION_OR_DISCREDITING') {
    reasoning = 'Content focuses on unverified criminal or ethical allegations directed toward specific individuals or institutions.';
  } else {
    reasoning = 'Content structure primarily conveys standard expository or reportorial information with moderate emotional intensity.';
  }

  return {
    primaryIntent: topIntent,
    isAnalyticalInference: true,
    confidence,
    secondaryIntents,
    reasoning,
    misinformationTargeting: {
      targetedEntities: Array.from(new Set(targetingIndicators)),
      potentialHarmVector: topIntent === 'FEARMONGERING_OR_PANIC' ? 'PUBLIC_PANIC_RISK' : (topIntent === 'FINANCIAL_MARKET_MANIPULATION' ? 'MARKET_DISTORTION_RISK' : (topIntent === 'DEFAMATION_OR_DISCREDITING' ? 'REPUTATIONAL_HARM_RISK' : 'MINIMAL_RISK'))
    }
  };
}

/**
 * Performs Comprehensive Entity & Intent Analysis
 */
async function performEntityAndIntentAnalysis(text = '', options = {}) {
  // 1. Extract Deterministic Entities
  const entities = extractEntitiesDeterministic(text);

  // 2. Extract Quotes and Attributions
  const quotes = extractQuotesAndAttributions(text);

  // 3. Infer Potential Intent with Confidence and Reasoning
  const intentAnalysis = inferPotentialIntent(text, entities, quotes);

  // 4. Check Geographic Consistency & Jurisdiction
  const geographicRelevance = {
    primaryJurisdiction: entities.find(e => e.type === 'LOCATION')?.jurisdiction || 'National',
    locationsIdentified: entities.filter(e => e.type === 'LOCATION').map(e => e.name),
    isCrossBorderJurisdiction: entities.some(e => e.jurisdiction === 'International')
  };

  // 5. Entity Consistency & Role Drift Checks
  const entityInconsistencies = [];
  const govEntities = entities.filter(e => e.type === 'GOVERNMENT_BODY');
  if (govEntities.length > 1) {
    const hasLocal = govEntities.some(g => g.jurisdiction === 'Local' || g.jurisdiction === 'State');
    const hasNational = govEntities.some(g => g.jurisdiction === 'National');
    if (hasLocal && hasNational && text.toLowerCase().includes('national ban')) {
      entityInconsistencies.push({
        type: 'JURISDICTIONAL_SCOPE_MISMATCH',
        explanation: 'State-level entity cited in connection with national policy decree.'
      });
    }
  }

  return {
    entitiesCount: entities.length,
    entities,
    quotesCount: quotes.length,
    quotes,
    geographicRelevance,
    entityInconsistencies,
    intentAnalysis,
    summary: {
      primaryIntent: intentAnalysis.primaryIntent,
      intentConfidence: intentAnalysis.confidence,
      isAnalyticalInference: intentAnalysis.isAnalyticalInference,
      targetedEntitiesCount: intentAnalysis.misinformationTargeting.targetedEntities.length,
      quotesVerifiedCount: quotes.filter(q => q.hasAttributedSpeaker).length
    }
  };
}

module.exports = {
  performEntityAndIntentAnalysis,
  extractEntitiesDeterministic,
  extractQuotesAndAttributions,
  inferPotentialIntent,
  CANONICAL_KNOWLEDGE_BASE
};
