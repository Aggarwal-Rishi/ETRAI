/**
 * ETRAI Global Scoring Configuration Service
 * 
 * Provides a unified, deterministic scoring formula applied identically across
 * every individual claim and rolled up into the final trust score.
 * 
 * Core Formula:
 *   Claim Score = Clamp[0, 100](
 *     Evidence Grounding × w_evidence +
 *     Source Authority   × w_authority +
 *     Source Agreement   × w_agreement +
 *     Source Independence × w_independence
 *   )
 */

'use strict';

const fs = require('fs');
const path = require('path');

const CONFIG_FILE_PATH = path.join(__dirname, '../../config/scoringWeights.json');

// Default global weights (sum = 1.0 / 100%)
const DEFAULT_GLOBAL_WEIGHTS = {
  evidenceQuality: 0.30,      // Evidence Grounding / Relevance match
  sourceAuthority: 0.25,      // Credibility of cited domains
  sourceAgreement: 0.25,      // Stance corroboration vs refutation
  sourceIndependence: 0.20    // Non-syndicated / diverse publisher count
};

let inMemoryWeights = null;

function loadStoredWeights() {
  if (inMemoryWeights) return inMemoryWeights;
  try {
    if (fs.existsSync(CONFIG_FILE_PATH)) {
      const content = fs.readFileSync(CONFIG_FILE_PATH, 'utf8');
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === 'object') {
        inMemoryWeights = normalizeWeights(parsed);
        return inMemoryWeights;
      }
    }
  } catch (err) {
    console.warn('[ScoringConfig] Could not read scoringWeights.json, using defaults:', err.message);
  }
  inMemoryWeights = { ...DEFAULT_GLOBAL_WEIGHTS };
  return inMemoryWeights;
}

function normalizeWeights(rawWeights = {}) {
  const keys = ['evidenceQuality', 'sourceAuthority', 'sourceAgreement', 'sourceIndependence'];
  let sum = 0;
  const cleaned = {};

  for (const k of keys) {
    const val = typeof rawWeights[k] === 'number' && !isNaN(rawWeights[k])
      ? Math.max(0, rawWeights[k])
      : DEFAULT_GLOBAL_WEIGHTS[k];
    cleaned[k] = val;
    sum += val;
  }

  if (sum === 0) sum = 1.0;

  // Normalize so weights sum to exactly 1.0
  const normalized = {};
  for (const k of keys) {
    normalized[k] = Number((cleaned[k] / sum).toFixed(4));
  }
  return normalized;
}

function getGlobalScoringWeights() {
  return loadStoredWeights();
}

function updateGlobalScoringWeights(newWeights) {
  const normalized = normalizeWeights(newWeights);
  inMemoryWeights = normalized;

  try {
    const dir = path.dirname(CONFIG_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(normalized, null, 2), 'utf8');
  } catch (err) {
    console.error('[ScoringConfig] Failed to save scoring weights to file:', err.message);
  }

  return inMemoryWeights;
}

function resetGlobalScoringWeights() {
  return updateGlobalScoringWeights(DEFAULT_GLOBAL_WEIGHTS);
}

/**
 * Calculates a single claim score using the global formula and active weights.
 *
 * @param {Object} factors
 * @param {number} factors.evidenceQuality     (0-100)
 * @param {number} factors.sourceAuthority    (0-100)
 * @param {number} factors.sourceAgreement     (0-100)
 * @param {number} factors.sourceIndependence  (0-100)
 * @param {Object} [customWeights]            Optional override weights
 * @returns {number} Deterministic score (0-100)
 */
function calculateClaimScore(factors = {}, customWeights = null) {
  const weights = customWeights ? normalizeWeights(customWeights) : getGlobalScoringWeights();

  const eq = Math.max(0, Math.min(100, typeof factors.evidenceQuality === 'number' ? factors.evidenceQuality : 50));
  const sa = Math.max(0, Math.min(100, typeof factors.sourceAuthority === 'number' ? factors.sourceAuthority : 50));
  const sag = Math.max(0, Math.min(100, typeof factors.sourceAgreement === 'number' ? factors.sourceAgreement : 50));
  const si = Math.max(0, Math.min(100, typeof factors.sourceIndependence === 'number' ? factors.sourceIndependence : 50));

  const weightedSum = (
    eq * weights.evidenceQuality +
    sa * weights.sourceAuthority +
    sag * weights.sourceAgreement +
    si * weights.sourceIndependence
  );

  return Math.max(0, Math.min(100, Math.round(weightedSum)));
}

module.exports = {
  DEFAULT_GLOBAL_WEIGHTS,
  getGlobalScoringWeights,
  updateGlobalScoringWeights,
  resetGlobalScoringWeights,
  calculateClaimScore,
  normalizeWeights
};
