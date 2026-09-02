import React from 'react';
import { Film, Volume2, ShieldCheck, AlertTriangle, Scissors, Activity, ExternalLink, Search, Users, Clock } from 'lucide-react';

function LegacyVideoForensicsExample({
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

const formatTime = (seconds) => {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) return '—';
  const mins = Math.floor(value / 60);
  const secs = Math.floor(value % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
};

/**
 * Data-driven video dossier. The legacy example above is deliberately not
 * exported: production reports must never claim a splice, recovered quote, or
 * synthetic-media result unless the backend actually measured it.
 */
export default function VideoForensicsViewer({ mediaAnalysis = {}, reportData = {} }) {
  const analysis = mediaAnalysis || reportData?.mediaAnalysis || {};
  const forensics = analysis.videoAudioForensics || analysis.forensics || {};
  const file = analysis.file || {};
  const metadata = analysis.metadata || {};
  const frames = Array.isArray(analysis.keyframes) ? analysis.keyframes : [];
  const transcriptSegments = Array.isArray(analysis.transcriptSegments) ? analysis.transcriptSegments : [];
  const transcript = analysis.transcript || '';
  const translatedTranscript = analysis.translatedTranscript || '';
  const transcriptLanguage = analysis.transcriptLanguage || null;
  const shotCuts = forensics.shotCuts || {};
  const audio = forensics.audioProfile || {};
  const voice = forensics.voiceSynthesis || {};
  const container = forensics.containerAnalysis || {};
  const cuts = Array.isArray(shotCuts.cuts) ? shotCuts.cuts : [];
  const splices = Array.isArray(audio.splices) ? audio.splices : [];
  const confirmedSplices = Array.isArray(audio.confirmedSplices) ? audio.confirmedSplices : [];
  const contextReport = analysis.videoContextReport || forensics.contextReport || null;
  const provenance = contextReport?.provenance || analysis.videoProvenance || null;
  const completeness = contextReport?.completeness || provenance?.completeness || null;
  const recognizedFigures = Array.isArray(provenance?.recognizedFigures) ? provenance.recognizedFigures : [];
  const frameSearches = Array.isArray(provenance?.frameSearches) ? provenance.frameSearches : [];
  const transcriptSearch = provenance?.transcriptSearch || null;
  const transcriptSourceMatches = Array.isArray(transcriptSearch?.matches) ? transcriptSearch.matches : [];
  const transcriptQueries = Array.isArray(transcriptSearch?.queries) ? transcriptSearch.queries : [];
  const contextSegments = Array.isArray(contextReport?.segments) ? contextReport.segments : [];
  const limitations = Array.isArray(analysis.limitations) ? analysis.limitations : [];
  const duration = Number(metadata.durationSeconds || audio.durationSeconds || 0);
  const contextVerdict = contextReport?.verdict || 'Inconclusive';
  const deceptiveCut = ['Deceptive Context', 'Manipulated', 'Deepfake'].includes(contextVerdict);
  const hasAudioAnalysis = audio.status === 'COMPLETED';

  const summary = contextReport?.summary || (deceptiveCut
    ? 'Segment-level evidence indicates manipulation or deceptive context. Review the timestamped findings below.'
    : forensics.verdict === 'MANIPULATION_SIGNAL'
      ? 'The clip contains an editing or encoding signal, but the available checks do not establish a deceptive cut by themselves.'
      : 'No deceptive splice was established by the available container, keyframe, and audio checks.');

  const checks = [
    ['Container / re-encoding', `${Number(container.reEncodingLikelihood || 0)}% likelihood`, container.anomalies?.length ? 'warn' : 'safe'],
    ['Visual shot transitions', `${Number(shotCuts.cutsCount || 0)} detected`, Number(shotCuts.cutsCount || 0) > 8 ? 'warn' : 'safe'],
    ['Audio splice candidates', hasAudioAnalysis ? `${Number(audio.confirmedSplicesCount || 0)} corroborated · ${Number(audio.splicesCount || 0)} candidates` : 'Not available', Number(audio.confirmedSplicesCount || 0) > 0 ? 'warn' : hasAudioAnalysis ? 'safe' : 'warn'],
    ['Synthetic voice signal', voice.status === 'COMPLETED' ? `${Number(voice.syntheticLikelihood || 0)}% likelihood` : 'Not available', voice.isSyntheticSuspected ? 'danger' : voice.status === 'COMPLETED' ? 'safe' : 'warn']
  ];

  const tone = (status) => status === 'danger'
    ? 'text-rose-300 border-rose-500/30 bg-rose-500/10'
    : status === 'warn'
      ? 'text-amber-300 border-amber-500/30 bg-amber-500/10'
      : 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10';

  const completenessTone = completeness?.verdict === 'MISLEADING_OUT_OF_CONTEXT'
    ? 'text-rose-300 border-rose-500/30 bg-rose-500/10'
    : completeness?.verdict === 'COMPLETE_ORIGINAL_VIDEO' || completeness?.verdict === 'FAITHFUL_EXCERPT'
      ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10'
      : 'text-amber-300 border-amber-500/30 bg-amber-500/10';

  return (
    <section id="video-forensics" className="p-6 bg-white border border-[#CECECE] rounded-3xl space-y-6 shadow-sm scroll-mt-24 text-xs text-[#2C4E86]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-[#CECECE] pb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-bold text-[#D97757]">05 ·</span>
          <h2 className="text-sm font-bold uppercase tracking-wider font-mono text-[#0B5CD5] flex items-center gap-2">
            <Film className="w-4 h-4 text-[#D97757]" />
            {contextVerdict === 'Inconclusive' ? 'Video: Segment & Context Forensics' : `Video: ${contextVerdict}`}
          </h2>
        </div>
        <span className="text-xs text-[#7386A8] font-mono">{file.filename || reportData?.sourceTitle?.replace(/^Video:\s*/i, '') || 'Video asset'}</span>
      </div>

      <div className={`p-4 rounded-2xl border ${deceptiveCut ? 'bg-[#F7E3E0] border-[#EBC7C2]' : 'bg-[#F8F8F6] border-[#CECECE]'}`}>
        <div className="flex items-start gap-3">
          {deceptiveCut ? <AlertTriangle className="w-5 h-5 text-[#B23F35] flex-shrink-0 mt-0.5" /> : <ShieldCheck className="w-5 h-5 text-[#3E7A55] flex-shrink-0 mt-0.5" />}
          <div className="space-y-1">
            <p className="text-sm text-[#0B5CD5] font-semibold leading-relaxed">{summary}</p>
            <p className="text-[11px] text-[#7386A8] font-mono">Context verdict: {contextVerdict} · authenticity score {contextReport ? Math.round(Number(contextReport.authenticity_score || 0) * 100) : '—'} / 100 · technical signal: {String(forensics.verdict || 'ANALYSIS_LIMITED').replaceAll('_', ' ')}</p>
          </div>
        </div>
      </div>

      {completeness && (
        <div className="rounded-2xl border border-[#CECECE] bg-[#F8F8F6] p-4 sm:p-5 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[#0B5CD5] flex items-center gap-1.5 font-mono">
                <Search className="w-3.5 h-3.5 text-[#D97757]" /> Original video &amp; context completeness
              </span>
              <p className="mt-2 text-sm leading-relaxed text-[#2C4E86]">{completeness.explanation}</p>
            </div>
            <span className={`self-start rounded-full border px-3 py-1 text-[10px] font-mono font-bold ${completenessTone}`}>
              {completeness.label || String(completeness.verdict || 'INCONCLUSIVE').replaceAll('_', ' ')}
            </span>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-[11px]">
            <div className="rounded-xl border border-[#CECECE] bg-white p-3"><span className="block text-[9px] uppercase tracking-wider text-[#7386A8]">Uploaded duration</span><strong className="mt-1 block font-mono text-[#0B5CD5] font-bold">{completeness.uploadedDurationSeconds ? formatTime(completeness.uploadedDurationSeconds) : 'Unknown'}</strong></div>
            <div className="rounded-xl border border-[#CECECE] bg-white p-3"><span className="block text-[9px] uppercase tracking-wider text-[#7386A8]">Original duration</span><strong className="mt-1 block font-mono text-[#0B5CD5] font-bold">{completeness.originalDurationSeconds ? formatTime(completeness.originalDurationSeconds) : 'Not recovered'}</strong></div>
            <div className="rounded-xl border border-[#CECECE] bg-white p-3"><span className="block text-[9px] uppercase tracking-wider text-[#7386A8]">Match in source</span><strong className="mt-1 block font-mono text-[#0B5CD5] font-bold">{completeness.matchTimeline?.sourceStartSec !== null && completeness.matchTimeline?.sourceStartSec !== undefined ? `${formatTime(completeness.matchTimeline.sourceStartSec)}–${formatTime(completeness.matchTimeline.sourceEndSec)}` : 'Not located'}</strong></div>
            <div className="rounded-xl border border-[#CECECE] bg-white p-3"><span className="block text-[9px] uppercase tracking-wider text-[#7386A8]">Source confidence</span><strong className="mt-1 block font-mono text-[#0B5CD5] font-bold">{Number(completeness.confidence || 0)} / 100</strong></div>
          </div>

          {completeness.source && (
            <div className="rounded-xl border border-[#CECECE] bg-white p-3 text-[11px]">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <span className="block text-[9px] uppercase tracking-wider text-[#7386A8]">Best matched source</span>
                  <p className="mt-1 break-words font-bold text-[#0B5CD5]">{completeness.source.title || completeness.source.domain || 'Matched video source'}</p>
                  <p className="mt-1 text-[#7386A8]">{[completeness.source.publisher, completeness.source.publishedAt, completeness.source.confidence].filter(Boolean).join(' · ')}</p>
                  {completeness.source.transcriptEvidenceScore && <p className="mt-1 font-mono text-[#D97757] font-bold">Transcript evidence: {Math.round(completeness.source.transcriptEvidenceScore)} / 100 · {String(completeness.source.transcriptMatchType || 'TRANSCRIPT MATCH').replaceAll('_', ' ')}</p>}
                </div>
                {completeness.source.url && <a href={completeness.source.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 flex-shrink-0 items-center gap-1 text-[#D97757] hover:text-[#B0512F] font-semibold">Open source <ExternalLink className="w-3 h-3" /></a>}
              </div>
            </div>
          )}

          {completeness.contextWindow && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#7386A8] font-mono"><Clock className="w-3.5 h-3.5 text-[#D97757]" /> Full-source context window</div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 text-[11px]">
                {[['Before the clip', completeness.contextWindow.before], ['Matched clip', completeness.contextWindow.matched], ['After the clip', completeness.contextWindow.after]].map(([label, value]) => (
                  <div key={label} className={`rounded-xl border p-3 ${label === 'Matched clip' ? 'border-[#E88F6B] bg-[#F6E7DF]' : 'border-[#CECECE] bg-white'}`}>
                    <span className="block text-[9px] uppercase tracking-wider text-[#7386A8]">{label}</span>
                    <p className="mt-1.5 whitespace-pre-wrap break-words leading-relaxed text-[#2C4E86]">{value || 'Not recovered'}</p>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-[#7386A8]">Context integrity: {String(completeness.contextIntegrity?.verdict || 'INCONCLUSIVE').replaceAll('_', ' ')}</p>
            </div>
          )}

          {recognizedFigures.length > 0 && (
            <div className="rounded-xl border border-[#CECECE] bg-white p-3 space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#7386A8] flex items-center gap-1.5 font-mono"><Users className="w-3.5 h-3.5 text-[#0B5CD5]" /> Public-figure search clues</span>
              <div className="flex flex-wrap gap-2">
                {recognizedFigures.map((figure, index) => <span key={`${figure.name}-${index}`} title={figure.basis || 'No identity basis supplied'} className={`rounded-full border px-2.5 py-1 text-[10px] font-mono ${figure.searchUsed ? 'border-[#CECECE] bg-[#EFEEE9] text-[#0B5CD5] font-bold' : 'border-[#CECECE] text-[#7386A8]'}`}>{figure.name}{figure.confidence !== null && figure.confidence !== undefined ? ` · ${Math.round(figure.confidence)}%` : ''}{figure.searchUsed ? ' · searched' : ' · not used'}</span>)}
              </div>
              <p className="text-[10px] text-[#7386A8]">Only visually supported public-figure names at or above the confidence threshold are used as search terms; ordinary or uncertain people are not identified.</p>
            </div>
          )}

          {transcriptSearch && (
            <div className="rounded-xl border border-[#CECECE] bg-white p-3 space-y-3 text-[11px]">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#0B5CD5] flex items-center gap-1.5 font-mono"><Search className="w-3.5 h-3.5 text-[#D97757]" /> Transcript original-news search</span>
                <span className="font-mono text-[#7386A8]">{String(transcriptSearch.status || 'UNAVAILABLE').replaceAll('_', ' ')} · {Number(transcriptSearch.executedQueryCount || 0)} searched · {Number(transcriptSearch.matchedSourceCount || 0)} matched</span>
              </div>

              {transcriptSearch.status === 'CONSENT_REQUIRED' && <p className="rounded-lg border border-[#E8D4B0] bg-[#F7EEDA] p-2 text-[#B98520]">Not searched: enable “Use transcript excerpts to find the original news” when starting the video analysis.</p>}

              {transcriptSourceMatches.length > 0 && (
                <div className="space-y-2">
                  {transcriptSourceMatches.slice(0, 5).map((match, index) => (
                    <div key={`${match.sourceUrl}-${index}`} className="rounded-xl border border-[#CECECE] bg-[#F8F8F6] p-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="break-words font-bold text-[#0B5CD5]">{match.title || match.domain || 'Transcript-matched source'}</p>
                          <p className="mt-1 text-[#7386A8]">{[match.publisher, match.domain, match.publishedAt].filter(Boolean).join(' · ')}</p>
                          <p className="mt-1 font-mono text-[#D97757] font-bold">{Math.round(Number(match.transcriptEvidenceScore || 0))}/100 · {String(match.transcriptMatchType || match.sourceKind || 'TRANSCRIPT CLUE').replaceAll('_', ' ')}</p>
                        </div>
                        {match.sourceUrl && <a href={match.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 flex-shrink-0 items-center gap-1 text-[#D97757] hover:text-[#B0512F] font-semibold">Open source <ExternalLink className="w-3 h-3" /></a>}
                      </div>
                      {Array.isArray(match.matchedTranscriptPhrases) && match.matchedTranscriptPhrases.length > 0 && <p className="mt-2 break-words text-[#2C4E86]"><span className="text-[#7386A8]">Matched spoken phrase:</span> “{match.matchedTranscriptPhrases[0]}”</p>}
                    </div>
                  ))}
                </div>
              )}

              {transcriptQueries.length > 0 && transcriptSearch.status !== 'CONSENT_REQUIRED' && (
                <details className="rounded-lg border border-[#CECECE] bg-[#F8F8F6] p-2.5">
                  <summary className="cursor-pointer font-mono text-[#7386A8]">Show transcript-derived search queries ({transcriptQueries.length})</summary>
                  <div className="mt-2 space-y-2">{transcriptQueries.map((query, index) => <div key={query.id || index} className="border-b border-[#CECECE] pb-2 last:border-0 last:pb-0"><p className="break-words text-[#2C4E86]">{query.query}</p><p className="mt-0.5 text-[#7386A8]">{String(query.provider || 'UNAVAILABLE').replaceAll('_', ' ')} · {Number(query.resultCount || 0)} result(s)</p></div>)}</div>
                </details>
              )}

              {Array.isArray(transcriptSearch.limitations) && transcriptSearch.limitations.length > 0 && <p className="text-[#B98520]">{transcriptSearch.limitations.join(' ')}</p>}
            </div>
          )}

          {frameSearches.length > 0 && (
            <details className="rounded-xl border border-[#CECECE] bg-white p-3 text-[11px]">
              <summary className="cursor-pointer font-mono text-[#0B5CD5] font-semibold">Keyframe source-search status ({frameSearches.length} selected)</summary>
              <div className="mt-3 space-y-2">
                {frameSearches.map((search, index) => <div key={`${search.frameIndex}-${index}`} className="flex flex-col gap-1 border-b border-[#CECECE] pb-2 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"><span className="text-[#7386A8]">{formatTime(search.timestamp)} · {String(search.provider || 'UNAVAILABLE').replaceAll('_', ' ')}</span><span className={search.exactMatch ? 'text-[#3E7A55] font-bold' : 'text-[#B98520]'}>{search.exactMatch ? 'Locally verified visual match' : String(search.status || 'NO MATCH').replaceAll('_', ' ')}</span></div>)}
              </div>
            </details>
          )}

          {Array.isArray(completeness.limitations) && completeness.limitations.length > 0 && <p className="text-[10px] leading-relaxed text-[#B98520]">{completeness.limitations.join(' ')}</p>}
        </div>
      )}

      <div>
        <span className="text-xs font-semibold uppercase tracking-wider text-[#7386A8] block mb-2.5 font-mono">Keyframe sequence integrity</span>
        {frames.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {frames.slice(0, 9).map((frame, index) => {
              const cut = cuts.find((item) => Math.abs(Number(item.timestamp) - Number(frame.timestamp)) < 0.25);
              return (
                <div key={`${frame.timestamp}-${index}`} className={`rounded-2xl border p-3 ${cut ? 'border-[#EBC7C2] bg-[#F7E3E0]' : 'border-[#CECECE] bg-[#F8F8F6]'}`}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-mono font-bold text-[#0B5CD5]">{formatTime(frame.timestamp)}</span>
                    <span className={`text-[10px] font-mono font-bold ${cut ? 'text-[#B23F35]' : 'text-[#3E7A55]'}`}>{cut ? String(cut.transitionType || 'TRANSITION').replaceAll('_', ' ') : 'SAMPLED'}</span>
                  </div>
                  <p className="text-[11px] text-[#2C4E86] leading-relaxed line-clamp-3">{frame.description || 'Keyframe sampled for visual consistency.'}</p>
                  {frame.visibleText && <p className="text-[10px] text-[#D97757] font-mono mt-2 line-clamp-2">OCR: {frame.visibleText}</p>}
                </div>
              );
            })}
          </div>
        ) : <div className="p-4 rounded-2xl bg-[#F8F8F6] border border-[#CECECE] text-xs text-[#7386A8]">No keyframes were available. The report does not invent frame or cut locations.</div>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 bg-[#F8F8F6] border border-[#CECECE] rounded-2xl space-y-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#0B5CD5] flex items-center gap-1.5 font-mono"><Volume2 className="w-3.5 h-3.5 text-[#D97757]" /> Audio edit timeline</span>
          {hasAudioAnalysis ? (
            <>
              <div className="relative h-3 rounded-full bg-[#EFEEE9] border border-[#CECECE] overflow-visible mt-5">
                {splices.map((splice, index) => {
                  const pct = duration > 0 ? Math.min(100, Math.max(0, (Number(splice.timestampSec || 0) / duration) * 100)) : 0;
                  const confirmed = confirmedSplices.some(item => item.spliceId === splice.spliceId);
                  return <span key={splice.spliceId || index} title={`${splice.description} · ${splice.confidence || 0}%`} className={`absolute top-1/2 -translate-y-1/2 rounded ${confirmed ? 'w-1.5 h-7 bg-[#B23F35]' : 'w-1 h-4 bg-[#B98520]'}`} style={{ left: `${pct}%` }} />;
                })}
              </div>
              <div className="flex justify-between text-[10px] font-mono text-[#7386A8]"><span>0:00</span><span>{formatTime(duration)}</span></div>
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                <span className="text-[#7386A8]">RMS energy</span><span className="text-right text-[#0B5CD5] font-bold">{audio.rmsEnergy ?? '—'}</span>
                <span className="text-[#7386A8]">Dynamic range</span><span className="text-right text-[#0B5CD5] font-bold">{audio.dynamicRangeDb ?? '—'} dB</span>
                <span className="text-[#7386A8]">Silence ratio</span><span className="text-right text-[#0B5CD5] font-bold">{audio.silenceRatioPct ?? '—'}%</span>
              </div>
            </>
          ) : <p className="text-xs text-[#7386A8]">An extracted PCM audio stream was unavailable, so no waveform or splice claim is shown.</p>}
        </div>

        <div className="p-4 bg-[#F8F8F6] border border-[#CECECE] rounded-2xl space-y-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#0B5CD5] flex items-center gap-1.5 mb-2 font-mono"><Activity className="w-3.5 h-3.5 text-[#D97757]" /> Measured signals</span>
          {checks.map(([label, value, status]) => (
            <div key={label} className="flex items-center justify-between gap-3 text-xs py-1.5 border-b border-[#CECECE] last:border-0">
              <span className="text-[#2C4E86]">{label}</span>
              <span className={`px-2 py-0.5 rounded-md border font-mono text-[10px] font-semibold ${tone(status)}`}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="p-4 bg-[#F8F8F6] border border-[#CECECE] rounded-2xl space-y-3">
        <div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold uppercase tracking-wider text-[#0B5CD5] font-mono">Transcript evidence</span><span className="text-[10px] font-mono text-[#7386A8]">{transcriptSegments.length} timestamped segment(s)</span></div>
        {transcriptLanguage && <p className="text-[10px] font-mono text-[#7386A8]">Detected language: {transcriptLanguage}</p>}
        {transcript ? <p className="text-sm text-[#2C4E86] leading-relaxed whitespace-pre-wrap">{transcript}</p> : <p className="text-xs text-[#7386A8]">No transcript was recovered. No omitted quotation or source passage has been fabricated.</p>}
        {translatedTranscript && <p className="rounded-xl border border-[#CECECE] bg-white p-3 text-xs text-[#0B5CD5]"><span className="text-[#7386A8]">English translation:</span> {translatedTranscript}</p>}
        {transcriptSegments.length > 0 && <div className="space-y-1.5 pt-2 border-t border-[#CECECE]">{transcriptSegments.slice(0, 12).map((segment, index) => <div key={`${segment.start}-${index}`} className="grid grid-cols-[70px_minmax(0,1fr)] gap-2 text-[11px]"><span className="font-mono text-[#D97757] font-bold">{formatTime(segment.start)}–{formatTime(segment.end)}</span><div className="min-w-0"><p className="text-[#2C4E86] break-words">{segment.text}</p>{segment.translatedText && <p className="text-[#0B5CD5] break-words">Translation: {segment.translatedText}</p>}{segment.audioType && segment.audioType !== 'UNKNOWN' && <p className="mt-0.5 text-[9px] font-mono text-[#7386A8]">{segment.audioType}</p>}</div></div>)}</div>}
      </div>

      {contextSegments.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#0B5CD5] font-mono">Timestamped segment verification</span>
            <span className="text-[10px] font-mono text-[#7386A8]">{contextSegments.length} segment(s) · {contextReport.methodology}</span>
          </div>
          <div className="space-y-3">
            {contextSegments.map((segment) => (
              <div key={segment.segment_index} className="rounded-2xl border border-[#CECECE] bg-white p-4 space-y-3 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-xs font-mono text-[#0B5CD5]">Segment {segment.segment_index} · {segment.timestamp_range}</strong>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-mono font-bold ${segment.is_truncated ? 'border-[#EBC7C2] bg-[#F7E3E0] text-[#B23F35]' : 'border-[#CECECE] bg-[#F8F8F6] text-[#7386A8]'}`}>
                    {segment.is_truncated ? 'SOURCE-BACKED TRUNCATION' : 'NO PROVEN TRUNCATION'}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                  <div><span className="block uppercase text-[9px] tracking-wider text-[#7386A8]">Visual authenticity</span><p className="mt-1 text-[#2C4E86] font-semibold">{segment.visual_authenticity || 'Inconclusive'}</p></div>
                  <div><span className="block uppercase text-[9px] tracking-wider text-[#7386A8]">Audio provenance</span><p className="mt-1 text-[#2C4E86] font-semibold">{segment.audio_authenticity || 'Undetermined'}</p></div>
                </div>
                <p className="text-xs leading-relaxed text-[#2C4E86]">{segment.actual_scene_breakdown || 'No scene description available.'}</p>
                {segment.visual_details && Object.entries({
                  'Visible text': segment.visual_details.visible_text,
                  'Public figures': segment.visual_details.public_figures?.map?.((item) => item.name || item.visibleAppearance || String(item)).join(', '),
                  'Vehicle markings': segment.visual_details.vehicle_markings?.join?.(', '),
                  'Badges / uniforms': [...(segment.visual_details.badges || []), ...(segment.visual_details.uniforms || [])].join(', '),
                  'Attire': segment.visual_details.attire?.join?.(', '),
                  'Security details': segment.visual_details.security_details?.join?.(', ')
                }).some(([, value]) => value) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 rounded-xl border border-[#CECECE] bg-[#F8F8F6] p-3">
                    {Object.entries({
                      'Visible text': segment.visual_details.visible_text,
                      'Public figures': segment.visual_details.public_figures?.map?.((item) => item.name || item.visibleAppearance || String(item)).join(', '),
                      'Vehicle markings': segment.visual_details.vehicle_markings?.join?.(', '),
                      'Badges / uniforms': [...(segment.visual_details.badges || []), ...(segment.visual_details.uniforms || [])].join(', '),
                      'Attire': segment.visual_details.attire?.join?.(', '),
                      'Security details': segment.visual_details.security_details?.join?.(', ')
                    }).filter(([, value]) => value).map(([label, value]) => <div key={label} className="min-w-0 text-[11px]"><span className="block text-[9px] uppercase text-[#7386A8]">{label}</span><p className="mt-0.5 break-words text-[#2C4E86]">{value}</p></div>)}
                  </div>
                )}
                {(segment.transcript_original || segment.transcript_translation) && (
                  <div className="rounded-xl border border-[#CECECE] bg-[#F8F8F6] p-3 text-[11px] space-y-1">
                    {segment.transcript_original && <p className="text-[#2C4E86]"><span className="text-[#7386A8]">Transcript:</span> {segment.transcript_original}</p>}
                    {segment.transcript_translation && <p className="text-[#0B5CD5]"><span className="text-[#7386A8]">Translation:</span> {segment.transcript_translation}</p>}
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px]">
                  <div><span className="block text-[9px] uppercase text-[#7386A8]">Original event</span><p className="text-[#2C4E86] mt-1 font-semibold">{segment.original_event?.event_name || 'Not established'}</p></div>
                  <div><span className="block text-[9px] uppercase text-[#7386A8]">Date</span><p className="text-[#2C4E86] mt-1 font-semibold">{segment.original_event?.date || 'Not established'}</p></div>
                  <div><span className="block text-[9px] uppercase text-[#7386A8]">Location</span><p className="text-[#2C4E86] mt-1 font-semibold">{segment.original_event?.location || 'Not established'}</p></div>
                </div>
                {segment.omitted_context && <p className="rounded-xl border border-[#EBC7C2] bg-[#F7E3E0] p-3 text-[11px] text-[#B23F35]"><strong>Verified omitted context:</strong> {segment.omitted_context}</p>}
                {segment.source_evidence?.url && (
                  <a href={segment.source_evidence.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-[#D97757] hover:text-[#B0512F] font-semibold">
                    {segment.source_evidence.title || segment.source_evidence.domain || 'Open contextual source'} <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {segment.source_evidence?.limitation && <p className="text-[10px] text-[#B98520]">{segment.source_evidence.limitation}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {contextReport && (
        <div className="rounded-2xl border border-[#E88F6B]/40 bg-[#F6E7DF] p-4 space-y-3">
          <span className="text-xs font-bold uppercase tracking-wider text-[#B0512F] font-mono">Full truth summary</span>
          <p className="text-sm leading-relaxed text-[#2C4E86]">{contextReport.full_truth_summary}</p>
          {contextReport.stitching_analysis && (
            <div className="rounded-xl border border-[#CECECE] bg-white p-3 text-[11px]">
              <p className="font-mono text-[#0B5CD5] font-bold">Cross-segment context: {String(contextReport.stitching_analysis.status || 'INCONCLUSIVE').replaceAll('_', ' ')}</p>
              <p className="mt-1 text-[#7386A8]">{contextReport.stitching_analysis.rationale}</p>
            </div>
          )}
          {Array.isArray(contextReport.manipulation_techniques_detected) && contextReport.manipulation_techniques_detected.length > 0 && (
            <div className="flex flex-wrap gap-2">{contextReport.manipulation_techniques_detected.map((technique, index) => <span key={index} className="rounded-full border border-[#CECECE] bg-white px-2.5 py-1 text-[10px] font-mono text-[#0B5CD5] font-semibold">{technique}</span>)}</div>
          )}
          {contextReport.reproducibility && <details className="rounded-xl border border-[#CECECE] bg-white p-3 text-[10px]"><summary className="cursor-pointer font-mono text-[#7386A8]">Reproducibility metadata</summary><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words text-[#7386A8]">{JSON.stringify(contextReport.reproducibility, null, 2)}</pre></details>}
        </div>
      )}

      {limitations.length > 0 && <details className="p-4 bg-[#F7EEDA] border border-[#E8D4B0] rounded-2xl text-xs"><summary className="cursor-pointer text-[#B98520] font-bold">Analysis limitations ({limitations.length})</summary><ul className="mt-2 space-y-1 text-[#2C4E86] list-disc pl-5">{limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul></details>}
    </section>
  );
}
