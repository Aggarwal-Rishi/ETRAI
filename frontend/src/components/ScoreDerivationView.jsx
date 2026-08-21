import React, { useState } from 'react';
import { Sliders, Calculator, ShieldAlert, Sparkles, TrendingUp, AlertTriangle, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function ScoreDerivationView({
  factors = [
    { k: 'authority', n: 'Source authority', sh: 'Authority', d: 'Rank and correction history of the publisher', w: 22, raw: 24 },
    { k: 'corrob', n: 'Independent corroboration', sh: 'Corroboration', d: 'How many ranked sources carry the same claim', w: 20, raw: 12 },
    { k: 'evidence', n: 'Claim–evidence match', sh: 'Evidence', d: 'Does cited evidence actually support the claim', w: 20, raw: 30 },
    { k: 'media', n: 'Media integrity', sh: 'Media', d: 'Edited regions, splices, synthesis signals', w: 15, raw: 38 },
    { k: 'prov', n: 'Provenance trail', sh: 'Provenance', d: 'Can the asset be traced to a first appearance', w: 10, raw: 52 },
    { k: 'lang', n: 'Language & framing', sh: 'Language', d: 'Urgency cues, unsourced attribution, forward bait', w: 8, raw: 55 },
    { k: 'amp', n: 'Amplification pattern', sh: 'Spread', d: 'Organic spread vs coordinated reposting', w: 5, raw: 46 }
  ],
  penalties = [
    { label: 'Fabricated primary document', val: '-4.0' },
    { label: 'Pixel-level image manipulation', val: '-2.6' },
    { label: 'Deceptive edit point in video', val: '-1.2' },
    { label: 'Coordinated repost pattern', val: '-0.6' }
  ],
  sensitivity = [
    { label: 'A resolvable circular reference number', change: '+18' },
    { label: 'Two tier-1 outlets carrying the claim', change: '+21' },
    { label: 'Unedited video with full sentence', change: '+9' },
    { label: 'Named author with byline history', change: '+4' }
  ],
  penaltyTotal = 8.4
}) {
  const [hoveredFactor, setHoveredFactor] = useState(null);

  const totalWeight = factors.reduce((sum, f) => sum + f.w, 0) || 100;
  const weightedSum = factors.reduce((sum, f) => sum + (f.raw * f.w) / totalWeight, 0);
  const finalTrustScore = Math.max(0, Math.min(100, Math.round(weightedSum - penaltyTotal)));

  const getScoreColor = (score) => {
    if (score >= 75) return 'text-emerald-400 bg-emerald-500';
    if (score >= 40) return 'text-amber-400 bg-amber-500';
    return 'text-rose-400 bg-rose-500';
  };

  return (
    <div className="space-y-4 text-sm text-slate-200">
      {/* Signature Derivation Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {/* Proportional Segmented Strip */}
        <div className="flex h-12 border-b border-slate-800 bg-slate-950">
          {factors.map((f, i) => {
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
                {widthPct >= 10 && (
                  <span className="absolute top-4.5 inset-x-0 text-center text-[9px] text-slate-500 truncate px-1 select-none">
                    {f.sh}
                  </span>
                )}
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
            const contribution = ((f.raw * f.w) / totalWeight).toFixed(2);
            return (
              <div
                key={f.k}
                onMouseEnter={() => setHoveredFactor(f.k)}
                onMouseLeave={() => setHoveredFactor(null)}
                className={`grid grid-cols-12 gap-3 items-center px-4 py-2.5 transition text-xs ${
                  isHovered ? 'bg-indigo-500/10' : 'hover:bg-slate-800/40'
                }`}
              >
                <div className="col-span-6">
                  <span className="font-medium text-slate-200 block">{f.n}</span>
                  <span className="text-[11px] text-slate-500">{f.d}</span>
                </div>
                <div className="col-span-3">
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
                <div className="col-span-1 text-right font-mono text-slate-400">
                  × {Math.round((f.w / totalWeight) * 100)}%
                </div>
                <div className="col-span-2 text-right font-mono font-semibold text-slate-200">
                  +{contribution}
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
            <span>Σ weighted = <strong className="text-white">{weightedSum.toFixed(1)}</strong></span>
            <span>penalties = <strong className="text-rose-400">-{penaltyTotal.toFixed(1)}</strong></span>
            <span>Score = <strong className="text-emerald-400 text-sm">{finalTrustScore} / 100</strong></span>
          </div>
        </div>
      </div>

      {/* Penalties Applied & Sensitivity Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Penalties Card */}
        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-rose-400 flex items-center gap-1.5 mb-1">
            <ShieldAlert className="w-3.5 h-3.5" /> Direct Penalties Applied
          </span>
          {penalties.map((p, i) => (
            <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-slate-800/60 last:border-0">
              <span className="text-slate-400">{p.label}</span>
              <span className="font-mono text-rose-400 font-bold">{p.val}</span>
            </div>
          ))}
        </div>

        {/* Sensitivity: What would move this score */}
        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5 mb-1">
            <TrendingUp className="w-3.5 h-3.5" /> What Would Move This Score
          </span>
          {sensitivity.map((s, i) => (
            <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-slate-800/60 last:border-0">
              <span className="text-slate-400">{s.label}</span>
              <span className="font-mono text-emerald-400 font-bold">{s.change}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Customization Link */}
      <div className="flex items-center justify-between p-3.5 bg-slate-900/40 border border-slate-800/80 rounded-xl text-xs text-slate-400">
        <span>Weights and penalties are customizable per news desk in your workspace settings.</span>
        <Link 
          to="/settings?tab=algo" 
          className="text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 transition"
        >
          Customize Scoring Weights <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
