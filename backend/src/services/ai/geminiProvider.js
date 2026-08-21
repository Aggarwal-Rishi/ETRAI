/**
 * ETRAI Google Gemini AI Provider Implementation
 * Production-grade integration with @google/genai SDK, schema validation, retry backoff, and robust error classification.
 */

'use strict';

const AIProviderInterface = require('./aiProviderInterface');
const { GoogleGenAI } = require('@google/genai');

class GeminiProvider extends AIProviderInterface {
  constructor(options = {}) {
    super('GEMINI');

    // Environment-driven defaults with zero hardcoded credentials
    this.apiKey = options.apiKey || process.env.GEMINI_API_KEY || '';
    this.defaultModel = options.defaultModel || (process.env.GEMINI_MODEL || 'gemini-flash-lite-latest').trim();
    this.defaultTemperature = parseFloat(options.temperature ?? process.env.GEMINI_TEMPERATURE ?? '0.0');
    this.defaultMaxTokens = parseInt(options.maxTokens ?? process.env.GEMINI_MAX_OUTPUT_TOKENS ?? '4096', 10);
    this.defaultTimeoutMs = parseInt(options.timeoutMs ?? process.env.GEMINI_TIMEOUT_MS ?? '30000', 10);
    this.maxRetries = parseInt(options.maxRetries ?? process.env.GEMINI_MAX_RETRIES ?? '3', 10);
    this.backoffBaseMs = parseInt(options.backoffBaseMs ?? process.env.GEMINI_BACKOFF_FACTOR_MS ?? '1000', 10);

    this.client = this.isAvailable() ? new GoogleGenAI({ apiKey: this.apiKey }) : null;
  }

  isAvailable() {
    if (!this.apiKey || typeof this.apiKey !== 'string') return false;
    const trimmed = this.apiKey.trim();
    return trimmed.length > 5 && !trimmed.includes('your_gemini_api_key') && trimmed !== 'YOUR_GEMINI_API_KEY_HERE';
  }

  getModelMetadata(modelName = null) {
    const activeModel = modelName || this.defaultModel;
    const is25 = activeModel.includes('2.5') || activeModel.includes('pro');
    return {
      provider: 'GEMINI',
      model: activeModel,
      contextWindow: is25 ? 2000000 : 1000000,
      maxOutputTokens: 8192,
      inputCostPer1k: 0.000125,
      outputCostPer1k: 0.000375,
      supportsMultimodal: true,
      supportsStructuredJson: true,
      supportsGrounding: true
    };
  }

  _estimateTokens(text) {
    if (!text || typeof text !== 'string') return 0;
    return Math.ceil(text.length / 4);
  }

  _calculateCost(inputTokens, outputTokens) {
    const meta = this.getModelMetadata();
    const cost = (inputTokens / 1000) * meta.inputCostPer1k + (outputTokens / 1000) * meta.outputCostPer1k;
    return Math.round(cost * 100000) / 100000;
  }

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

  /**
   * Helper to execute an async AI operation with exponential backoff retries and timeout
   */
  async _executeWithRetry(fn, operationName, customTimeoutMs = null) {
    const timeout = customTimeoutMs || this.defaultTimeoutMs;
    let lastError = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            const err = new Error(`Gemini ${operationName} timed out after ${timeout}ms (attempt ${attempt}/${this.maxRetries})`);
            err.code = 'AI_TIMEOUT';
            reject(err);
          }, timeout);
        });

        return await Promise.race([fn(), timeoutPromise]);
      } catch (err) {
        lastError = err;
        const classification = this.classifyError(err);
        
        // If error is not retryable (e.g. invalid API key or safety refusal), abort immediately
        if (!classification.retryable || attempt === this.maxRetries) {
          const enrichedError = new Error(`[Gemini ${operationName} ${classification.code}]: ${classification.message} (Underlying: ${err.message})`);
          enrichedError.code = classification.code;
          enrichedError.underlying = err;
          enrichedError.status = 'FAILED';
          throw enrichedError;
        }

        // Exponential backoff with jitter
        const delay = this.backoffBaseMs * Math.pow(2, attempt - 1) + Math.random() * 200;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  /**
   * Generates free-form text output
   */
  async generateText({
    prompt,
    systemPrompt = '',
    temperature = null,
    maxTokens = null,
    model = null,
    timeoutMs = null
  }) {
    if (!this.isAvailable() || !this.client) {
      const err = new Error('[Gemini AI_AUTH_FAILURE]: Gemini API key unconfigured or invalid.');
      err.code = 'AI_AUTH_FAILURE';
      throw err;
    }

    const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
    const modelName = model || this.defaultModel;
    const temp = temperature !== null ? temperature : (this.defaultTemperature || 0.2);
    const maxOut = maxTokens || this.defaultMaxTokens;

    const res = await this._executeWithRetry(async () => {
      return await this.client.models.generateContent({
        model: modelName,
        contents: fullPrompt,
        config: {
          temperature: temp,
          maxOutputTokens: maxOut
        }
      });
    }, 'generateText', timeoutMs);

    let rawText = '';
    if (typeof res.text === 'string') rawText = res.text;
    else if (typeof res.text === 'function') rawText = res.text();
    else if (res.candidates?.[0]?.content?.parts) {
      rawText = res.candidates[0].content.parts.map(p => p.text || '').join('');
    }

    const inputTokens = this._estimateTokens(fullPrompt);
    const outputTokens = this._estimateTokens(rawText);

    return {
      status: 'SUCCESS',
      text: rawText,
      tokens: { input: inputTokens, output: outputTokens, total: inputTokens + outputTokens },
      costUsd: this._calculateCost(inputTokens, outputTokens),
      model: modelName
    };
  }

  /**
   * Generates structured JSON output with strict validation and parsing
   */
  async generateStructured({
    prompt,
    systemPrompt = '',
    schema = null,
    validator = null,
    temperature = null,
    maxTokens = null,
    model = null,
    timeoutMs = null
  }) {
    if (!this.isAvailable() || !this.client) {
      const err = new Error('[Gemini AI_AUTH_FAILURE]: Gemini API key unconfigured or invalid.');
      err.code = 'AI_AUTH_FAILURE';
      throw err;
    }

    const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
    const modelName = model || this.defaultModel;
    const temp = temperature !== null ? temperature : this.defaultTemperature;
    const maxOut = maxTokens || this.defaultMaxTokens;

    const res = await this._executeWithRetry(async () => {
      const apiRes = await this.client.models.generateContent({
        model: modelName,
        contents: fullPrompt,
        config: {
          responseMimeType: 'application/json',
          temperature: temp,
          maxOutputTokens: maxOut
        }
      });

      let rawText = '';
      if (typeof apiRes.text === 'string') rawText = apiRes.text;
      else if (typeof apiRes.text === 'function') rawText = apiRes.text();
      else if (apiRes.candidates?.[0]?.content?.parts) {
        rawText = apiRes.candidates[0].content.parts.map(p => p.text || '').join('');
      }

      const parsed = this._safeParseJson(rawText);
      if (!parsed) {
        const err = new Error(`Malformed JSON output from Gemini: ${rawText.substring(0, 120)}...`);
        err.code = 'AI_MALFORMED_OUTPUT';
        throw err;
      }

      // Schema or custom validator validation
      if (typeof validator === 'function') {
        const validationResult = validator(parsed);
        if (validationResult === false || (typeof validationResult === 'object' && validationResult.valid === false)) {
          const err = new Error(`JSON failed schema validation: ${validationResult?.error || 'Schema mismatch'}`);
          err.code = 'AI_MALFORMED_OUTPUT';
          throw err;
        }
      }

      return { parsed, rawText };
    }, 'generateStructured', timeoutMs);

    const inputTokens = this._estimateTokens(fullPrompt);
    const outputTokens = this._estimateTokens(res.rawText);

    return {
      status: 'SUCCESS',
      data: res.parsed,
      tokens: { input: inputTokens, output: outputTokens, total: inputTokens + outputTokens },
      costUsd: this._calculateCost(inputTokens, outputTokens),
      model: modelName,
      raw: res.rawText
    };
  }

  /**
   * Analyzes multimodal inputs (image, video, document)
   */
  async generateMultimodal({
    prompt,
    mimeType,
    dataBase64,
    isJson = true,
    temperature = null,
    model = null,
    timeoutMs = null
  }) {
    if (!this.isAvailable() || !this.client) {
      const err = new Error('[Gemini AI_AUTH_FAILURE]: Gemini API key unconfigured or invalid.');
      err.code = 'AI_AUTH_FAILURE';
      throw err;
    }

    const modelName = model || this.defaultModel;
    const temp = temperature !== null ? temperature : 0.1;

    const res = await this._executeWithRetry(async () => {
      const apiRes = await this.client.models.generateContent({
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
          temperature: temp
        }
      });

      let rawText = '';
      if (typeof apiRes.text === 'string') rawText = apiRes.text;
      else if (typeof apiRes.text === 'function') rawText = apiRes.text();
      else if (apiRes.candidates?.[0]?.content?.parts) {
        rawText = apiRes.candidates[0].content.parts.map(p => p.text || '').join('');
      }

      if (isJson) {
        const parsed = this._safeParseJson(rawText);
        if (!parsed) {
          const err = new Error(`Malformed JSON output from multimodal Gemini: ${rawText.substring(0, 120)}...`);
          err.code = 'AI_MALFORMED_OUTPUT';
          throw err;
        }
        return { data: parsed, rawText };
      }

      return { data: rawText, rawText };
    }, 'generateMultimodal', timeoutMs);

    const inputTokens = this._estimateTokens(prompt) + 258; // Standard image token estimate
    const outputTokens = this._estimateTokens(res.rawText);

    return {
      status: 'SUCCESS',
      data: res.data,
      tokens: { input: inputTokens, output: outputTokens, total: inputTokens + outputTokens },
      costUsd: this._calculateCost(inputTokens, outputTokens),
      model: modelName,
      raw: res.rawText
    };
  }
}

module.exports = GeminiProvider;
