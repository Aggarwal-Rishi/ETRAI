const { extractClaims, extractMockClaims } = require('../claimExtractor');

function isUsefulOcrText(value = '') {
  const text = String(value).replace(/\[model-extracted text\]\s*:\s*/gi, '').replace(/\s+/g, ' ').trim();
  if (text.length < 15 || /([^\p{L}\p{N}\s])\1{4,}/u.test(text)) return false;
  
  // Reject binary metadata artifacts and camera container strings
  const lower = text.toLowerCase();
  const binaryArtifacts = ['jfif', 'icc_profile', 'exif', 'adobe photoshop', 'dall-e', 'midjourney', 'stable diffusion', 'srgb'];
  if (binaryArtifacts.some(tag => lower.includes(tag)) && text.length < 60) return false;

  const compact = text.replace(/\s/g, '');
  const readableCount = (compact.match(/[\p{L}\p{N}]/gu) || []).length;
  if (compact.length === 0 || readableCount / compact.length < 0.75) return false;

  const words = text.split(/\s+/).filter(w => w.length >= 2);
  if (words.length < 4) return false;

  const incidentalTerms = ['nike', 'adidas', 'puma', 'gucci', 'supreme', 'levi', 'apple', 'samsung', 'shot on', 'getty', 'shutterstock', 'watermark'];
  if (incidentalTerms.some(term => lower.includes(term)) && words.length < 7) return false;

  return true;
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
    'billboard', 'sale', 'discount', 'buy 1', 'shop', 'exit', 'entrance', 'street',
    'canon', 'nikon', 'sony', 'fujifilm', 'leica', 'adobe', 'photoshop', 'lightroom',
    'midjourney', 'stable diffusion', 'dall-e', 'exif', 'jfif', 'icc'
  ];
  if (incidentalTerms.some(term => lower === term || (words.length <= 4 && lower.includes(term)))) {
    return false;
  }

  const logos = Array.isArray(observed?.logos) ? observed.logos.map(l => String(l).toLowerCase()) : [];
  const signs = Array.isArray(observed?.signs) ? observed.signs.map(s => String(s).toLowerCase()) : [];
  if (logos.some(l => lower.includes(l)) && words.length < 8) return false;
  if (signs.some(s => lower === s)) return false;

  // Must contain an assertion verb characteristic of a news headline or event proposition
  return /\b(is|are|was|were|has|have|had|announced|announces|reported|reports|arrested|arrests|killed|signed|signs|approved|approves|rejected|rejects|declined|declines|passed|passes|blocked|blocks|won|wins|lost|loses|launched|launches|unveiled|unveils|declared|declares|banned|bans|resigned|resigns|stepped down|claims|claimed|stated|states)\b/i.test(clean);
}

/**
 * Visual, Audio & Textual Media Claim Extractor
 * Feeds user claim + transcript + OCR text + visual findings into Agent 2.
 * Produces self-contained verifiable claims (e.g., "The video transcript states...").
 */
async function extractMediaClaims({ userNotes = '', transcript = '', ocrText = '', visualDescription = '', entities = [], isVideo = false, observed = {}, onScreenHeadlines = [], audioBreakdown = null }, options = {}) {
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
  const isSongOrMusic = Boolean(
    audioBreakdown?.isSongOrMusic ||
    audioBreakdown?.isPureSongOrMusic ||
    audioBreakdown?.dominantType === 'SONG_VOCALS' ||
    audioBreakdown?.dominantType === 'MUSIC_BGM'
  );

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
  // CRITICAL: Reject song lyrics or musical BGM from generating factual propositions!
  if (trimmedTranscript && !isSongOrMusic) {
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
      origin: 'VIDEO_TRANSCRIPT',
      sourceRole: 'VIDEO_TRANSCRIPT'
    });
  }

  // 3. Dedicated On-Screen News Headline Claims (Videos & Images)
  if (Array.isArray(onScreenHeadlines) && onScreenHeadlines.length > 0) {
    onScreenHeadlines.slice(0, 3).forEach((hl, idx) => {
      const headlineText = (hl.headlineText || hl.text || '').trim();
      if (headlineText && !claims.some(c => c.searchQuery === headlineText)) {
        claims.push({
          id: `media_claim_headline_${idx + 1}`,
          claimText: `The video displays an on-screen breaking news banner stating: "${headlineText}"`,
          text: `The video displays an on-screen breaking news banner stating: "${headlineText}"`,
          entities: hl.entities || entities || [],
          searchQuery: headlineText,
          scope: 'National',
          importance: 'High',
          verifiability: 'High',
          origin: 'VIDEO_ON_SCREEN_HEADLINE',
          sourceRole: 'VIDEO_ON_SCREEN_HEADLINE',
          headlineMetadata: hl
        });
      }
    });
  }

  // 3B. Extract OCR Text Claim ONLY if it represents a substantive news headline/assertion (if not already added)
  const usableOcrText = isUsefulOcrText(ocrText) ? ocrText : '';
  const isHeadline = isSubstantiveNewsHeadline(usableOcrText, observed);
  if (usableOcrText && isHeadline && !claims.some(c => c.origin === 'VIDEO_ON_SCREEN_HEADLINE')) {
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
      origin: isVideo ? 'VIDEO_ON_SCREEN_HEADLINE' : 'IMAGE_OCR_TEXT'
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
  const hasSubstantiveText = Boolean(trimmedUserClaim || (trimmedTranscript && !isSongOrMusic) || (usableOcrText && isHeadline));
  if (hasSubstantiveText) {
    const combinedContext = [
      trimmedUserClaim ? `User Submitted Context: ${trimmedUserClaim}.` : '',
      trimmedTranscript && !isSongOrMusic ? `Video Audio Transcript: ${trimmedTranscript}.` : '',
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
