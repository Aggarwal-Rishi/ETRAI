/**
 * ETRAI AI Provider Abstraction Interface
 * Decouples all ETRAI agents and verification services from underlying LLM SDKs.
 */

'use strict';

class AIProviderInterface {
  constructor(providerName = 'UNKNOWN') {
    this.providerName = providerName;
  }

  /**
   * Generates free-form text output from prompt
   * @param {Object} params
   * @param {string} params.prompt
   * @param {string} [params.systemPrompt]
   * @param {number} [params.temperature]
   * @param {number} [params.maxTokens]
   * @param {string} [params.model]
   * @param {number} [params.timeoutMs]
   * @returns {Promise<{status: 'SUCCESS'|'PARTIAL'|'FAILED', text: string, tokens: Object, costUsd: number, model: string}>}
   */
  async generateText(params) {
    throw new Error(`generateText() not implemented by ${this.providerName}`);
  }

  /**
   * Generates structured JSON output with validation
   * @param {Object} params
   * @param {string} params.prompt
   * @param {string} [params.systemPrompt]
   * @param {Object|Function} [params.schema]
   * @param {number} [params.temperature]
   * @param {number} [params.maxTokens]
   * @param {string} [params.model]
   * @param {number} [params.timeoutMs]
   * @param {Function} [params.validator] Optional custom validator function
   * @returns {Promise<{status: 'SUCCESS'|'PARTIAL'|'FAILED', data: Object, tokens: Object, costUsd: number, model: string}>}
   */
  async generateStructured(params) {
    throw new Error(`generateStructured() not implemented by ${this.providerName}`);
  }

  /**
   * Alias for generateStructured
   */
  async generateJson(params) {
    return this.generateStructured(params);
  }

  /**
   * Analyzes multimodal inputs (image/video/pdf)
   * @param {Object} params
   * @param {string} params.prompt
   * @param {string} params.mimeType
   * @param {string} params.dataBase64
   * @param {boolean} [params.isJson=false]
   * @param {number} [params.temperature]
   * @param {string} [params.model]
   * @returns {Promise<{status: 'SUCCESS'|'PARTIAL'|'FAILED', data: Object|string, tokens: Object, costUsd: number, model: string}>}
   */
  async generateMultimodal(params) {
    throw new Error(`generateMultimodal() not implemented by ${this.providerName}`);
  }

  /**
   * Alias for generateMultimodal
   */
  async analyzeMultimodal(params) {
    return this.generateMultimodal(params);
  }

  /**
   * Returns metadata regarding the active model capabilities, token limits, and pricing
   * @param {string} [modelName]
   * @returns {Object}
   */
  getModelMetadata(modelName = null) {
    return {
      provider: this.providerName,
      model: modelName || 'default',
      contextWindow: 1000000,
      inputCostPer1k: 0.000125,
      outputCostPer1k: 0.000375,
      supportsMultimodal: true,
      supportsStructuredJson: true
    };
  }

  /**
   * Checks if provider credentials and network availability are valid
   * @returns {boolean}
   */
  isAvailable() {
    return false;
  }

  /**
   * Classifies low-level SDK/HTTP errors into standardized ETRAI AI error categories
   * @param {Error} error
   * @returns {{code: string, message: string, retryable: boolean}}
   */
  classifyError(error) {
    const msg = (error?.message || '').toLowerCase();
    const status = error?.status || error?.statusCode || error?.response?.status;

    if (status === 401 || status === 403 || msg.includes('api_key_invalid') || msg.includes('invalid api key') || msg.includes('unauthorized')) {
      return { code: 'AI_AUTH_FAILURE', message: 'AI authentication failed: Invalid or expired API key.', retryable: false };
    }
    if (status === 429 || msg.includes('resource_exhausted') || msg.includes('quota') || msg.includes('rate limit')) {
      return { code: 'AI_RATE_LIMITED', message: 'AI provider quota exhausted or rate limit reached.', retryable: true };
    }
    if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('etimedout')) {
      return { code: 'AI_TIMEOUT', message: 'AI request timed out.', retryable: true };
    }
    if (msg.includes('safety') || msg.includes('blocked') || msg.includes('refusal') || msg.includes('harm_category')) {
      return { code: 'AI_SAFETY_REFUSAL', message: 'AI provider declined to process content under safety guidelines.', retryable: false };
    }
    if (status >= 500 || msg.includes('internal error') || msg.includes('service unavailable') || msg.includes('bad gateway')) {
      return { code: 'AI_SERVICE_OUTAGE', message: 'AI provider service error or temporary outage.', retryable: true };
    }
    if (msg.includes('econnrefused') || msg.includes('enotfound') || msg.includes('network error')) {
      return { code: 'AI_NETWORK_FAILURE', message: 'Network connectivity failure connecting to AI provider.', retryable: true };
    }
    if (msg.includes('json') || msg.includes('parse') || msg.includes('syntaxerror')) {
      return { code: 'AI_MALFORMED_OUTPUT', message: 'AI provider returned malformed or non-parseable output.', retryable: true };
    }

    return { code: 'AI_UNKNOWN_FAILURE', message: error?.message || 'Unknown AI provider error.', retryable: false };
  }
}

module.exports = AIProviderInterface;
