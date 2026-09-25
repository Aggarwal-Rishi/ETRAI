const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync, spawnSync } = require('child_process');
const bundledFfmpegPath = require('ffmpeg-static');
const { GoogleGenAI } = require('@google/genai');
const sharp = require('sharp');
const { getProviderStatus, isKeyValid } = require('../providerManager');
const { extractMediaMetadata } = require('./mediaMetadata');
const { analyzeImage } = require('./imageAnalyzer');
const { extractOcrText } = require('./ocrService');

async function createFrameDifferenceHash(buffer) {
  const pixels = await sharp(buffer)
    .rotate()
    .resize(9, 8, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer();
  let hash = '';
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const offset = row * 9 + col;
      hash += pixels[offset] > pixels[offset + 1] ? '1' : '0';
    }
  }
  return hash;
}

/**
 * Checks if system FFmpeg CLI tool is available on system PATH
 */
function isFfmpegAvailable() {
  try {
    execFileSync(bundledFfmpegPath || 'ffmpeg', ['-version'], { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Detects real scene boundaries from the encoded video timeline. Unlike the
 * legacy evenly-spaced keyframe comparison, FFmpeg's scene score reports the
 * timestamp of the transition itself. Test callers may inject explicit
 * boundaries without invoking FFmpeg.
 */
function detectTemporalBoundaries(fileInfo, buffer = null, options = {}) {
  if (Array.isArray(options.mockTemporalBoundaries)) {
    const hardCutThreshold = Number(options.hardCutThreshold || 0.65);
    return {
      status: 'AVAILABLE',
      method: 'INJECTED_TEST_BOUNDARIES',
      boundaries: options.mockTemporalBoundaries.map((item, index) => ({
        boundaryId: item.boundaryId || `boundary_${index + 1}`,
        timestampSec: Number(item.timestampSec ?? item.timestamp ?? 0),
        boundaryType: item.boundaryType || (Number(item.sceneScore || 0) >= hardCutThreshold ? 'HARD_CUT' : 'SCENE_TRANSITION'),
        confidence: Number(item.confidence || 90),
        sceneScore: Number(item.sceneScore || 0)
      })).filter(item => item.timestampSec > 0),
      limitations: []
    };
  }

  if (!buffer || !Buffer.isBuffer(buffer) || !isFfmpegAvailable()) {
    return {
      status: 'UNAVAILABLE',
      method: 'FFMPEG_SCENE_SCORE',
      boundaries: [],
      limitations: ['Exact temporal boundary detection requires a decodable video and FFmpeg.']
    };
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'etrai_video_boundaries_'));
  const safeName = path.basename(fileInfo.filename || 'video.mp4').replace(/[^a-zA-Z0-9._-]/g, '_');
  const inputPath = path.join(tmpDir, `input_${Date.now()}_${safeName}`);
  try {
    fs.writeFileSync(inputPath, buffer);
    const sceneThreshold = Number(options.sceneThreshold || 0.32);
    const hardCutThreshold = Number(options.hardCutThreshold || 0.65);
    const result = spawnSync(bundledFfmpegPath || 'ffmpeg', [
      '-hide_banner', '-i', inputPath,
      '-vf', `select=gt(scene\\,${sceneThreshold}),metadata=print`,
      '-an', '-vsync', 'vfr', '-f', 'null', '-'
    ], { encoding: 'utf8', maxBuffer: 12 * 1024 * 1024, timeout: 15000 });
    const diagnosticText = `${result.stderr || ''}\n${result.stdout || ''}`;
    const detected = [];
    const metadataRegex = /frame:\d+\s+pts:[^\s]+\s+pts_time:([0-9]+(?:\.[0-9]+)?)[\s\S]{0,500}?lavfi\.scene_score=([0-9]+(?:\.[0-9]+)?)/g;
    let match;
    while ((match = metadataRegex.exec(diagnosticText)) !== null) {
      const timestampSec = Number(Number(match[1]).toFixed(3));
      const sceneScore = Number(Number(match[2]).toFixed(4));
      if (timestampSec > 0.05 && !detected.some(value => Math.abs(value.timestampSec - timestampSec) < 0.12)) {
        detected.push({ timestampSec, sceneScore });
      }
    }

    // Older FFmpeg builds may omit metadata values even though they print the
    // selected timestamps. Retain those boundaries, but label their type as
    // unknown rather than inventing a hard-cut score.
    if (detected.length === 0) {
      const timestampRegex = /pts_time:([0-9]+(?:\.[0-9]+)?)/g;
      while ((match = timestampRegex.exec(diagnosticText)) !== null) {
        const timestampSec = Number(Number(match[1]).toFixed(3));
        if (timestampSec > 0.05 && !detected.some(value => Math.abs(value.timestampSec - timestampSec) < 0.12)) {
          detected.push({ timestampSec, sceneScore: null });
        }
      }
    }

    return {
      status: result.error ? 'ERROR' : 'AVAILABLE',
      method: 'FFMPEG_SCENE_SCORE',
      threshold: sceneThreshold,
      hardCutThreshold,
      boundaries: detected.slice(0, 30).map((item, index) => ({
        boundaryId: `boundary_${index + 1}`,
        timestampSec: item.timestampSec,
        boundaryType: item.sceneScore === null ? 'SCENE_CHANGE' : (item.sceneScore >= hardCutThreshold ? 'HARD_CUT' : 'SCENE_TRANSITION'),
        confidence: item.sceneScore === null ? 75 : Math.min(99, Math.round(72 + item.sceneScore * 27)),
        sceneScore: item.sceneScore
      })),
      limitations: result.error ? [`FFmpeg scene-boundary analysis failed: ${result.error.message}`] : []
    };
  } catch (error) {
    return {
      status: 'ERROR',
      method: 'FFMPEG_SCENE_SCORE',
      boundaries: [],
      limitations: [`FFmpeg scene-boundary analysis failed: ${error.message}`]
    };
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }
}

function buildRepresentativeTimestamps(duration, boundaries = [], sampleCount = 5) {
  const safeDuration = Math.max(0.2, Number(duration) || 10);
  const boundaryTimes = boundaries
    .map(item => Number(item.timestampSec ?? item.timestamp))
    .filter(value => Number.isFinite(value) && value > 0.05 && value < safeDuration - 0.05)
    .sort((a, b) => a - b);
  const segmentEdges = [0, ...boundaryTimes, safeDuration];
  const representatives = [0];
  for (let index = 0; index < segmentEdges.length - 1; index += 1) {
    const start = segmentEdges[index];
    const end = segmentEdges[index + 1];
    representatives.push(Number(Math.min(safeDuration - 0.05, start + 0.08).toFixed(3)));
    if (end - start > 12) representatives.push(Number(((start + end) / 2).toFixed(3)));
  }
  representatives.push(Number(Math.max(0, safeDuration - 0.08).toFixed(3)));

  if (boundaryTimes.length === 0) {
    for (let index = 0; index < sampleCount; index += 1) {
      representatives.push(Number(((index / Math.max(1, sampleCount - 1)) * (safeDuration - 0.08)).toFixed(3)));
    }
  }
  return Array.from(new Set(representatives)).sort((a, b) => a - b).slice(0, 14);
}

/**
 * Extracts video container metadata using FFprobe if available, or buffer header parser fallback.
 */
async function getVideoMetadata(fileInfo, buffer = null, options = {}) {
  const metaRes = extractMediaMetadata(fileInfo, buffer, options.mockMetadata);
  const limitations = [...(metaRes.limitations || [])];

  const hasFfmpeg = isFfmpegAvailable();
  if (!hasFfmpeg) {
    limitations.push('FFmpeg/FFprobe binary not detected on system PATH. Header atom parser used for container metadata');
  }

  return {
    metadata: metaRes.metadata,
    hasFfmpeg,
    limitations
  };
}

/**
 * Keyframe Sampling Service
 * Samples first frame (0.0s), last frame (duration), and evenly distributed frames across video.
 * Uses temporary directory and CLEANS UP temporary files immediately after reading.
 */
async function extractKeyframes(fileInfo, buffer = null, url = null, options = {}) {
  const sampleCount = options.sampleCount || 3;
  const keyframes = [];
  const limitations = [];

  // Option A: Caller-provided mock keyframe buffers for unit testing / environments without FFmpeg
  if (Array.isArray(options.mockFrames) && options.mockFrames.length > 0) {
    return {
      status: 'AVAILABLE',
      keyframes: options.mockFrames.map((f, idx) => ({
        frameIndex: idx,
        timestamp: typeof f.timestamp === 'number' ? f.timestamp : Number((idx * 2.5).toFixed(1)),
        buffer: f.buffer || Buffer.from('mock_frame_jpeg_bytes'),
        mimeType: 'image/jpeg',
        description: f.description || '',
        entities: f.entities || []
      })),
      limitations: []
    };
  }

  const hasFfmpeg = isFfmpegAvailable();
  if (!hasFfmpeg || !buffer || !Buffer.isBuffer(buffer)) {
    return {
      status: 'UNAVAILABLE',
      keyframes: [],
      limitations: ['FFmpeg binary unavailable on host system for video frame sampling']
    };
  }

  // Option B: Real FFmpeg frame sampling using temporary directory
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'etrai_video_frames_'));
  const inputPath = path.join(tmpDir, `input_${Date.now()}_${fileInfo.filename}`);

  try {
    fs.writeFileSync(inputPath, buffer);
    const metaRes = extractMediaMetadata(fileInfo, buffer, options.mockMetadata);
    const duration = metaRes.metadata.durationSeconds || 10.0;

    // Sample immediately inside each detected segment plus long-segment
    // midpoints. With no detected boundary this falls back to even coverage.
    const timestamps = buildRepresentativeTimestamps(duration, options.boundaryTimestamps || [], sampleCount);
    for (let idx = 0; idx < timestamps.length; idx += 1) {
      const calcTimestamp = timestamps[idx];
      const fPath = path.join(tmpDir, `frame_${String(idx).padStart(3, '0')}.jpg`);
      execFileSync(bundledFfmpegPath || 'ffmpeg', [
        '-y', '-ss', String(calcTimestamp), '-i', inputPath,
        '-frames:v', '1', '-q:v', '3', fPath
      ], { stdio: 'ignore', timeout: 10000 });
      if (!fs.existsSync(fPath)) continue;
      const fBuffer = fs.readFileSync(fPath);
      keyframes.push({
        frameIndex: idx,
        timestamp: calcTimestamp,
        buffer: fBuffer,
        mimeType: 'image/jpeg',
        dHash: await createFrameDifferenceHash(fBuffer)
      });
    }

    return {
      status: keyframes.length > 0 ? 'AVAILABLE' : 'NO_FRAMES_EXTRACTED',
      keyframes,
      limitations: keyframes.length === 0 ? ['FFmpeg sampling produced zero frame images'] : []
    };
  } catch (e) {
    return {
      status: 'ERROR',
      keyframes: [],
      limitations: [`FFmpeg frame extraction failed: ${e.message}`]
    };
  } finally {
    // PART 13: CLEANUP - Delete temporary files/directories
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch (cleanupErr) {
      // Ignore cleanup error
    }
  }
}

/**
 * Audio Track Extraction Service
 * Extracts audio track into temporary audio file using FFmpeg.
 * CLEANS UP temporary files immediately after reading.
 */
async function extractAudio(fileInfo, buffer = null, options = {}) {
  if (options.mockAudioBuffer) {
    return {
      status: 'AVAILABLE',
      audioBuffer: options.mockAudioBuffer,
      pcmAudioBuffer: options.mockPcmAudioBuffer || options.mockAudioBuffer,
      pcmSampleFormat: options.mockPcmSampleFormat || 'u8',
      mimeType: 'audio/mp3',
      limitations: []
    };
  }

  const hasFfmpeg = isFfmpegAvailable();
  if (!hasFfmpeg || !buffer || !Buffer.isBuffer(buffer)) {
    return {
      status: 'UNAVAILABLE',
      audioBuffer: null,
      limitations: ['FFmpeg binary unavailable on host system for audio track extraction']
    };
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'etrai_video_audio_'));
  const inputPath = path.join(tmpDir, `input_${Date.now()}_${fileInfo.filename}`);
  const outputPath = path.join(tmpDir, 'extracted_audio.mp3');
  const pcmPath = path.join(tmpDir, 'forensic_audio.pcm');

  try {
    fs.writeFileSync(inputPath, buffer);
    execFileSync(bundledFfmpegPath || 'ffmpeg', ['-y', '-i', inputPath, '-vn', '-acodec', 'libmp3lame', '-q:a', '4', outputPath], { stdio: 'ignore', timeout: 15000 });
    execFileSync(bundledFfmpegPath || 'ffmpeg', ['-y', '-i', inputPath, '-vn', '-ac', '1', '-ar', '16000', '-f', 's16le', pcmPath], { stdio: 'ignore', timeout: 15000 });

    if (fs.existsSync(outputPath)) {
      const audioBuffer = fs.readFileSync(outputPath);
      const pcmAudioBuffer = fs.existsSync(pcmPath) ? fs.readFileSync(pcmPath) : null;
      return {
        status: 'AVAILABLE',
        audioBuffer,
        pcmAudioBuffer,
        pcmSampleFormat: pcmAudioBuffer ? 's16le' : null,
        audioPath: outputPath,
        mimeType: 'audio/mp3',
        limitations: []
      };
    }

    return {
      status: 'NO_AUDIO_TRACK',
      audioBuffer: null,
      limitations: ['No audio stream detected in video container']
    };
  } catch (e) {
    return {
      status: 'ERROR',
      audioBuffer: null,
      limitations: [`FFmpeg audio extraction error: ${e.message}`]
    };
  } finally {
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch (e) {}
  }
}

/**
 * Audio Speech-to-Text Transcription Service (Whisper API)
 * Returns language-aware text plus timestamped speech/audio components. Audio
 * type is an acoustic observation; diegetic/non-diegetic provenance is only
 * decided later when it can be compared with the visual stream.
 * Returns explicit UNAVAILABLE state when key/audio is missing. NEVER fabricates transcripts.
 */
async function transcribeAudio(audioBuffer = null, options = {}) {
  // Option A: Mock transcript passed explicitly for unit testing
  if (options.mockTranscript) {
    const mock = typeof options.mockTranscript === 'string'
      ? { text: options.mockTranscript }
      : options.mockTranscript;
    const isSong = Boolean(mock.isSongOrMusic || options.isSongOrMusic || mock.audioType === 'SONG_VOCALS' || mock.audioType === 'MUSIC' || mock.audioType === 'MUSIC_BGM');
    const defaultSegment = {
      start: 0.0,
      end: 5.0,
      text: isSong ? '' : (mock.text || ''),
      translatedText: isSong ? '' : (mock.translatedText || ''),
      language: mock.language || null,
      audioType: isSong ? 'SONG_VOCALS' : (mock.audioType || 'SPEECH'),
      backgroundAudio: isSong ? ['music'] : []
    };
    return {
      status: isSong ? 'SONG_OR_MUSIC_ONLY' : (mock.text ? 'AVAILABLE' : 'NO_SPEECH_DETECTED'),
      text: isSong ? '' : (mock.text || ''),
      translatedText: isSong ? '' : (mock.translatedText || ''),
      language: mock.language || null,
      segments: Array.isArray(mock.segments) ? mock.segments.map(segment => ({ ...defaultSegment, ...segment })) : [defaultSegment],
      audioBreakdown: {
        hasSpokenSpeech: !isSong && Boolean(mock.text),
        isSongOrMusic: isSong,
        speechPercentage: isSong ? 0 : (mock.speechPercentage !== undefined ? mock.speechPercentage : 100),
        musicPercentage: isSong ? 100 : (mock.musicPercentage !== undefined ? mock.musicPercentage : 0),
        songSegmentsCount: isSong ? 1 : 0,
        speechSegmentsCount: isSong ? 0 : 1
      },
      provider: 'INJECTED_TEST_TRANSCRIPT',
      limitations: []
    };
  }

  const geminiKey = options.geminiKey || process.env.GEMINI_API_KEY;
  const hasGemini = isKeyValid(geminiKey);

  if (!hasGemini) {
    return {
      status: 'UNAVAILABLE',
      text: '',
      translatedText: '',
      language: null,
      segments: [],
      limitations: ['Audio transcription provider unavailable (missing GEMINI_API_KEY)']
    };
  }

  if (!audioBuffer || !Buffer.isBuffer(audioBuffer)) {
    return {
      status: 'UNAVAILABLE',
      text: '',
      translatedText: '',
      language: null,
      segments: [],
      limitations: ['No extracted audio buffer available for speech-to-text transcription']
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const modelName = (process.env.GEMINI_FLASH_MODEL || process.env.GEMINI_MEDIA_MODEL || 'gemini-3.5-flash').trim();

    const response = await ai.models.generateContent({
      model: modelName,
      contents: [
        `Transcribe spoken dialogue in this audio accurately.
CRITICAL RULES:
1. DO NOT transcribe singing, song lyrics, or background music as spoken speech.
2. Classify audio components into audioType: "SPEECH", "VOICEOVER", "SONG_VOCALS", "MUSIC_BGM", "SOUND_EFFECT", "AMBIENT", or "UNKNOWN".
3. The root "text" field MUST ONLY contain human spoken speech / dialogue / news reporting. If the audio contains ONLY songs or background music and NO spoken dialogue, set "text" to "".
Output ONLY JSON matching:
{
  "text": "spoken human dialogue only (empty string if song/music only)",
  "translatedText": "English translation of spoken dialogue or empty",
  "language": "BCP-47 or plain language name",
  "isSongOrMusic": false,
  "speechPercentage": 85,
  "musicPercentage": 15,
  "segments": [
    {
      "start": 0.0,
      "end": 5.0,
      "text": "spoken dialogue or lyrics",
      "translatedText": "translation",
      "language": "en",
      "audioType": "SPEECH",
      "backgroundAudio": ["music", "crowd"]
    }
  ]
}`,
        {
          inlineData: {
            mimeType: 'audio/mp3',
            data: audioBuffer.toString('base64')
          }
        }
      ],
      config: {
        responseMimeType: 'application/json',
        temperature: 0.0
      }
    });

    let rawText = null;
    if (typeof response.text === 'string') rawText = response.text;
    else if (typeof response.text === 'function') rawText = response.text();
    else if (response.candidates?.[0]?.content?.parts) {
      rawText = response.candidates[0].content.parts.map(p => p.text || '').join('');
    }

    const parsed = JSON.parse((rawText || '{}').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim());

    const allowedAudioTypes = new Set(['SPEECH', 'VOICEOVER', 'SONG_VOCALS', 'MUSIC_BGM', 'MUSIC', 'SOUND_EFFECT', 'AMBIENT', 'MIXED', 'UNKNOWN']);
    const rawSegments = Array.isArray(parsed.segments) ? parsed.segments : [];
    const segments = rawSegments.map(s => {
      const type = allowedAudioTypes.has(String(s.audioType || '').toUpperCase()) ? String(s.audioType).toUpperCase() : 'UNKNOWN';
      return {
        start: Number(Number(s.start || 0).toFixed(1)),
        end: Number(Number(s.end || 0).toFixed(1)),
        text: (s.text || '').trim(),
        translatedText: (s.translatedText || '').trim(),
        language: s.language ? String(s.language).trim() : (parsed.language ? String(parsed.language).trim() : null),
        audioType: type,
        backgroundAudio: Array.isArray(s.backgroundAudio) ? s.backgroundAudio.map(String).slice(0, 8) : []
      };
    });

    const spokenSegments = segments.filter(s => s.audioType === 'SPEECH' || s.audioType === 'VOICEOVER');
    const songSegments = segments.filter(s => s.audioType === 'SONG_VOCALS' || s.audioType === 'MUSIC_BGM' || s.audioType === 'MUSIC');
    const isPureSongOrMusic = spokenSegments.length === 0 && (songSegments.length > 0 || parsed.isSongOrMusic === true || (parsed.musicPercentage || 0) >= 80);

    let cleanFullText = isPureSongOrMusic ? '' : (parsed.text || '').trim();
    if (isPureSongOrMusic) {
      cleanFullText = '';
    }

    const translatedText = isPureSongOrMusic ? '' : (parsed.translatedText || '').trim();
    const language = parsed.language ? String(parsed.language).trim() : null;

    const audioBreakdown = {
      hasSpokenSpeech: cleanFullText.length > 0,
      isSongOrMusic: Boolean(isPureSongOrMusic),
      speechPercentage: isPureSongOrMusic ? 0 : Number(parsed.speechPercentage || (spokenSegments.length > 0 ? (songSegments.length > 0 ? 60 : 100) : 0)),
      musicPercentage: isPureSongOrMusic ? 100 : Number(parsed.musicPercentage || (songSegments.length > 0 ? (spokenSegments.length > 0 ? 40 : 100) : 0)),
      songSegmentsCount: songSegments.length,
      speechSegmentsCount: spokenSegments.length
    };

    return {
      status: cleanFullText ? 'AVAILABLE' : (isPureSongOrMusic ? 'SONG_OR_MUSIC_ONLY' : 'NO_SPEECH_DETECTED'),
      text: cleanFullText,
      translatedText,
      language,
      segments: segments.length > 0 ? segments : (cleanFullText ? [{ start: 0.0, end: 5.0, text: cleanFullText, translatedText, language, audioType: 'SPEECH', backgroundAudio: [] }] : []),
      audioBreakdown,
      provider: 'GEMINI_AUDIO_TRANSCRIPTION',
      model: modelName,
      limitations: cleanFullText ? [] : (isPureSongOrMusic ? ['Audio identified as song or background music; musical lyrics excluded from spoken claims'] : ['Speech-to-text transcription detected zero spoken audio words'])
    };
  } catch (e) {
    return {
      status: 'ERROR',
      text: '',
      translatedText: '',
      language: null,
      segments: [],
      limitations: [`Gemini speech-to-text transcription failed: ${e.message}`]
    };
  }
}

/**
 * Main Video Analyzer Pipeline Coordinator
 * Keyframe sampling, audio transcription, frame visual analysis, frame OCR, and temporal consistency.
 */
async function analyzeVideo(fileInfo, buffer = null, url = null, options = {}) {
  const allLimitations = [];
  let extractedAudio = null;
  let extractedPcmAudio = null;
  let pcmSampleFormat = null;
  const emitProgress = (progress, step, stage) => {
    if (typeof options.onVideoProgress !== 'function') return;
    try {
      options.onVideoProgress({ progress, step, stage });
    } catch (_) {
      // Progress reporting must never interrupt the forensic pipeline.
    }
  };

  // 1. Container Metadata & FFmpeg Diagnostics
  const metaRes = await getVideoMetadata(fileInfo, buffer, options);
  allLimitations.push(...metaRes.limitations);
  emitProgress(31, 'Agent 1: Video metadata parsed successfully...', 'MEDIA_METADATA');

  // 2. Keyframe Extraction
  const boundaryRes = detectTemporalBoundaries(fileInfo, buffer, options);
  allLimitations.push(...(boundaryRes.limitations || []));
  const frameRes = await extractKeyframes(fileInfo, buffer, url, {
    ...options,
    boundaryTimestamps: boundaryRes.boundaries || []
  });
  allLimitations.push(...frameRes.limitations);
  const keyframes = frameRes.keyframes || [];
  emitProgress(36, `Agent 1: Extracted ${keyframes.length} representative keyframe${keyframes.length === 1 ? '' : 's'}...`, 'KEYFRAME_EXTRACTION');

  // 3. Audio Extraction & Speech-to-Text Transcription
  let transcriptRes = { status: 'UNAVAILABLE', text: '', segments: [], limitations: [] };
  if (metaRes.metadata.hasAudio || options.mockAudioBuffer || options.mockTranscript) {
    const audioRes = await extractAudio(fileInfo, buffer, options);
    allLimitations.push(...audioRes.limitations);
    extractedAudio = audioRes.audioBuffer || null;
    extractedPcmAudio = audioRes.pcmAudioBuffer || null;
    pcmSampleFormat = audioRes.pcmSampleFormat || null;

    transcriptRes = await transcribeAudio(audioRes.audioBuffer, options);
    allLimitations.push(...transcriptRes.limitations);
  } else {
    allLimitations.push('Video container indicates no audio track present');
  }
  emitProgress(43, transcriptRes.audioBreakdown?.isSongOrMusic
    ? 'Agent 1: Background song / music track detected; lyrics excluded from factual claims...'
    : (transcriptRes.text
      ? 'Agent 1: Speech transcript extracted for source and context matching...'
      : 'Agent 1: Audio inspection completed; no usable speech transcript was recovered...'), 'AUDIO_TRANSCRIPTION');

  // 4. Frame Visual Analysis & Separate Frame OCR (Executed in parallel for performance)
  const allObservedEntities = [];
  const ocrTexts = [];

  let analyzedFrameCount = 0;
  const frameAnalyses = await Promise.all(
    keyframes.map(async (frame) => {
      try {
        const imgRes = await analyzeImage(
          { filename: `frame_${frame.frameIndex}.jpg`, mimeType: 'image/jpeg' },
          frame.buffer,
          null,
          options
        );
        const ocrRes = await extractOcrText(
          { filename: `frame_${frame.frameIndex}.jpg` },
          frame.buffer,
          {
            ...options,
            visionExtractedText: (imgRes.observed && imgRes.observed.visibleText) ? imgRes.observed.visibleText : options.visionExtractedText
          }
        );

        if (ocrRes.ocrText) ocrTexts.push(`[Timestamp ${frame.timestamp}s]: ${ocrRes.ocrText}`);
        if (options.detectEntities !== false && Array.isArray(imgRes.observed?.entities)) allObservedEntities.push(...imgRes.observed.entities);
        if (options.detectEntities !== false && Array.isArray(imgRes.observed?.landmarks)) allObservedEntities.push(...imgRes.observed.landmarks);

        const analysis = {
          frameIndex: frame.frameIndex,
          timestamp: frame.timestamp,
          description: imgRes.visualDescription || frame.description || `Frame at ${frame.timestamp}s`,
          visibleText: ocrRes.ocrText || '',
          entities: options.detectEntities === false ? [] : (imgRes.observed?.entities?.length > 0 ? imgRes.observed.entities : (frame.entities || [])),
          publicFigures: options.detectEntities === false ? [] : (imgRes.observed?.publicFigures || []),
          logos: imgRes.observed?.logos || [],
          signs: imgRes.observed?.signs || [],
          landmarks: imgRes.observed?.landmarks || [],
          flags: imgRes.observed?.flags || [],
          objects: imgRes.observed?.objects || [],
          vehicleMarkings: imgRes.observed?.vehicleMarkings || [],
          badges: imgRes.observed?.badges || [],
          uniforms: imgRes.observed?.uniforms || [],
          attire: imgRes.observed?.attire || [],
          securityDetails: imgRes.observed?.securityDetails || [],
          locationClues: imgRes.observed?.visibleLocationClues || [],
          dateClues: imgRes.observed?.visibleDates || [],
          visualSignals: imgRes.manipulationSignals || [],
          dHash: frame.dHash || null
        };
        analyzedFrameCount += 1;
        emitProgress(
          44 + Math.round((analyzedFrameCount / Math.max(keyframes.length, 1)) * 8),
          `Agent 1: Analyzed keyframe ${analyzedFrameCount} of ${keyframes.length}...`,
          'FRAME_ANALYSIS'
        );
        return analysis;
      } catch (_) {
        const analysis = {
          frameIndex: frame.frameIndex,
          timestamp: frame.timestamp,
          description: `Frame at ${frame.timestamp}s`,
          visibleText: '',
          entities: [],
          publicFigures: [],
          logos: [],
          signs: [],
          landmarks: [],
          flags: [],
          objects: [],
          vehicleMarkings: [],
          badges: [],
          uniforms: [],
          attire: [],
          securityDetails: [],
          locationClues: [],
          dateClues: [],
          visualSignals: [],
          dHash: frame.dHash || null
        };
        analyzedFrameCount += 1;
        emitProgress(
          44 + Math.round((analyzedFrameCount / Math.max(keyframes.length, 1)) * 8),
          `Agent 1: Analyzed keyframe ${analyzedFrameCount} of ${keyframes.length}...`,
          'FRAME_ANALYSIS'
        );
        return analysis;
      }
    })
  );
  emitProgress(52, 'Agent 1: Keyframe vision and OCR analysis complete...', 'FRAME_ANALYSIS');

  // 5. Reverse-search only a small set of high-value keyframes when the user
  // explicitly opted in to external visual search. Raw frame buffers are used
  // transiently by the configured provider and are never returned or persisted.
  const { collectVideoProvenanceEvidence } = require('./videoProvenanceVerifier');
  const injectedFramesWithoutSearchEvidence = Array.isArray(options.mockFrames) &&
    !Array.isArray(options.mockVideoFrameSearches) &&
    !Array.isArray(options.mockTranscriptSearches) &&
    !Array.isArray(options.mockOriginalVideoCandidates) &&
    !options.originalVideoResolver;
  let videoProvenanceEvidence;
  try {
    emitProgress(54, options.allowExternalVisualSearch || options.allowExternalTranscriptSearch
      ? 'Agent 1: Searching authorized visual and transcript clues for original sources...'
      : 'Agent 1: Assessing provenance without external source searches...', 'VIDEO_PROVENANCE');
    videoProvenanceEvidence = await collectVideoProvenanceEvidence(
      frameAnalyses.map((analysis, index) => ({ ...analysis, buffer: keyframes[index]?.buffer || null })),
      transcriptRes.segments || [],
      injectedFramesWithoutSearchEvidence ? { ...options, enableReverseSearch: false } : options
    );
    allLimitations.push(...(videoProvenanceEvidence.limitations || []));
    const searchByFrame = new Map((videoProvenanceEvidence.frameSearches || []).map(search => [Number(search.frameIndex), search]));
    frameAnalyses.forEach(frame => {
      const search = searchByFrame.get(Number(frame.frameIndex));
      if (search) frame.reverseSearch = search;
    });
  } catch (error) {
    videoProvenanceEvidence = {
      status: 'ERROR',
      methodology: 'ETRAI_VIDEO_PROVENANCE_V1',
      recognizedFigures: [],
      searchFigures: [],
      frameSearches: [],
      sourceCandidates: [],
      transcriptSearch: { status: 'ERROR', queryCount: 0, executedQueryCount: 0, queries: [], matches: [], limitations: [`Video provenance analysis failed: ${error.message}`] },
      originalCandidate: null,
      limitations: [`Video provenance analysis failed: ${error.message}`]
    };
    allLimitations.push(...videoProvenanceEvidence.limitations);
  }
  emitProgress(61, 'Agent 1: Video provenance and original-source candidates assessed...', 'VIDEO_PROVENANCE');

  // 6. Temporal Consistency Analysis Across Keyframes
  const manipulationSignals = [];

  for (let i = 1; i < frameAnalyses.length; i++) {
    const prev = frameAnalyses[i - 1];
    const curr = frameAnalyses[i];

    // Check sudden entity disappearance or lighting discontinuities
    if (prev.entities.length > 0 && curr.entities.length === 0 && (curr.timestamp - prev.timestamp) < 3.0) {
      manipulationSignals.push({
        type: 'DISCONTINUITY',
        timestamp: curr.timestamp,
        severity: 'MEDIUM',
        confidence: 70,
        explanation: `Potential manipulation indicator: Sudden disappearance of visible entity (${prev.entities.join(', ')}) between frame ${prev.timestamp}s and ${curr.timestamp}s`
      });
    }

    if (curr.visualSignals && curr.visualSignals.length > 0) {
      curr.visualSignals.forEach(sig => {
        manipulationSignals.push({
          type: sig.type || 'SOFTWARE',
          timestamp: curr.timestamp,
          severity: sig.severity || 'LOW',
          confidence: sig.confidence || 60,
          explanation: sig.explanation.startsWith('Potential manipulation indicator:') 
            ? sig.explanation 
            : `Potential manipulation indicator: ${sig.explanation}`
        });
      });
    }
  }

  // 7. Real Video & Audio Forensics Pipeline
  const { performVideoAudioForensics } = require('./videoAudioForensics');
  emitProgress(63, 'Agent 1: Running video, audio, splice, and synthetic-media checks...', 'VIDEO_FORENSICS');
  const forensicsRes = await performVideoAudioForensics(fileInfo, buffer, {
    ...options,
    metadata: metaRes.metadata,
    duration: metaRes.metadata?.durationSeconds || options.duration || 10.0,
    keyframes: frameAnalyses,
    transcriptSegments: transcriptRes.segments || [],
    audioBuffer: extractedPcmAudio,
    audioSampleFormat: pcmSampleFormat,
    temporalBoundaries: boundaryRes.boundaries || []
  });
  emitProgress(65, 'Agent 1: Video and audio forensic checks complete...', 'VIDEO_FORENSICS');

  // 8. Segment-level context and completeness report. It consumes only the
  // sanitized reverse-search evidence above, never the raw keyframe buffers.
  const { generateVideoContextReport } = require('./videoContextVerifier');
  emitProgress(66, 'Agent 1: Comparing clip segments with recovered source context...', 'VIDEO_CONTEXT');
  const videoContextReport = await generateVideoContextReport({
    fileInfo,
    durationSeconds: metaRes.metadata?.durationSeconds || options.duration || 10,
    temporalBoundaries: boundaryRes.boundaries || [],
    temporalBoundaryDetection: boundaryRes,
    frames: frameAnalyses,
    transcriptSegments: transcriptRes.segments || [],
    transcriptMetadata: {
      language: transcriptRes.language || null,
      translatedText: transcriptRes.translatedText || '',
      provider: transcriptRes.provider || null,
      model: transcriptRes.model || null
    },
    forensics: forensicsRes,
    provenanceEvidence: videoProvenanceEvidence
  }, options);
  forensicsRes.contextReport = videoContextReport;
  emitProgress(68, 'Agent 1: Clip completeness and full-context assessment complete...', 'VIDEO_CONTEXT');

  if (forensicsRes.suspiciousSegments?.length > 0) {
    forensicsRes.suspiciousSegments.forEach(seg => {
      manipulationSignals.push({
        type: seg.anomalyType,
        timestamp: seg.startSec,
        severity: seg.severity,
        confidence: seg.confidence,
        explanation: `Potential manipulation indicator: ${seg.explanation}`
      });
    });
  }

  const combinedEntities = Array.from(new Set(allObservedEntities));
  const combinedOcrText = ocrTexts.join('\n');
  const primaryDescription = frameAnalyses.map(f => `[${f.timestamp}s]: ${f.description}`).join(' ');
  const uniqueFrameValues = key => Array.from(new Set(frameAnalyses.flatMap(frame => frame[key] || []).filter(Boolean)));
  const uniqueLimitations = Array.from(new Set(allLimitations));

  // 7. Dedicated On-Screen Headline Rail
  const { isSubstantiveNewsHeadline } = require('./mediaClaimExtractor');
  const onScreenHeadlines = [];
  for (const frame of frameAnalyses) {
    const rawOcr = frame.visibleText || '';
    if (rawOcr && isSubstantiveNewsHeadline(rawOcr, { logos: frame.logos, signs: frame.signs })) {
      const cleanHeadline = rawOcr.trim().replace(/\s+/g, ' ');
      if (!onScreenHeadlines.some(h => h.text.toLowerCase() === cleanHeadline.toLowerCase())) {
        onScreenHeadlines.push({
          text: cleanHeadline,
          timestamp: frame.timestamp,
          frameIndex: frame.frameIndex
        });
      }
    }
  }

  // 8. Speaker Identification & Online Transcript Verifier
  const { verifyOnlineTranscript } = require('./videoTranscriptVerifier');
  let transcriptVerification = null;
  if (transcriptRes.text && transcriptRes.text.length >= 15 && !transcriptRes.audioBreakdown?.isSongOrMusic) {
    try {
      transcriptVerification = await verifyOnlineTranscript({
        transcript: transcriptRes.text,
        entities: combinedEntities,
        publicFigures: videoProvenanceEvidence?.recognizedFigures || frameAnalyses.flatMap(f => f.publicFigures || []),
        visualDescription: primaryDescription
      }, options);
    } catch (err) {
      console.warn('[Video Transcript Verification Error]:', err.message);
    }
  }

  const audioBreakdown = transcriptRes.audioBreakdown || {
    hasSpokenSpeech: Boolean(transcriptRes.text),
    isSongOrMusic: false,
    speechPercentage: transcriptRes.text ? 100 : 0,
    musicPercentage: 0,
    songSegmentsCount: 0,
    speechSegmentsCount: transcriptRes.text ? 1 : 0
  };

  return {
    status: (keyframes.length > 0 || transcriptRes.text) ? 'AVAILABLE' : 'UNAVAILABLE',
    visualDescription: primaryDescription,
    transcript: transcriptRes.text || '',
    translatedTranscript: transcriptRes.translatedText || '',
    transcriptLanguage: transcriptRes.language || null,
    transcriptSegments: transcriptRes.segments || [],
    audioBreakdown,
    onScreenHeadlines,
    transcriptVerification,
    frameCount: keyframes.length,
    extractedFrames: frameAnalyses,
    temporalBoundaries: boundaryRes.boundaries || [],
    temporalBoundaryDetection: boundaryRes,
    ocrText: combinedOcrText,
    entities: combinedEntities,
    observed: {
      visibleText: combinedOcrText,
      entities: combinedEntities,
      publicFigures: frameAnalyses.flatMap(frame => frame.publicFigures || []),
      logos: uniqueFrameValues('logos'),
      signs: uniqueFrameValues('signs'),
      landmarks: uniqueFrameValues('landmarks'),
      flags: uniqueFrameValues('flags'),
      objects: uniqueFrameValues('objects'),
      vehicleMarkings: uniqueFrameValues('vehicleMarkings'),
      badges: uniqueFrameValues('badges'),
      uniforms: uniqueFrameValues('uniforms'),
      attire: uniqueFrameValues('attire'),
      securityDetails: uniqueFrameValues('securityDetails'),
      visibleDates: uniqueFrameValues('dateClues'),
      visibleLocationClues: uniqueFrameValues('locationClues')
    },
    manipulationSignals,
    forensics: forensicsRes,
    videoContextReport,
    videoProvenance: videoContextReport?.provenance || videoProvenanceEvidence,
    limitations: uniqueLimitations
  };
}

module.exports = {
  getVideoMetadata,
  extractKeyframes,
  extractAudio,
  transcribeAudio,
  detectTemporalBoundaries,
  buildRepresentativeTimestamps,
  analyzeVideo
};
