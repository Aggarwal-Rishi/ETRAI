const { GoogleGenAI } = require('@google/genai');
const { getProviderStatus, isKeyValid } = require('../providerManager');

const EMPTY_OBSERVED = Object.freeze({
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
  visibleDates: [],
  visibleLocationClues: []
});

function emptyObserved() {
  return Object.fromEntries(Object.entries(EMPTY_OBSERVED).map(([key, value]) => [key, Array.isArray(value) ? [] : value]));
}

/**
 * Image Visual Analyzer Service
 * Uses multimodal Gemini Vision API when available to analyze visual elements.
 * Separates OBSERVED facts from INFERRED context. Identifies potential manipulation indicators.
 */
async function analyzeImage(fileInfo, buffer = null, url = null, options = {}) {
  const geminiKey = options.geminiKey || process.env.GEMINI_API_KEY;
  const hasGemini = isKeyValid(geminiKey);

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
      limitations: ['Gemini multimodal vision provider unavailable (missing API key)']
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const modelName = (process.env.GEMINI_MODEL || 'gemini-flash-lite-latest').trim();

    const promptText = `Analyze this image objectively for factual verification and forensic inspection.

CRITICAL DISTINCTION:
You MUST strictly separate OBSERVED elements (directly visible in image) from INFERRED elements (speculative context). Do NOT claim a specific location or date unless explicitly visible on a sign, timestamp, or unmistakable landmark.

OUTPUT FORMAT (JSON):
{
  "observed": {
    "visibleText": "all visible text transcribed",
    "entities": ["visible public figures/people"],
    "publicFigures": [{"name": "name only when visually recognizable with high confidence", "visibleAppearance": "directly visible features", "attire": "directly visible clothing", "confidence": 0, "basis": "visual basis or uncertainty"}],
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
      "explanation": "Potential manipulation indicator: [explanation]"
    }
  ]
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
      explanation: sig.explanation?.startsWith('Potential manipulation indicator:') 
        ? sig.explanation 
        : `Potential manipulation indicator: ${sig.explanation || 'Visual anomaly detected'}`
    }));

    return {
      status: 'AVAILABLE',
      observed: { ...emptyObserved(), ...(parsed.observed || {}) },
      inferred: parsed.inferred || { possibleContext: '', possibleEvent: '', uncertainties: [] },
      visualDescription: parsed.visualDescription || '',
      visualInconsistencies: parsed.visualInconsistencies || [],
      manipulationSignals,
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
      limitations: [`Gemini Vision API analysis error: ${e.message}`]
    };
  }
}

module.exports = {
  analyzeImage
};
