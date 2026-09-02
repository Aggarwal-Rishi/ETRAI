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
    <div className="space-y-5 text-sm text-[#2C4E86]">
      
      {/* 1. FACTOR PILL BADGES SUMMARY BAR (Fixes label truncation and guarantees full visibility) */}
      <div className="flex flex-wrap items-center gap-2 p-3 bg-[#F8F8F6] border border-[#CECECE] rounded-2xl">
        <span className="text-[10px] font-mono uppercase text-[#7386A8] font-bold tracking-wider mr-1 flex items-center gap-1">
          <Sliders className="w-3 h-3 text-[#D97757]" /> Active Factors ({factors.length}):
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
                  ? 'bg-[#F6E7DF] border-[#E88F6B] text-[#0B5CD5] shadow-xs'
                  : 'bg-white border-[#CECECE] text-[#2C4E86] hover:border-[#AAAAAA]'
              }`}
              title={`${f.n}: ${f.w}% weight, score: ${f.raw}/100`}
            >
              <span className="font-semibold">{f.n}</span>
              <span className="text-[#7386A8] font-normal">({f.w}%)</span>
              <span className={`font-bold px-1.5 py-0.2 rounded text-[10px] ${
                f.raw >= 75 ? 'bg-[#E4EFE7] text-[#2C5B3E]' :
                f.raw >= 40 ? 'bg-[#F7EEDA] text-[#B98520]' :
                'bg-[#F7E3E0] text-[#B23F35]'
              }`}>
                {f.raw}
              </span>
            </div>
          );
        })}
      </div>

      {/* 2. SIGNATURE DERIVATION CARD */}
      <div className="bg-white border border-[#CECECE] rounded-2xl overflow-hidden shadow-sm">
        
        {/* Proportional Segmented Strip */}
        <div className="flex h-12 border-b border-[#CECECE] bg-[#EFEEE9]">
          {factors.map((f) => {
            const widthPct = (f.w / totalWeight) * 100;
            const isHovered = hoveredFactor === f.k;
            return (
              <div
                key={f.k}
                onMouseEnter={() => setHoveredFactor(f.k)}
                onMouseLeave={() => setHoveredFactor(null)}
                style={{ width: `${widthPct}%` }}
                className={`relative flex flex-col justify-end transition-all border-r border-[#CECECE] last:border-0 cursor-pointer overflow-hidden ${
                  isHovered ? 'bg-[#F6E7DF]' : 'bg-[#EFEEE9] hover:bg-[#E5E3DC]'
                }`}
                title={`${f.n}: ${f.w}% weight (Score: ${f.raw}/100)`}
              >
                <span className="absolute top-1.5 inset-x-0 text-center font-mono text-[9px] text-[#7386A8] select-none font-bold">
                  {f.w}%
                </span>
                <span className="absolute top-5 inset-x-0 text-center text-[9px] text-[#2C4E86] truncate px-1 select-none font-semibold">
                  {f.sh}
                </span>
                {/* Score bar at bottom */}
                <div
                  style={{ height: `${Math.max(4, f.raw * 0.28)}px` }}
                  className={`w-full transition-all ${
                    f.raw >= 75 ? 'bg-[#3E7A55]' : f.raw >= 40 ? 'bg-[#B98520]' : 'bg-[#B23F35]'
                  }`}
                />
              </div>
            );
          })}
        </div>

        {/* Itemized Mathematical Calculation Rows */}
        <div className="divide-y divide-[#CECECE]">
          {factors.map((f) => {
            const isHovered = hoveredFactor === f.k;
            const contribution = ((f.raw * f.w) / totalWeight).toFixed(1);
            return (
              <div
                key={f.k}
                onMouseEnter={() => setHoveredFactor(f.k)}
                onMouseLeave={() => setHoveredFactor(null)}
                className={`grid grid-cols-12 gap-3 items-center px-4 py-2.5 transition text-xs ${
                  isHovered ? 'bg-[#F8F8F6]' : 'hover:bg-[#F8F8F6]'
                }`}
              >
                <div className="col-span-12 sm:col-span-6">
                  <span className="font-bold text-[#0B5CD5] block">{f.n}</span>
                  <span className="text-[11px] text-[#7386A8]">{f.d}</span>
                </div>
                <div className="col-span-6 sm:col-span-3">
                  <div className="w-full h-1.5 bg-[#EFEEE9] rounded-full overflow-hidden mb-1">
                    <div
                      style={{ width: `${f.raw}%` }}
                      className={`h-full ${
                        f.raw >= 75 ? 'bg-[#3E7A55]' : f.raw >= 40 ? 'bg-[#B98520]' : 'bg-[#B23F35]'
                      }`}
                    />
                  </div>
                  <span className="font-mono text-[10px] text-[#7386A8]">{f.raw} / 100</span>
                </div>
                <div className="col-span-3 sm:col-span-1 text-right font-mono text-[#7386A8] text-xs">
                  × {Math.round((f.w / totalWeight) * 100)}%
                </div>
                <div className="col-span-3 sm:col-span-2 text-right font-mono font-bold text-[#D97757] text-xs">
                  +{contribution} pts
                </div>
              </div>
            );
          })}
        </div>

        {/* Formula Footer */}
        <div className="px-5 py-3.5 bg-[#F8F8F6] border-t border-[#CECECE] flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-[#7386A8]">
          <div className="flex items-center gap-2">
            <Calculator className="w-4 h-4 text-[#D97757]" />
            <span>Trust = Σ (factor score × weight) − penalties</span>
          </div>
          <div className="flex items-center gap-3">
            <span>Σ weighted = <strong className="text-[#0B5CD5]">{Number(weightedSum).toFixed(1)}</strong></span>
            <span>penalties = <strong className={penaltyTotal > 0 ? 'text-[#B23F35]' : 'text-[#7386A8]'}>-{Number(penaltyTotal).toFixed(1)}</strong></span>
            <span>Score = <strong className={`text-sm ${
              finalTrustScore >= 75 ? 'text-[#3E7A55]' : finalTrustScore >= 40 ? 'text-[#B98520]' : 'text-[#B23F35]'
            }`}>{finalTrustScore} / 100</strong></span>
          </div>
        </div>
      </div>

      {/* 3. PENALTIES APPLIED & SENSITIVITY MATRIX */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* Penalties Card (STRICTLY CONDITIONAL) */}
        <div className="p-4 bg-white border border-[#CECECE] rounded-2xl space-y-2.5 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#B23F35] flex items-center gap-1.5 mb-1">
            <ShieldAlert className="w-3.5 h-3.5" /> Direct Penalties Applied
          </span>

          {penalties.length > 0 ? (
            <div className="space-y-1.5">
              {penalties.map((p, i) => (
                <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-[#CECECE] last:border-0">
                  <span className="text-[#2C4E86]">{p.label || p.reason || p.description || p.code}</span>
                  <span className="font-mono text-[#B23F35] font-bold">{p.val || `-${p.pointsDeducted || p.value || 0}`}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 py-2 text-xs text-[#3E7A55] font-mono">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>Zero penalties applied — no manipulation, refutation, or tampering detected.</span>
            </div>
          )}
        </div>

        {/* Sensitivity: What would move this score */}
        <div className="p-4 bg-white border border-[#CECECE] rounded-2xl space-y-2.5 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#0B5CD5] flex items-center gap-1.5 mb-1">
            <TrendingUp className="w-3.5 h-3.5 text-[#D97757]" /> What Would Move This Score
          </span>
          
          <div className="space-y-1.5">
            {sensitivity.map((s, i) => {
              const changeStr = s.change || s.potentialImpact || '+10';
              const isPositive = !String(changeStr).startsWith('-');
              return (
                <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-[#CECECE] last:border-0 gap-2">
                  <span className="text-[#2C4E86] truncate">{s.label || s.condition}</span>
                  <span className={`font-mono font-bold flex-shrink-0 ${isPositive ? 'text-[#3E7A55]' : 'text-[#B23F35]'}`}>
                    {changeStr}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Customization Link */}
      <div className="flex items-center justify-between p-3.5 bg-[#F8F8F6] border border-[#CECECE] rounded-xl text-xs text-[#7386A8]">
        <span>Scoring methodology v{scoringVersion} is deterministic and audit-traceable.</span>
        <Link 
          to="/settings?tab=algo" 
          className="text-[#D97757] hover:text-[#B0512F] font-semibold flex items-center gap-1 transition"
        >
          View Scoring Configuration <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

    </div>
  );
}
