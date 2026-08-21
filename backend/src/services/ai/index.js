/**
 * ETRAI AI Provider Factory & Export
 */

'use strict';

const AIProviderInterface = require('./aiProviderInterface');
const GeminiProvider = require('./geminiProvider');

// Singleton default AI provider (Google Gemini)
const defaultProvider = new GeminiProvider();

module.exports = {
  AIProviderInterface,
  GeminiProvider,
  defaultProvider,
  getAIProvider: (apiKey = null, model = null) => {
    if (apiKey || model) return new GeminiProvider(apiKey, model);
    return defaultProvider;
  }
};
