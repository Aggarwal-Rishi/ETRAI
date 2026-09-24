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

/**
 * Dual-Axis Scoring Engine & Epistemic Guardrail Synthesizer
 * Separates truth value (Veracity Index V) from proof certainty (Evidentiary Certainty C).
 * 
 * Veracity Index V = 50 * (1 + S_net), where S_net = (W_sup - W_ref) / W_total
 * Evidentiary Certainty C = Mean(Authority) * (1 - e^(-0.4 * N_indep))
 */
function calculateDualAxisScore({
  supportingSources = [],
  refutingSources = [],
  qualifyingSources = [],
  neutralSources = [],
  allSources = [],
  distinctCorporateParents = 0,
  maxRefutingAuthority = 0
} = {}) {
  const getAuth = (s) => typeof s.authorityScore === 'number' ? s.authorityScore : (typeof s.trustScore === 'number' ? Math.round(s.trustScore * 100) : 50);

  const wSup = supportingSources.reduce((sum, s) => sum + getAuth(s), 0);
  const wRef = refutingSources.reduce((sum, s) => sum + getAuth(s), 0);
  const wQual = qualifyingSources.reduce((sum, s) => sum + (getAuth(s) * 0.5), 0);
  const wTotal = allSources.reduce((sum, s) => sum + getAuth(s), 0);

  // 1. Veracity Index (0 to 100)
  let sNet = 0;
  let veracityIndex = 50.0;
  if (wTotal > 0) {
    sNet = ((wSup + wQual) - wRef) / wTotal;
    veracityIndex = Number(Math.max(0, Math.min(100, 50.0 * (1.0 + sNet))).toFixed(1));
  }

  // 2. Evidentiary Certainty (0 to 100)
  const nIndep = Math.max(0, distinctCorporateParents || allSources.length);
  const totalCount = allSources.length;
  const meanAuthority = totalCount > 0 ? (wTotal / totalCount) : 0;
  const certaintyFactor = 1.0 - Math.exp(-0.4 * nIndep);
  const evidentiaryCertainty = Number(Math.max(0, Math.min(100, meanAuthority * certaintyFactor)).toFixed(1));

  // 3. Epistemic Guardrail Execution
  let canonicalVerdict = 'UNVERIFIED';
  let evidenceState = 'INSUFFICIENT';
  let statusLabel = 'UNVERIFIED';

  if (totalCount === 0 || nIndep === 0 || evidentiaryCertainty < 30.0) {
    canonicalVerdict = 'UNVERIFIED';
    evidenceState = 'INSUFFICIENT';
    statusLabel = 'UNVERIFIED';
  } else if (veracityIndex >= 80.0 && supportingSources.length > 0) {
    canonicalVerdict = 'VERIFIED';
    evidenceState = 'SUPPORTED';
    statusLabel = 'TRUSTED';
  } else if (veracityIndex <= 25.0 && refutingSources.length > 0 && maxRefutingAuthority >= 85) {
    canonicalVerdict = 'FALSE';
    evidenceState = 'REFUTED';
    statusLabel = 'FABRICATED';
  } else if (qualifyingSources.length > 0 || (supportingSources.length > 0 && refutingSources.length > 0)) {
    canonicalVerdict = 'PARTIALLY_VERIFIED';
    evidenceState = 'MIXED';
    statusLabel = 'SUSPICIOUS';
  } else {
    canonicalVerdict = 'UNVERIFIED';
    evidenceState = 'INSUFFICIENT';
    statusLabel = 'SUSPICIOUS';
  }

  return {
    veracityIndex,
    evidentiaryCertainty,
    canonicalVerdict,
    evidenceState,
    statusLabel,
    netBalance: Number(sNet.toFixed(3)),
    distinctCorporateParents: nIndep,
    weightsSummary: {
      wSup,
      wRef,
      wQual,
      wTotal
    }
  };
}

module.exports = {
  DEFAULT_GLOBAL_WEIGHTS,
  getGlobalScoringWeights,
  updateGlobalScoringWeights,
  resetGlobalScoringWeights,
  calculateClaimScore,
  calculateDualAxisScore,
  normalizeWeights
};
