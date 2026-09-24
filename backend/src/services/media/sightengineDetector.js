/**
 * Sightengine AI & Deepfake Detection Service
 * Analyzes images and sampled video frames for synthetic AI generation (Midjourney, DALL-E,
 * Flux, Stable Diffusion, Sora, etc.) and facial manipulation / deepfakes.
 */

'use strict';

const fetch = require('node-fetch');
const FormData = require('form-data');

const SIGHTENGINE_API_URL = 'https://api.sightengine.com/1.0/check.json';

function isSightengineConfigured() {
  const user = process.env.SIGHTENGINE_API_USER;
  const secret = process.env.SIGHTENGINE_API_SECRET;
  return Boolean(user && user.trim() && secret && secret.trim());
}

/**
 * Detect AI generation and deepfake probability for an image buffer.
 *
 * @param {Buffer} imageBuffer - Raw image binary buffer
 * @param {Object} [options]
 * @returns {Promise<Object>}
 */
async function detectImageAi(imageBuffer, options = {}) {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
    return {
      status: 'SKIPPED',
      reason: 'No image buffer provided for AI detection.'
    };
  }

  if (!isSightengineConfigured()) {
    return {
      status: 'UNCONFIGURED',
      configured: false,
      provider: 'SIGHTENGINE',
      reason: 'Sightengine API credentials (SIGHTENGINE_API_USER / SIGHTENGINE_API_SECRET) not configured in .env',
      aiGeneratedProbability: null,
      isAiGenerated: false,
      deepfakeScore: null,
      isDeepfake: false
    };
  }

  const apiUser = process.env.SIGHTENGINE_API_USER.trim();
  const apiSecret = process.env.SIGHTENGINE_API_SECRET.trim();

  try {
    const form = new FormData();
    form.append('models', 'genai,deepfake');
    form.append('api_user', apiUser);
    form.append('api_secret', apiSecret);
    form.append('media', imageBuffer, {
      filename: 'image_analysis.jpg',
      contentType: options.mimeType || 'image/jpeg'
    });

    const response = await fetch(SIGHTENGINE_API_URL, {
      method: 'POST',
      body: form,
      headers: form.getHeaders(),
      timeout: options.timeoutMs || 10000
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.warn(`[Sightengine Warning]: HTTP ${response.status} - ${errText.substring(0, 200)}`);
      return {
        status: 'API_ERROR',
        provider: 'SIGHTENGINE',
        statusCode: response.status,
        error: errText.substring(0, 200),
        aiGeneratedProbability: null
      };
    }

    const data = await response.json();
    if (data.status !== 'success') {
      return {
        status: 'FAILED',
        provider: 'SIGHTENGINE',
        error: data.error?.message || 'Sightengine evaluation failed.',
        raw: data
      };
    }

    const aiProb = typeof data.type?.ai_generated === 'number' ? data.type.ai_generated : 0;
    const deepfakeScore = typeof data.deepfake?.score === 'number' ? data.deepfake.score : 0;

    const isAi = aiProb >= 0.70;
    const isDeepfake = deepfakeScore >= 0.70;

    let verdictLabel = 'AUTHENTIC_IMAGE';
    let assessmentSummary = 'No strong synthetic artifacts detected. Photographic features are consistent with genuine hardware camera capture.';

    if (isAi) {
      verdictLabel = 'AI_GENERATED';
      assessmentSummary = `High synthetic probability (${Math.round(aiProb * 100)}%). Pixel patterns and latent generator signatures match generative AI models (e.g. Flux / Midjourney / Stable Diffusion).`;
    } else if (isDeepfake) {
      verdictLabel = 'DEEPFAKE_MANIPULATED';
      assessmentSummary = `Facial manipulation detected (${Math.round(deepfakeScore * 100)}% certainty). Discontinuities in facial features indicate synthetic face swapping or reenactment.`;
    } else if (aiProb >= 0.35 || deepfakeScore >= 0.35) {
      verdictLabel = 'SUSPICIOUS_ANOMALIES';
      assessmentSummary = `Moderate synthetic probability (${Math.round(Math.max(aiProb, deepfakeScore) * 100)}%). Anomalous rendering detected, but inconclusive without cross-referencing web sources.`;
    }

    return {
      status: 'SUCCESS',
      provider: 'SIGHTENGINE',
      configured: true,
      aiGeneratedProbability: Number(aiProb.toFixed(3)),
      isAiGenerated: isAi,
      deepfakeScore: Number(deepfakeScore.toFixed(3)),
      isDeepfake: isDeepfake,
      verdictLabel,
      assessmentSummary,
      rawOutput: {
        type: data.type,
        deepfake: data.deepfake
      }
    };
  } catch (err) {
    console.error('[Sightengine Error]:', err.message);
    return {
      status: 'ERROR',
      provider: 'SIGHTENGINE',
      error: err.message,
      aiGeneratedProbability: null
    };
  }
}

/**
 * Detect AI generation across sampled video keyframe buffers.
 *
 * @param {Array<Buffer>} keyframeBuffers
 * @param {Object} [options]
 * @returns {Promise<Object>}
 */
async function detectVideoKeyframesAi(keyframeBuffers = [], options = {}) {
  if (!Array.isArray(keyframeBuffers) || keyframeBuffers.length === 0) {
    return {
      status: 'SKIPPED',
      reason: 'No video keyframes provided for AI detection.'
    };
  }

  if (!isSightengineConfigured()) {
    return {
      status: 'UNCONFIGURED',
      configured: false,
      provider: 'SIGHTENGINE',
      reason: 'Sightengine API credentials not configured in .env'
    };
  }

  // Sample up to 4 keyframes evenly spaced across the video
  const sampleCount = Math.min(4, keyframeBuffers.length);
  const step = Math.max(1, Math.floor(keyframeBuffers.length / sampleCount));
  const sampled = [];
  for (let i = 0; i < keyframeBuffers.length && sampled.length < sampleCount; i += step) {
    sampled.push({ index: i, buffer: keyframeBuffers[i] });
  }

  const frameResults = [];
  for (const item of sampled) {
    const res = await detectImageAi(item.buffer, options);
    if (res.status === 'SUCCESS') {
      frameResults.push({ frameIndex: item.index, ...res });
    }
  }

  if (frameResults.length === 0) {
    return {
      status: 'FAILED',
      provider: 'SIGHTENGINE',
      reason: 'Could not successfully evaluate sampled keyframes with Sightengine.'
    };
  }

  const maxAi = Math.max(...frameResults.map(r => r.aiGeneratedProbability || 0));
  const maxDeepfake = Math.max(...frameResults.map(r => r.deepfakeScore || 0));
  const isAi = maxAi >= 0.70;
  const isDeepfake = maxDeepfake >= 0.70;

  return {
    status: 'SUCCESS',
    provider: 'SIGHTENGINE',
    configured: true,
    evaluatedFramesCount: frameResults.length,
    maxAiGeneratedProbability: Number(maxAi.toFixed(3)),
    maxDeepfakeScore: Number(maxDeepfake.toFixed(3)),
    isAiGenerated: isAi,
    isDeepfake: isDeepfake,
    verdictLabel: isAi ? 'AI_GENERATED_VIDEO' : (isDeepfake ? 'DEEPFAKE_VIDEO' : 'AUTHENTIC_VIDEO'),
    assessmentSummary: isAi
      ? `Video exhibits synthetic diffusion signatures across keyframes (${Math.round(maxAi * 100)}% AI certainty).`
      : (isDeepfake
        ? `Video displays synthetic face reenactment / face-swap indicators (${Math.round(maxDeepfake * 100)}% deepfake certainty).`
        : 'Sampled video keyframes are consistent with natural optical lens capture.'),
    frameResults
  };
}

module.exports = {
  isSightengineConfigured,
  detectImageAi,
  detectVideoKeyframesAi
};
