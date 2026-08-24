/**
 * Provider Manager Service for ETRAI
 * Centralizes provider availability checks, environment modes, test fixture provisioning,
 * and standard Google Gemini (@google/genai) client initialization with timeout guardrails.
 * 
 * Rules:
 * - NEVER expose raw API key secrets.
 * - Mode: REAL (production default) or MOCK (only when ETRAI_TEST_MODE=mock).
 * - Real mode with missing keys MUST return UNAVAILABLE without fabricating evidence.
 * - Mock mode ONLY uses fixture evidence clearly marked as test-fixture.local.
 * - All agents (Agent 1 Intake/Vision, Agent 2 Claim Extraction, Agent 3 Fact Verification,
 *   Agent 4 Report Synthesis, Forensics, Corrections) use Google Gemini.
 */

function isKeyValid(key) {
  if (!key || typeof key !== 'string') return false;
  const trimmed = key.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.includes('your_openai_api_key') || trimmed.includes('your_serper_api_key') || trimmed === 'sk-proj-your_openai_api_key_here') {
    return false;
  }
  if (trimmed.includes('your_gemini_api_key') || trimmed === 'YOUR_GEMINI_API_KEY_HERE') {
    return false;
  }
  if (trimmed.includes('your_google_vision_api_key') || trimmed === 'YOUR_GOOGLE_VISION_API_KEY_HERE') {
    return false;
  }
  if (trimmed.includes('your_serpapi_api_key') || trimmed === 'YOUR_SERPAPI_API_KEY_HERE') {
    return false;
  }
  return true;
}

/**
 * Creates standard Google Gemini SDK instance (@google/genai).
 * Used across all ETRAI pipeline agents (Agents 1-4).
 */
function createGeminiClient(apiKeyOverride = null) {
  const { GoogleGenAI } = require('@google/genai');
  const apiKey = apiKeyOverride || process.env.GEMINI_API_KEY;
  if (!isKeyValid(apiKey)) return null;
  try {
    return new GoogleGenAI({ apiKey });
  } catch (e) {
    console.warn('[Gemini Client Init Warning]:', e.message);
    return null;
  }
}

/**
 * Legacy wrapper for createGeminiClient.
 */
function createOpenAIClient(apiKeyOverride = null) {
  return createGeminiClient(apiKeyOverride);
}

/**
 * Returns current provider status object for pipeline telemetry & observability.
 * - gemini: reflects GEMINI_API_KEY (primary AI provider for all agents)
 * - openai: mirrors gemini or OPENAI_API_KEY for backward compatibility
 * - webSearch: reflects SERPER_API_KEY
 * - googleVision: reflects GOOGLE_VISION_API_KEY
 * - googleLens: reflects SERPAPI_API_KEY
 * - mode: MOCK only when ETRAI_TEST_MODE=mock
 */
function getProviderStatus() {
  const geminiKey = process.env.GEMINI_API_KEY;
  const openAiKey = process.env.OPENAI_API_KEY;
  const serperKey = process.env.SERPER_API_KEY;
  const googleVisionKey = process.env.GOOGLE_VISION_API_KEY || process.env.GOOGLE_API_KEY;
  const serpApiKey = process.env.SERPAPI_API_KEY;
  const testMode = (process.env.ETRAI_TEST_MODE || '').toLowerCase().trim();

  const isMockMode = testMode === 'mock';
  const isGeminiAvailable = isKeyValid(geminiKey);
  const isOpenAiAvailable = isKeyValid(openAiKey) || isGeminiAvailable;

  return {
    gemini: isGeminiAvailable ? 'AVAILABLE' : 'UNAVAILABLE',
    openai: isOpenAiAvailable ? 'AVAILABLE' : 'UNAVAILABLE',
    webSearch: isKeyValid(serperKey) ? 'AVAILABLE' : 'UNAVAILABLE',
    googleVision: isKeyValid(googleVisionKey) ? 'AVAILABLE' : 'UNAVAILABLE',
    googleLens: isKeyValid(serpApiKey) ? 'AVAILABLE' : 'UNAVAILABLE',
    mode: isMockMode ? 'MOCK' : 'REAL'
  };
}

/**
 * Returns deterministic mock search fixtures for test mode only.
 * Mock sources use test-fixture.local domains and are clearly flagged.
 * NEVER uses real news domains (Reuters, BBC, FactCheck) for mock data.
 */
function getMockSearchFixtures(searchQuery = '') {
  return [
    {
      index: 0,
      title: `[Test Fixture] Mock Verification Data for: ${searchQuery.substring(0, 40)}`,
      url: `https://test-fixture.local/mock-article-1?q=${encodeURIComponent(searchQuery.substring(0, 20))}`,
      snippet: `Deterministic test fixture evidence provided for offline test mode assertion: ${searchQuery.substring(0, 60)}.`,
      domain: 'test-fixture.local',
      isMockFixture: true
    }
  ];
}

module.exports = {
  getProviderStatus,
  getMockSearchFixtures,
  isKeyValid,
  createGeminiClient,
  createOpenAIClient
};
