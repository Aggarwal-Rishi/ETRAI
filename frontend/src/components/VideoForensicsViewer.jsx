import React from 'react';
import { Film, Volume2, ShieldCheck, AlertTriangle, Scissors, Activity, ExternalLink } from 'lucide-react';

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

  return (
    <section id="video-forensics" className="p-6 bg-slate-900/80 border border-slate-800 rounded-3xl space-y-6 shadow-xl scroll-mt-24">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-bold text-[#E88F6B]">05 ·</span>
          <h2 className="text-sm font-bold uppercase tracking-wider font-mono text-white flex items-center gap-2">
            <Film className="w-4 h-4 text-indigo-400" />
            {contextVerdict === 'Inconclusive' ? 'Video: Segment & Context Forensics' : `Video: ${contextVerdict}`}
          </h2>
        </div>
        <span className="text-xs text-slate-400 font-mono">{file.filename || reportData?.sourceTitle?.replace(/^Video:\s*/i, '') || 'Video asset'}</span>
      </div>

      <div className={`p-4 rounded-2xl border ${deceptiveCut ? 'bg-rose-950/20 border-rose-500/30' : 'bg-slate-950/50 border-slate-800'}`}>
        <div className="flex items-start gap-3">
          {deceptiveCut ? <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" /> : <ShieldCheck className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />}
          <div className="space-y-1">
            <p className="text-sm text-slate-200 leading-relaxed">{summary}</p>
            <p className="text-[11px] text-slate-500 font-mono">Context verdict: {contextVerdict} · authenticity score {contextReport ? Math.round(Number(contextReport.authenticity_score || 0) * 100) : '—'} / 100 · technical signal: {String(forensics.verdict || 'ANALYSIS_LIMITED').replaceAll('_', ' ')}</p>
          </div>
        </div>
      </div>

      <div>
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-2.5">Keyframe sequence integrity</span>
        {frames.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {frames.slice(0, 9).map((frame, index) => {
              const cut = cuts.find((item) => Math.abs(Number(item.timestamp) - Number(frame.timestamp)) < 0.25);
              return (
                <div key={`${frame.timestamp}-${index}`} className={`rounded-xl border p-3 ${cut ? 'border-rose-500/50 bg-rose-950/15' : 'border-slate-800 bg-slate-950/60'}`}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-mono font-bold text-slate-200">{formatTime(frame.timestamp)}</span>
                    <span className={`text-[10px] font-mono ${cut ? 'text-rose-300' : 'text-emerald-300'}`}>{cut ? String(cut.transitionType || 'TRANSITION').replaceAll('_', ' ') : 'SAMPLED'}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed line-clamp-3">{frame.description || 'Keyframe sampled for visual consistency.'}</p>
                  {frame.visibleText && <p className="text-[10px] text-indigo-300 mt-2 line-clamp-2">OCR: {frame.visibleText}</p>}
                </div>
              );
            })}
          </div>
        ) : <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400">No keyframes were available. The report does not invent frame or cut locations.</div>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 bg-slate-950/50 border border-slate-800 rounded-2xl space-y-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5"><Volume2 className="w-3.5 h-3.5 text-indigo-400" /> Audio edit timeline</span>
          {hasAudioAnalysis ? (
            <>
              <div className="relative h-3 rounded-full bg-slate-800 overflow-visible mt-5">
                {splices.map((splice, index) => {
                  const pct = duration > 0 ? Math.min(100, Math.max(0, (Number(splice.timestampSec || 0) / duration) * 100)) : 0;
                  const confirmed = confirmedSplices.some(item => item.spliceId === splice.spliceId);
                  return <span key={splice.spliceId || index} title={`${splice.description} · ${splice.confidence || 0}%`} className={`absolute top-1/2 -translate-y-1/2 rounded ${confirmed ? 'w-1 h-7 bg-rose-500' : 'w-0.5 h-4 bg-amber-400/60'}`} style={{ left: `${pct}%` }} />;
                })}
              </div>
              <div className="flex justify-between text-[10px] font-mono text-slate-500"><span>0:00</span><span>{formatTime(duration)}</span></div>
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                <span className="text-slate-500">RMS energy</span><span className="text-right text-slate-300">{audio.rmsEnergy ?? '—'}</span>
                <span className="text-slate-500">Dynamic range</span><span className="text-right text-slate-300">{audio.dynamicRangeDb ?? '—'} dB</span>
                <span className="text-slate-500">Silence ratio</span><span className="text-right text-slate-300">{audio.silenceRatioPct ?? '—'}%</span>
              </div>
            </>
          ) : <p className="text-xs text-slate-400">An extracted PCM audio stream was unavailable, so no waveform or splice claim is shown.</p>}
        </div>

        <div className="p-4 bg-slate-950/50 border border-slate-800 rounded-2xl space-y-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-2"><Activity className="w-3.5 h-3.5 text-cyan-400" /> Measured signals</span>
          {checks.map(([label, value, status]) => (
            <div key={label} className="flex items-center justify-between gap-3 text-xs py-1.5 border-b border-slate-800/60 last:border-0">
              <span className="text-slate-400">{label}</span>
              <span className={`px-2 py-0.5 rounded-md border font-mono text-[10px] font-semibold ${tone(status)}`}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="p-4 bg-slate-950/50 border border-slate-800 rounded-2xl space-y-3">
        <div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Transcript evidence</span><span className="text-[10px] font-mono text-slate-500">{transcriptSegments.length} timestamped segment(s)</span></div>
        {transcriptLanguage && <p className="text-[10px] font-mono text-slate-500">Detected language: {transcriptLanguage}</p>}
        {transcript ? <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{transcript}</p> : <p className="text-xs text-slate-400">No transcript was recovered. No omitted quotation or source passage has been fabricated.</p>}
        {translatedTranscript && <p className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3 text-xs text-indigo-200"><span className="text-slate-500">English translation:</span> {translatedTranscript}</p>}
        {transcriptSegments.length > 0 && <div className="space-y-1.5 pt-2 border-t border-slate-800">{transcriptSegments.slice(0, 12).map((segment, index) => <div key={`${segment.start}-${index}`} className="grid grid-cols-[70px_minmax(0,1fr)] gap-2 text-[11px]"><span className="font-mono text-indigo-300">{formatTime(segment.start)}–{formatTime(segment.end)}</span><div className="min-w-0"><p className="text-slate-400 break-words">{segment.text}</p>{segment.translatedText && <p className="text-indigo-300 break-words">Translation: {segment.translatedText}</p>}{segment.audioType && segment.audioType !== 'UNKNOWN' && <p className="mt-0.5 text-[9px] font-mono text-slate-600">{segment.audioType}</p>}</div></div>)}</div>}
      </div>

      {contextSegments.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Timestamped segment verification</span>
            <span className="text-[10px] font-mono text-slate-500">{contextSegments.length} segment(s) · {contextReport.methodology}</span>
          </div>
          <div className="space-y-3">
            {contextSegments.map((segment) => (
              <div key={segment.segment_index} className="rounded-2xl border border-slate-800 bg-slate-950/55 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-xs font-mono text-white">Segment {segment.segment_index} · {segment.timestamp_range}</strong>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-mono ${segment.is_truncated ? 'border-rose-500/30 bg-rose-500/10 text-rose-300' : 'border-slate-700 text-slate-400'}`}>
                    {segment.is_truncated ? 'SOURCE-BACKED TRUNCATION' : 'NO PROVEN TRUNCATION'}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                  <div><span className="block uppercase text-[9px] tracking-wider text-slate-500">Visual authenticity</span><p className="mt-1 text-slate-300">{segment.visual_authenticity || 'Inconclusive'}</p></div>
                  <div><span className="block uppercase text-[9px] tracking-wider text-slate-500">Audio provenance</span><p className="mt-1 text-slate-300">{segment.audio_authenticity || 'Undetermined'}</p></div>
                </div>
                <p className="text-xs leading-relaxed text-slate-400">{segment.actual_scene_breakdown || 'No scene description available.'}</p>
                {segment.visual_details && Object.entries({
                  'Visible text': segment.visual_details.visible_text,
                  'Public figures': segment.visual_details.public_figures?.map?.((item) => item.name || item.visibleAppearance || String(item)).join(', '),
                  'Vehicle markings': segment.visual_details.vehicle_markings?.join?.(', '),
                  'Badges / uniforms': [...(segment.visual_details.badges || []), ...(segment.visual_details.uniforms || [])].join(', '),
                  'Attire': segment.visual_details.attire?.join?.(', '),
                  'Security details': segment.visual_details.security_details?.join?.(', ')
                }).some(([, value]) => value) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                    {Object.entries({
                      'Visible text': segment.visual_details.visible_text,
                      'Public figures': segment.visual_details.public_figures?.map?.((item) => item.name || item.visibleAppearance || String(item)).join(', '),
                      'Vehicle markings': segment.visual_details.vehicle_markings?.join?.(', '),
                      'Badges / uniforms': [...(segment.visual_details.badges || []), ...(segment.visual_details.uniforms || [])].join(', '),
                      'Attire': segment.visual_details.attire?.join?.(', '),
                      'Security details': segment.visual_details.security_details?.join?.(', ')
                    }).filter(([, value]) => value).map(([label, value]) => <div key={label} className="min-w-0 text-[11px]"><span className="block text-[9px] uppercase text-slate-600">{label}</span><p className="mt-0.5 break-words text-slate-300">{value}</p></div>)}
                  </div>
                )}
                {(segment.transcript_original || segment.transcript_translation) && (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-[11px] space-y-1">
                    {segment.transcript_original && <p className="text-slate-300"><span className="text-slate-500">Transcript:</span> {segment.transcript_original}</p>}
                    {segment.transcript_translation && <p className="text-indigo-300"><span className="text-slate-500">Translation:</span> {segment.transcript_translation}</p>}
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px]">
                  <div><span className="block text-[9px] uppercase text-slate-500">Original event</span><p className="text-slate-300 mt-1">{segment.original_event?.event_name || 'Not established'}</p></div>
                  <div><span className="block text-[9px] uppercase text-slate-500">Date</span><p className="text-slate-300 mt-1">{segment.original_event?.date || 'Not established'}</p></div>
                  <div><span className="block text-[9px] uppercase text-slate-500">Location</span><p className="text-slate-300 mt-1">{segment.original_event?.location || 'Not established'}</p></div>
                </div>
                {segment.omitted_context && <p className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-[11px] text-rose-200"><strong>Verified omitted context:</strong> {segment.omitted_context}</p>}
                {segment.source_evidence?.url && (
                  <a href={segment.source_evidence.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-indigo-300 hover:text-indigo-200">
                    {segment.source_evidence.title || segment.source_evidence.domain || 'Open contextual source'} <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {segment.source_evidence?.limitation && <p className="text-[10px] text-amber-300/70">{segment.source_evidence.limitation}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {contextReport && (
        <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4 space-y-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-indigo-300">Full truth summary</span>
          <p className="text-sm leading-relaxed text-slate-300">{contextReport.full_truth_summary}</p>
          {contextReport.stitching_analysis && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-[11px]">
              <p className="font-mono text-slate-300">Cross-segment context: {String(contextReport.stitching_analysis.status || 'INCONCLUSIVE').replaceAll('_', ' ')}</p>
              <p className="mt-1 text-slate-500">{contextReport.stitching_analysis.rationale}</p>
            </div>
          )}
          {Array.isArray(contextReport.manipulation_techniques_detected) && contextReport.manipulation_techniques_detected.length > 0 && (
            <div className="flex flex-wrap gap-2">{contextReport.manipulation_techniques_detected.map((technique, index) => <span key={index} className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-[10px] font-mono text-slate-300">{technique}</span>)}</div>
          )}
          {contextReport.reproducibility && <details className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-[10px]"><summary className="cursor-pointer font-mono text-slate-400">Reproducibility metadata</summary><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words text-slate-500">{JSON.stringify(contextReport.reproducibility, null, 2)}</pre></details>}
        </div>
      )}

      {limitations.length > 0 && <details className="p-4 bg-amber-950/10 border border-amber-500/20 rounded-2xl text-xs"><summary className="cursor-pointer text-amber-300 font-semibold">Analysis limitations ({limitations.length})</summary><ul className="mt-2 space-y-1 text-slate-400 list-disc pl-5">{limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul></details>}
    </section>
  );
}
