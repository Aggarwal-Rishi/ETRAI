const { GoogleGenAI } = require('@google/genai');
const { getProviderStatus, isKeyValid } = require('../providerManager');

const EMPTY_OBSERVED = Object.freeze({
  visibleText: '',
  entities: [],
  entityRegions: [],
  textRegions: [],
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
  visibleDates: [],
  visibleLocationClues: []
});

const EMPTY_MOBILE_EDITS = Object.freeze({
  hasEdits: false,
  editCount: 0,
  estimatedEditPercentage: 0,
  summary: '',
  items: []
});

function emptyObserved() {
  return Object.fromEntries(Object.entries(EMPTY_OBSERVED).map(([key, value]) => [key, Array.isArray(value) ? [] : value]));
}

function emptyMobileEdits() {
  return {
    hasEdits: false,
    editCount: 0,
    estimatedEditPercentage: 0,
    summary: '',
    items: []
  };
}

/**
 * Image Visual Analyzer Service
 * Uses multimodal Gemini Vision API when available to analyze visual elements.
 * Separates OBSERVED facts from INFERRED context. Identifies potential manipulation indicators,
 * inpainting residues, mobile stickers, text additions, and localized retouching.
 */
async function analyzeImage(fileInfo, buffer = null, url = null, options = {}) {
  const geminiKey = options.geminiKey || process.env.GEMINI_API_KEY;
  const hasGemini = isKeyValid(geminiKey);

  // Allow injected mock for deterministic tests
  if (options.mockImageAnalysis) {
    return options.mockImageAnalysis;
  }

  if (!hasGemini) {
    return {
      status: 'UNAVAILABLE',
      observed: emptyObserved(),
      inferred: {
        possibleContext: '',
        possibleEvent: '',
        uncertainties: []
      },
      visualDescription: '',
      visualInconsistencies: [],
      manipulationSignals: [],
      mobileEdits: options.mockMobileEdits || emptyMobileEdits(),
      limitations: ['Gemini multimodal vision provider unavailable (missing API key)']
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const modelName = (process.env.GEMINI_FLASH_MODEL || process.env.GEMINI_MEDIA_MODEL || 'gemini-3.5-flash').trim();

    const promptText = `Analyze this image objectively for factual verification, forensic inspection, and local/mobile photo editing.

CRITICAL INSTRUCTIONS:
1. Strictly separate OBSERVED elements (directly visible in image) from INFERRED elements (speculative context). Do NOT claim a specific location or date unless explicitly visible on a sign, timestamp, or unmistakable landmark.
2. MOBILE & LOCAL PHOTO EDIT DETECTION:
   Examine this image specifically for edits made on mobile phones or photo editors:
   - ERASED / INPAINTED: Object eraser, healing brush, or content-aware fill residues (smudged textures, unnatural blur patches, cloned repeated pixel patterns, melted edges where someone/something was removed). Action: "ERASED".
   - ADDED: Digital stickers, cartoon graphics, emojis, pasted cutouts, or superimposed modern digital text/captions/watermarks that do not match the real camera scene. Action: "ADDED".
   - MODIFIED: Localized skin smoothing, beauty filters, digital face retouching, or localized color/lighting filter patches. Action: "MODIFIED".
   For each detected edit, specify:
   - action: "ADDED" | "ERASED" | "MODIFIED"
   - category: "STICKER_OVERLAY" | "TEXT_OVERLAY" | "OBJECT_ERASED" | "FILTER_SMOOTHING" | "CUTOUT_PASTED"
   - title: Short descriptive name (e.g. "Digital Sticker", "Inpainted Region", "Erased Person", "Skin Smoothing Filter")
   - explanation: Concrete visual evidence explaining why it appears added, erased, or altered.
   - confidence: 0 to 100
   - box_2d: 2D bounding box [ymin, xmin, ymax, xmax] on a 0 to 1000 scale.
3. For all detected people, text blocks, or anomalous regions, provide 2D bounding boxes in normalized coordinates [ymin, xmin, ymax, xmax] on a 0 to 1000 scale (e.g., [100, 200, 500, 600]).

OUTPUT FORMAT (JSON):
{
  "observed": {
    "visibleText": "all visible text transcribed",
    "entities": ["visible public figures/people"],
    "entityRegions": [{"name": "person or entity name or description", "box_2d": [0, 0, 0, 0]}],
    "textRegions": [{"text": "text snippet", "box_2d": [0, 0, 0, 0]}],
    "publicFigures": [{"name": "name only when visually recognizable with high confidence", "visibleAppearance": "directly visible features", "attire": "directly visible clothing", "confidence": 0, "basis": "visual basis or uncertainty", "box_2d": [0, 0, 0, 0]}],
    "logos": ["visible brand/agency logos"],
    "signs": ["street/building signs"],
    "landmarks": ["visible architectural landmarks"],
    "flags": ["visible national/organization flags"],
    "objects": ["key visible physical objects"],
    "vehicleMarkings": ["text, emblems, registration or campaign markings visible on vehicles"],
    "badges": ["visible badges, insignia or passes"],
    "uniforms": ["directly visible uniforms and identifying markings"],
    "attire": ["distinctive clothing relevant to identification, without guessing identity"],
    "securityDetails": ["visible security personnel, formations, equipment or protective detail"],
    "visibleDates": ["dates explicitly visible"],
    "visibleLocationClues": ["location clues explicitly visible"]
  },
  "inferred": {
    "possibleContext": "general scene context",
    "possibleEvent": "hypothesized event type",
    "uncertainties": ["items that cannot be determined visually"]
  },
  "visualDescription": "objective, detailed scene description",
  "visualInconsistencies": ["lighting inconsistencies, reflection anomalies, compositing borders"],
  "manipulationSignals": [
    {
      "type": "COMPOSITING|LIGHTING|PATTERN|ARTIFACT|GEOMETRY|SOFTWARE",
      "severity": "LOW|MEDIUM|HIGH",
      "confidence": 80,
      "box_2d": [0, 0, 0, 0],
      "explanation": "Potential manipulation indicator: [explanation]"
    }
  ],
  "mobileEdits": {
    "hasEdits": false,
    "editCount": 0,
    "estimatedEditPercentage": 0,
    "summary": "Brief summary of any detected mobile edits, or empty string if clean",
    "items": [
      {
        "id": "A",
        "action": "ADDED|ERASED|MODIFIED",
        "category": "STICKER_OVERLAY|TEXT_OVERLAY|OBJECT_ERASED|FILTER_SMOOTHING|CUTOUT_PASTED",
        "title": "Title",
        "explanation": "Forensic visual explanation",
        "confidence": 85,
        "box_2d": [0, 0, 0, 0]
      }
    ]
  }
}`;

    const contentsPayload = [promptText];

    if (buffer && Buffer.isBuffer(buffer)) {
      const base64Img = buffer.toString('base64');
      const mime = (fileInfo && fileInfo.mimeType) ? fileInfo.mimeType : 'image/jpeg';
      contentsPayload.push({
        inlineData: {
          mimeType: mime,
          data: base64Img
        }
      });
    } else {
      return {
        status: 'UNAVAILABLE',
        observed: emptyObserved(),
        inferred: { possibleContext: '', possibleEvent: '', uncertainties: [] },
        visualDescription: '',
        visualInconsistencies: [],
        manipulationSignals: [],
        mobileEdits: options.mockMobileEdits || emptyMobileEdits(),
        limitations: ['No image buffer supplied for vision analysis']
      };
    }

    const response = await ai.models.generateContent({
      model: modelName,
      contents: contentsPayload,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1
      }
    });

    let rawText = null;
    if (typeof response.text === 'string') rawText = response.text;
    else if (typeof response.text === 'function') rawText = response.text();
    else if (response.candidates?.[0]?.content?.parts) {
      rawText = response.candidates[0].content.parts.map(p => p.text || '').join('');
    }

    const parsed = JSON.parse((rawText || '{}').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim());

    // Format manipulation signals with standardized phrasing
    const manipulationSignals = (parsed.manipulationSignals || []).map(sig => ({
      type: sig.type || 'ARTIFACT',
      severity: sig.severity || 'LOW',
      confidence: typeof sig.confidence === 'number' ? sig.confidence : 50,
      box_2d: Array.isArray(sig.box_2d) && sig.box_2d.length === 4 ? sig.box_2d : null,
      explanation: sig.explanation?.startsWith('Potential manipulation indicator:') 
        ? sig.explanation 
        : `Potential manipulation indicator: ${sig.explanation || 'Visual anomaly detected'}`
    }));

    // Process & sanitize mobile edits
    let mobileEdits = options.mockMobileEdits || null;
    if (!mobileEdits && parsed.mobileEdits && typeof parsed.mobileEdits === 'object') {
      const rawItems = Array.isArray(parsed.mobileEdits.items) ? parsed.mobileEdits.items : [];
      const sanitizedItems = rawItems
        .filter(item => item && (item.explanation || item.title))
        .map((item, index) => {
          const rawAction = String(item.action || '').toUpperCase();
          const action = ['ADDED', 'ERASED', 'MODIFIED'].includes(rawAction) ? rawAction : 'MODIFIED';
          return {
            id: item.id || String.fromCharCode(65 + index),
            action,
            category: item.category || 'MOBILE_EDIT',
            title: item.title || (action === 'ADDED' ? 'Added Element' : action === 'ERASED' ? 'Erased Region' : 'Modified Area'),
            explanation: item.explanation || 'Visual artifact indicating mobile or local editing.',
            confidence: typeof item.confidence === 'number' ? Math.min(100, Math.max(1, item.confidence)) : 80,
            box_2d: Array.isArray(item.box_2d) && item.box_2d.length === 4 ? item.box_2d : null
          };
        });

      const hasEdits = Boolean(parsed.mobileEdits.hasEdits || sanitizedItems.length > 0);
      const editCount = sanitizedItems.length;
      
      // Proportional deduction calculation: 3% to 10%
      let estimatedEditPercentage = 0;
      if (hasEdits) {
        if (typeof parsed.mobileEdits.estimatedEditPercentage === 'number') {
          estimatedEditPercentage = Math.min(10, Math.max(3, Math.round(parsed.mobileEdits.estimatedEditPercentage)));
        } else {
          // Rule-of-thumb: 3% for single minor edit, +2-3% per additional edit, capped at 10%
          estimatedEditPercentage = Math.min(10, Math.max(3, editCount * 3));
        }
      }

      mobileEdits = {
        hasEdits,
        editCount,
        estimatedEditPercentage,
        summary: parsed.mobileEdits.summary || (hasEdits ? `${editCount} mobile photo alteration(s) detected.` : ''),
        items: sanitizedItems
      };
    } else if (!mobileEdits) {
      mobileEdits = emptyMobileEdits();
    }

    return {
      status: 'AVAILABLE',
      observed: { ...emptyObserved(), ...(parsed.observed || {}) },
      inferred: parsed.inferred || { possibleContext: '', possibleEvent: '', uncertainties: [] },
      visualDescription: parsed.visualDescription || '',
      visualInconsistencies: parsed.visualInconsistencies || [],
      manipulationSignals,
      mobileEdits,
      limitations: []
    };
  } catch (e) {
    return {
      status: 'ERROR',
      observed: emptyObserved(),
      inferred: { possibleContext: '', possibleEvent: '', uncertainties: [] },
      visualDescription: '',
      visualInconsistencies: [],
      manipulationSignals: [],
      mobileEdits: options.mockMobileEdits || emptyMobileEdits(),
      limitations: [`Gemini Vision API analysis error: ${e.message}`]
    };
  }
}

module.exports = {
  analyzeImage
};
