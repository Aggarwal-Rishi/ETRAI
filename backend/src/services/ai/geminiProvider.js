/**
 * ETRAI Google Gemini AI Provider Implementation
 * Encapsulates @google/genai SDK integration, retry backoff, response cleaning, and multimodal handling.
 */

'use strict';

const AIProviderInterface = require('./aiProviderInterface');
const { GoogleGenAI } = require('@google/genai');

class GeminiProvider extends AIProviderInterface {
  constructor(apiKey = null, defaultModel = null) {
    super('GEMINI');
    this.apiKey = apiKey || process.env.GEMINI_API_KEY || '';
    this.defaultModel = defaultModel || (process.env.GEMINI_MODEL || 'gemini-flash-lite-latest').trim();
    this.client = this.isAvailable() ? new GoogleGenAI({ apiKey: this.apiKey }) : null;
  }

  isAvailable() {
    if (!this.apiKey || typeof this.apiKey !== 'string') return false;
    const trimmed = this.apiKey.trim();
    return trimmed.length > 5 && !trimmed.includes('your_gemini_api_key') && trimmed !== 'YOUR_GEMINI_API_KEY_HERE';
  }

  /**
   * Cleans Markdown code fences and parses JSON safely
   */
  _safeParseJson(raw) {
    if (!raw || typeof raw !== 'string') return null;
    let text = raw.trim();
    if (text.startsWith('```')) {
      text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    }
    try {
      return JSON.parse(text);
    } catch (_) {}

    const jsonMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (_) {}
      try {
        return JSON.parse(jsonMatch[0].replace(/,\s*([\}\]])/g, '$1'));
      } catch (_) {}
    }
    return null;
  }

  async generateJson({ prompt, systemPrompt = '', temperature = 0.0, maxTokens = 4096, model = null, timeoutMs = 25000 }) {
    if (!this.isAvailable() || !this.client) {
      throw new Error('LLM_UNAVAILABLE: Gemini API key unconfigured or invalid.');
    }

    const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
    const modelName = model || this.defaultModel;

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Gemini generateJson timed out after ${timeoutMs}ms`)), timeoutMs);
    });

    const apiPromise = this.client.models.generateContent({
      model: modelName,
      contents: fullPrompt,
      config: {
        responseMimeType: 'application/json',
        temperature,
        maxOutputTokens: maxTokens
      }
    });

    const response = await Promise.race([apiPromise, timeoutPromise]);
    let rawText = '';
    if (typeof response.text === 'string') rawText = response.text;
    else if (typeof response.text === 'function') rawText = response.text();
    else if (response.candidates?.[0]?.content?.parts) {
      rawText = response.candidates[0].content.parts.map(p => p.text || '').join('');
    }

    const parsed = this._safeParseJson(rawText);
    if (!parsed) {
      throw new Error(`Gemini returned non-parseable JSON response: ${rawText.substring(0, 200)}`);
    }
    return parsed;
  }

  async generateText({ prompt, systemPrompt = '', temperature = 0.2, maxTokens = 2048, model = null, timeoutMs = 25000 }) {
    if (!this.isAvailable() || !this.client) {
      throw new Error('LLM_UNAVAILABLE: Gemini API key unconfigured or invalid.');
    }

    const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
    const modelName = model || this.defaultModel;

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Gemini generateText timed out after ${timeoutMs}ms`)), timeoutMs);
    });

    const apiPromise = this.client.models.generateContent({
      model: modelName,
      contents: fullPrompt,
      config: {
        temperature,
        maxOutputTokens: maxTokens
      }
    });

    const response = await Promise.race([apiPromise, timeoutPromise]);
    if (typeof response.text === 'string') return response.text;
    if (typeof response.text === 'function') return response.text();
    if (response.candidates?.[0]?.content?.parts) {
      return response.candidates[0].content.parts.map(p => p.text || '').join('');
    }
    return '';
  }

  async analyzeMultimodal({ prompt, mimeType, dataBase64, isJson = true, temperature = 0.1, model = null, timeoutMs = 30000 }) {
    if (!this.isAvailable() || !this.client) {
      throw new Error('LLM_UNAVAILABLE: Gemini API key unconfigured or invalid.');
    }

    const modelName = model || this.defaultModel;

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Gemini multimodal analysis timed out after ${timeoutMs}ms`)), timeoutMs);
    });

    const apiPromise = this.client.models.generateContent({
      model: modelName,
      contents: [
        prompt,
        {
          inlineData: {
            mimeType,
            data: dataBase64
          }
        }
      ],
      config: {
        ...(isJson ? { responseMimeType: 'application/json' } : {}),
        temperature
      }
    });

    const response = await Promise.race([apiPromise, timeoutPromise]);
    let rawText = '';
    if (typeof response.text === 'string') rawText = response.text;
    else if (typeof response.text === 'function') rawText = response.text();
    else if (response.candidates?.[0]?.content?.parts) {
      rawText = response.candidates[0].content.parts.map(p => p.text || '').join('');
    }

    if (isJson) {
      const parsed = this._safeParseJson(rawText);
      if (!parsed) throw new Error(`Gemini multimodal returned non-parseable JSON: ${rawText.substring(0, 200)}`);
      return parsed;
    }
    return rawText;
  }

  async transcribeAudio({ audioBase64, mimeType = 'audio/mp3', model = null, timeoutMs = 30000 }) {
    const prompt = 'Transcribe the spoken audio in this file accurately into text. Output ONLY a valid JSON object matching this schema: { "text": "full transcript text", "segments": [ { "start": 0.0, "end": 5.0, "text": "segment text" } ] }';
    return await this.analyzeMultimodal({
      prompt,
      mimeType,
      dataBase64: audioBase64,
      isJson: true,
      model,
      timeoutMs
    });
  }
}

module.exports = GeminiProvider;
