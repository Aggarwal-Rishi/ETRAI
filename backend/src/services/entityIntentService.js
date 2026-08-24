/**
 * ETRAI Entity Intelligence, Attribution & Framing Analysis Engine
 * Extracts People, Organizations, Governments, Companies, Products, Locations, Events, and Documents.
 * Connects entities to claims, evaluates quote attribution validity and alteration signals,
 * and detects potential framing signals with calibrated analytical inferences.
 */

'use strict';

const { createGeminiClient, getProviderStatus, isKeyValid } = require('./providerManager');
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
  'supreme court': { normalizedName: 'Supreme Court of India', type: 'GOVERNMENT_BODY', jurisdiction: 'National' },
  'high court': { normalizedName: 'High Court', type: 'GOVERNMENT_BODY', jurisdiction: 'Regional' },
  'who': { normalizedName: 'World Health Organization (WHO)', type: 'ORGANIZATION', jurisdiction: 'International' },
  'un': { normalizedName: 'United Nations (UN)', type: 'ORGANIZATION', jurisdiction: 'International' },
  'imf': { normalizedName: 'International Monetary Fund (IMF)', type: 'ORGANIZATION', jurisdiction: 'International' },
  'world bank': { normalizedName: 'World Bank Group', type: 'ORGANIZATION', jurisdiction: 'International' },

  // Key Technology & Industrial Companies
  'tcs': { normalizedName: 'Tata Consultancy Services (TCS)', type: 'COMPANY', jurisdiction: 'National' },
  'tata motors': { normalizedName: 'Tata Motors Limited', type: 'COMPANY', jurisdiction: 'National' },
  'reliance': { normalizedName: 'Reliance Industries Limited (RIL)', type: 'COMPANY', jurisdiction: 'National' },
  'ril': { normalizedName: 'Reliance Industries Limited (RIL)', type: 'COMPANY', jurisdiction: 'National' },
  'infosys': { normalizedName: 'Infosys Limited', type: 'COMPANY', jurisdiction: 'National' },
  'google': { normalizedName: 'Google LLC', type: 'COMPANY', jurisdiction: 'International' },
  'microsoft': { normalizedName: 'Microsoft Corporation', type: 'COMPANY', jurisdiction: 'International' },
  'apple': { normalizedName: 'Apple Inc.', type: 'COMPANY', jurisdiction: 'International' },
  'meta': { normalizedName: 'Meta Platforms Inc.', type: 'COMPANY', jurisdiction: 'International' },

  // Products & Currencies
  'upi': { normalizedName: 'Unified Payments Interface (UPI)', type: 'PRODUCT', jurisdiction: 'National' },
  'aadhaar': { normalizedName: 'Aadhaar Identity System', type: 'PRODUCT', jurisdiction: 'National' },
  'chatgpt': { normalizedName: 'ChatGPT AI Platform', type: 'PRODUCT', jurisdiction: 'International' },
  'iphone': { normalizedName: 'Apple iPhone', type: 'PRODUCT', jurisdiction: 'International' },
  'bitcoin': { normalizedName: 'Bitcoin Cryptocurrency', type: 'PRODUCT', jurisdiction: 'International' },

  // Documents & Orders
  'gazette of india': { normalizedName: 'The Gazette of India', type: 'DOCUMENT', jurisdiction: 'National' },
  'press release': { normalizedName: 'Official Press Release Document', type: 'DOCUMENT', jurisdiction: 'National' },
  'ordinance': { normalizedName: 'Statutory Presidential Ordinance', type: 'DOCUMENT', jurisdiction: 'National' },
  'white paper': { normalizedName: 'Government White Paper', type: 'DOCUMENT', jurisdiction: 'National' },
  'annual report': { normalizedName: 'Corporate Annual Financial Report', type: 'DOCUMENT', jurisdiction: 'National' },

  // Events
  'g20 summit': { normalizedName: 'G20 Leadership Summit', type: 'EVENT', jurisdiction: 'International' },
  'cop28': { normalizedName: 'COP28 UN Climate Conference', type: 'EVENT', jurisdiction: 'International' },
  'general election': { normalizedName: 'National General Elections', type: 'EVENT', jurisdiction: 'National' },
  'union budget': { normalizedName: 'Union Budget Presentation', type: 'EVENT', jurisdiction: 'National' }
};

/**
 * Extracts quotes, attribution sources, speaker identities, and alteration signals.
 * Rule: Unattributed statements are strictly marked as UNATTRIBUTED_ASSERTION.
 */
function extractQuotesAndAttributions(text = '', sources = []) {
  const quotes = [];
  if (!text || typeof text !== 'string') return quotes;

  // Regex capturing quote strings and preceding/trailing attribution verbs
  const quoteRegex = /(?:([A-Z][a-zA-Z\s\.\-]{2,60})\s+(?:stated|said|claimed|declared|announced|warned|asserted|posted|tweeted|wrote|reported|confirmed)[,:\s]+)?["“'«]([^"”'»]{8,400})["”'»](?:\s+[,:\-]\s*([A-Z][a-zA-Z\s\.\-]{2,60}))?/gi;

  let match;
  let quoteId = 1;
  while ((match = quoteRegex.exec(text)) !== null) {
    let speakerPrefix = (match[1] || '').trim();
    const quoteBody = (match[2] || '').trim();
    let speakerSuffix = (match[3] || '').trim();

    // Strip leading transitional adverbials
    speakerPrefix = speakerPrefix.replace(/^(Meanwhile|However|Furthermore|Additionally|In addition|Later|Consequently)[,\s]+/i, '').trim();
    speakerSuffix = speakerSuffix.replace(/^(Meanwhile|However|Furthermore|Additionally|In addition|Later|Consequently)[,\s]+/i, '').trim();

    let rawSpeaker = speakerPrefix || speakerSuffix || null;

    // Filter out generic phrases that are not named individuals/entities
    const genericPhrases = /\b(an? unverified|an? anonymous|a social post|a blog|some users|sources|social media|online post|channels|critics|insiders|commenters)\b/i;
    if (rawSpeaker && genericPhrases.test(rawSpeaker)) {
      rawSpeaker = null;
    }

    if (quoteBody.length >= 8) {
      let isAuthoritative = false;
      let claimedSpeaker = rawSpeaker;
      let claimedAffiliation = null;

      if (rawSpeaker) {
        if (/\b(Governor|Minister|President|Secretary|Director|Chief|Justice|Spokesperson|Officer)\b/i.test(rawSpeaker)) {
          isAuthoritative = true;
        }
        if (rawSpeaker.includes(',')) {
          const parts = rawSpeaker.split(',');
          claimedSpeaker = parts[0].trim();
          claimedAffiliation = parts.slice(1).join(',').trim();
        }
      }

      // Check if alteration signals exist (ellipsis splicing, bracketed modifications, sensational re-phrasing)
      let isAltered = false;
      const alterationDetails = [];
      if (quoteBody.includes('...') || quoteBody.includes('…')) {
        isAltered = true;
        alterationDetails.push('Ellipsis detected indicating excised context from original spoken quotation');
      }
      if (/\[.*?\]/.test(quoteBody)) {
        isAltered = true;
        alterationDetails.push('Bracketed editorial interpolations found in quotation body');
      }
      if (/\b(ALL CAPS|NEVER|DESTROY|KILL|SCANDAL)\b/.test(quoteBody) && !isAuthoritative) {
        alterationDetails.push('Sensationalized formatting in quotation');
      }

      // Verification status of attribution
      let verificationStatus = 'UNATTRIBUTED_ASSERTION';
      let confidence = 40;

      if (claimedSpeaker) {
        // Cross-check if speaker is mentioned alongside authoritative reporting in sources
        const isSupportedInSources = (sources || []).some(s => {
          const srcText = `${s.title || ''} ${s.snippet || ''} ${s.content || ''}`.toLowerCase();
          return srcText.includes(claimedSpeaker.toLowerCase()) && (s.authorityRank <= 2 || s.stance === 'SUPPORTS');
        });

        if (isSupportedInSources && isAuthoritative) {
          verificationStatus = 'VERIFIED_ATTRIBUTION';
          confidence = 90;
        } else {
          verificationStatus = 'UNVERIFIED_ATTRIBUTION';
          confidence = 60;
        }
      }

      quotes.push({
        id: `quote_${quoteId++}`,
        quoteText: quoteBody,
        claimedSpeaker: claimedSpeaker || null,
        attributedSpeaker: claimedSpeaker || null,
        claimedAffiliation: claimedAffiliation || null,
        hasAttributedSpeaker: Boolean(claimedSpeaker),
        verificationStatus: claimedSpeaker ? 'ATTRIBUTED_STATEMENT' : 'UNATTRIBUTED_ASSERTION',
        attributionState: verificationStatus,
        isAltered,
        alterationDetails: alterationDetails.length > 0 ? alterationDetails.join('; ') : null,
        isAuthoritative,
        confidence,
        originalSourceUrl: null
      });
    }
  }

  return quotes;
}

/**
 * Extracts and normalizes named entities across all 8 supported entity types:
 * PEOPLE, ORGANIZATIONS, GOVERNMENTS, COMPANIES, PRODUCTS, LOCATIONS, EVENTS, DOCUMENTS.
 */
function extractEntitiesDeterministic(text = '') {
  if (!text || typeof text !== 'string') return [];

  const entitiesMap = new Map();
  const lowerText = text.toLowerCase();

  // 1. Scan against canonical knowledge base
  for (const [key, info] of Object.entries(CANONICAL_KNOWLEDGE_BASE)) {
    const regex = new RegExp(`\\b${key}\\b`, 'gi');
    const matches = lowerText.match(regex);
    if (matches && matches.length > 0) {
      entitiesMap.set(info.normalizedName, {
        name: key.toUpperCase(),
        normalizedName: info.normalizedName,
        type: info.type,
        role: info.jurisdiction || 'National',
        jurisdiction: info.jurisdiction || 'National',
        mentionsCount: matches.length,
        confidence: 95
      });
    }
  }

  // 2. Scan for capitalized Proper Noun patterns
  const properNounRegex = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/g;
  let match;
  while ((match = properNounRegex.exec(text)) !== null) {
    const candidate = match[1].trim();
    const candidateLower = candidate.toLowerCase();

    // Exclude generic sentence starters
    const exclusions = [
      'The Union', 'According To', 'In Addition', 'On Wednesday', 'On Monday',
      'On Tuesday', 'On Thursday', 'On Friday', 'On Saturday', 'On Sunday',
      'In India', 'In Recent', 'As Per', 'Under The', 'For The', 'With Regard'
    ];
    if (exclusions.includes(candidate)) continue;

    if (!entitiesMap.has(candidate) && !CANONICAL_KNOWLEDGE_BASE[candidateLower]) {
      let type = 'ORGANIZATION';
      let jurisdiction = 'National';

      if (candidate.match(/\b(Minister|Secretary|President|Governor|Director|Chief|Officer|Justice|Spokesperson|Mr|Ms|Dr|Prof|Narendra|Modi|Biden|Trump|Sunak|Das)\b/i)) {
        type = 'PERSON';
      } else if (candidate.match(/\b(Ministry|Department|Commission|Cabinet|Parliament|Court|Tribunal|Bureau|Agency|Administration)\b/i)) {
        type = 'GOVERNMENT_BODY';
      } else if (candidate.match(/\b(Ltd|Limited|Corp|Corporation|Inc|Pvt|Enterprises|Technologies|Bank|Airlines|Pharmaceuticals)\b/i)) {
        type = 'COMPANY';
      } else if (candidate.match(/\b(Phone|Device|App|Software|System|Token|Currency|Coin|Model|Vaccine|Drug)\b/i)) {
        type = 'PRODUCT';
      } else if (candidate.match(/\b(Summit|Conference|Forum|Championship|Cup|Election|Assembly|Exhibition|Expo|War|Treaty)\b/i)) {
        type = 'EVENT';
      } else if (candidate.match(/\b(Act|Bill|Order|Gazette|Notification|Report|Treaty|Constitution|Declaration|Agreement)\b/i)) {
        type = 'DOCUMENT';
      } else if (candidate.match(/\b(City|State|Province|District|Delhi|Mumbai|Bengaluru|Gujarat|Assam|Punjab|Kashmir|India|London|Washington|Tokyo|Beijing|Paris|Dubai)\b/i)) {
        type = 'LOCATION';
      }

      entitiesMap.set(candidate, {
        name: candidate,
        normalizedName: candidate,
        type,
        role: jurisdiction,
        jurisdiction,
        mentionsCount: 1,
        confidence: 80
      });
    }
  }

  return Array.from(entitiesMap.values());
}

/**
 * Connects extracted NamedEntities to extracted claims
 */
function connectEntitiesToClaims(entities = [], claims = []) {
  const connections = [];

  claims.forEach(claim => {
    const claimText = `${claim.claimText || claim.text || ''} ${claim.attribution || ''}`.toLowerCase();
    const claimId = claim.id || `claim_${connections.length + 1}`;

    entities.forEach(entity => {
      const entityName = (entity.name || '').toLowerCase();
      const normName = (entity.normalizedName || '').toLowerCase();

      if (claimText.includes(entityName) || claimText.includes(normName)) {
        let roleInClaim = 'SUBJECT';
        if (entity.type === 'PERSON' && (claimText.includes('said') || claimText.includes('stated') || claimText.includes('claimed'))) {
          roleInClaim = 'QUOTED_SPEAKER';
        } else if (entity.type === 'LOCATION') {
          roleInClaim = 'JURISDICTION';
        } else if (entity.type === 'DOCUMENT') {
          roleInClaim = 'EVIDENCE_ANCHOR';
        } else if (entity.type === 'GOVERNMENT_BODY') {
          roleInClaim = 'TARGET';
        }

        connections.push({
          id: `ent_conn_${connections.length + 1}`,
          entityId: entity.id || entity.name,
          entityName: entity.normalizedName || entity.name,
          entityType: entity.type,
          claimId,
          roleInClaim,
          confidence: entity.confidence || 85.0
        });
      }
    });
  });

  return connections;
}

/**
 * Identifies Potential Framing Signals with calibrated confidence.
 * MANDATORY RULE: Never claims to know author's psychological intent.
 * Uses strictly: "Potential framing signals" as analytical inference.
 */
function analyzePotentialFramingSignals(text = '', entities = [], quotes = []) {
  if (!text || typeof text !== 'string') {
    return {
      primaryFramingSignal: 'INFORMATIONAL_REPORTING',
      isAnalyticalInference: true,
      confidence: 40,
      potentialFramingSignals: [],
      reasoning: 'Insufficient prose text available for framing signal analysis.',
      signalsBreakdown: {
        sensationalFraming: { detected: false, score: 0, cues: [] },
        engagementBait: { detected: false, score: 0, cues: [] },
        monetizationSignals: { detected: false, score: 0, cues: [] },
        urgencyLanguage: { detected: false, score: 0, cues: [] },
        misleadingAttribution: { detected: false, score: 0, cues: [] }
      }
    };
  }

  const sentiment = analyzeSentiment(text);
  const lower = text.toLowerCase();

  // 1. Sensational Framing Cues
  const sensationalCues = [];
  const sensationalRegex = /\b(shocking|unbelievable|mind-blowing|terrifying|disaster|disastrous|catastrophe|catastrophic|miracle|apocalypse|apocalyptic|massacre|bloodbath|furious|horrific|horrifying|nightmare|explosive|blackout|collapse|deadly|panic|collapse|chaos)\b/gi;
  let match;
  while ((match = sensationalRegex.exec(text)) !== null) {
    sensationalCues.push(match[0]);
  }
  const sensationalScore = Math.min(100, sensationalCues.length * 25 + (sentiment.intensity > 0.4 ? 20 : 0));

  // 2. Engagement Bait Cues
  const engagementCues = [];
  const engagementRegex = /\b(you won't believe|share before deleted|what happens next|will leave you speechless|must watch|everyone is talking about|tag a friend|comment below)\b/gi;
  while ((match = engagementRegex.exec(text)) !== null) {
    engagementCues.push(match[0]);
  }
  const engagementScore = Math.min(100, engagementCues.length * 35);

  // 3. Monetization Signals
  const monetizationCues = [];
  const monetizationRegex = /\b(buy\s+(?:[\w\s]{0,20})?now|limited discount|exclusive offer|promo code|promotional code|crypto|profit|guaranteed\s+(?:[\w\s%]{0,15})?returns|sponsored post|target price|trading strategy|invest now)\b/gi;
  while ((match = monetizationRegex.exec(text)) !== null) {
    monetizationCues.push(match[0]);
  }
  const monetizationScore = Math.min(100, monetizationCues.length * 35);

  // 4. Urgency Language Cues
  const urgencyCues = [];
  const urgencyRegex = /\b(urgent|immediate action required|emergency order|warning to all citizens|breaking alert|within 24 hours|deadline tonight|act fast|before it's too late)\b/gi;
  while ((match = urgencyRegex.exec(text)) !== null) {
    urgencyCues.push(match[0]);
  }
  const urgencyScore = Math.min(100, urgencyCues.length * 30);

  // 5. Misleading Attribution Signals
  const misleadingAttributionCues = [];
  const unattributedQuotes = quotes.filter(q => !q.hasAttributedSpeaker || q.verificationStatus === 'UNATTRIBUTED_ASSERTION');
  if (unattributedQuotes.length > 0 && (lower.includes('sources say') || lower.includes('insiders claim') || lower.includes('leaked memo'))) {
    misleadingAttributionCues.push('Anonymous or unverified sourcing connected to high-impact allegations');
  }
  if (quotes.some(q => q.isAltered)) {
    misleadingAttributionCues.push('Quotations exhibit contextual alterations or ellipsis excision');
  }
  const misleadingAttributionScore = Math.min(100, misleadingAttributionCues.length * 40);

  // Compile Potential Framing Signals
  const potentialFramingSignals = [];
  if (sensationalScore >= 30) potentialFramingSignals.push('SENSATIONAL_FRAMING');
  if (engagementScore >= 30) potentialFramingSignals.push('ENGAGEMENT_BAIT');
  if (monetizationScore >= 30) potentialFramingSignals.push('MONETIZATION_PROMOTION');
  if (urgencyScore >= 30) potentialFramingSignals.push('URGENCY_PRESSURE');
  if (misleadingAttributionScore >= 30) potentialFramingSignals.push('MISLEADING_ATTRIBUTION_RISK');

  let primaryFramingSignal = 'INFORMATIONAL_REPORTING';
  let maxScore = 20;

  const scoreMap = {
    SENSATIONAL_FRAMING: sensationalScore,
    ENGAGEMENT_BAIT: engagementScore,
    MONETIZATION_PROMOTION: monetizationScore,
    URGENCY_PRESSURE: urgencyScore,
    MISLEADING_ATTRIBUTION_RISK: misleadingAttributionScore
  };

  for (const [signal, score] of Object.entries(scoreMap)) {
    if (score > maxScore) {
      maxScore = score;
      primaryFramingSignal = signal;
    }
  }

  let reasoning = 'Text structure primarily exhibits expository reportorial syntax with measured framing. This is an analytical structural inference, not a definitive psychological claim.';
  if (primaryFramingSignal === 'SENSATIONAL_FRAMING') {
    reasoning = `Content exhibits potential sensational framing signals (${sensationalCues.length} emotive/hyperbolic terms identified), utilizing alarmist crisis framing and heightened public panic cues. This is an analytical structural inference, not a definitive psychological claim.`;
  } else if (primaryFramingSignal === 'ENGAGEMENT_BAIT') {
    reasoning = `Content utilizes engagement-bait rhetoric and curiosity gap patterns designed to encourage viral sharing. This is an analytical structural inference, not a definitive psychological claim.`;
  } else if (primaryFramingSignal === 'MONETIZATION_PROMOTION') {
    reasoning = `Content features commercial monetization hooks, investment return claims, or promotional framing signals. This is an analytical structural inference, not a definitive psychological claim.`;
  } else if (primaryFramingSignal === 'URGENCY_PRESSURE') {
    reasoning = `Heightened urgency language, alarmist phrasing, and immediate panic deadline pressure detected in text structure. This is an analytical structural inference, not a definitive psychological claim.`;
  } else if (primaryFramingSignal === 'MISLEADING_ATTRIBUTION_RISK') {
    reasoning = `Attribution signals exhibit potential sourcing anomalies or unverified quotation claims. This is an analytical structural inference, not a definitive psychological claim.`;
  }

  let computedConfidence = 45;
  if (primaryFramingSignal === 'INFORMATIONAL_REPORTING') {
    computedConfidence = 50;
  } else {
    computedConfidence = Math.min(95, Math.max(65, maxScore));
  }

  return {
    primaryFramingSignal,
    isAnalyticalInference: true,
    confidence: computedConfidence,
    potentialFramingSignals,
    reasoning,
    signalsBreakdown: {
      sensationalFraming: { detected: sensationalScore >= 30, score: sensationalScore, cues: sensationalCues },
      engagementBait: { detected: engagementScore >= 30, score: engagementScore, cues: engagementCues },
      monetizationSignals: { detected: monetizationScore >= 30, score: monetizationScore, cues: monetizationCues },
      urgencyLanguage: { detected: urgencyScore >= 30, score: urgencyScore, cues: urgencyCues },
      misleadingAttribution: { detected: misleadingAttributionScore >= 30, score: misleadingAttributionScore, cues: misleadingAttributionCues }
    }
  };
}

/**
 * Executes Comprehensive Entity, Attribution, and Framing Intelligence
 */
async function performEntityAndIntentAnalysis(text = '', options = {}) {
  const claims = options.claims || [];
  const sources = options.sources || [];

  // 1. Deterministic Named Entity Extraction across all 8 types
  let entities = extractEntitiesDeterministic(text);

  // 2. Quote & Speaker Attribution Extraction
  const quotes = extractQuotesAndAttributions(text, sources);

  // 3. Connect Entities to Claims
  const entityClaimConnections = connectEntitiesToClaims(entities, claims);

  // 4. Potential Framing Signals Engine
  const framingAnalysis = analyzePotentialFramingSignals(text, entities, quotes);

  // 5. Geographic & Jurisdictional Analysis
  const geographicRelevance = {
    primaryJurisdiction: entities.find(e => e.type === 'LOCATION')?.jurisdiction || 'National',
    locationsIdentified: entities.filter(e => e.type === 'LOCATION').map(e => e.name),
    isCrossBorderJurisdiction: entities.some(e => e.jurisdiction === 'International')
  };

  // 6. Entity Consistency & Role Drift Checks
  const entityInconsistencies = [];
  const govEntities = entities.filter(e => e.type === 'GOVERNMENT_BODY');
  if (govEntities.length > 1) {
    const hasLocal = govEntities.some(g => g.jurisdiction === 'Local' || g.jurisdiction === 'Regional');
    const hasNational = govEntities.some(g => g.jurisdiction === 'National');
    if (hasLocal && hasNational && text.toLowerCase().includes('national ban')) {
      entityInconsistencies.push({
        type: 'JURISDICTIONAL_SCOPE_MISMATCH',
        explanation: 'State/Regional entity cited in connection with national statutory ban.'
      });
    }
  }

  // Optional Gemini Semantic Enrichment when available
  const gemini = createGeminiClient();
  if (gemini && isKeyValid(process.env.GEMINI_API_KEY) && text.length > 80 && options.enableLlmEnrichment) {
    try {
      const modelName = (process.env.GEMINI_MODEL || 'gemini-flash-lite-latest').trim();
      const prompt = `Analyze the following text for named entities and quote attributions. Return ONLY a JSON object:
{
  "entities": [{"name": "Entity Name", "type": "PERSON|ORGANIZATION|GOVERNMENT_BODY|COMPANY|PRODUCT|LOCATION|EVENT|DOCUMENT"}],
  "quotes": [{"quoteText": "quoted string", "claimedSpeaker": "speaker name or null", "isAltered": false}]
}
Text: ${text.substring(0, 2000)}`;

      const res = await gemini.models.generateContent({
        model: modelName,
        contents: prompt,
        config: { responseMimeType: 'application/json', temperature: 0.1 }
      });

      let raw = typeof res.text === 'string' ? res.text : (typeof res.text === 'function' ? res.text() : '');
      const parsed = JSON.parse((raw || '{}').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim());
      if (Array.isArray(parsed.entities)) {
        parsed.entities.forEach(pe => {
          if (!entities.some(e => e.normalizedName.toLowerCase() === pe.name.toLowerCase())) {
            entities.push({
              name: pe.name,
              normalizedName: pe.name,
              type: pe.type || 'ORGANIZATION',
              role: 'National',
              jurisdiction: 'National',
              mentionsCount: 1,
              confidence: 85
            });
          }
        });
      }
    } catch (_) {
      // Graceful fallback to deterministic analysis
    }
  }

  return {
    entitiesCount: entities.length,
    entities,
    quotesCount: quotes.length,
    quotes,
    entityClaimConnections,
    geographicRelevance,
    entityInconsistencies,
    framingAnalysis,
    intentAnalysis: {
      primaryIntent: framingAnalysis.primaryFramingSignal,
      isAnalyticalInference: true,
      confidence: framingAnalysis.confidence,
      potentialFramingSignals: framingAnalysis.potentialFramingSignals,
      reasoning: framingAnalysis.reasoning,
      signalsBreakdown: framingAnalysis.signalsBreakdown,
      misinformationTargeting: {
        targetedEntities: entities.filter(e => e.type === 'PERSON' || e.type === 'GOVERNMENT_BODY' || e.type === 'COMPANY').map(e => e.normalizedName),
        potentialHarmVector: framingAnalysis.primaryFramingSignal === 'URGENCY_PRESSURE' ? 'PUBLIC_PANIC_RISK' : (framingAnalysis.primaryFramingSignal === 'MONETIZATION_PROMOTION' ? 'MARKET_DISTORTION_RISK' : 'MINIMAL_RISK')
      }
    },
    summary: {
      primaryIntent: framingAnalysis.primaryFramingSignal === 'INFORMATIONAL_REPORTING' ? 'INFORMATIONAL' : framingAnalysis.primaryFramingSignal,
      primaryFramingSignal: framingAnalysis.primaryFramingSignal,
      intentConfidence: framingAnalysis.confidence,
      isAnalyticalInference: true,
      targetedEntitiesCount: entities.length,
      quotesVerifiedCount: quotes.filter(q => q.verificationStatus === 'VERIFIED_ATTRIBUTION' || q.verificationStatus === 'ATTRIBUTED_STATEMENT').length,
      unattributedQuotesCount: quotes.filter(q => q.verificationStatus === 'UNATTRIBUTED_ASSERTION').length
    }
  };
}

function inferPotentialIntent(text = '', entities = [], quotes = []) {
  const framing = analyzePotentialFramingSignals(text, entities, quotes);
  let primaryIntent = 'INFORMATIONAL';
  if (framing.primaryFramingSignal === 'URGENCY_PRESSURE' || framing.primaryFramingSignal === 'SENSATIONAL_FRAMING') {
    primaryIntent = 'FEARMONGERING_OR_PANIC';
  } else if (framing.primaryFramingSignal === 'MONETIZATION_PROMOTION') {
    primaryIntent = 'FINANCIAL_MARKET_MANIPULATION';
  } else if (framing.primaryFramingSignal === 'MISLEADING_ATTRIBUTION_RISK') {
    primaryIntent = 'DEFAMATION_OR_DISCREDITING';
  }

  return {
    ...framing,
    primaryIntent,
    misinformationTargeting: {
      targetedEntities: [],
      potentialHarmVector: primaryIntent === 'FEARMONGERING_OR_PANIC' ? 'PUBLIC_PANIC_RISK' : (primaryIntent === 'FINANCIAL_MARKET_MANIPULATION' ? 'MARKET_DISTORTION_RISK' : 'MINIMAL_RISK')
    }
  };
}

module.exports = {
  performEntityAndIntentAnalysis,
  extractEntitiesDeterministic,
  extractQuotesAndAttributions,
  connectEntitiesToClaims,
  analyzePotentialFramingSignals,
  inferPotentialIntent,
  CANONICAL_KNOWLEDGE_BASE
};
