const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { GoogleGenAI } = require('@google/genai');
const { getProviderStatus, isKeyValid } = require('../providerManager');
const { extractMediaMetadata } = require('./mediaMetadata');
const { analyzeImage } = require('./imageAnalyzer');
const { extractOcrText } = require('./ocrService');

/**
 * Checks if system FFmpeg CLI tool is available on system PATH
 */
function isFfmpegAvailable() {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
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
  const sampleCount = options.sampleCount || 5;
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

    // Sample keyframes with ffmpeg
    const outputPattern = path.join(tmpDir, 'frame_%03d.jpg');
    const fps = Math.max(0.1, sampleCount / duration);
    execSync(`ffmpeg -y -i "${inputPath}" -vf "fps=${fps.toFixed(3)}" "${outputPattern}"`, { stdio: 'ignore' });

    const files = fs.readdirSync(tmpDir).filter(f => f.startsWith('frame_') && f.endsWith('.jpg')).sort();
    files.forEach((fName, idx) => {
      const fPath = path.join(tmpDir, fName);
      const fBuffer = fs.readFileSync(fPath);
      const calcTimestamp = Number((idx * (duration / Math.max(1, files.length - 1))).toFixed(1));
      keyframes.push({
        frameIndex: idx,
        timestamp: calcTimestamp,
        buffer: fBuffer,
        mimeType: 'image/jpeg'
      });
    });

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

  try {
    fs.writeFileSync(inputPath, buffer);
    execSync(`ffmpeg -y -i "${inputPath}" -vn -acodec libmp3lame -q:a 4 "${outputPath}"`, { stdio: 'ignore' });

    if (fs.existsSync(outputPath)) {
      const audioBuffer = fs.readFileSync(outputPath);
      return {
        status: 'AVAILABLE',
        audioBuffer,
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
 * Returns { text: "...", segments: [{ start, end, text }] }.
 * Returns explicit UNAVAILABLE state when key/audio is missing. NEVER fabricates transcripts.
 */
async function transcribeAudio(audioBuffer = null, options = {}) {
  // Option A: Mock transcript passed explicitly for unit testing
  if (options.mockTranscript) {
    return {
      status: 'AVAILABLE',
      text: typeof options.mockTranscript === 'string' ? options.mockTranscript : (options.mockTranscript.text || ''),
      segments: Array.isArray(options.mockTranscript.segments) ? options.mockTranscript.segments : [
        { start: 0.0, end: 5.0, text: typeof options.mockTranscript === 'string' ? options.mockTranscript : options.mockTranscript.text }
      ],
      limitations: []
    };
  }

  const geminiKey = options.geminiKey || options.openAiKey || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;
  const hasGemini = isKeyValid(geminiKey);

  if (!hasGemini) {
    return {
      status: 'UNAVAILABLE',
      text: '',
      segments: [],
      limitations: ['Audio transcription provider unavailable (missing GEMINI_API_KEY)']
    };
  }

  if (!audioBuffer || !Buffer.isBuffer(audioBuffer)) {
    return {
      status: 'UNAVAILABLE',
      text: '',
      segments: [],
      limitations: ['No extracted audio buffer available for speech-to-text transcription']
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const modelName = (process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim();

    const response = await ai.models.generateContent({
      model: modelName,
      contents: [
        'Transcribe the spoken audio in this file accurately into text. Output ONLY a valid JSON object matching this schema: { "text": "full transcript text", "segments": [ { "start": 0.0, "end": 5.0, "text": "segment text" } ] }',
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

    const fullText = (parsed.text || '').trim();
    const rawSegments = Array.isArray(parsed.segments) ? parsed.segments : [];
    const segments = rawSegments.map(s => ({
      start: Number((s.start || 0).toFixed(1)),
      end: Number((s.end || 0).toFixed(1)),
      text: (s.text || '').trim()
    }));

    return {
      status: fullText ? 'AVAILABLE' : 'NO_SPEECH_DETECTED',
      text: fullText,
      segments: segments.length > 0 ? segments : (fullText ? [{ start: 0.0, end: 5.0, text: fullText }] : []),
      limitations: fullText ? [] : ['Speech-to-text transcription detected zero spoken audio words']
    };
  } catch (e) {
    return {
      status: 'ERROR',
      text: '',
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

  // 1. Container Metadata & FFmpeg Diagnostics
  const metaRes = await getVideoMetadata(fileInfo, buffer, options);
  allLimitations.push(...metaRes.limitations);

  // 2. Keyframe Extraction
  const frameRes = await extractKeyframes(fileInfo, buffer, url, options);
  allLimitations.push(...frameRes.limitations);
  const keyframes = frameRes.keyframes || [];

  // 3. Audio Extraction & Speech-to-Text Transcription
  let transcriptRes = { status: 'UNAVAILABLE', text: '', segments: [], limitations: [] };
  if (metaRes.metadata.hasAudio || options.mockAudioBuffer || options.mockTranscript) {
    const audioRes = await extractAudio(fileInfo, buffer, options);
    allLimitations.push(...audioRes.limitations);

    transcriptRes = await transcribeAudio(audioRes.audioBuffer, options);
    allLimitations.push(...transcriptRes.limitations);
  } else {
    allLimitations.push('Video container indicates no audio track present');
  }

  // 4. Frame Visual Analysis & Separate Frame OCR
  const frameAnalyses = [];
  const allObservedEntities = [];
  const ocrTexts = [];

  for (const frame of keyframes) {
    const imgRes = await analyzeImage({ filename: `frame_${frame.frameIndex}.jpg`, mimeType: 'image/jpeg' }, frame.buffer, null, options);
    const ocrRes = await extractOcrText({ filename: `frame_${frame.frameIndex}.jpg` }, frame.buffer, {
      ...options,
      visionExtractedText: (imgRes.observed && imgRes.observed.visibleText) ? imgRes.observed.visibleText : options.visionExtractedText
    });

    if (ocrRes.ocrText) ocrTexts.push(`[Timestamp ${frame.timestamp}s]: ${ocrRes.ocrText}`);
    if (Array.isArray(imgRes.observed?.entities)) allObservedEntities.push(...imgRes.observed.entities);
    if (Array.isArray(imgRes.observed?.landmarks)) allObservedEntities.push(...imgRes.observed.landmarks);

    frameAnalyses.push({
      timestamp: frame.timestamp,
      description: imgRes.visualDescription || frame.description || `Frame at ${frame.timestamp}s`,
      visibleText: ocrRes.ocrText || '',
      entities: (imgRes.observed?.entities?.length > 0 ? imgRes.observed.entities : (frame.entities || [])),
      locationClues: imgRes.observed?.visibleLocationClues || [],
      dateClues: imgRes.observed?.visibleDates || [],
      visualSignals: imgRes.manipulationSignals || []
    });
  }

  // 5. Temporal Consistency Analysis Across Keyframes
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

  // 6. Real Video & Audio Forensics Pipeline
  const { performVideoAudioForensics } = require('./videoAudioForensics');
  const forensicsRes = await performVideoAudioForensics({
    fileInfo,
    buffer,
    metadata: metaRes.metadata,
    keyframes: frameAnalyses,
    transcriptSegments: transcriptRes.segments || [],
    audioBuffer: options.mockAudioBuffer || (metaRes.metadata.hasAudio ? buffer : null),
    options
  });

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

  const uniqueLimitations = Array.from(new Set(allLimitations));

  return {
    status: (keyframes.length > 0 || transcriptRes.text) ? 'AVAILABLE' : 'UNAVAILABLE',
    visualDescription: primaryDescription,
    transcript: transcriptRes.text || '',
    transcriptSegments: transcriptRes.segments || [],
    frameCount: keyframes.length,
    extractedFrames: frameAnalyses,
    ocrText: combinedOcrText,
    entities: combinedEntities,
    manipulationSignals,
    forensics: forensicsRes,
    limitations: uniqueLimitations
  };
}

module.exports = {
  getVideoMetadata,
  extractKeyframes,
  extractAudio,
  transcribeAudio,
  analyzeVideo
};
