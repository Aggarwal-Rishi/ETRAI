const { extractClaims, extractMockClaims } = require('../claimExtractor');

function isUsefulOcrText(value = '') {
  const text = String(value).replace(/\[model-extracted text\]\s*:\s*/gi, '').replace(/\s+/g, ' ').trim();
  if (text.length < 3 || /([^\p{L}\p{N}\s])\1{5,}/u.test(text)) return false;
  const compact = text.replace(/\s/g, '');
  const readableCount = (compact.match(/[\p{L}\p{N}]/gu) || []).length;
  return compact.length > 0 && readableCount / compact.length >= 0.65;
}

function isSubstantiveNewsHeadline(rawText, observed = {}) {
  if (!rawText || typeof rawText !== 'string') return false;
  const clean = rawText.trim().replace(/\s+/g, ' ');
  const words = clean.split(/\s+/).filter(Boolean);

  // Reject short snippets (< 6 words), brand slogans, apparel or billboard text
  if (words.length < 6) return false;

  const lower = clean.toLowerCase();
  const incidentalTerms = [
    'nike', 'adidas', 'puma', 'gucci', 'supreme', 'levi', 'apple', 'samsung',
    'shot on', 'getty images', 'shutterstock', 'reuters photo', 'ap photo', 'watermark',
    'billboard', 'sale', 'discount', 'buy 1', 'shop', 'exit', 'entrance', 'street'
  ];
  if (incidentalTerms.some(term => lower === term || (words.length <= 4 && lower.includes(term)))) {
    return false;
  }

  const logos = Array.isArray(observed?.logos) ? observed.logos.map(l => String(l).toLowerCase()) : [];
  const signs = Array.isArray(observed?.signs) ? observed.signs.map(s => String(s).toLowerCase()) : [];
  if (logos.some(l => lower.includes(l)) && words.length < 8) return false;
  if (signs.some(s => lower === s)) return false;

  // Must contain an assertion verb characteristic of a news headline or event proposition
  return /\b(is|are|was|were|has|have|had|announced|announces|reported|reports|arrested|arrests|killed|signed|approved|rejected|declined|passed|won|lost|launched|unveiled|declared|banned|resigned|stepped down|claims|claimed|stated|states)\b/i.test(clean);
}

/**
 * Visual, Audio & Textual Media Claim Extractor
 * Feeds user claim + transcript + OCR text + visual findings into Agent 2.
 * Produces self-contained verifiable claims (e.g., "The video transcript states...").
 */
async function extractMediaClaims({ userNotes = '', transcript = '', ocrText = '', visualDescription = '', entities = [], isVideo = false, observed = {} }, options = {}) {
  if (Array.isArray(options.mockClaims) && options.mockClaims.length > 0) {
    return {
      claims: options.mockClaims,
      entities,
      limitations: []
    };
  }

  const claims = [];
  const limitations = [];

  const trimmedUserClaim = (userNotes || '').trim();
  const trimmedTranscript = (transcript || '').trim();

  // 1. Preserve User Claim as Primary Verification Target
  if (trimmedUserClaim) {
    const formattedUserClaim = trimmedUserClaim.toLowerCase().startsWith('the submitted') || trimmedUserClaim.toLowerCase().startsWith('the video')
      ? trimmedUserClaim
      : (isVideo 
          ? `The submitted video is claimed to depict: ${trimmedUserClaim}`
          : `The submitted image is claimed to depict: ${trimmedUserClaim}`);

    const realEntities = entities.length > 0 
      ? entities 
      : (trimmedUserClaim.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || []);

    claims.push({
      id: 'media_claim_user_1',
      claimText: formattedUserClaim,
      text: formattedUserClaim,
      entities: realEntities,
      searchQuery: trimmedUserClaim,
      scope: 'National',
      importance: 'Critical',
      verifiability: 'High',
      origin: 'USER_SUBMITTED_CLAIM'
    });
  }

  // 2. Format Transcript Claim as Self-Contained Verifiable Proposition (Videos)
  if (trimmedTranscript) {
    const formattedTranscriptClaim = trimmedTranscript.toLowerCase().startsWith('the video transcript states') || trimmedTranscript.toLowerCase().startsWith('the speaker claims')
      ? trimmedTranscript
      : `The video transcript states: "${trimmedTranscript}"`;

    const realEntities = entities.length > 0
      ? entities
      : (trimmedTranscript.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || []);

    claims.push({
      id: 'media_claim_transcript_1',
      claimText: formattedTranscriptClaim,
      text: formattedTranscriptClaim,
      entities: realEntities,
      searchQuery: trimmedTranscript,
      scope: 'National',
      importance: 'High',
      verifiability: 'High',
      origin: 'VIDEO_TRANSCRIPT'
    });
  }

  // 3. Extract OCR Text Claim ONLY if it represents a substantive news headline/assertion
  const usableOcrText = isUsefulOcrText(ocrText) ? ocrText : '';
  const isHeadline = isSubstantiveNewsHeadline(usableOcrText, observed);
  if (usableOcrText && isHeadline) {
    const cleanOcr = usableOcrText.trim().replace(/\s+/g, ' ');
    const formattedOcrClaim = `The submitted media displays visible text stating: "${cleanOcr.substring(0, 240)}"`;
    claims.push({
      id: 'media_claim_ocr_1',
      claimText: formattedOcrClaim,
      text: formattedOcrClaim,
      entities: entities.length > 0 ? entities : (cleanOcr.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || []),
      searchQuery: cleanOcr.substring(0, 120),
      scope: 'National',
      importance: 'High',
      verifiability: 'High',
      origin: 'IMAGE_OCR_TEXT'
    });
  }

  // 4. Standalone Visual Claim: ONLY for videos with narration or when explicit user context was provided
  if (isVideo && visualDescription && visualDescription.trim().length >= 15 && !claims.some(c => c.origin === 'USER_SUBMITTED_CLAIM')) {
    const standaloneClaimText = `The submitted video depicts ${visualDescription.replace(/\.$/, '')}.`;
    claims.push({
      id: 'media_claim_standalone_1',
      claimText: standaloneClaimText,
      text: standaloneClaimText,
      entities: entities.length > 0 ? entities : (visualDescription.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || []),
      searchQuery: visualDescription.substring(0, 120),
      scope: 'National',
      importance: 'High',
      verifiability: 'High',
      origin: 'VISUAL_SCENE_DESCRIPTION'
    });
  }

  // 5. Only perform LLM claim decomposition if there is substantive textual/user/transcript context
  const hasSubstantiveText = Boolean(trimmedUserClaim || trimmedTranscript || (usableOcrText && isHeadline));
  if (hasSubstantiveText) {
    const combinedContext = [
      trimmedUserClaim ? `User Submitted Context: ${trimmedUserClaim}.` : '',
      trimmedTranscript ? `Video Audio Transcript: ${trimmedTranscript}.` : '',
      usableOcrText && isHeadline ? `Visible Headline OCR Text: ${usableOcrText}.` : ''
    ].filter(Boolean).join('\n\n');

    if (combinedContext.length >= 20) {
      let extracted = [];
      try {
        extracted = await extractClaims(combinedContext, options);
      } catch (e) {
        extracted = extractMockClaims(combinedContext);
      }

      const extraList = Array.isArray(extracted) ? extracted : (extracted.claims || []);
      
      extraList.forEach((c, idx) => {
        const cText = c.claimText || c.text || '';
        if (cText && !claims.some(existing => existing.claimText.toLowerCase() === cText.toLowerCase())) {
          claims.push({
            id: `media_claim_visual_${idx + 1}`,
            claimText: cText,
            text: cText,
            entities: Array.isArray(c.entities) && c.entities.length > 0 ? c.entities : entities,
            searchQuery: c.searchQuery || cText,
            scope: c.scope || 'National',
            importance: c.importance || 'High',
            verifiability: c.verifiability || 'High',
            origin: 'MEDIA_CONTEXT_DECOMPOSITION'
          });
        }
      });
    }
  }

  if (claims.length === 0) {
    limitations.push('Pure visual media without editorial news text or user claim. Evaluated via Google Lens and AI forensics.');
  }

  return {
    claims,
    entities,
    limitations,
    isPureVisualMedia: claims.length === 0
  };
}

module.exports = {
  extractMediaClaims,
  isUsefulOcrText,
  isSubstantiveNewsHeadline
};
