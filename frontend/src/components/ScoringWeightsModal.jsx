import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Sliders,
  Check,
  RotateCcw,
  X,
  Sparkles,
  ShieldAlert,
  HelpCircle,
  Save,
  CheckCircle2
} from 'lucide-react';
import { apiUrl } from '../utils/api';

const FACTOR_METADATA = {
  evidenceQuality: {
    name: 'Evidence Grounding & Relevance',
    short: 'Evidence',
    description: 'Measures how well retrieved news passages and primary docs match claim facts',
    defaultWeight: 30,
    color: 'text-[#0B5CD5]',
    bg: 'bg-[#0B5CD5]'
  },
  sourceAuthority: {
    name: 'Source Authority & Credibility',
    short: 'Authority',
    description: 'Domain trust ranking, news agency tier, and editorial track record of cited outlets',
    defaultWeight: 25,
    color: 'text-[#2C5B3E]',
    bg: 'bg-[#2C5B3E]'
  },
  sourceAgreement: {
    name: 'Source Consensus & Stance',
    short: 'Consensus',
    description: 'Degree of unanimity among corroborating sources vs refuting/conflicting reports',
    defaultWeight: 25,
    color: 'text-[#8A6318]',
    bg: 'bg-[#8A6318]'
  },
  sourceIndependence: {
    name: 'Independent Corroboration',
    short: 'Independence',
    description: 'Diverse publisher ownership, non-syndicated reporting, and distinct wire coverage',
    defaultWeight: 20,
    color: 'text-[#B0512F]',
    bg: 'bg-[#B0512F]'
  }
};

export default function ScoringWeightsModal({
  isOpen,
  onClose,
  currentReport = null,
  onApplyRecalculatedReport = null
}) {
  const [weights, setWeights] = useState({
    evidenceQuality: 30,
    sourceAuthority: 25,
    sourceAgreement: 25,
    sourceIndependence: 20
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successToast, setSuccessToast] = useState(null);
  const [errorToast, setErrorToast] = useState(null);

  // Fetch initial active weights from backend
  useEffect(() => {
    if (!isOpen) return;

    const fetchWeights = async () => {
      try {
        setLoading(true);
        const res = await fetch(apiUrl('/api/v1/verify/scoring-weights'));
        if (res.ok) {
          const data = await res.json();
          if (data.weights) {
            setWeights({
              evidenceQuality: Math.round((data.weights.evidenceQuality || 0.3) * 100),
              sourceAuthority: Math.round((data.weights.sourceAuthority || 0.25) * 100),
              sourceAgreement: Math.round((data.weights.sourceAgreement || 0.25) * 100),
              sourceIndependence: Math.round((data.weights.sourceIndependence || 0.2) * 100)
            });
          }
        }
      } catch (err) {
        console.warn('[ScoringWeightsModal] Failed to fetch server weights:', err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchWeights();
  }, [isOpen]);

  // Lock document body scroll when modal is open
  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  if (!isOpen || typeof document === 'undefined') return null;

  const totalWeight = weights.evidenceQuality + weights.sourceAuthority + weights.sourceAgreement + weights.sourceIndependence;
  const isBalanced = totalWeight === 100;

  const handleSliderChange = (key, val) => {
    const intVal = Math.max(0, Math.min(100, parseInt(val, 10) || 0));
    setWeights(prev => ({ ...prev, [key]: intVal }));
  };

  const handleReset = () => {
    setWeights({
      evidenceQuality: 30,
      sourceAuthority: 25,
      sourceAgreement: 25,
      sourceIndependence: 20
    });
    setSuccessToast('Reset weights to system baseline (30% / 25% / 25% / 20%).');
    setTimeout(() => setSuccessToast(null), 3000);
  };

  /**
   * Recalculates individual claim scores and overall report trust score
   * based on the custom weights.
   */
  const recalculateReportScores = (targetWeights) => {
    if (!currentReport || !currentReport.claims) return null;

    const sum = (targetWeights.evidenceQuality + targetWeights.sourceAuthority + targetWeights.sourceAgreement + targetWeights.sourceIndependence) || 100;
    const norm = {
      eq: targetWeights.evidenceQuality / sum,
      sa: targetWeights.sourceAuthority / sum,
      sag: targetWeights.sourceAgreement / sum,
      si: targetWeights.sourceIndependence / sum
    };

    let claimScoreTotal = 0;
    const updatedClaims = currentReport.claims.map(c => {
      const res = c.claimVerificationResult || {};
      const eq = typeof res.evidenceQuality === 'number' ? res.evidenceQuality : 50;
      const sa = typeof res.sourceAuthority === 'number' ? res.sourceAuthority : (typeof c.sourceAuthority === 'number' ? c.sourceAuthority : 75);
      const sag = typeof res.sourceAgreement === 'number' ? res.sourceAgreement : (c.verdict === 'VERIFIED' ? 100 : c.verdict === 'FALSE' ? 0 : 50);
      const si = typeof res.sourceIndependence === 'number' ? res.sourceIndependence : 70;

      const newConfidence = Math.max(0, Math.min(100, Math.round(eq * norm.eq + sa * norm.sa + sag * norm.sag + si * norm.si)));
      claimScoreTotal += newConfidence;

      return {
        ...c,
        confidence: newConfidence,
        claimVerificationResult: {
          ...res,
          confidence: newConfidence,
          scoringWeights: targetWeights
        }
      };
    });

    const avgClaimScore = updatedClaims.length > 0 ? Math.round(claimScoreTotal / updatedClaims.length) : (currentReport.trustScore || 50);

    return {
      ...currentReport,
      trustScore: avgClaimScore,
      factualAccuracyScore: avgClaimScore,
      confidenceRating: avgClaimScore,
      claims: updatedClaims,
      activeScoringWeights: targetWeights
    };
  };

  const handleApplyToActiveDossier = () => {
    if (!isBalanced) {
      setErrorToast('Weights must sum to exactly 100% before applying.');
      setTimeout(() => setErrorToast(null), 3500);
      return;
    }

    const updated = recalculateReportScores(weights);
    if (updated && onApplyRecalculatedReport) {
      onApplyRecalculatedReport(updated);
      setSuccessToast('Recalculated active dossier scores with new weights.');
      setTimeout(() => {
        setSuccessToast(null);
        onClose();
      }, 1200);
    }
  };

  const handleSaveAsGlobalDefault = async () => {
    if (!isBalanced) {
      setErrorToast('Weights must sum to exactly 100% before saving globally.');
      setTimeout(() => setErrorToast(null), 3500);
      return;
    }

    try {
      setSaving(true);
      const token = localStorage.getItem('etrai_token');
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(apiUrl('/api/v1/verify/scoring-weights'), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          weights: {
            evidenceQuality: weights.evidenceQuality / 100,
            sourceAuthority: weights.sourceAuthority / 100,
            sourceAgreement: weights.sourceAgreement / 100,
            sourceIndependence: weights.sourceIndependence / 100
          }
        })
      });

      if (res.ok) {
        setSuccessToast('Global scoring weights updated successfully for all future pipeline runs.');
        // Also recalculate active report if open
        if (onApplyRecalculatedReport && currentReport) {
          const updated = recalculateReportScores(weights);
          if (updated) onApplyRecalculatedReport(updated);
        }
        setTimeout(() => {
          setSuccessToast(null);
          onClose();
        }, 1500);
      } else {
        const data = await res.json().catch(() => ({}));
        setErrorToast(data.error || 'Failed to persist global scoring weights.');
        setTimeout(() => setErrorToast(null), 4000);
      }
    } catch (err) {
      setErrorToast(err.message || 'Error saving weights.');
      setTimeout(() => setErrorToast(null), 4000);
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md overflow-y-auto animate-fadeIn"
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', margin: 0 }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl bg-white border border-[#CECECE] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] my-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-[#CECECE] bg-[#F8F8F6] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#0B5CD5]/10 border border-[#0B5CD5]/20 rounded-2xl text-[#0B5CD5]">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#0B5CD5]">
                Global Scoring Formula &amp; Weight Configurator
              </h2>
              <p className="text-xs text-[#7386A8]">
                Adjust the weights applied uniformly to each claim and the final dossier trust score
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[#7386A8] hover:text-[#0B5CD5] rounded-xl hover:bg-[#EFEEE9] transition"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* Status banner */}
          <div className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
            isBalanced
              ? 'bg-[#E4EFE7] border-[#C5DEC9] text-[#2C5B3E]'
              : 'bg-[#F7E3E0] border-[#EBC7C2] text-[#B23F35]'
          }`}>
            <div className="flex items-center gap-2">
              {isBalanced ? <CheckCircle2 className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
              <span className="font-semibold text-xs">
                {isBalanced
                  ? 'Weights are normalized to exactly 100%.'
                  : `Total allocation is ${totalWeight}%. Adjust sliders to sum to 100%.`}
              </span>
            </div>
            <span className="font-mono font-bold text-sm px-3 py-1 bg-white rounded-xl border border-current">
              {totalWeight}%
            </span>
          </div>

          {/* Factor Sliders */}
          <div className="space-y-4">
            {Object.keys(FACTOR_METADATA).map(key => {
              const meta = FACTOR_METADATA[key];
              const val = weights[key];

              return (
                <div key={key} className="p-4 bg-[#F8F8F6] border border-[#CECECE] rounded-2xl space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="font-bold text-xs text-[#0B5CD5] block">
                        {meta.name}
                      </span>
                      <p className="text-[11px] text-[#7386A8] leading-tight">
                        {meta.description}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 font-mono flex-shrink-0">
                      <span className={`text-sm font-bold px-2.5 py-0.5 rounded-lg border bg-white ${meta.color}`}>
                        {val}%
                      </span>
                    </div>
                  </div>

                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={val}
                    onChange={e => handleSliderChange(key, e.target.value)}
                    className="w-full accent-[#0B5CD5] cursor-pointer"
                  />
                </div>
              );
            })}
          </div>

          {/* Formula Preview Callout */}
          <div className="p-4 bg-white border border-[#CECECE] rounded-2xl space-y-2">
            <span className="text-[10px] font-mono uppercase text-[#7386A8] font-bold block">
              Mathematical Claim &amp; Final Trust Score Formula
            </span>
            <div className="p-3 bg-[#EFEEE9] rounded-xl font-mono text-[11px] text-[#2C4E86] leading-relaxed">
              Claim Score = Clamp[0, 100](<br />
              &nbsp;&nbsp;Evidence Match × <strong className="text-[#0B5CD5]">{(weights.evidenceQuality / (totalWeight || 100)).toFixed(2)}</strong> +<br />
              &nbsp;&nbsp;Source Authority × <strong className="text-[#2C5B3E]">{(weights.sourceAuthority / (totalWeight || 100)).toFixed(2)}</strong> +<br />
              &nbsp;&nbsp;Stance Consensus × <strong className="text-[#8A6318]">{(weights.sourceAgreement / (totalWeight || 100)).toFixed(2)}</strong> +<br />
              &nbsp;&nbsp;Independence × <strong className="text-[#B0512F]">{(weights.sourceIndependence / (totalWeight || 100)).toFixed(2)}</strong><br />
              )
            </div>
            <p className="text-[11px] text-[#7386A8]">
              This identical formula is computed for each extracted assertion, preventing arbitrary divergence between claims.
            </p>
          </div>

          {/* Toasts */}
          {successToast && (
            <div className="p-3 bg-[#E4EFE7] border border-[#C5DEC9] text-[#2C5B3E] rounded-xl font-medium text-xs animate-fadeIn flex items-center gap-2">
              <Check className="w-4 h-4" />
              {successToast}
            </div>
          )}
          {errorToast && (
            <div className="p-3 bg-[#F7E3E0] border border-[#EBC7C2] text-[#B23F35] rounded-xl font-medium text-xs animate-fadeIn flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" />
              {errorToast}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-6 border-t border-[#CECECE] bg-[#F8F8F6] flex items-center justify-between gap-3 flex-wrap">
          <button
            type="button"
            onClick={handleReset}
            className="px-3 py-2 rounded-xl border border-[#CECECE] bg-white text-[#2C4E86] hover:bg-[#EFEEE9] transition flex items-center gap-1.5 font-bold"
            title="Reset weights to system baseline"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Baseline
          </button>

          <div className="flex items-center gap-2">
            {currentReport && onApplyRecalculatedReport && (
              <button
                type="button"
                onClick={handleApplyToActiveDossier}
                disabled={!isBalanced}
                className="px-4 py-2 rounded-xl border border-[#0B5CD5]/40 bg-[#0B5CD5]/10 text-[#0B5CD5] hover:bg-[#0B5CD5] hover:text-white transition flex items-center gap-1.5 font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                title="Recalculate and preview active report immediately"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Apply to Current Dossier
              </button>
            )}

            <button
              type="button"
              onClick={handleSaveAsGlobalDefault}
              disabled={!isBalanced || saving}
              className="px-4 py-2 rounded-xl bg-[#0B5CD5] text-white hover:bg-[#0033C4] transition flex items-center gap-1.5 font-bold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              title="Save these weights globally for all future analyses"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving...' : 'Save as Global Standard'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
