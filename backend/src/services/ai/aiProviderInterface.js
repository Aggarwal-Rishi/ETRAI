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
   * Generates structured JSON output from prompt & schema
   * @param {Object} params
   * @param {string} params.prompt
   * @param {string} [params.systemPrompt]
   * @param {Object} [params.schema]
   * @param {number} [params.temperature=0.0]
   * @param {number} [params.maxTokens=4096]
   * @param {string} [params.model]
   * @returns {Promise<Object>} parsed JSON object
   */
  async generateJson(params) {
    throw new Error(`generateJson() not implemented by ${this.providerName}`);
  }

  /**
   * Generates free-form text output from prompt
   * @param {Object} params
   * @param {string} params.prompt
   * @param {string} [params.systemPrompt]
   * @param {number} [params.temperature=0.2]
   * @param {number} [params.maxTokens=2048]
   * @param {string} [params.model]
   * @returns {Promise<string>}
   */
  async generateText(params) {
    throw new Error(`generateText() not implemented by ${this.providerName}`);
  }

  /**
   * Analyzes multimodal inputs (image/video/pdf)
   * @param {Object} params
   * @param {string} params.prompt
   * @param {string} params.mimeType
   * @param {string} params.dataBase64
   * @param {boolean} [params.isJson=false]
   * @param {number} [params.temperature=0.1]
   * @param {string} [params.model]
   * @returns {Promise<Object|string>}
   */
  async analyzeMultimodal(params) {
    throw new Error(`analyzeMultimodal() not implemented by ${this.providerName}`);
  }

  /**
   * Transcribes audio into structured speech text
   * @param {Object} params
   * @param {string} params.audioBase64
   * @param {string} [params.mimeType='audio/mp3']
   * @param {string} [params.model]
   * @returns {Promise<{text: string, segments: Array<{start: number, end: number, text: string}>}>}
   */
  async transcribeAudio(params) {
    throw new Error(`transcribeAudio() not implemented by ${this.providerName}`);
  }

  /**
   * Checks if provider credentials and network availability are valid
   * @returns {boolean}
   */
  isAvailable() {
    return false;
  }
}

module.exports = AIProviderInterface;
