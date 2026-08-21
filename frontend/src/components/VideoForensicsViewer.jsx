import React from 'react';
import { Film, Volume2, ShieldCheck, AlertTriangle, Scissors, Activity } from 'lucide-react';

export default function VideoForensicsViewer({
  duration = '41s',
  sourceDuration = '6m 12s',
  cutTimestamp = '0:18',
  omittedTranscript = '“…transmission is on track. To be clear, there is no change to the currency in circulation, and no proposal before this committee to alter the status of any denomination.”',
  signalChecks = [
    { label: 'Face-swap / lip-sync deviation', val: '0.04 · none', status: 'safe' },
    { label: 'Voice clone probability', val: '0.07 · none', status: 'safe' },
    { label: 'Re-encode generations', val: '4 · heavy compression', status: 'warn' },
    { label: 'Cut points detected', val: '1 · deceptive splice', status: 'danger' }
  ]
}) {
  const FRAMES = [
    { t: '0:00', status: 'clean' },
    { t: '0:06', status: 'clean' },
    { t: '0:12', status: 'clean' },
    { t: '0:18', status: 'cut' },
    { t: '0:24', status: 'clean' },
    { t: '0:36', status: 'clean' }
  ];

  const WAVEFORM_AMPS = [
    7, 12, 18, 26, 34, 40, 46, 38, 30, 24, 33, 41, 45, 39, 28, 20, 14, 44, 4, 3, 26, 34, 40, 44, 38, 30, 22, 16, 28, 36, 42, 46, 40, 32, 24, 18, 12, 8, 20, 30
  ];

  return (
    <div className="space-y-5 text-sm text-slate-200">
      {/* Editorial Deception Summary */}
      <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl">
        <p className="text-xs text-slate-300 leading-relaxed">
          The video footage is authentic with no synthetic face-swap or AI voice generation detected. However, a <strong>deceptive editorial splice at {cutTimestamp}</strong> terminates the sentence mid-thought, suppressing the official clarification.
        </p>
      </div>

      {/* 6-Frame Integrity Visual Strip */}
      <div>
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-2.5">
          Keyframe Sequence Integrity
        </span>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {FRAMES.map((f, i) => (
            <div 
              key={i} 
              className={`rounded-xl border overflow-hidden bg-slate-950 text-center transition ${
                f.status === 'cut' 
                  ? 'border-rose-500/80 bg-rose-950/20 shadow-md shadow-rose-500/10' 
                  : 'border-slate-800'
              }`}
            >
              {/* Frame Mock Visual */}
              <div className="aspect-[16/10] bg-slate-900 flex items-center justify-center p-1 relative">
                <svg viewBox="0 0 120 75" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                  <rect width="120" height="75" fill={f.status === 'cut' ? '#881337' : '#1e293b'} />
                  <rect y="46" width="120" height="29" fill={f.status === 'cut' ? '#4c0519' : '#0f172a'} />
                  <rect x="44" y="30" width="32" height="26" fill="#334155" rx="2" />
                  <circle cx="60" cy="24" r="9" fill="#475569" />
                  <rect x="26" y="10" width="68" height="11" rx="2" fill="#0f766e" opacity="0.8" />
                </svg>
                {f.status === 'cut' && (
                  <div className="absolute inset-0 bg-rose-600/30 flex items-center justify-center">
                    <Scissors className="w-4 h-4 text-white drop-shadow" />
                  </div>
                )}
              </div>
              <div className={`py-1 text-[10px] font-mono border-t ${
                f.status === 'cut' ? 'border-rose-500/40 text-rose-300 font-bold bg-rose-950/40' : 'border-slate-800 text-slate-400'
              }`}>
                {f.t} · {f.status === 'cut' ? 'SPLICE' : 'OK'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Audio Waveform & Signal Checks Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Waveform Timeline */}
        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-indigo-400" /> Audio Waveform Analysis
              </span>
              <span className="text-[10px] font-mono text-rose-400 font-bold">Splice at {cutTimestamp}</span>
            </div>
            {/* Waveform Bars */}
            <div className="h-16 flex items-end gap-1 px-1 bg-slate-950 rounded-xl border border-slate-800/80 p-2">
              {WAVEFORM_AMPS.map((h, i) => {
                const isCutRegion = i >= 17 && i <= 19;
                return (
                  <div
                    key={i}
                    style={{ height: `${h}px` }}
                    className={`flex-1 rounded-sm transition-all ${
                      isCutRegion 
                        ? 'bg-rose-500 animate-pulse' 
                        : 'bg-indigo-500/40 hover:bg-indigo-400'
                    }`}
                  />
                );
              })}
            </div>
          </div>
          <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-2">
            <span>0:00</span>
            <span className="text-rose-400 font-semibold">{cutTimestamp} (Splice Point)</span>
            <span>{duration}</span>
          </div>
        </div>

        {/* Deepfake & Synthesis Signal Checks */}
        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-2">
            <Activity className="w-3.5 h-3.5 text-cyan-400" /> Deepfake & Synthesis Signals
          </span>
          {signalChecks.map((sc, i) => (
            <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-slate-800/60 last:border-0">
              <span className="text-slate-400">{sc.label}</span>
              <span className={`font-mono text-xs font-semibold ${
                sc.status === 'safe' ? 'text-emerald-400' :
                sc.status === 'warn' ? 'text-amber-400' : 'text-rose-400'
              }`}>
                {sc.val}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Recovered 12-Second Omitted Transcript */}
      <div className="p-4 bg-emerald-950/30 border border-emerald-500/30 rounded-2xl text-xs space-y-2">
        <div className="flex items-center gap-2 text-emerald-400 font-semibold">
          <ShieldCheck className="w-4 h-4" />
          <span>Recovered Omitted 12 Seconds (Full Press Briefing Match)</span>
        </div>
        <p className="text-slate-200 text-sm italic font-serif leading-relaxed pl-6 border-l-2 border-emerald-500/50">
          {omittedTranscript}
        </p>
        <p className="text-[11px] font-mono text-emerald-300/80 pt-1 pl-6">
          Source: Full briefing archive recording (0:18–0:30) · matched at 99.2% acoustic fingerprint.
        </p>
      </div>
    </div>
  );
}
