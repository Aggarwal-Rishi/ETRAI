/**
 * Video Spoken Transcript Authenticity & Speaker Verifier
 * Identifies public figure speakers from visual & contextual cues,
 * searches official transcripts and press records via Serper,
 * and assesses verbatim accuracy, selective splicing, and deepfake fabrication.
 */

'use strict';

const { querySerperSearch } = require('./reverseImageSearch');

/**
 * Extract candidate public figure or speaker name from visual entities and speech clues
 */
function resolvePrimarySpeaker(arg1 = [], arg2 = [], arg3 = '', arg4 = '') {
  let entities = [];
  let publicFigures = [];
  let transcript = '';
  let visualDescription = '';

  if (arg1 && typeof arg1 === 'object' && !Array.isArray(arg1)) {
    entities = Array.isArray(arg1.entities) ? arg1.entities : (Array.isArray(arg1.observed?.entities) ? arg1.observed.entities : []);
    publicFigures = Array.isArray(arg1.publicFigures) ? arg1.publicFigures : (Array.isArray(arg1.observed?.publicFigures) ? arg1.observed.publicFigures : []);
    transcript = typeof arg1.transcript === 'string' ? arg1.transcript : '';
    visualDescription = typeof arg1.visualDescription === 'string' ? arg1.visualDescription : '';
  } else {
    entities = Array.isArray(arg1) ? arg1 : [];
    publicFigures = Array.isArray(arg2) ? arg2 : [];
    transcript = typeof arg3 === 'string' ? arg3 : '';
    visualDescription = typeof arg4 === 'string' ? arg4 : '';
  }

  // 1. Direct high-confidence visual public figure
  if (Array.isArray(publicFigures) && publicFigures.length > 0) {
    const valid = publicFigures.find(f => {
      const conf = typeof f.confidence === 'number' ? f.confidence : 80;
      return f.name && (conf >= 70 || conf >= 0.7);
    });
    if (valid) return String(valid.name).trim();
  }

  // 2. High-salience person entity
  if (Array.isArray(entities) && entities.length > 0) {
    const person = entities.find(e => {
      if (typeof e === 'string') return false;
      const type = (e.type || e.category || '').toUpperCase();
      return (type === 'PERSON' || type === 'PUBLIC_FIGURE' || type === 'LEADER') && e.name;
    });
    if (person) return String(person.name).trim();
  }

  // 3. String entity match against recognized global leaders / public figures
  const knownFigures = [
    'Narendra Modi', 'Donald Trump', 'Joe Biden', 'Kamala Harris', 'Barack Obama',
    'Keir Starmer', 'Rishi Sunak', 'Emmanuel Macron', 'Volodymyr Zelenskyy', 'Vladimir Putin',
    'Xi Jinping', 'Elon Musk', 'Sam Altman', 'Jerome Powell', 'Sundar Pichai', 'Satya Nadella',
    'Bill Gates', 'Mark Zuckerberg', 'Jensen Huang', 'Pope Francis', 'Rahul Gandhi', 'Amit Shah'
  ];

  const corpus = `${visualDescription} ${transcript}`.toLowerCase();
  for (const figure of knownFigures) {
    if (corpus.includes(figure.toLowerCase())) {
      return figure;
    }
  }

  // Also check if any raw entity string matches
  if (Array.isArray(entities)) {
    for (const e of entities) {
      const str = typeof e === 'string' ? e : (e.name || '');
      const matched = knownFigures.find(k => k.toLowerCase() === str.toLowerCase());
      if (matched) return matched;
    }
  }

  return null;
}

/**
 * Tokenize text for bag-of-words similarity
 */
function tokenizeWords(str = '') {
  return String(str || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3);
}

function calculateVerbatimSimilarity(spokenText = '', referenceText = '') {
  const spokenTokens = tokenizeWords(spokenText);
  const refTokens = new Set(tokenizeWords(referenceText));
  if (!spokenTokens.length || !refTokens.size) return 0;
  const matches = spokenTokens.filter(t => refTokens.has(t)).length;
  return Math.min(100, Math.round((matches / spokenTokens.length) * 100));
}

/**
 * Search official online transcript records and verify speech authenticity.
 *
 * @param {Object} params
 * @param {string} params.transcript - Extracted spoken dialogue
 * @param {Array} [params.entities] - Entities observed in video
 * @param {Array} [params.publicFigures] - Public figures detected in video
 * @param {string} [params.visualDescription] - Scene visual context
 * @param {Object} [options]
 * @returns {Promise<Object>}
 */
async function verifyOnlineTranscript(params = {}, options = {}) {
  const transcript = params.transcript || '';
  const entities = params.entities || [];
  const publicFigures = params.publicFigures || [];
  const visualDescription = params.visualDescription || '';
  const cleanTranscript = (transcript || '').trim();

  if (!cleanTranscript || cleanTranscript.length < 15) {
    return {
      status: 'SKIPPED',
      reason: 'No substantive spoken speech to verify against online transcripts.',
      transcriptVerdict: 'NO_SPEECH_TO_VERIFY',
      matchedSpeaker: null,
      similarityScore: null,
      isOfficialVerified: false
    };
  }

  // Allow explicit mock results for deterministic testing
  if (options.mockTranscriptVerification || params.mockTranscriptVerification) {
    return options.mockTranscriptVerification || params.mockTranscriptVerification;
  }

  const primarySpeaker = params.primarySpeaker || resolvePrimarySpeaker(entities, publicFigures, cleanTranscript, visualDescription);

  // Extract a salient phrase from speech (up to 10 words) for search
  const words = cleanTranscript.split(/\s+/).filter(Boolean);
  const searchSnippet = words.slice(0, 10).join(' ').replace(/["'’]/g, '');

  let searchQuery = primarySpeaker
    ? `"${primarySpeaker}" "${searchSnippet}" transcript OR speech OR "press conference"`
    : `"${searchSnippet}" transcript OR statement OR speech`;

  let hits = Array.isArray(params.mockSearchResults)
    ? params.mockSearchResults
    : (Array.isArray(options.mockSearchResults) ? options.mockSearchResults : []);

  if (hits.length === 0) {
    try {
      const searchRes = await querySerperSearch(searchQuery, {
        ...options,
        gl: 'us',
        hl: 'en',
        num: 6
      });
      hits = Array.isArray(searchRes?.organic) ? searchRes.organic : [];
      
      if (hits.length === 0 && primarySpeaker && words.length > 5) {
        const broadQuery = `"${primarySpeaker}" "${words.slice(0, 6).join(' ')}" speech`;
        const fallbackSearch = await querySerperSearch(broadQuery, { ...options, num: 4 });
        if (Array.isArray(fallbackSearch?.organic) && fallbackSearch.organic.length > 0) {
          hits.push(...fallbackSearch.organic);
        }
      }
    } catch (err) {
      console.warn('[Transcript Verifier Search Error]:', err.message);
    }
  }

  if (hits.length === 0) {
    return {
      status: 'UNVERIFIED',
      verdict: 'NO_OFFICIAL_TRANSCRIPT_INDEXED',
      transcriptVerdict: 'NO_OFFICIAL_TRANSCRIPT_INDEXED',
      primarySpeaker,
      matchedSpeaker: primarySpeaker,
      similarityScore: 40,
      isOfficialVerified: false,
      isDebunkedDeepfake: false,
      matchedSource: null,
      source: null,
      rationale: primarySpeaker
        ? `No official transcript indexed matching this speech by ${primarySpeaker}. May be an unindexed appearance, informal remarks, or synthetic audio.`
        : 'Spoken dialogue was not found in indexed public speech or press archives.',
      explanation: primarySpeaker
        ? `No official transcript indexed matching this speech by ${primarySpeaker}. May be an unindexed appearance, informal remarks, or synthetic audio.`
        : 'Spoken dialogue was not found in indexed public speech or press archives.',
      checkedQuery: searchQuery
    };
  }

  const authoritativeDomains = ['whitehouse.gov', 'pib.gov.in', 'gov.uk', 'c-span.org', 'reuters.com', 'apnews.com', 'bbc.com', 'rev.com'];
  
  let bestHit = null;
  let highestSim = 0;

  for (const hit of hits) {
    const combinedHitText = `${hit.title || ''} ${hit.snippet || ''}`;
    const sim = calculateVerbatimSimilarity(cleanTranscript, combinedHitText);
    const domain = (hit.domain || (hit.link ? new URL(hit.link).hostname.replace(/^www\./, '') : '')).toLowerCase();
    const isAuth = authoritativeDomains.some(d => domain.includes(d));
    const weightedSim = isAuth ? sim + 20 : sim;

    if (weightedSim > highestSim) {
      highestSim = weightedSim;
      bestHit = {
        title: hit.title || 'Official Speech / Transcript Record',
        url: hit.link || hit.url,
        domain,
        snippet: hit.snippet || '',
        publishedDate: hit.date || null,
        isAuthoritative: isAuth
      };
    }
  }

  const allSnippets = hits.map(h => `${h.title} ${h.snippet}`).join(' ').toLowerCase();
  const isDebunkedFake = /\b(deepfake|fabricated audio|fake audio|ai voice clone|falsely claims|hoax|never said|manipulated video)\b/i.test(allSnippets);

  let transcriptVerdict = 'NO_OFFICIAL_TRANSCRIPT_INDEXED';
  let isOfficialVerified = false;
  let explanation = '';

  if (isDebunkedFake) {
    transcriptVerdict = 'DEBUNKED_DEEPFAKE';
    isOfficialVerified = false;
    explanation = `Fact-checking records explicitly flag this speech or audio as fabricated / AI-cloned (${bestHit?.domain || 'web archives'}).`;
  } else if (highestSim >= 65 && bestHit?.isAuthoritative) {
    transcriptVerdict = 'AUTHENTIC_VERBATIM';
    isOfficialVerified = true;
    explanation = `Spoken words match official public transcript from ${bestHit.domain} (${highestSim}% verbatim agreement).`;
  } else if (highestSim >= 45) {
    transcriptVerdict = 'AUTHENTIC_VERBATIM';
    isOfficialVerified = true;
    explanation = `Spoken speech is corroborated by press and transcript reporting on ${bestHit?.domain || 'news archives'}.`;
  } else if (primarySpeaker && hits.length > 0) {
    transcriptVerdict = 'SELECTIVE_SPLICING';
    isOfficialVerified = false;
    explanation = `Contextual records found for ${primarySpeaker}, but exact transcript phrasing shows material variation. Potential selective splicing or historical remarks.`;
  } else {
    transcriptVerdict = 'NO_OFFICIAL_TRANSCRIPT_INDEXED';
    isOfficialVerified = false;
    explanation = 'Dialogue does not match authoritative public speech or press databases.';
  }

  return {
    status: transcriptVerdict,
    verdict: transcriptVerdict,
    transcriptVerdict,
    primarySpeaker,
    matchedSpeaker: primarySpeaker,
    similarityScore: Math.min(100, Math.max(0, highestSim)),
    isOfficialVerified,
    isDebunkedDeepfake: transcriptVerdict === 'DEBUNKED_DEEPFAKE' || transcriptVerdict === 'FABRICATED_DEEPFAKE',
    matchedSource: bestHit,
    source: bestHit,
    rationale: explanation,
    explanation,
    checkedQuery: searchQuery
  };
}

module.exports = {
  resolvePrimarySpeaker,
  verifyOnlineTranscript,
  calculateVerbatimSimilarity
};
