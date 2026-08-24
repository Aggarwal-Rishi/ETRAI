const { extractClaims, extractMockClaims } = require('../claimExtractor');

function isUsefulOcrText(value = '') {
  const text = String(value).replace(/\[model-extracted text\]\s*:\s*/gi, '').replace(/\s+/g, ' ').trim();
  if (text.length < 3 || /([^\p{L}\p{N}\s])\1{5,}/u.test(text)) return false;
  const compact = text.replace(/\s/g, '');
  const readableCount = (compact.match(/[\p{L}\p{N}]/gu) || []).length;
  return compact.length > 0 && readableCount / compact.length >= 0.65;
}

/**
 * Visual, Audio & Textual Media Claim Extractor
 * Feeds user claim + transcript + OCR text + visual findings into Agent 2.
 * Produces self-contained verifiable claims (e.g., "The video transcript states...").
 */
async function extractMediaClaims({ userNotes = '', transcript = '', ocrText = '', visualDescription = '', entities = [], isVideo = false }, options = {}) {
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

  // 2. Format Transcript Claim as Self-Contained Verifiable Proposition
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

  // 3. Extract OCR Text Claim (if visible text is detected on image)
  const usableOcrText = isUsefulOcrText(ocrText) ? ocrText : '';
  if (usableOcrText && usableOcrText.trim().length >= 8) {
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

  // 4. Standalone Visual Claim (if visual description supplied)
  if (visualDescription && visualDescription.trim().length >= 10) {
    const standaloneClaimText = `The submitted ${isVideo ? 'video' : 'image'} depicts ${visualDescription.replace(/\.$/, '')}.`;
    if (!claims.some(c => c.origin === 'USER_SUBMITTED_CLAIM')) {
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
  }

  // 5. Combine user claim + transcript + OCR text + visual findings for Agent 2 extraction
  const combinedContext = [
    trimmedUserClaim ? `User Submitted Context: ${trimmedUserClaim}.` : '',
    trimmedTranscript ? `Video Audio Transcript: ${trimmedTranscript}.` : '',
    usableOcrText ? `Visible OCR Text: ${usableOcrText}.` : '',
    visualDescription ? `Visual Scene Description: ${visualDescription}.` : ''
  ].filter(Boolean).join('\n\n');

  if (combinedContext.length >= 15) {
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
          origin: 'VISUAL_FINDINGS'
        });
      }
    });
  }

  if (claims.length === 0) {
    limitations.push('No user notes, audio transcript, or verifiable visual claim propositions extracted from media payload');
  }

  return {
    claims,
    entities,
    limitations
  };
}

module.exports = {
  extractMediaClaims,
  isUsefulOcrText
};
