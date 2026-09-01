const { querySerperSearch, isUsefulOcrText } = require('./reverseImageSearch');
const { fetchImageSourceContext } = require('./imageSourceContextVerifier');
const { createGeminiClient, isKeyValid } = require('../providerManager');
const { AUDIO_SPLICE_CONFIG } = require('./videoAudioForensics');

function formatTimestamp(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = Math.floor(value % 60);
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function normalizeTokens(value = '') {
  return Array.from(new Set(String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(/\s+/)
    .filter(token => token.length >= 3)));
}

function tokenSimilarity(left = '', right = '') {
  const a = new Set(normalizeTokens(left));
  const b = new Set(normalizeTokens(right));
  if (!a.size || !b.size) return 0;
  return [...a].filter(token => b.has(token)).length / Math.max(a.size, b.size);
}

function classifyTransitionCard(frames = []) {
  const combined = frames.map(frame => `${frame.visibleText || ''} ${frame.description || ''}`).join(' ');
  return /\b(a few moments later|moments later|hours later|days later|meanwhile|to be continued|breaking news|flashback)\b/i.test(combined);
}

function searchablePublicFigureNames(publicFigures = []) {
  return Array.from(new Set(publicFigures.map(figure => {
    if (!figure || typeof figure === 'string') return null;
    const confidence = Number(figure.confidence);
    const normalizedConfidence = Number.isFinite(confidence) && confidence <= 1 ? confidence * 100 : confidence;
    return figure.name && Number.isFinite(normalizedConfidence) && normalizedConfidence >= 75 && figure.basis
      ? String(figure.name).trim()
      : null;
  }).filter(Boolean)));
}

function buildVideoSegments({ durationSeconds = 0, temporalBoundaries = [], shotCuts = {}, frames = [], transcriptSegments = [], forensics = {} }) {
  const duration = Math.max(0.1, Number(durationSeconds) || Math.max(0, ...frames.map(frame => Number(frame.timestamp || 0))) || 10);
  const values = [
    ...(temporalBoundaries || []).map(item => Number(item.timestampSec ?? item.timestamp)),
    ...((shotCuts && shotCuts.cuts) || []).map(item => Number(item.timestamp))
  ].filter(value => Number.isFinite(value) && value > 0.05 && value < duration - 0.05).sort((a, b) => a - b);
  const boundaries = values.filter((value, index) => index === 0 || value - values[index - 1] >= 0.25);
  const edges = [0, ...boundaries, duration];
  const segments = [];
  const incomingBoundary = timestamp => {
    const exact = (temporalBoundaries || []).find(item => Math.abs(Number(item.timestampSec ?? item.timestamp) - timestamp) < 0.13);
    if (exact) return {
      type: exact.boundaryType || 'SCENE_CHANGE',
      confidence: Number(exact.confidence || 0) || null,
      sceneScore: exact.sceneScore !== null && exact.sceneScore !== undefined && Number.isFinite(Number(exact.sceneScore)) ? Number(exact.sceneScore) : null,
      method: 'FFMPEG_SCENE_SCORE'
    };
    const sampled = ((shotCuts && shotCuts.cuts) || []).find(item => Math.abs(Number(item.timestamp) - timestamp) < 0.25);
    return sampled ? {
      type: sampled.transitionType || 'SCENE_CHANGE',
      confidence: Number(sampled.confidence || 0) || null,
      sceneScore: null,
      method: sampled.detectionMethod || 'FRAME_COMPARISON'
    } : null;
  };
  const uniqueValues = (segmentFrames, key) => Array.from(new Set(segmentFrames.flatMap(frame => frame[key] || []).filter(Boolean)));

  for (let index = 0; index < edges.length - 1; index += 1) {
    const startSec = Number(edges[index].toFixed(3));
    const endSec = Number(edges[index + 1].toFixed(3));
    let segmentFrames = frames.filter(frame => Number(frame.timestamp) >= startSec && Number(frame.timestamp) < endSec);
    if (!segmentFrames.length && frames.length) {
      const midpoint = (startSec + endSec) / 2;
      segmentFrames = [[...frames].sort((a, b) => Math.abs(Number(a.timestamp) - midpoint) - Math.abs(Number(b.timestamp) - midpoint))[0]];
    }
    const speech = transcriptSegments.filter(segment => Number(segment.end) > startSec && Number(segment.start) < endSec);
    const lipSyncSignal = (forensics.lipSync?.desyncSegments || []).some(item => Number(item.timestampSec) >= startSec && Number(item.timestampSec) < endSec);
    const boundary = index === 0 ? null : incomingBoundary(startSec);
    const audioComponents = Array.from(new Set(speech.map(segment => String(segment.audioType || 'UNKNOWN').toUpperCase()).filter(Boolean)));
    const acousticOverlaySignal = audioComponents.some(type => ['VOICEOVER', 'MUSIC', 'SOUND_EFFECT', 'MIXED'].includes(type));
    segments.push({
      segment_index: index + 1,
      startSec,
      endSec,
      timestamp_range: `${formatTimestamp(startSec)} - ${formatTimestamp(endSec)}`,
      boundary_in: index === 0 ? null : formatTimestamp(startSec),
      boundary_type: index === 0 ? 'VIDEO_START' : (boundary?.type || 'SCENE_CHANGE'),
      boundary_confidence: boundary?.confidence || null,
      boundary_scene_score: boundary?.sceneScore ?? null,
      boundary_detection_method: index === 0 ? null : (boundary?.method || 'UNKNOWN'),
      is_transition_card: classifyTransitionCard(segmentFrames),
      visual_summary: segmentFrames.map(frame => frame.description).filter(Boolean).join(' ').slice(0, 1800),
      visible_text: Array.from(new Set(segmentFrames.map(frame => frame.visibleText).filter(Boolean))).join(' | '),
      entities: Array.from(new Set(segmentFrames.flatMap(frame => frame.entities || []).filter(Boolean))),
      public_figures: segmentFrames.flatMap(frame => frame.publicFigures || []),
      logos: uniqueValues(segmentFrames, 'logos'),
      signs: uniqueValues(segmentFrames, 'signs'),
      landmarks: uniqueValues(segmentFrames, 'landmarks'),
      flags: uniqueValues(segmentFrames, 'flags'),
      objects: uniqueValues(segmentFrames, 'objects'),
      vehicle_markings: uniqueValues(segmentFrames, 'vehicleMarkings'),
      badges: uniqueValues(segmentFrames, 'badges'),
      uniforms: uniqueValues(segmentFrames, 'uniforms'),
      attire: uniqueValues(segmentFrames, 'attire'),
      security_details: uniqueValues(segmentFrames, 'securityDetails'),
      location_clues: Array.from(new Set(segmentFrames.flatMap(frame => frame.locationClues || []).filter(Boolean))),
      date_clues: Array.from(new Set(segmentFrames.flatMap(frame => frame.dateClues || []).filter(Boolean))),
      transcript_original: speech.map(segment => segment.text).filter(Boolean).join(' ').trim(),
      transcript_translation: speech.map(segment => segment.translatedText).filter(Boolean).join(' ').trim() || null,
      transcript_language: Array.from(new Set(speech.map(segment => segment.language).filter(Boolean))).join(', ') || null,
      audio_components: audioComponents,
      background_audio: Array.from(new Set(speech.flatMap(segment => segment.backgroundAudio || []).filter(Boolean))),
      audio_provenance: lipSyncSignal
        ? 'NON_DIEGETIC_OR_DESYNCHRONIZED_SUSPECTED'
        : (acousticOverlaySignal ? 'POSSIBLE_OVERLAY_OR_MIXED_AUDIO' : 'UNDETERMINED'),
      audio_provenance_reason: lipSyncSignal
        ? 'An explicit timestamped lip-sync inconsistency overlaps this segment.'
        : (acousticOverlaySignal
          ? `Acoustic transcription identified ${audioComponents.join(', ')}; visual correlation is still required to prove non-diegetic audio.`
          : 'No calibrated audio-to-scene provenance model established whether speech is native or overlaid.'),
      reverse_searches: segmentFrames.map(frame => frame.reverseSearch).filter(Boolean),
      source_evidence: null
    });
  }

  for (let current = 1; current < segments.length; current += 1) {
    for (let previous = 0; previous < current; previous += 1) {
      const similarity = tokenSimilarity(segments[current].transcript_original, segments[previous].transcript_original);
      if (normalizeTokens(segments[current].transcript_original).length >= 5 && similarity >= 0.82) {
        segments[current].audio_provenance = `POSSIBLE_REUSED_AUDIO_FROM_SEGMENT_${previous + 1}`;
        segments[current].audio_provenance_reason = `Transcript overlap with Segment ${previous + 1} is ${Math.round(similarity * 100)}%; acoustic identity was not independently measured.`;
        break;
      }
    }
  }
  return segments;
}

function buildSegmentSearchQuery(segment) {
  const cleanOcr = String(segment.visible_text || '').replace(/\[model-extracted text\]\s*:\s*/gi, '').trim();
  const parts = [
    isUsefulOcrText(cleanOcr) ? `"${cleanOcr.slice(0, 100)}"` : '',
    ...searchablePublicFigureNames(segment.public_figures).slice(0, 2).map(name => `"${name}"`),
    ...(segment.entities || []).slice(0, 3),
    ...(segment.logos || []).slice(0, 2),
    ...(segment.landmarks || []).slice(0, 2),
    ...(segment.location_clues || []).slice(0, 2),
    ...(segment.date_clues || []).slice(0, 2),
    segment.transcript_original ? `"${segment.transcript_original.slice(0, 100)}"` : ''
  ].filter(Boolean);
  return [...parts, 'original full video'].join(' ').slice(0, 360);
}

function buildTranscriptContextWindow(sourceText = '', clipText = '') {
  const full = String(sourceText || '').replace(/\s+/g, ' ').trim();
  const clip = String(clipText || '').replace(/\s+/g, ' ').trim();
  if (full.length < 20 || clip.length < 8) return null;
  const directIndex = full.toLocaleLowerCase().indexOf(clip.toLocaleLowerCase());
  if (directIndex >= 0) {
    return {
      before: full.slice(Math.max(0, directIndex - 500), directIndex).trim() || null,
      matched: full.slice(directIndex, directIndex + clip.length).trim(),
      after: full.slice(directIndex + clip.length, directIndex + clip.length + 500).trim() || null
    };
  }
  const sentences = full.split(/(?<=[.!?।])\s+/).filter(Boolean);
  const ranked = sentences.map((sentence, index) => ({ index, sentence, similarity: tokenSimilarity(sentence, clip) }))
    .sort((left, right) => right.similarity - left.similarity);
  const best = ranked[0];
  if (!best || best.similarity < 0.28) return null;
  return {
    before: sentences.slice(Math.max(0, best.index - 2), best.index).join(' ') || null,
    matched: best.sentence,
    after: sentences.slice(best.index + 1, best.index + 3).join(' ') || null
  };
}

async function fetchSourceContextCached(url, options = {}) {
  const cache = options.sourceContextCache;
  if (!(cache instanceof Map)) return fetchImageSourceContext(url, options);
  if (!cache.has(url)) {
    cache.set(url, fetchImageSourceContext(url, options).catch(() => ({ status: 'UNAVAILABLE' })));
  }
  return cache.get(url);
}

async function collectSegmentSourceEvidence(segment, options = {}) {
  if (Array.isArray(options.mockSegmentEvidence)) {
    return options.mockSegmentEvidence.find(item => Number(item.segment_index) === Number(segment.segment_index)) || null;
  }
  const exactFrameSearch = options.enableReverseSearch === false
    ? null
    : (segment.reverse_searches || []).find(search => search.exactMatch === true && Array.isArray(search.matches) && search.matches.length > 0);
  if (exactFrameSearch) {
    const match = exactFrameSearch.matches[0];
    let contextWindow = match.contextWindow && typeof match.contextWindow === 'object' ? match.contextWindow : null;
    let page = { status: 'UNAVAILABLE' };
    try { page = await fetchSourceContextCached(match.sourceUrl, options); } catch (_) {}
    if (!contextWindow) contextWindow = buildTranscriptContextWindow(page.videoTranscript || page.articleText || '', segment.transcript_original || segment.transcript_translation || '');
    const sourceText = [
      page.title,
      page.description,
      page.videoTranscript,
      page.articleText,
      contextWindow?.before,
      contextWindow?.matched,
      contextWindow?.after
    ].filter(Boolean).join(' ').slice(0, 12000);
    return {
      status: 'EXACT_KEYFRAME_MATCH',
      decisive: true,
      corroborative: true,
      provider: exactFrameSearch.provider,
      query: exactFrameSearch.query || buildSegmentSearchQuery(segment),
      relevance: Number.isFinite(Number(match.similarity)) ? Number(match.similarity) : 1,
      visual_match: {
        frame_timestamp: exactFrameSearch.timestamp,
        similarity: match.similarity ?? null,
        match_type: match.matchType || 'LOCALLY_VERIFIED_KEYFRAME_MATCH'
      },
      source: {
        url: page.url || match.sourceUrl,
        domain: page.domain || match.domain,
        title: page.title || match.title,
        description: page.description || null,
        publisher: page.publisher || match.publisher || null,
        publishedAt: page.publishedAt || match.publishedAt || null,
        durationSeconds: match.sourceDurationSeconds || page.videoDurationSeconds || null,
        sourceStartSec: match.sourceStartSec ?? null,
        sourceEndSec: match.sourceEndSec ?? null,
        contextWindow,
        contextualVerdict: match.contextualVerdict || null
      },
      source_text: sourceText,
      limitation: match.resolverVerified
        ? 'An original-video resolver verified this source and the keyframe was also matched visually.'
        : 'The frame is a locally verified visual match to this source; a matched frame alone does not prove that the page hosts the earliest or complete original video.'
    };
  }
  const transcriptCandidate = options.provenanceEvidence?.originalCandidate;
  if (transcriptCandidate?.sourceUrl && Number(transcriptCandidate.transcriptEvidenceScore || 0) >= 45) {
    let page = { status: 'UNAVAILABLE' };
    try { page = await fetchSourceContextCached(transcriptCandidate.sourceUrl, options); } catch (_) {}
    const clipText = segment.transcript_original || segment.transcript_translation || '';
    const sourceText = [page.videoTranscript, page.articleText, page.title, page.description, transcriptCandidate.snippet].filter(Boolean).join(' ').slice(0, 12000);
    const contextWindow = buildTranscriptContextWindow(page.videoTranscript || page.articleText || '', clipText) || transcriptCandidate.contextWindow || null;
    const relevance = tokenSimilarity(clipText, sourceText);
    return {
      status: 'TRANSCRIPT_SOURCE_MATCH',
      decisive: false,
      corroborative: Boolean(sourceText && (contextWindow || relevance >= 0.38)),
      provider: (transcriptCandidate.providers || []).join('+') || transcriptCandidate.provider || 'TRANSCRIPT_SEARCH',
      query: transcriptCandidate.searchQueries?.[0] || buildSegmentSearchQuery(segment),
      relevance: Number(Math.max(relevance, Number(transcriptCandidate.transcriptClipCoverage || 0)).toFixed(3)),
      source: {
        url: page.url || transcriptCandidate.sourceUrl,
        domain: page.domain || transcriptCandidate.domain,
        title: page.title || transcriptCandidate.title,
        description: page.description || transcriptCandidate.snippet || null,
        publisher: page.publisher || transcriptCandidate.publisher || null,
        publishedAt: page.publishedAt || transcriptCandidate.publishedAt || null,
        durationSeconds: transcriptCandidate.sourceDurationSeconds || page.videoDurationSeconds || null,
        sourceStartSec: transcriptCandidate.sourceStartSec ?? null,
        sourceEndSec: transcriptCandidate.sourceEndSec ?? null,
        contextWindow,
        contextualVerdict: transcriptCandidate.contextualVerdict || (contextWindow ? 'CONTEXT_REVIEW_REQUIRED' : null)
      },
      source_text: sourceText,
      limitation: transcriptCandidate.sourceTranscriptAvailable
        ? 'The source exposes matching transcript text and adjacent context. Transcript identity alone does not prove that every pictured frame comes from this source.'
        : 'A news report contains matching spoken phrases, but no source-hosted full transcript was available to prove exact video identity.'
    };
  }
  if (options.enableReverseSearch === false) return null;
  const apiKey = options.serperKey || process.env.SERPER_API_KEY;
  const query = buildSegmentSearchQuery(segment);
  if (!isKeyValid(apiKey) || query.length < 8) return null;
  const search = await querySerperSearch(query, apiKey, { intent: 'VIDEO_ORIGINAL' });
  const segmentText = [segment.visible_text, segment.transcript_original, ...searchablePublicFigureNames(segment.public_figures), ...(segment.entities || []), ...(segment.location_clues || [])].join(' ');
  const candidates = (search.matches || []).map(match => ({
    ...match,
    relevance: tokenSimilarity(segmentText, `${match.title || ''} ${match.snippet || ''}`)
  })).filter(match => match.relevance >= 0.28).sort((a, b) => b.relevance - a.relevance);
  const match = candidates[0];
  if (!match) return null;
  const page = await fetchSourceContextCached(match.sourceUrl, options);
  return {
    status: 'TEXT_CONTEXT_MATCH',
    decisive: false,
    corroborative: page.status === 'AVAILABLE' && match.relevance >= 0.45,
    provider: search.provider,
    query,
    relevance: Number(match.relevance.toFixed(3)),
    source: {
      url: page.url || match.sourceUrl,
      domain: page.domain || match.domain,
      title: page.title || match.title,
      description: page.description || match.snippet || null,
      publisher: page.publisher || null,
      publishedAt: page.publishedAt || match.publishedDate || null
    },
    source_text: page.status === 'AVAILABLE'
      ? [page.title, page.description, page.articleText].filter(Boolean).join(' ').slice(0, 5000)
      : `${match.title || ''} ${match.snippet || ''}`,
    limitation: 'Text search corroborates extracted clues but does not prove that the retrieved page contains this exact video frame.'
  };
}

function analyzeCrossSegmentContext(segments = [], userClaim = '') {
  const claimPresent = normalizeTokens(userClaim).length >= 4;
  const eventFor = segment => {
    const original = segment.original_event || {};
    const evidence = segment.source_evidence || {};
    const source = evidence.source || evidence;
    return {
      eventName: original.event_name || source.title || null,
      date: original.date || source.publishedAt || null,
      location: original.location || (segment.location_clues || []).join(', ') || null,
      corroborative: evidence.corroborative === true,
      decisive: evidence.decisive === true,
      sourceUrl: source.url || null
    };
  };
  const comparisons = [];
  for (let leftIndex = 0; leftIndex < segments.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < segments.length; rightIndex += 1) {
      const left = eventFor(segments[leftIndex]);
      const right = eventFor(segments[rightIndex]);
      const dateConflict = Boolean(left.date && right.date && String(left.date).toLowerCase() !== String(right.date).toLowerCase());
      const locationConflict = Boolean(left.location && right.location && tokenSimilarity(left.location, right.location) < 0.2);
      const eventNameConflict = Boolean(left.eventName && right.eventName && tokenSimilarity(left.eventName, right.eventName) < 0.25);
      const sourceGrounded = left.corroborative && right.corroborative;
      const mismatch = sourceGrounded && (dateConflict || (locationConflict && eventNameConflict));
      if (mismatch || segments[leftIndex].is_transition_card || segments[rightIndex].is_transition_card) {
        comparisons.push({
          segment_pair: [segments[leftIndex].segment_index, segments[rightIndex].segment_index],
          mismatch,
          date_conflict: dateConflict,
          location_conflict: locationConflict,
          event_name_conflict: eventNameConflict,
          source_grounded: sourceGrounded,
          exact_media_match: left.decisive && right.decisive,
          left_event: left,
          right_event: right
        });
      }
      if (comparisons.length >= 12) break;
    }
    if (comparisons.length >= 12) break;
  }
  const sourceBackedMismatch = comparisons.some(item => item.mismatch);
  const exactMismatch = comparisons.some(item => item.mismatch && item.exact_media_match);
  const decisive = Boolean(claimPresent && exactMismatch);
  let status = 'INCONCLUSIVE';
  if (decisive) status = 'SOURCE_BACKED_MISATTRIBUTION';
  else if (sourceBackedMismatch && claimPresent) status = 'POSSIBLE_MISATTRIBUTION';
  else if (sourceBackedMismatch) status = 'MULTI_EVENT_COMPILATION';
  else if (segments.some(segment => segment.is_transition_card)) status = 'POSSIBLE_COMPILATION';
  return {
    status,
    decisive,
    user_claim_present: claimPresent,
    user_claim: claimPresent ? String(userClaim).slice(0, 1000) : null,
    comparisons,
    rationale: decisive
      ? 'Exact-media evidence identifies different source events and the supplied claim links them as one account.'
      : (sourceBackedMismatch
        ? 'Retrieved text suggests different events, but text matching alone does not prove that the pages contain these exact frames.'
        : 'No source-grounded cross-segment event mismatch was established.')
  };
}

function deterministicVideoReport(segments, forensics = {}, options = {}) {
  const syntheticVisual = forensics.faceManipulation?.modelExecuted && forensics.faceManipulation?.isSyntheticFace;
  const syntheticAudio = forensics.voiceClone?.modelExecuted && forensics.voiceClone?.isSyntheticVoice;
  const memeCompilation = segments.length > 1 && segments.some(segment => segment.is_transition_card);
  const reusedAudio = segments.some(segment => String(segment.audio_provenance).startsWith('POSSIBLE_REUSED_AUDIO'));
  const confirmedSplices = Number(forensics.audioProfile?.confirmedSplicesCount || 0);
  const stitchingAnalysis = analyzeCrossSegmentContext(segments, options.userClaim || '');
  let verdict = 'Inconclusive';
  if (syntheticVisual || syntheticAudio) verdict = 'Deepfake';
  else if (memeCompilation) verdict = 'Meme Compilation';
  else if (confirmedSplices > 0) verdict = 'Manipulated';
  const scores = { Deepfake: 0.15, 'Deceptive Context': 0.4, Manipulated: 0.5, 'Meme Compilation': 0.55, Inconclusive: 0.5 };
  return {
    verdict,
    authenticity_score: scores[verdict],
    summary: verdict === 'Inconclusive'
      ? 'The clip was segmented and inspected, but available evidence does not establish authenticity or deceptive context conclusively.'
      : `The segment-level forensic assessment classified this clip as ${verdict}.`,
    segments: segments.map(segment => ({
      segment_index: segment.segment_index,
      timestamp_range: segment.timestamp_range,
      visual_authenticity: syntheticVisual ? 'Synthetic/manipulated face signal detected' : (forensics.faceManipulation?.modelExecuted ? 'No synthetic face signal detected' : 'Not independently tested'),
      audio_authenticity: syntheticAudio ? 'Synthetic voice signal detected' : segment.audio_provenance,
      transcript_original: segment.transcript_original,
      transcript_translation: segment.transcript_translation,
      transcript_language: segment.transcript_language,
      audio_components: segment.audio_components,
      is_truncated: false,
      edit_point: segment.boundary_in,
      original_event: { event_name: segment.source_evidence?.source?.title || null, date: segment.source_evidence?.source?.publishedAt || null, location: null },
      omitted_context: null,
      original_intent: null,
      actual_scene_breakdown: segment.visual_summary,
      visual_details: {
        visible_text: segment.visible_text,
        public_figures: segment.public_figures,
        vehicle_markings: segment.vehicle_markings,
        badges: segment.badges,
        uniforms: segment.uniforms,
        attire: segment.attire,
        security_details: segment.security_details,
        flags: segment.flags,
        signs: segment.signs
      },
      source_evidence: segment.source_evidence ? {
        status: segment.source_evidence.status,
        corroborative: segment.source_evidence.corroborative === true,
        decisive: segment.source_evidence.decisive === true,
        relevance: segment.source_evidence.relevance ?? null,
        url: segment.source_evidence.source?.url,
        domain: segment.source_evidence.source?.domain,
        title: segment.source_evidence.source?.title,
        publishedAt: segment.source_evidence.source?.publishedAt || null,
        durationSeconds: segment.source_evidence.source?.durationSeconds || null,
        sourceStartSec: segment.source_evidence.source?.sourceStartSec ?? null,
        sourceEndSec: segment.source_evidence.source?.sourceEndSec ?? null,
        contextWindow: segment.source_evidence.source?.contextWindow || null,
        contextualVerdict: segment.source_evidence.source?.contextualVerdict || null,
        visualMatch: segment.source_evidence.visual_match || null,
        limitation: segment.source_evidence.limitation
      } : null
    })),
    manipulation_techniques_detected: [
      ...(confirmedSplices > 0 ? ['Audio edit boundary candidate'] : []),
      ...(stitchingAnalysis.status === 'SOURCE_BACKED_MISATTRIBUTION' ? ['Source-backed temporal/event misattribution'] : []),
      ...(stitchingAnalysis.status === 'POSSIBLE_MISATTRIBUTION' ? ['Possible temporal/event misattribution requiring exact-media confirmation'] : []),
      ...(reusedAudio ? ['Possible audio reuse across visually separate segments'] : []),
      ...(memeCompilation ? ['Intertitle / meme transition card'] : [])
    ],
    stitching_analysis: stitchingAnalysis,
    full_truth_summary: 'Only source-backed event details and measured forensic signals are reported; unresolved context remains explicitly inconclusive.',
    evidence_limitations: [
      ...(!forensics.faceManipulation?.modelExecuted ? ['No configured face-manipulation model tested whether visible faces are synthetic.'] : []),
      ...(!forensics.voiceClone?.modelExecuted ? ['No configured voice-clone model tested whether speech is synthetic.'] : []),
      ...(!forensics.lipSync?.modelExecuted ? ['No calibrated audiovisual lip-sync model measured whether speech is native to the pictured speaker.'] : []),
      ...(!segments.some(segment => segment.source_evidence?.decisive === true) ? ['No exact-media segment match was available; text-context matches cannot by themselves prove an event or misattribution.'] : [])
    ]
  };
}

function normalizeScore(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number > 1 ? number / 100 : number));
}

function sanitizeContextWindow(value) {
  if (!value || typeof value !== 'object') return null;
  const clean = field => value[field] ? String(value[field]).trim().slice(0, 5000) : null;
  const window = {
    before: clean('before'),
    matched: clean('matched'),
    after: clean('after'),
    beforeStartSec: Number.isFinite(Number(value.beforeStartSec)) ? Number(value.beforeStartSec) : null,
    matchStartSec: Number.isFinite(Number(value.matchStartSec)) ? Number(value.matchStartSec) : null,
    matchEndSec: Number.isFinite(Number(value.matchEndSec)) ? Number(value.matchEndSec) : null,
    afterEndSec: Number.isFinite(Number(value.afterEndSec)) ? Number(value.afterEndSec) : null
  };
  return window.before || window.matched || window.after ? window : null;
}

function buildVideoCompletenessAssessment({ durationSeconds = 0, report = {}, provenanceEvidence = {} }) {
  const segmentEvidence = (report.segments || []).map(segment => segment.source_evidence).find(evidence => evidence?.decisive && evidence?.url) || null;
  const provenanceCandidate = provenanceEvidence.originalCandidate || null;
  const candidate = provenanceCandidate || segmentEvidence ? {
    ...(segmentEvidence ? {
      sourceUrl: segmentEvidence.url,
      title: segmentEvidence.title,
      domain: segmentEvidence.domain,
      publishedAt: segmentEvidence.publishedAt,
      sourceDurationSeconds: segmentEvidence.durationSeconds,
      sourceStartSec: segmentEvidence.sourceStartSec,
      sourceEndSec: segmentEvidence.sourceEndSec,
      contextWindow: segmentEvidence.contextWindow,
      contextualVerdict: segmentEvidence.contextualVerdict,
      exactFrameMatches: segmentEvidence.decisive ? 1 : 0,
      providers: segmentEvidence.visualMatch ? ['LOCALLY_VERIFIED_KEYFRAME_MATCH'] : [],
      confidence: 'VISUALLY_MATCHED_SOURCE_PAGE'
    } : {}),
    ...(provenanceCandidate || {}),
    sourceDurationSeconds: provenanceCandidate?.sourceDurationSeconds || segmentEvidence?.durationSeconds || null,
    sourceStartSec: provenanceCandidate?.sourceStartSec ?? segmentEvidence?.sourceStartSec ?? null,
    sourceEndSec: provenanceCandidate?.sourceEndSec ?? segmentEvidence?.sourceEndSec ?? null,
    contextWindow: provenanceCandidate?.contextWindow || segmentEvidence?.contextWindow || null,
    contextualVerdict: provenanceCandidate?.contextualVerdict || segmentEvidence?.contextualVerdict || null
  } : null;
  const uploadedDuration = Math.max(0, Number(durationSeconds) || 0);
  const originalDuration = Math.max(0, Number(candidate?.sourceDurationSeconds || 0) || 0);
  const sourceStartSec = Number.isFinite(Number(candidate?.sourceStartSec)) ? Number(candidate.sourceStartSec) : null;
  const sourceEndSec = Number.isFinite(Number(candidate?.sourceEndSec))
    ? Number(candidate.sourceEndSec)
    : (sourceStartSec !== null && uploadedDuration > 0 ? sourceStartSec + uploadedDuration : null);
  const durationRatio = originalDuration > 0 && uploadedDuration > 0 ? Math.min(1, uploadedDuration / originalDuration) : null;
  const contextWindow = sanitizeContextWindow(candidate?.contextWindow);
  const exactVisualEvidence = Boolean(candidate && (candidate.resolverVerified || Number(candidate.exactFrameMatches || 0) > 0));
  const originalVerified = candidate?.confidence === 'VERIFIED_ORIGINAL' || candidate?.resolverVerified === true;
  const strongTranscriptEvidence = Boolean(candidate && (
    candidate.confidence === 'STRONG_TRANSCRIPT_ORIGINAL_CANDIDATE' ||
    (candidate.strongTranscriptMatch === true && candidate.sourceTranscriptAvailable === true && Number(candidate.transcriptEvidenceScore || 0) >= 78)
  ));
  const sourceIdentitySupported = exactVisualEvidence || strongTranscriptEvidence;
  const strongOriginalCandidate = originalVerified || candidate?.confidence === 'STRONG_ORIGINAL_CANDIDATE' || strongTranscriptEvidence;
  const reportProvesMisrepresentation = report.verdict === 'Deceptive Context' || (report.segments || []).some(segment => segment.is_truncated === true);
  const sourceContextVerdict = String(candidate?.contextualVerdict || '').toUpperCase();
  const contextMisrepresented = reportProvesMisrepresentation || ['CONTEXT_MISREPRESENTED', 'MISLEADING_OUT_OF_CONTEXT'].includes(sourceContextVerdict);
  const contextSupported = ['CONTEXT_SUPPORTED', 'FAITHFUL_EXCERPT'].includes(sourceContextVerdict);
  const startsAtBeginning = sourceStartSec === null ? null : sourceStartSec <= Math.max(3, originalDuration * 0.02);
  const endsAtEnd = sourceEndSec === null || originalDuration <= 0 ? null : sourceEndSec >= originalDuration - Math.max(3, originalDuration * 0.02);
  const completeByTimeline = Boolean(strongOriginalCandidate && sourceStartSec !== null && sourceEndSec !== null && durationRatio !== null && durationRatio >= 0.95 && startsAtBeginning !== false && endsAtEnd !== false);

  let verdict = 'ORIGINAL_NOT_FOUND';
  let label = 'Original source not found';
  let explanation = 'No locally verified keyframe match or resolver-confirmed original video was recovered.';
  if (candidate && !sourceIdentitySupported) {
    verdict = 'POSSIBLE_SOURCE_CANDIDATE';
    label = 'Possible source candidate';
    explanation = 'Search results contain a related news or video candidate, but neither a locally verified frame match nor a strong source-hosted transcript match proves it contains this footage.';
  } else if (candidate && exactVisualEvidence && !strongOriginalCandidate) {
    verdict = 'VISUAL_SOURCE_MATCH_FOUND';
    label = 'Matching source found; original not yet confirmed';
    explanation = 'At least one keyframe matches this source, but the evidence does not establish that it is the complete or earliest original video.';
  } else if (completeByTimeline) {
    verdict = 'COMPLETE_ORIGINAL_VIDEO';
    label = 'Complete original video';
    explanation = 'The resolver-confirmed source timeline and duration align with the submitted video from beginning to end.';
  } else if (strongOriginalCandidate && contextMisrepresented) {
    verdict = 'MISLEADING_OUT_OF_CONTEXT';
    label = 'Partial clip with misleading context';
    explanation = 'Source-backed adjacent context or timeline evidence materially changes the meaning presented by the submitted clip.';
  } else if (strongOriginalCandidate && contextSupported) {
    verdict = 'FAITHFUL_EXCERPT';
    label = 'Short but contextually faithful excerpt';
    explanation = 'The submitted video is shorter than the matched source, while the available full-context comparison supports the same meaning.';
  } else if (strongOriginalCandidate && originalDuration > 0 && uploadedDuration < originalDuration * 0.95) {
    verdict = 'PARTIAL_CLIP_CONTEXT_UNVERIFIED';
    label = 'Partial clip; context not fully resolved';
    explanation = 'A longer source was identified, but the available before/after evidence is insufficient to determine whether the excerpt preserves its meaning.';
  } else if (strongOriginalCandidate) {
    verdict = 'ORIGINAL_FOUND_COMPLETENESS_UNKNOWN';
    label = 'Original candidate found; completeness unknown';
    explanation = 'The source is strongly matched, but its full duration or the clip position within it could not be established.';
  }

  const integrityVerdict = contextMisrepresented
    ? 'CONTEXT_MISREPRESENTED'
    : contextSupported
      ? 'CONTEXT_SUPPORTED'
      : contextWindow
        ? 'CONTEXT_REVIEW_REQUIRED'
        : 'INCONCLUSIVE';
  const confidence = originalVerified ? 95
    : candidate?.confidence === 'STRONG_ORIGINAL_CANDIDATE' ? 86
      : strongTranscriptEvidence ? 82
      : exactVisualEvidence ? 72
        : candidate ? 35 : 0;

  return {
    verdict,
    label,
    explanation,
    confidence,
    isComplete: verdict === 'COMPLETE_ORIGINAL_VIDEO',
    isExcerpt: ['FAITHFUL_EXCERPT', 'MISLEADING_OUT_OF_CONTEXT', 'PARTIAL_CLIP_CONTEXT_UNVERIFIED'].includes(verdict),
    contextIntegrity: {
      verdict: integrityVerdict,
      sourceGrounded: Boolean(contextWindow || reportProvesMisrepresentation),
      rationale: report.summary || explanation
    },
    uploadedDurationSeconds: uploadedDuration || null,
    originalDurationSeconds: originalDuration || null,
    durationRatio: durationRatio === null ? null : Number(durationRatio.toFixed(3)),
    matchTimeline: {
      sourceStartSec,
      sourceEndSec
    },
    contextWindow,
    source: candidate ? {
      url: candidate.sourceUrl || null,
      title: candidate.title || null,
      domain: candidate.domain || null,
      publisher: candidate.publisher || null,
      publishedAt: candidate.publishedAt || null,
      confidence: candidate.confidence || null,
      exactFrameMatches: Number(candidate.exactFrameMatches || 0),
      matchedFrameTimestamps: candidate.matchedFrameTimestamps || [],
      providers: candidate.providers || [],
      transcriptEvidenceScore: Number(candidate.transcriptEvidenceScore || 0) || null,
      transcriptMatchType: candidate.transcriptMatchType || null,
      matchedTranscriptPhrases: candidate.matchedTranscriptPhrases || []
    } : null,
    limitations: [
      ...(!candidate ? ['The original video could not be identified from the configured search providers.'] : []),
      ...(candidate && !originalDuration ? ['The matched source did not expose a reliable full-video duration.'] : []),
      ...(candidate && !contextWindow ? ['No source-backed before/after transcript window was recovered.'] : []),
      ...(strongTranscriptEvidence && !exactVisualEvidence ? ['The likely source is supported by source-hosted transcript overlap, but no keyframe match independently proves visual identity.'] : []),
      ...(candidate && !strongOriginalCandidate ? ['A related page or weak transcript clue is not by itself proof of the earliest complete original video.'] : [])
    ]
  };
}

function buildReproducibilityMetadata({ fileInfo = {}, durationSeconds = 0, temporalBoundaries = [], temporalBoundaryDetection = {}, transcriptMetadata = {}, segments = [], forensics = {} }, options = {}) {
  return {
    methodology_version: 'ETRAI_SEGMENT_CONTEXT_V3',
    input: {
      filename: fileInfo.filename || null,
      mime_type: fileInfo.mimeType || null,
      size_bytes: Number(fileInfo.sizeBytes || 0) || null,
      sha256: fileInfo.sha256 || null,
      duration_seconds: Number(durationSeconds || 0)
    },
    temporal_boundary_detection: {
      status: temporalBoundaryDetection.status || 'UNKNOWN',
      method: temporalBoundaryDetection.method || 'UNKNOWN',
      scene_threshold: temporalBoundaryDetection.threshold ?? Number(options.sceneThreshold || 0.32),
      hard_cut_threshold: temporalBoundaryDetection.hardCutThreshold ?? Number(options.hardCutThreshold || 0.65),
      boundaries: (temporalBoundaries || []).map(item => ({
        timestamp_sec: Number(item.timestampSec ?? item.timestamp),
        type: item.boundaryType || 'SCENE_CHANGE',
        scene_score: item.sceneScore ?? null,
        confidence: item.confidence ?? null
      }))
    },
    audio_splice_detection: {
      method: 'IMPULSE_CLUSTERING_WITH_RMS_DC_WINDOW_CORROBORATION',
      config: AUDIO_SPLICE_CONFIG,
      confirmed_splices: Number(forensics.audioProfile?.confirmedSplicesCount || 0)
    },
    transcription: {
      status: transcriptMetadata.provider ? 'EXECUTED' : 'UNAVAILABLE_OR_NOT_RUN',
      provider: transcriptMetadata.provider || null,
      model: transcriptMetadata.model || null,
      detected_language: transcriptMetadata.language || null
    },
    context_retrieval: {
      providers_used: Array.from(new Set(segments.map(segment => segment.source_evidence?.provider).filter(Boolean))),
      exact_media_match_required_for_misattribution_verdict: true,
      external_visual_search_consent: options.allowExternalVisualSearch === true,
      external_transcript_search_consent: options.allowExternalTranscriptSearch === true,
      public_figure_search_confidence_threshold: 75,
      reverse_searched_frames: Number(options.provenanceEvidence?.reverseSearchedFrameCount || 0),
      transcript_search_queries: Number(options.provenanceEvidence?.transcriptSearch?.executedQueryCount || 0),
      transcript_matched_sources: Number(options.provenanceEvidence?.transcriptSearch?.matchedSourceCount || 0)
    },
    configured_models: {
      report_synthesis: options.disableAi === true ? null : ((process.env.GEMINI_MODEL || 'gemini-flash-lite-latest').trim()),
      face_manipulation: forensics.faceManipulation?.modelExecuted ? (forensics.faceManipulation.modelName || 'configured detector') : null,
      voice_clone: forensics.voiceClone?.modelExecuted ? (forensics.voiceClone.modelName || 'configured detector') : null,
      audiovisual_lip_sync: forensics.lipSync?.modelExecuted ? (forensics.lipSync.modelName || 'configured detector') : null
    }
  };
}

async function synthesizeVideoReport(segments, forensics, options = {}) {
  const fallback = deterministicVideoReport(segments, forensics, options);
  if (options.disableAi === true) return fallback;
  const ai = options.geminiClient || createGeminiClient(options.geminiKey);
  if (!ai) return fallback;
  try {
    const response = await ai.models.generateContent({
      model: (process.env.GEMINI_MODEL || 'gemini-flash-lite-latest').trim(),
      contents: `Produce a source-grounded, segment-level video verification report using only this evidence.

Rules: ordinary cuts prove editing, not deception; set is_truncated=true only when supplied source text contains the omitted adjacent words; never invent omitted speech, original intent, event, date, location, identity, or source; unknown fields must be null; use Inconclusive when evidence is insufficient; Deceptive Context requires source-grounded truncation or exact-media evidence proving that different events were presented as one; transcript similarity is only a possible audio-reuse clue, not acoustic proof; preserve supplied translations faithfully.

Forensics: ${JSON.stringify({ containerAnalysis: forensics.containerAnalysis, audioProfile: { confirmedSplicesCount: forensics.audioProfile?.confirmedSplicesCount, confirmedSplices: forensics.audioProfile?.confirmedSplices }, lipSync: forensics.lipSync, faceManipulation: forensics.faceManipulation, voiceClone: forensics.voiceClone })}
Segments: ${JSON.stringify(segments)}

Return JSON only with verdict (Manipulated / Deceptive Context / Authentic / Deepfake / Meme Compilation / Inconclusive), authenticity_score (0 to 1), summary, segments, manipulation_techniques_detected, full_truth_summary, evidence_limitations. Preserve every segment_index and timestamp_range. Each segment must contain visual_authenticity, audio_authenticity, transcript_original, transcript_translation, is_truncated, edit_point, original_event {event_name,date,location}, omitted_context, original_intent, actual_scene_breakdown, source_evidence.`,
      config: { responseMimeType: 'application/json', temperature: 0.05 }
    });
    let raw = typeof response.text === 'function' ? response.text() : response.text;
    if (!raw && response.candidates?.[0]?.content?.parts) raw = response.candidates[0].content.parts.map(part => part.text || '').join('');
    const parsed = JSON.parse(String(raw || '{}').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim());
    const allowed = ['Manipulated', 'Deceptive Context', 'Authentic', 'Deepfake', 'Meme Compilation', 'Inconclusive'];
    const candidates = Array.isArray(parsed.segments) ? parsed.segments : [];
    const validatedSegments = fallback.segments.map(base => {
      const candidate = candidates.find(item => Number(item.segment_index) === Number(base.segment_index)) || {};
      const evidence = segments[base.segment_index - 1]?.source_evidence;
      const omitted = String(candidate.omitted_context || '').trim();
      const omittedTokens = normalizeTokens(omitted);
      const sourceTokens = new Set(normalizeTokens(evidence?.source_text || ''));
      const grounded = omittedTokens.length >= 3 && omittedTokens.filter(token => sourceTokens.has(token)).length / omittedTokens.length >= 0.7;
      return {
        ...base,
        ...candidate,
        segment_index: base.segment_index,
        timestamp_range: base.timestamp_range,
        edit_point: base.edit_point,
        transcript_original: base.transcript_original,
        is_truncated: Boolean(candidate.is_truncated && grounded && evidence?.corroborative),
        omitted_context: candidate.is_truncated && grounded && evidence?.corroborative ? omitted : null,
        original_intent: candidate.is_truncated && grounded && evidence?.corroborative ? (candidate.original_intent || null) : null,
        original_event: evidence?.corroborative ? (candidate.original_event || base.original_event) : base.original_event,
        source_evidence: base.source_evidence
      };
    });
    const syntheticConfirmed = Boolean(
      (forensics.faceManipulation?.modelExecuted && forensics.faceManipulation?.isSyntheticFace) ||
      (forensics.voiceClone?.modelExecuted && forensics.voiceClone?.isSyntheticVoice)
    );
    const manipulationConfirmed = Number(forensics.audioProfile?.confirmedSplicesCount || 0) > 0;
    const stitchingAnalysis = analyzeCrossSegmentContext(validatedSegments, options.userClaim || '');
    const contextualDeceptionConfirmed = validatedSegments.some(segment => segment.is_truncated === true) || stitchingAnalysis.decisive;
    const authenticTested = Boolean(
      forensics.faceManipulation?.modelExecuted &&
      forensics.voiceClone?.modelExecuted &&
      !syntheticConfirmed &&
      !manipulationConfirmed
    );
    let validatedVerdict = allowed.includes(parsed.verdict) ? parsed.verdict : fallback.verdict;
    if (validatedVerdict === 'Deepfake' && !syntheticConfirmed) validatedVerdict = fallback.verdict;
    if (validatedVerdict === 'Manipulated' && !manipulationConfirmed) validatedVerdict = fallback.verdict;
    if (validatedVerdict === 'Deceptive Context' && !contextualDeceptionConfirmed) validatedVerdict = fallback.verdict;
    if (validatedVerdict === 'Authentic' && !authenticTested) validatedVerdict = 'Inconclusive';
    const techniques = Array.from(new Set([
      ...(Array.isArray(parsed.manipulation_techniques_detected) ? parsed.manipulation_techniques_detected.map(String).slice(0, 10) : fallback.manipulation_techniques_detected),
      ...(stitchingAnalysis.status === 'SOURCE_BACKED_MISATTRIBUTION' ? ['Source-backed temporal/event misattribution'] : []),
      ...(stitchingAnalysis.status === 'POSSIBLE_MISATTRIBUTION' ? ['Possible temporal/event misattribution requiring exact-media confirmation'] : [])
    ])).slice(0, 12);
    const evidenceLimitations = Array.from(new Set([
      ...(fallback.evidence_limitations || []),
      ...(Array.isArray(parsed.evidence_limitations) ? parsed.evidence_limitations.map(String).slice(0, 10) : [])
    ])).slice(0, 14);
    return {
      ...fallback,
      ...parsed,
      verdict: validatedVerdict,
      authenticity_score: normalizeScore(parsed.authenticity_score, fallback.authenticity_score),
      segments: validatedSegments,
      stitching_analysis: stitchingAnalysis,
      manipulation_techniques_detected: techniques,
      evidence_limitations: evidenceLimitations
    };
  } catch (error) {
    return { ...fallback, synthesis_error: error.message };
  }
}

async function generateVideoContextReport({ fileInfo = {}, durationSeconds, temporalBoundaries, temporalBoundaryDetection = {}, frames, transcriptSegments, transcriptMetadata = {}, forensics, provenanceEvidence = {} }, options = {}) {
  const injectedMedia = Array.isArray(options.mockFrames) || Boolean(options.mockTranscript);
  const effectiveOptions = injectedMedia && !Array.isArray(options.mockSegmentEvidence) && !options.geminiClient
    ? { ...options, provenanceEvidence, enableReverseSearch: false, disableAi: true }
    : { ...options, provenanceEvidence };
  const evidenceOptions = { ...effectiveOptions, sourceContextCache: new Map() };
  const segments = buildVideoSegments({ durationSeconds, temporalBoundaries, shotCuts: forensics?.shotCuts, frames, transcriptSegments, forensics });
  const configuredSegmentLimit = Number(effectiveOptions.maxVideoContextSegments);
  const segmentLimit = Number.isFinite(configuredSegmentLimit) && configuredSegmentLimit > 0 ? Math.floor(configuredSegmentLimit) : 6;
  const maxSearchSegments = Math.min(segmentLimit, segments.length);
  const configuredConcurrency = Number(effectiveOptions.videoContextSearchConcurrency);
  const searchBatchSize = Number.isFinite(configuredConcurrency) && configuredConcurrency > 0
    ? Math.max(1, Math.min(Math.floor(configuredConcurrency), 3))
    : 3;
  for (let start = 0; start < maxSearchSegments; start += searchBatchSize) {
    const indexes = Array.from(
      { length: Math.min(searchBatchSize, maxSearchSegments - start) },
      (_, offset) => start + offset
    );
    const evidenceResults = await Promise.all(indexes.map(async index => {
      try {
        return await collectSegmentSourceEvidence(segments[index], evidenceOptions);
      } catch (error) {
        return { status: 'UNAVAILABLE', decisive: false, limitation: error.message, source: null };
      }
    }));
    indexes.forEach((index, offset) => {
      segments[index].source_evidence = evidenceResults[offset];
    });
  }
  const report = await synthesizeVideoReport(segments, forensics || {}, effectiveOptions);
  const completeness = buildVideoCompletenessAssessment({ durationSeconds, report, provenanceEvidence });
  const reproducibility = buildReproducibilityMetadata({ fileInfo, durationSeconds, temporalBoundaries, temporalBoundaryDetection, transcriptMetadata, segments, forensics: forensics || {} }, effectiveOptions);
  return {
    ...report,
    methodology: 'ETRAI_SEGMENT_CONTEXT_V3',
    completeness,
    provenance: { ...provenanceEvidence, completeness },
    reproducibility,
    generated_at: new Date().toISOString()
  };
}

module.exports = {
  formatTimestamp,
  tokenSimilarity,
  buildVideoSegments,
  buildSegmentSearchQuery,
  buildTranscriptContextWindow,
  collectSegmentSourceEvidence,
  analyzeCrossSegmentContext,
  deterministicVideoReport,
  buildVideoCompletenessAssessment,
  synthesizeVideoReport,
  buildReproducibilityMetadata,
  generateVideoContextReport
};
