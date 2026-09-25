/**
 * ETRAI Multimodal Image-to-Image Visual Differ
 * Compares an uploaded image side-by-side against a retrieved web original from Google Lens.
 * Detects face swaps, person replacements, compositing, object insertions, and generates
 * normalized bounding boxes and forensic diff objects for the comparison slider.
 */

'use strict';

const { createGeminiClient } = require('../providerManager');

function convertBox2dToPercent(box2d, fallback = null) {
  if (!Array.isArray(box2d) || box2d.length !== 4) return fallback;
  const [ymin, xmin, ymax, xmax] = box2d;
  if (![ymin, xmin, ymax, xmax].every(Number.isFinite)) return fallback;
  const scale = Math.max(...box2d) > 1 ? 1000 : 1;
  const top = Math.max(0, Math.min(95, (ymin / scale) * 100));
  const left = Math.max(0, Math.min(95, (xmin / scale) * 100));
  const height = Math.max(4, Math.min(100 - top, ((ymax - ymin) / scale) * 100));
  const width = Math.max(4, Math.min(100 - left, ((xmax - xmin) / scale) * 100));
  return {
    x: Math.round(left * 10) / 10,
    y: Math.round(top * 10) / 10,
    w: Math.round(width * 10) / 10,
    h: Math.round(height * 10) / 10,
    left: `${Math.round(left * 10) / 10}%`,
    top: `${Math.round(top * 10) / 10}%`,
    width: `${Math.round(width * 10) / 10}%`,
    height: `${Math.round(height * 10) / 10}%`
  };
}

/**
 * Performs multimodal visual diffing between input image and reference web original
 */
async function diffImagesWithGemini(inputBuffer, referenceBuffer, referenceMetadata = {}, options = {}) {
  if (!Buffer.isBuffer(inputBuffer) || !Buffer.isBuffer(referenceBuffer)) {
    return {
      status: 'SKIPPED',
      isModified: false,
      modificationType: 'NONE',
      confidence: 0,
      summary: 'Insufficient image buffer data for side-by-side visual diffing.',
      differences: []
    };
  }

  // Support injected mock diff for deterministic tests
  if (options.mockDiffResult) {
    return options.mockDiffResult;
  }

  const ai = options.geminiClient || createGeminiClient(options.geminiKey);
  if (!ai) {
    return {
      status: 'UNAVAILABLE',
      isModified: false,
      modificationType: 'NONE',
      confidence: 0,
      summary: 'Gemini multimodal client unavailable for visual image-to-image differ.',
      differences: []
    };
  }

  try {
    const domain = referenceMetadata.domain || 'web archive';
    const sourceTitle = referenceMetadata.title || 'reference photo';

    const promptText = `You are an expert digital forensics examiner comparing two photographs side-by-side:
- Image 1 (First image): The submitted image under forensic verification.
- Image 2 (Second image): The reference authentic original image retrieved from ${domain} ("${sourceTitle}").

TASK:
Determine if Image 1 is a digitally altered, edited, photoshopped, or face-swapped version of Image 2.
Specifically inspect for:
1. PERSON / FACE REPLACEMENT: Has an individual or face in Image 2 been swapped with someone else in Image 1?
2. OBJECT / ELEMENT INSERTION OR REMOVAL: Has an object, vehicle, weapon, crowd member, building, or item been added or deleted?
3. TEXT / BANNER ALTERATION: Have signs, chyrons, watermarks, placards, or text been edited?
4. BACKGROUND / SETTING COMPOSITING: Has the background or lighting been replaced?

CRITICAL FORENSIC RULES:
- If Image 1 and Image 2 depict the exact same people, objects, and scene with only natural differences in cropping, resolution, aspect ratio, or JPEG compression, mark isModified: false.
- If ANY person, face, or key element has been replaced, inserted, or removed, mark isModified: true, provide the exact normalized bounding box [ymin, xmin, ymax, xmax] on a 0 to 1000 scale over the altered region in Image 1, and describe precisely what was changed.

OUTPUT FORMAT (JSON ONLY):
{
  "isModified": true/false,
  "modificationType": "NONE" | "PERSON_SWAPPED" | "FACE_SWAPPED" | "ELEMENT_INSERTED" | "ELEMENT_REMOVED" | "TEXT_ALTERED" | "BACKGROUND_CHANGED",
  "confidence": 0-100,
  "summary": "Detailed forensic explanation comparing Image 1 to Image 2",
  "alteredRegions": [
    {
      "id": "A",
      "title": "Person / Face Swapped",
      "type": "PERSON_SWAPPED",
      "desc": "Short description of specific replacement",
      "detail": "Compared to the original photo from ${domain}, the person on the left has been replaced with...",
      "box_2d": [ymin, xmin, ymax, xmax]
    }
  ]
}`;

    const inputMime = options.inputMimeType || 'image/jpeg';
    const refMime = options.referenceMimeType || 'image/jpeg';

    const contentsPayload = [
      promptText,
      {
        inlineData: {
          mimeType: inputMime,
          data: inputBuffer.toString('base64')
        }
      },
      {
        inlineData: {
          mimeType: refMime,
          data: referenceBuffer.toString('base64')
        }
      }
    ];

    const modelName = (process.env.GEMINI_FLASH_MODEL || process.env.GEMINI_MEDIA_MODEL || 'gemini-3.5-flash').trim();

    const response = await ai.models.generateContent({
      model: modelName,
      contents: contentsPayload,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.05
      }
    });

    let rawText = null;
    if (typeof response.text === 'string') rawText = response.text;
    else if (typeof response.text === 'function') rawText = response.text();
    else if (response.candidates?.[0]?.content?.parts) {
      rawText = response.candidates[0].content.parts.map(p => p.text || '').join('');
    }

    const parsed = JSON.parse((rawText || '{}').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim());

    const isModified = Boolean(parsed.isModified);
    const modificationType = parsed.modificationType || (isModified ? 'PERSON_SWAPPED' : 'NONE');
    const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : (isModified ? 90 : 85);
    const summary = parsed.summary || (isModified ? 'Visual differences detected between submitted image and retrieved original.' : 'Visual contents match original source image.');

    let markerCode = 65; // 'A'
    const differences = (parsed.alteredRegions || []).map((region, idx) => {
      const box = convertBox2dToPercent(region.box_2d) || {
        x: 25, y: 20, w: 50, h: 60, left: '25%', top: '20%', width: '50%', height: '60%'
      };
      return {
        id: region.id || String.fromCharCode(markerCode + idx),
        title: region.title || 'Altered / Replaced Region',
        desc: region.desc || region.detail || 'Visual element discrepancy against verified original',
        detail: region.detail || `Compared to original photo from ${domain}, this region exhibits direct digital modification.`,
        box,
        box_2d: region.box_2d || null,
        type: region.type || modificationType
      };
    });

    // If marked modified but no boxes returned, provide a reasonable fallback box
    if (isModified && differences.length === 0) {
      differences.push({
        id: 'A',
        title: 'Element Replaced',
        desc: summary,
        detail: `Direct comparison against the original photo from ${domain} indicates this region was altered.`,
        box: { x: 20, y: 20, w: 60, h: 60, left: '20%', top: '20%', width: '60%', height: '60%' },
        type: modificationType
      });
    }

    return {
      status: 'COMPLETED',
      isModified,
      modificationType,
      confidence,
      summary,
      domain,
      differences
    };
  } catch (error) {
    console.warn('[Image Visual Differ Error]:', error.message);
    return {
      status: 'ERROR',
      isModified: false,
      modificationType: 'NONE',
      confidence: 0,
      summary: `Image visual differ error: ${error.message}`,
      differences: []
    };
  }
}

module.exports = {
  diffImagesWithGemini,
  convertBox2dToPercent
};
