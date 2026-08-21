/**
 * ETRAI Advanced Text and Document Analysis Engine
 * Computes word count, readability metrics (Flesch Reading Ease / Flesch-Kincaid Grade),
 * urgency & emotional language detection, attribution quality analysis, quote verification,
 * document metadata & authenticity indicators, suspicious text patterns,
 * and sentence-level factual highlight mapping.
 * 
 * CRITICAL RULE: Clearly distinguishes factual verification findings from linguistic signals.
 */

const { analyzeSentiment } = require('./sentimentService');
const { extractQuotesAndAttributions } = require('./entityIntentService');

/**
 * Counts syllables in an English word using phonetic heuristics
 */
function countSyllablesInWord(word = '') {
  const clean = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!clean || clean.length <= 3) return 1;

  // Syllable counting rules
  const vowels = clean.match(/[aeiouy]{1,2}/g);
  let count = vowels ? vowels.length : 1;

  // Drop silent trailing 'e'
  if (clean.endsWith('e') && !clean.endsWith('le') && count > 1) {
    count--;
  }

  return Math.max(1, count);
}

/**
 * Computes comprehensive readability metrics
 */
function computeReadabilityMetrics(text = '') {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return {
      wordCount: 0,
      characterCount: 0,
      sentenceCount: 0,
      readingTimeMinutes: 0.0,
      averageSentenceLength: 0.0,
      averageSyllablesPerWord: 0.0,
      fleschReadingEase: 100.0,
      fleschKincaidGrade: 0.0,
      readabilityGradeLabel: 'Very Easy'
    };
  }

  const cleanText = text.trim();
  const sentences = cleanText.split(/(?<=[.?!])\s+/).filter(s => s.trim().length > 0);
  const words = cleanText.split(/\s+/).filter(w => w.length > 0);

  const sentenceCount = Math.max(1, sentences.length);
  const wordCount = Math.max(1, words.length);
  const characterCount = cleanText.length;

  let totalSyllables = 0;
  for (const w of words) {
    totalSyllables += countSyllablesInWord(w);
  }

  const wordsPerSentence = wordCount / sentenceCount;
  const syllablesPerWord = totalSyllables / wordCount;

  // Flesch Reading Ease: 206.835 - (1.015 * ASL) - (84.6 * ASW)
  let fleschScore = 206.835 - (1.015 * wordsPerSentence) - (84.6 * syllablesPerWord);
  fleschScore = Number(Math.max(0, Math.min(100, fleschScore)).toFixed(1));

  // Flesch-Kincaid Grade Level: (0.39 * ASL) + (11.8 * ASW) - 15.59
  let gradeLevel = (0.39 * wordsPerSentence) + (11.8 * syllablesPerWord) - 15.59;
  gradeLevel = Number(Math.max(1, Math.min(18, gradeLevel)).toFixed(1));

  let readabilityGradeLabel = 'Standard';
  if (fleschScore >= 80) readabilityGradeLabel = 'Easy / Conversational';
  else if (fleschScore >= 60) readabilityGradeLabel = 'Standard (Plain Language)';
  else if (fleschScore >= 40) readabilityGradeLabel = 'Moderately Difficult';
  else readabilityGradeLabel = 'Complex / Academic';

  // Standard reading speed ~200 words per minute
  const readingTimeMinutes = Number((wordCount / 200).toFixed(1));

  return {
    wordCount,
    characterCount,
    sentenceCount,
    readingTimeMinutes,
    averageSentenceLength: Number(wordsPerSentence.toFixed(1)),
    averageSyllablesPerWord: Number(syllablesPerWord.toFixed(2)),
    fleschReadingEase: fleschScore,
    fleschKincaidGrade: gradeLevel,
    readabilityGradeLabel
  };
}

/**
 * Detects Urgency, Clickbait Framing & Emotional Language
 */
function detectUrgencyAndEmotionalLanguage(text = '') {
  if (!text || typeof text !== 'string') {
    return {
      urgencyScore: 0,
      urgencyTier: 'LOW',
      clickbaitTriggersCount: 0,
      detectedTriggers: [],
      allCapsRatio: 0.0,
      exclamationDensity: 0.0,
      explanation: 'No urgent or emotional rhetoric detected.'
    };
  }

  const lower = text.toLowerCase();
  const words = text.split(/\s+/).filter(Boolean);
  const totalWords = Math.max(1, words.length);

  // 1. Urgency & Clickbait Trigger Lexicon
  const urgencyTriggers = [
    'immediate', 'urgent', 'emergency', 'breaking', 'alert', 'warning',
    'must read', 'before it is deleted', 'share immediately', 'shocking truth',
    'unbelievable', 'secret revealed', 'hidden agenda', 'exposed', 'deadly'
  ];

  const detectedTriggers = [];
  for (const trig of urgencyTriggers) {
    if (lower.includes(trig)) {
      detectedTriggers.push(trig);
    }
  }

  // 2. All-Caps Emphasis Ratio
  const allCapsWords = words.filter(w => w.length >= 3 && w === w.toUpperCase() && /^[A-Z]+$/.test(w));
  const allCapsRatio = Number((allCapsWords.length / totalWords).toFixed(3));

  // 3. Exclamation & Punctuation Density
  const exclamationMatches = text.match(/!{1,}/g) || [];
  const exclamationDensity = Number((exclamationMatches.length / totalWords).toFixed(3));

  // 4. Sentiment Intensity Factor
  const sentiment = analyzeSentiment(text);

  let urgencyScore = Math.min(100, Math.round(
    (detectedTriggers.length * 15) +
    (allCapsRatio * 100) +
    (exclamationDensity * 150) +
    (sentiment.intensity * 20)
  ));

  let urgencyTier = 'LOW_URGENCY';
  if (urgencyScore >= 60) urgencyTier = 'HIGH_SENSATIONALISM';
  else if (urgencyScore >= 30) urgencyTier = 'MODERATE_URGENCY';

  const explanation = detectedTriggers.length > 0
    ? `Detected ${detectedTriggers.length} urgency/alarmist phrase(s) (${detectedTriggers.slice(0, 3).join(', ')}) with ${allCapsWords.length} emphasized capitalized tokens.`
    : 'Text demonstrates calm, expository language without sensationalist or urgent alarm triggers.';

  return {
    urgencyScore,
    urgencyTier,
    clickbaitTriggersCount: detectedTriggers.length,
    detectedTriggers,
    allCapsRatio,
    exclamationDensity,
    explanation
  };
}

/**
 * Evaluates Attribution Quality & Anonymous Sourcing
 */
function evaluateAttributionQuality(text = '', quotes = []) {
  if (!text || typeof text !== 'string') {
    return {
      attributionScore: 50,
      attributionGrade: 'FAIR',
      namedAttributionsCount: 0,
      vagueAttributionsCount: 0,
      vaguePhrases: [],
      explanation: 'Insufficient text to evaluate attribution quality.'
    };
  }

  const lower = text.toLowerCase();
  const vaguePhrasesFound = [];
  const vaguePatterns = [
    'sources say', 'sources claim', 'insiders reveal', 'anonymous officials',
    'viral posts claim', 'rumors suggest', 'unconfirmed reports', 'people are saying',
    'it is believed', 'unnamed spokesperson'
  ];

  for (const vp of vaguePatterns) {
    if (lower.includes(vp)) {
      vaguePhrasesFound.push(vp);
    }
  }

  const namedQuotes = quotes.filter(q => q.hasAttributedSpeaker).length;
  const vagueCount = vaguePhrasesFound.length;

  let attributionScore = 70; // baseline
  attributionScore += (namedQuotes * 10);
  attributionScore -= (vagueCount * 20);
  attributionScore = Math.max(10, Math.min(95, attributionScore));

  let attributionGrade = 'AUTHORITATIVE';
  if (attributionScore < 40) attributionGrade = 'ANONYMOUS_OR_VAGUE';
  else if (attributionScore < 65) attributionGrade = 'PARTIALLY_ATTRIBUTED';

  return {
    attributionScore,
    attributionGrade,
    namedAttributionsCount: namedQuotes,
    vagueAttributionsCount: vagueCount,
    vaguePhrases: vaguePhrasesFound,
    explanation: vagueCount > 0
      ? `Identified ${vagueCount} vague attribution phrase(s) (${vaguePhrasesFound.join(', ')}). Requires primary source cross-referencing.`
      : (namedQuotes > 0 ? `Attribution quality is high with ${namedQuotes} directly attributed statement(s).` : 'Text contains general factual assertions without direct quotes.')
  };
}

/**
 * Detects Suspicious Text Patterns (Prompt Injection markers, synthetic AI boilerplate)
 */
function detectSuspiciousTextPatterns(text = '') {
  if (!text || typeof text !== 'string') {
    return { hasSuspiciousPatterns: false, detectedPatterns: [] };
  }

  const lower = text.toLowerCase();
  const detectedPatterns = [];

  // 1. Prompt Injection Delimiters
  if (text.match(/(\[SYSTEM\]|<SYSTEM>|IGNORE PREVIOUS INSTRUCTIONS|YOU ARE NOW|DAN MODE)/i)) {
    detectedPatterns.push({
      type: 'PROMPT_INJECTION_MARKER',
      severity: 'CRITICAL',
      explanation: 'Detected adversarial prompt injection sequence attempt in text body.'
    });
  }

  // 2. Synthetic AI Model Boilerplate
  if (lower.match(/\b(as an ai language model|as an ai developed by|i do not have access to real-time|my knowledge cutoff)\b/i)) {
    detectedPatterns.push({
      type: 'SYNTHETIC_AI_BOILERPLATE',
      severity: 'MEDIUM',
      explanation: 'Text contains boilerplate responses characteristic of synthetic LLM generation.'
    });
  }

  // 3. Repeated Boilerplate
  const sentences = text.split(/(?<=[.?!])\s+/).map(s => s.trim().toLowerCase());
  const duplicates = sentences.filter((s, idx) => s.length > 25 && sentences.indexOf(s) !== idx);
  if (duplicates.length > 0) {
    detectedPatterns.push({
      type: 'REPETITIVE_BOILERPLATE',
      severity: 'LOW',
      explanation: `Detected ${duplicates.length} duplicate repetitive sentence span(s).`
    });
  }

  return {
    hasSuspiciousPatterns: detectedPatterns.length > 0,
    detectedPatterns
  };
}

/**
 * Maps Sentence-Level Factual Highlighting based on verified claim evidence
 */
function mapSentenceFactualHighlights(text = '', verifiedClaims = []) {
  if (!text || typeof text !== 'string') return [];

  const sentences = text.split(/(?<=[.?!])\s+/).filter(s => s.trim().length > 0);

  return sentences.map((sentence, idx) => {
    const cleanSentence = sentence.trim();
    const sentenceLower = cleanSentence.toLowerCase();

    // Check if sentence correlates with any verified claim
    let highlightStatus = 'NEUTRAL'; // NEUTRAL | SUPPORTED | UNVERIFIED | REFUTED
    let matchingClaim = null;

    for (const claim of verifiedClaims) {
      const claimTextLower = (claim.claimText || claim.text || '').toLowerCase();
      // Match if sentence contains claim keywords or vice versa
      if (sentenceLower.includes(claimTextLower) || claimTextLower.includes(sentenceLower.substring(0, 40))) {
        matchingClaim = claim;
        if (claim.verdict === 'VERIFIED' || claim.status === 'TRUSTED') {
          highlightStatus = 'SUPPORTED';
        } else if (claim.verdict === 'FALSE' || claim.status === 'REFUTED') {
          highlightStatus = 'REFUTED';
        } else {
          highlightStatus = 'UNVERIFIED';
        }
        break;
      }
    }

    return {
      sentenceIndex: idx + 1,
      text: cleanSentence,
      highlightStatus,
      claimId: matchingClaim?.id || null,
      verdict: matchingClaim?.verdict || null,
      tooltip: highlightStatus === 'REFUTED'
        ? `Contradicted statement: ${matchingClaim?.reasoning || 'Refuted by authoritative evidence'}`
        : (highlightStatus === 'SUPPORTED' ? 'Corroborated by verified sources' : 'Standard descriptive statement')
    };
  });
}

/**
 * Master Advanced Text and Document Analysis Pipeline
 */
async function performAdvancedTextAnalysis(text = '', documentMetadata = null, verifiedClaims = [], options = {}) {
  // 1. Readability Metrics
  const readability = computeReadabilityMetrics(text);

  // 2. Urgency & Emotional Language Detection
  const urgency = detectUrgencyAndEmotionalLanguage(text);

  // 3. Quotes & Attribution Analysis
  const quotes = extractQuotesAndAttributions(text);
  const attribution = evaluateAttributionQuality(text, quotes);

  // 4. Suspicious Text Patterns
  const patternAudit = detectSuspiciousTextPatterns(text);

  // 5. Sentence-Level Factual Highlighting
  const highlights = mapSentenceFactualHighlights(text, verifiedClaims);

  // 6. Document Authenticity Indicators (if document metadata supplied)
  const docAuthenticity = {
    hasDocumentMetadata: Boolean(documentMetadata),
    pageCount: documentMetadata?.pageCount || null,
    author: documentMetadata?.author || null,
    publisher: documentMetadata?.publisher || null,
    publishedAt: documentMetadata?.publishedAt || null,
    mimeType: documentMetadata?.mimeType || 'text/plain',
    sha256: documentMetadata?.sha256 || null,
    integrityStatus: documentMetadata ? 'METADATA_EXTRACTED' : 'PLAIN_PROSE_INPUT'
  };

  return {
    readability,
    urgency,
    attribution,
    quotesCount: quotes.length,
    quotes,
    patternAudit,
    docAuthenticity,
    highlightsCount: highlights.length,
    highlights,
    summary: {
      wordCount: readability.wordCount,
      fleschReadingEase: readability.fleschReadingEase,
      urgencyScore: urgency.urgencyScore,
      attributionGrade: attribution.attributionGrade,
      refutedSentencesCount: highlights.filter(h => h.highlightStatus === 'REFUTED').length,
      supportedSentencesCount: highlights.filter(h => h.highlightStatus === 'SUPPORTED').length
    }
  };
}

module.exports = {
  performAdvancedTextAnalysis,
  computeReadabilityMetrics,
  detectUrgencyAndEmotionalLanguage,
  evaluateAttributionQuality,
  detectSuspiciousTextPatterns,
  mapSentenceFactualHighlights,
  countSyllablesInWord
};
