import React, { useState } from 'react';
import {
  Sliders,
  Calculator,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  AlertTriangle,
  ArrowRight,
  Info,
  CheckCircle2
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function ScoreDerivationView({
  factors: propFactors,
  penalties: propPenalties,
  sensitivity: propSensitivity,
  penaltyTotal: propPenaltyTotal,
  finalTrustScore: propTrustScore,
  weightedSum: propWeightedSum,
  scoringVersion = '2.4.0',
  reportData
}) {
  const [hoveredFactor, setHoveredFactor] = useState(null);

  // Extract from reportData if passed directly
  const data = reportData?.explainableScoring || reportData || {};
  
  // Real factors array from backend
  const rawFactors = propFactors || data.factorBreakdown || data.factors || [
    { k: 'claimEvidenceMatch', n: 'Claim–evidence match', sh: 'Evidence', d: 'Degree of semantic alignment between claim propositions and retrieved evidence passages', w: 22, raw: 85 },
    { k: 'sourceAuthority', n: 'Source authority', sh: 'Authority', d: 'Average authority ranking and reputation score of cited publications', w: 18, raw: 90 },
    { k: 'independentCorroboration', n: 'Independent corroboration', sh: 'Corroboration', d: 'Number of distinct, non-syndicated corporate media owners corroborating the claim', w: 15, raw: 95 },
    { k: 'contradictoryEvidence', n: 'Contradictory evidence', sh: 'Stance', d: 'Proportion of unrefuted vs contested evidence stances', w: 12, raw: 100 },
    { k: 'evidenceFreshness', n: 'Evidence freshness', sh: 'Freshness', d: 'Temporal proximity of evidence to claim event window', w: 8, raw: 90 },
    { k: 'provenanceQuality', n: 'Provenance trail', sh: 'Provenance', d: 'Confidence in first-known publication origin and wire archives', w: 7, raw: 85 },
    { k: 'attributionQuality', n: 'Language & framing', sh: 'Language', d: 'Clarity of named primary actors, direct quotes, and official statements', w: 6, raw: 88 },
    { k: 'contextFramingQuality', n: 'Amplification pattern', sh: 'Spread', d: 'Freedom from sensationalism, urgency manipulation, and logical inconsistencies', w: 5, raw: 92 }
  ];

  // Normalize factor items cleanly
  const factors = rawFactors.map(f => ({
    k: f.k || f.factorKey || f.id,
    n: f.n || f.factorName || f.name,
    sh: f.sh || f.shortName || (f.factorName ? f.factorName.split(' ')[0] : 'Factor'),
    d: f.d || f.description || '',
    w: typeof f.w === 'number' ? f.w : (typeof f.weight === 'number' ? Math.round(f.weight) : 10),
    raw: typeof f.raw === 'number' ? f.raw : (typeof f.rawScore === 'number' ? f.rawScore : (typeof f.score === 'number' ? f.score : 50))
  }));

  // Real penalties array from backend
  const penalties = propPenalties || data.appliedPenalties || data.penalties || [];
  
  // Real sensitivity / counterfactuals from backend
  const sensitivity = propSensitivity || data.counterfactualConditions || data.sensitivity || [
    { label: 'Providing independent third-party evidence citations', change: '+10' }
  ];

  const totalWeight = factors.reduce((sum, f) => sum + f.w, 0) || 100;
  const calculatedWeightedSum = factors.reduce((sum, f) => sum + (f.raw * f.w) / totalWeight, 0);
  const weightedSum = propWeightedSum !== undefined ? propWeightedSum : Number(calculatedWeightedSum.toFixed(1));
  
  const penaltyTotal = propPenaltyTotal !== undefined ? propPenaltyTotal : (penalties.reduce((sum, p) => sum + Math.abs(parseFloat(p.val || p.pointsDeducted || p.value || 0)), 0));
  const finalTrustScore = propTrustScore !== undefined ? propTrustScore : Math.max(0, Math.min(100, Math.round(weightedSum - penaltyTotal)));

  return (
    <div className="space-y-5 text-sm text-slate-200">
      
      {/* 1. FACTOR PILL BADGES SUMMARY BAR (Fixes label truncation and guarantees full visibility) */}
      <div className="flex flex-wrap items-center gap-2 p-3 bg-slate-950/80 border border-slate-800/90 rounded-2xl">
        <span className="text-[10px] font-mono uppercase text-slate-400 font-bold tracking-wider mr-1 flex items-center gap-1">
          <Sliders className="w-3 h-3 text-indigo-400" /> Active Factors ({factors.length}):
        </span>
        {factors.map((f) => {
          const isHovered = hoveredFactor === f.k;
          return (
            <div
              key={f.k}
              onMouseEnter={() => setHoveredFactor(f.k)}
              onMouseLeave={() => setHoveredFactor(null)}
              className={`px-2.5 py-1 rounded-xl text-xs font-mono transition flex items-center gap-1.5 cursor-pointer border ${
                isHovered
                  ? 'bg-indigo-950/90 border-indigo-500/50 text-white shadow-md'
                  : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
              title={`${f.n}: ${f.w}% weight, score: ${f.raw}/100`}
            >
              <span className="font-semibold">{f.n}</span>
              <span className="text-slate-500 font-normal">({f.w}%)</span>
              <span className={`font-bold px-1.5 py-0.2 rounded text-[10px] ${
                f.raw >= 75 ? 'bg-emerald-500/20 text-emerald-300' :
                f.raw >= 40 ? 'bg-amber-500/20 text-amber-300' :
                'bg-rose-500/20 text-rose-300'
              }`}>
                {f.raw}
              </span>
            </div>
          );
        })}
      </div>

      {/* 2. SIGNATURE DERIVATION CARD */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        
        {/* Proportional Segmented Strip */}
        <div className="flex h-12 border-b border-slate-800 bg-slate-950">
          {factors.map((f) => {
            const widthPct = (f.w / totalWeight) * 100;
            const isHovered = hoveredFactor === f.k;
            return (
              <div
                key={f.k}
                onMouseEnter={() => setHoveredFactor(f.k)}
                onMouseLeave={() => setHoveredFactor(null)}
                style={{ width: `${widthPct}%` }}
                className={`relative flex flex-col justify-end transition-all border-r border-slate-900 last:border-0 cursor-pointer overflow-hidden ${
                  isHovered ? 'bg-indigo-950/80 brightness-125' : 'bg-slate-900/60 hover:bg-slate-800/80'
                }`}
                title={`${f.n}: ${f.w}% weight (Score: ${f.raw}/100)`}
              >
                <span className="absolute top-1.5 inset-x-0 text-center font-mono text-[9px] text-slate-400 select-none">
                  {f.w}%
                </span>
                <span className="absolute top-5 inset-x-0 text-center text-[9px] text-slate-400 truncate px-1 select-none font-medium">
                  {f.sh}
                </span>
                {/* Score bar at bottom */}
                <div
                  style={{ height: `${Math.max(4, f.raw * 0.28)}px` }}
                  className={`w-full transition-all ${
                    f.raw >= 75 ? 'bg-emerald-500' : f.raw >= 40 ? 'bg-amber-500' : 'bg-rose-500'
                  }`}
                />
              </div>
            );
          })}
        </div>

        {/* Itemized Mathematical Calculation Rows */}
        <div className="divide-y divide-slate-800/60">
          {factors.map((f) => {
            const isHovered = hoveredFactor === f.k;
            const contribution = ((f.raw * f.w) / totalWeight).toFixed(1);
            return (
              <div
                key={f.k}
                onMouseEnter={() => setHoveredFactor(f.k)}
                onMouseLeave={() => setHoveredFactor(null)}
                className={`grid grid-cols-12 gap-3 items-center px-4 py-2.5 transition text-xs ${
                  isHovered ? 'bg-indigo-500/10' : 'hover:bg-slate-800/40'
                }`}
              >
                <div className="col-span-12 sm:col-span-6">
                  <span className="font-medium text-slate-200 block">{f.n}</span>
                  <span className="text-[11px] text-slate-400">{f.d}</span>
                </div>
                <div className="col-span-6 sm:col-span-3">
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mb-1">
                    <div
                      style={{ width: `${f.raw}%` }}
                      className={`h-full ${
                        f.raw >= 75 ? 'bg-emerald-400' : f.raw >= 40 ? 'bg-amber-400' : 'bg-rose-400'
                      }`}
                    />
                  </div>
                  <span className="font-mono text-[10px] text-slate-400">{f.raw} / 100</span>
                </div>
                <div className="col-span-3 sm:col-span-1 text-right font-mono text-slate-400 text-xs">
                  × {Math.round((f.w / totalWeight) * 100)}%
                </div>
                <div className="col-span-3 sm:col-span-2 text-right font-mono font-semibold text-indigo-300 text-xs">
                  +{contribution} pts
                </div>
              </div>
            );
          })}
        </div>

        {/* Formula Footer */}
        <div className="px-5 py-3.5 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-slate-400">
          <div className="flex items-center gap-2">
            <Calculator className="w-4 h-4 text-indigo-400" />
            <span>Trust = Σ (factor score × weight) − penalties</span>
          </div>
          <div className="flex items-center gap-3">
            <span>Σ weighted = <strong className="text-white">{Number(weightedSum).toFixed(1)}</strong></span>
            <span>penalties = <strong className={penaltyTotal > 0 ? 'text-rose-400' : 'text-slate-400'}>-{Number(penaltyTotal).toFixed(1)}</strong></span>
            <span>Score = <strong className={`text-sm ${
              finalTrustScore >= 75 ? 'text-emerald-400' : finalTrustScore >= 40 ? 'text-amber-400' : 'text-rose-400'
            }`}>{finalTrustScore} / 100</strong></span>
          </div>
        </div>
      </div>

      {/* 3. PENALTIES APPLIED & SENSITIVITY MATRIX */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* Penalties Card (STRICTLY CONDITIONAL) */}
        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-rose-400 flex items-center gap-1.5 mb-1">
            <ShieldAlert className="w-3.5 h-3.5" /> Direct Penalties Applied
          </span>

          {penalties.length > 0 ? (
            <div className="space-y-1.5">
              {penalties.map((p, i) => (
                <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-slate-800/60 last:border-0">
                  <span className="text-slate-300">{p.label || p.reason || p.description || p.code}</span>
                  <span className="font-mono text-rose-400 font-bold">{p.val || `-${p.pointsDeducted || p.value || 0}`}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 py-2 text-xs text-emerald-400 font-mono">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>Zero penalties applied — no manipulation, refutation, or tampering detected.</span>
            </div>
          )}
        </div>

        {/* Sensitivity: What would move this score */}
        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5 mb-1">
            <TrendingUp className="w-3.5 h-3.5" /> What Would Move This Score
          </span>
          
          <div className="space-y-1.5">
            {sensitivity.map((s, i) => {
              const changeStr = s.change || s.potentialImpact || '+10';
              const isPositive = !String(changeStr).startsWith('-');
              return (
                <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-slate-800/60 last:border-0 gap-2">
                  <span className="text-slate-300 truncate">{s.label || s.condition}</span>
                  <span className={`font-mono font-bold flex-shrink-0 ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {changeStr}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Customization Link */}
      <div className="flex items-center justify-between p-3.5 bg-slate-900/40 border border-slate-800/80 rounded-xl text-xs text-slate-400">
        <span>Scoring methodology v{scoringVersion} is deterministic and audit-traceable.</span>
        <Link 
          to="/settings?tab=algo" 
          className="text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 transition"
        >
          View Scoring Configuration <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

    </div>
  );
}
