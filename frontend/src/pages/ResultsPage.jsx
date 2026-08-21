import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import ObservabilityPanel from '../components/ObservabilityPanel';
import ClaimAuditModal from '../components/ClaimAuditModal';
import { apiUrl } from '../utils/api';
import { 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  HelpCircle, 
  ExternalLink, 
  ArrowLeft,
  FileText,
  PieChart as PieIcon,
  RefreshCw,
  Info,
  Search,
  Camera,
  Film
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

export default function ResultsPage() {
  const { id } = useParams();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [auditModalClaim, setAuditModalClaim] = useState(null);
  
  // SSE progress state
  const [progressState, setProgressState] = useState({
    status: 'PROCESSING',
    progress: 10,
    step: 'Connecting to 4-Agent Verification Engine...'
  });

  // Filter claim status
  const [claimFilter, setClaimFilter] = useState('ALL'); // 'ALL' | 'Verified' | 'Suspicious' | 'False'

  // Fetch report details or connect to SSE stream
  useEffect(() => {
    let eventSource = null;

    const fetchReportDetail = async () => {
      try {
        const res = await fetch(apiUrl(`/api/v1/reports/${id}`), { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          const reportPayload = data.report?.reportData || data.report;
          if (reportPayload && (reportPayload.claims || reportPayload.scores)) {
            setReport(reportPayload);
            setLoading(false);
            return true;
          }
        }
      } catch (e) {
        // Report detail not ready in DB yet
      }
      return false;
    };

    const init = async () => {
      const exists = await fetchReportDetail();
      if (exists) return;

      // Connect to SSE stream (Cookie-based authentication)
      eventSource = new EventSource(apiUrl(`/api/v1/verify/stream/${id}`), { withCredentials: true });

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setProgressState(data);

          if (data.status === 'COMPLETED' && data.reportData) {
            setReport(data.reportData);
            setLoading(false);
            eventSource.close();
          } else if (data.status === 'FAILED') {
            setError(data.error || 'Verification pipeline encountered an error.');
            setLoading(false);
            eventSource.close();
          }
        } catch (err) {
          console.error('[SSE Parse Error]:', err);
        }
      };

      eventSource.onerror = async () => {
        // Attempt polling report endpoint if SSE connection drops
        const found = await fetchReportDetail();
        if (!found) {
          setTimeout(fetchReportDetail, 2000);
        }
      };
    };

    init();

    return () => {
      if (eventSource) eventSource.close();
    };
  }, [id]);

  const hasReportData = report && (report.claims || report.scores || report.summary);

  if ((loading || !hasReportData) && !error) {
    return (
      <div className="min-h-screen bg-slateDark-950 text-slate-100 flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-16 flex flex-col items-center justify-center text-center">
          <div className="glass-panel p-8 sm:p-12 rounded-2xl border border-slate-800 w-full space-y-6">
            <RefreshCw className="w-12 h-12 text-brand-400 animate-spin mx-auto" />
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">
                4-Agent AI Verification Engine Active
              </h2>
              <p className="text-slate-400 text-sm">{progressState.step}</p>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-slate-900 rounded-full h-3 overflow-hidden border border-slate-800">
              <div
                className="bg-gradient-to-r from-brand-600 to-emerald-400 h-full transition-all duration-500 rounded-full"
                style={{ width: `${progressState.progress || 15}%` }}
              />
            </div>
            
            <div className="flex justify-between items-center text-xs text-slate-500 font-mono">
              <span>Job ID: {id}</span>
              <span>{progressState.progress || 15}% Completed</span>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slateDark-950 text-slate-100 flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-16 text-center">
          <div className="glass-panel p-8 rounded-2xl border border-red-500/30 bg-red-500/5 space-y-4">
            <AlertTriangle className="w-12 h-12 text-red-400 mx-auto" />
            <h2 className="text-xl font-bold text-white">Verification Execution Failed</h2>
            <p className="text-sm text-slate-300">{error}</p>
            <Link
              to="/analysis"
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold rounded-xl"
            >
              <ArrowLeft className="w-4 h-4" /> Try Another Analysis
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const reportPayload = report?.reportData || report || {};
  const {
    sourceTitle = 'Verification Report',
    selectedTypes = [],
    scores = reportPayload.overallMetrics || {},
    breakdown = {},
    summary = '',
    recommendation = '',
    manipulationAnalysis = {},
    chartData = [],
    claims = [],
    truncated = false
  } = reportPayload;

  const safeScores = scores || {};
  const totalClaimsCount = claims ? claims.length : 0;

  const vCount = breakdown?.verified !== undefined ? breakdown.verified : (claims ? claims.filter(c => c.status === 'TRUSTED' || c.status === 'Verified').length : 0);
  const sCount = breakdown?.suspicious !== undefined ? breakdown.suspicious : (claims ? claims.filter(c => c.status === 'SUSPICIOUS' || c.status === 'Suspicious').length : 0);
  const fCount = breakdown?.false !== undefined ? breakdown.false : (claims ? claims.filter(c => c.status === 'FABRICATED' || c.status === 'False').length : 0);

  const totalBreakdownClaims = Math.max(1, vCount + sCount + fCount);
  const vPct = Math.round((vCount / totalBreakdownClaims) * 100);
  const sPct = Math.round((sCount / totalBreakdownClaims) * 100);
  const fPct = Math.round((fCount / totalBreakdownClaims) * 100);

  let dominantCategory = 'Verified';
  let dominantPct = vPct;
  let dominantColor = '#10b981';

  if (sPct >= vPct && sPct >= fPct) {
    dominantCategory = 'Suspicious';
    dominantPct = sPct;
    dominantColor = '#f59e0b';
  } else if (fPct >= vPct && fPct >= sPct) {
    dominantCategory = 'False';
    dominantPct = fPct;
    dominantColor = '#ef4444';
  }

  const safeChartData = (chartData && chartData.length > 0) ? chartData : [
    { name: 'Verified', value: vCount, color: '#10b981' },
    { name: 'Suspicious', value: sCount, color: '#f59e0b' },
    { name: 'False', value: fCount, color: '#ef4444' }
  ];

  const filteredClaims = claims ? claims.filter(c => claimFilter === 'ALL' || c.status === claimFilter) : [];

  const canonicalVerdict = reportPayload.articleVerdict || manipulationAnalysis?.verdict || 'UNVERIFIED';
  const factualScore = typeof reportPayload.factualAccuracyScore === 'number' ? reportPayload.factualAccuracyScore : (typeof safeScores.factCheckingScore === 'number' ? safeScores.factCheckingScore : 0);

  const isVerifiedHero = canonicalVerdict === 'VERIFIED' || canonicalVerdict === 'TRUSTED' || canonicalVerdict === 'HIGH_TRUST';
  const isFalseHero = canonicalVerdict === 'FALSE' || canonicalVerdict === 'FABRICATED' || canonicalVerdict === 'LOW_TRUST';
  const isPartiallyVerifiedHero = canonicalVerdict === 'PARTIALLY_VERIFIED';

  return (
    <div className="min-h-screen bg-slateDark-950 text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
        
        {/* High-Impact Non-Technical Verdict Hero Banner */}
        <div className={`p-6 rounded-2xl border flex flex-col sm:flex-row items-center justify-between gap-6 shadow-2xl ${
          isVerifiedHero
            ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
            : isFalseHero
            ? 'bg-red-950/40 border-red-500/50 text-red-300'
            : isPartiallyVerifiedHero
            ? 'bg-sky-950/40 border-sky-500/50 text-sky-300'
            : 'bg-amber-950/40 border-amber-500/50 text-amber-300'
        }`}>
          <div className="space-y-1.5 text-center sm:text-left">
            <div className="text-xs font-extrabold uppercase tracking-widest text-slate-400">OVERALL ARTICLE CREDIBILITY VERDICT</div>
            <div className="text-3xl sm:text-5xl font-black tracking-tight flex items-center justify-center sm:justify-start gap-3">
              {isVerifiedHero && (
                <><ShieldCheck className="w-10 h-10 text-emerald-400 shrink-0" /> VERIFIED</>
              )}
              {isFalseHero && (
                <><AlertTriangle className="w-10 h-10 text-red-400 shrink-0" /> FALSE</>
              )}
              {isPartiallyVerifiedHero && (
                <><HelpCircle className="w-10 h-10 text-sky-400 shrink-0" /> PARTIALLY VERIFIED</>
              )}
              {!isVerifiedHero && !isFalseHero && !isPartiallyVerifiedHero && (
                <><HelpCircle className="w-10 h-10 text-amber-400 shrink-0" /> UNVERIFIED</>
              )}
            </div>
            <p className="text-sm text-slate-200 font-medium max-w-2xl pt-1">
              {isVerifiedHero
                ? 'Verified Factual News: Content is independently corroborated by primary authoritative sources.'
                : isFalseHero
                ? 'False / Fabricated Misinformation Warning: Content contains major fabricated assertions contradicted by primary evidence.'
                : isPartiallyVerifiedHero
                ? 'Partially Verified: Core factual statements are supported, but sub-details or numbers contain discrepancies.'
                : 'Unverified Notice: Insufficient primary evidence exists to independently verify this content.'
              }
            </p>
          </div>

          <div className="flex flex-col items-center sm:items-end justify-center bg-slate-900/90 px-6 py-4 rounded-xl border border-slate-800 shrink-0 shadow-lg">
            <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Factual Score</span>
            <span className="text-3xl sm:text-4xl font-black text-white">{factualScore}%</span>
            <span className="text-[11px] text-slate-400 mt-0.5">{breakdown?.verified || 0} of {totalClaimsCount} claims verified</span>
          </div>
        </div>

        {/* PART A — Internal Contradiction Callout Banner */}
        {reportPayload.internalConsistencyIssues && reportPayload.internalConsistencyIssues.length > 0 && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/40 text-amber-200 text-xs sm:text-sm space-y-2 shadow-lg">
            <div className="flex items-center gap-2 font-bold text-amber-400 text-sm">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>⚠ Internal Contradiction Detected ({reportPayload.internalConsistencyIssues.length})</span>
            </div>
            {reportPayload.internalConsistencyIssues.map((issue, idx) => (
              <div key={idx} className="pl-7 text-xs opacity-90 leading-relaxed border-l-2 border-amber-500/50">
                {issue.description}
              </div>
            ))}
          </div>
        )}

        {/* 📷 / 🎥 Media Forensic Verification Card */}
        {(reportPayload.mediaAnalysis || reportPayload.inputType === 'PHOTO' || reportPayload.inputType === 'VIDEO' || sourceTitle.includes('Photo Verification') || sourceTitle.includes('Video Verification')) && (() => {
          const ma = reportPayload.mediaAnalysis || {};
          const fileInfo = ma.file || {};
          const metadata = ma.metadata || {};
          const isVideo = ma.mediaType === 'VIDEO' || reportPayload.inputType === 'VIDEO' || sourceTitle.includes('Video Verification');
          const signals = ma.manipulationSignals || [];
          const limitations = ma.limitations || [
            !metadata.hasExif ? 'EXIF metadata was unavailable in file payload.' : null,
            ma.reverseSearch?.status !== 'AVAILABLE' ? 'Reverse image search was not configured.' : null
          ].filter(Boolean);

          return (
            <div className="glass-panel p-6 rounded-2xl border border-purple-500/30 bg-purple-950/10 space-y-6 shadow-xl">
              {/* Card Header */}
              <div className="flex items-center justify-between border-b border-purple-500/20 pb-4">
                <div className="flex items-center gap-3">
                  {isVideo ? (
                    <Film className="w-6 h-6 text-indigo-400 shrink-0" />
                  ) : (
                    <Camera className="w-6 h-6 text-purple-400 shrink-0" />
                  )}
                  <div>
                    <h3 className="text-base font-bold text-white">
                      {isVideo ? '🎥 Video Forensic Verification Report' : '📷 Photo & Visual Media Verification Report'}
                    </h3>
                    <p className="text-xs text-slate-400">{fileInfo.filename || sourceTitle}</p>
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/40">
                  Agent 1–4 Media Pass
                </span>
              </div>

              {/* MEDIA OVERVIEW */}
              <div className="space-y-2">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-purple-400">Media Overview</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
                    <span className="text-slate-400 font-semibold block uppercase tracking-wider text-[10px]">File Name</span>
                    <span className="font-bold text-white truncate block">{fileInfo.filename || 'Uploaded Media File'}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
                    <span className="text-slate-400 font-semibold block uppercase tracking-wider text-[10px]">Type</span>
                    <span className="font-bold text-white uppercase">{ma.mediaType || (isVideo ? 'VIDEO' : 'PHOTO')}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
                    <span className="text-slate-400 font-semibold block uppercase tracking-wider text-[10px]">Size</span>
                    <span className="font-bold text-white">
                      {fileInfo.sizeBytes ? `${(fileInfo.sizeBytes / (1024 * 1024)).toFixed(2)} MB` : 'N/A'}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1 overflow-hidden">
                    <span className="text-slate-400 font-semibold block uppercase tracking-wider text-[10px]">SHA-256 Hash</span>
                    <span className="font-mono text-[10px] text-slate-300 truncate block">{fileInfo.sha256 || 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* MEDIA FINDINGS */}
              <div className="space-y-3">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-purple-400">Media Findings</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  
                  {/* Metadata */}
                  <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
                    <span className="font-bold text-white block">Metadata Inspection</span>
                    <div className="text-slate-300 space-y-1">
                      <div>Dimensions: <strong className="text-white">{metadata.width ? `${metadata.width} × ${metadata.height}` : 'N/A'}</strong></div>
                      <div>Format / Codec: <strong className="text-white">{metadata.format || metadata.codec || fileInfo.mimeType || 'N/A'}</strong></div>
                      <div>EXIF Data: <strong className={metadata.hasExif ? 'text-emerald-400' : 'text-slate-400'}>{metadata.hasExif ? 'Present' : 'Unavailable'}</strong></div>
                      {metadata.cameraMake && <div>Camera: <strong className="text-white">{metadata.cameraMake} {metadata.cameraModel}</strong></div>}
                      {metadata.dateTimeOriginal && <div>Timestamp: <strong className="text-white">{metadata.dateTimeOriginal}</strong></div>}
                      {metadata.durationSeconds && <div>Duration: <strong className="text-white">{metadata.durationSeconds.toFixed(1)}s</strong></div>}
                      {metadata.fps && <div>FPS: <strong className="text-white">{metadata.fps}</strong></div>}
                    </div>
                  </div>

                  {/* Visual Findings */}
                  <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
                    <span className="font-bold text-white block">Visual Scene Analysis</span>
                    <p className="text-slate-300 leading-relaxed">
                      {ma.visualDescription || 'Visual scene evaluation completed by Agent 1 multimodal vision reader.'}
                    </p>
                  </div>

                  {/* OCR Visible Text */}
                  {ma.ocrText && (
                    <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2 md:col-span-2">
                      <span className="font-bold text-white block">OCR Visible Text Extraction</span>
                      <p className="text-slate-300 font-mono text-xs whitespace-pre-wrap bg-slate-950/60 p-3 rounded-lg border border-slate-800/60">
                        {ma.ocrText}
                      </p>
                    </div>
                  )}

                  {/* Video Audio Transcript */}
                  {isVideo && ma.transcript && (
                    <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2 md:col-span-2">
                      <span className="font-bold text-white block">Speech-to-Text Audio Transcript</span>
                      <p className="text-slate-300 text-xs leading-relaxed bg-slate-950/60 p-3 rounded-lg border border-slate-800/60">
                        "{ma.transcript}"
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* AI MANIPULATION INDICATORS */}
              <div className="space-y-3">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-purple-400">AI Manipulation Indicators</h4>
                {signals.length > 0 ? (
                  <div className="space-y-2">
                    {signals.map((s, idx) => (
                      <div key={idx} className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 flex items-start justify-between gap-3 text-xs">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white uppercase">{s.type || 'Indicator'}</span>
                            {typeof s.timestamp === 'number' && (
                              <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono text-[10px]">
                                t = {s.timestamp.toFixed(1)}s
                              </span>
                            )}
                            <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                              s.severity === 'HIGH' ? 'bg-red-500/20 text-red-300 border border-red-500/30' :
                              s.severity === 'MEDIUM' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                              'bg-slate-800 text-slate-300'
                            }`}>
                              {s.severity || 'LOW'} SEVERITY
                            </span>
                          </div>
                          <p className="text-slate-300 leading-relaxed">{s.explanation}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-[10px] text-slate-400 uppercase font-semibold block">Confidence</span>
                          <span className="font-bold text-white text-sm">{s.confidence || 50}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-400 italic">
                    No critical manipulation indicators detected in visual or temporal frames.
                  </div>
                )}
              </div>

              {/* RELATED NEWS & WEB COVERAGE (STAGE 2) */}
              {reportPayload.articleResearchContext?.summary && (
                <div className="p-4 rounded-xl bg-slate-900/90 border border-brand-500/30 space-y-2 shadow-lg">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-brand-300 text-xs uppercase tracking-wider flex items-center gap-2">
                      <Search className="w-4 h-4 text-brand-400" />
                      Stage 2: Related News & Web Coverage Summary
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-brand-500/20 text-brand-300 border border-brand-500/30">
                      {reportPayload.hasAttachedNews ? 'Attached News Cross-Checked' : 'Related News Research'}
                    </span>
                  </div>
                  <p className="text-slate-200 text-xs leading-relaxed">
                    {reportPayload.articleResearchContext.summary}
                  </p>
                </div>
              )}

              {/* LIMITATIONS */}
              <div className="space-y-2">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">Analysis Limitations & Context</h4>
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-400 space-y-1">
                  {limitations.length > 0 ? (
                    limitations.map((lim, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <span className="text-amber-400 font-bold">•</span>
                        <span>{lim}</span>
                      </div>
                    ))
                  ) : (
                    <div className="italic">Analysis performed based on available binary context and external evidence archives.</div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* PART B — Sourcing Transparency & Density Indicator */}
        {reportPayload.sourcingTransparency && (
          <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-md">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Sourcing Transparency & Attribution Quality</div>
              <div className="text-sm text-slate-200 mt-1 flex items-center gap-2">
                <span className="font-semibold text-emerald-400">{reportPayload.sourcingTransparency.namedAttributionCount} Named Attributions</span>
                <span className="text-slate-600">•</span>
                <span className="font-semibold text-amber-400">{reportPayload.sourcingTransparency.vagueAttributionCount} Vague/Anonymous References</span>
              </div>
            </div>
            <div className="flex items-center gap-3 text-right">
              <div>
                <div className="text-[11px] text-slate-400 uppercase font-semibold">Vague Sourcing Ratio</div>
                <div className={`text-lg font-black ${reportPayload.sourcingTransparency.vagueSourcingRatio > 0.5 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {Math.round((reportPayload.sourcingTransparency.vagueSourcingRatio || 0) * 100)}%
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Truncation Warning Notice Banner */}
        {truncated && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs sm:text-sm flex items-center gap-3">
            <Info className="w-5 h-5 shrink-0 text-amber-400" />
            <span>Note: Document text exceeded token limits and was automatically truncated to ~12,000 tokens. Analysis was conducted on the leading portion.</span>
          </div>
        )}

        {/* Per-Category Score Visualizations */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {safeScores.factCheckingScore !== undefined && (
            <div className="glass-panel p-5 rounded-2xl border border-slate-800 flex flex-col justify-between">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Fact Checking Score</div>
              <div className="flex items-baseline gap-2 my-2">
                <span className="text-3xl sm:text-4xl font-extrabold text-white">
                  {typeof safeScores.factCheckingScore === 'number' ? `${safeScores.factCheckingScore}%` : safeScores.factCheckingScore}
                </span>
                <span className="text-xs text-emerald-400 font-medium">Verified claims ratio</span>
              </div>
              <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${typeof safeScores.factCheckingScore === 'number' ? safeScores.factCheckingScore : 0}%` }} />
              </div>
            </div>
          )}

          {safeScores.fakeNewsScore !== undefined && (
            <div className="glass-panel p-5 rounded-2xl border border-slate-800 flex flex-col justify-between">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Source & Content Credibility</div>
              <div className="flex items-baseline gap-2 my-2">
                <span className="text-3xl sm:text-4xl font-extrabold text-white">
                  {typeof safeScores.fakeNewsScore === 'number' ? `${safeScores.fakeNewsScore}%` : safeScores.fakeNewsScore}
                </span>
                <span className="text-xs text-brand-400 font-medium">Factual trust index</span>
              </div>
              <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                <div className="bg-brand-500 h-full rounded-full" style={{ width: `${typeof safeScores.fakeNewsScore === 'number' ? safeScores.fakeNewsScore : 0}%` }} />
              </div>
            </div>
          )}

          {safeScores.businessReportScore !== undefined && (
            <div className="glass-panel p-5 rounded-2xl border border-slate-800 flex flex-col justify-between">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Business Metric Precision</div>
              <div className="flex items-baseline gap-2 my-2">
                <span className={`font-extrabold text-white ${typeof safeScores.businessReportScore === 'number' ? 'text-3xl sm:text-4xl' : 'text-sm font-sans text-amber-300'}`}>
                  {typeof safeScores.businessReportScore === 'number' ? `${safeScores.businessReportScore}%` : safeScores.businessReportScore}
                </span>
                {typeof safeScores.businessReportScore === 'number' && (
                  <span className="text-xs text-amber-400 font-medium">Numerical & data accuracy</span>
                )}
              </div>
              <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                <div className="bg-amber-500 h-full rounded-full" style={{ width: `${typeof safeScores.businessReportScore === 'number' ? safeScores.businessReportScore : 0}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* Executive Summary & Visualization Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Executive AI Summary Box */}
          <div className="lg:col-span-2 glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-brand-400" />
              <h2 className="text-lg font-bold text-white">AI Executive Summary & Recommendation</h2>
            </div>
            
            <p className="text-slate-300 text-sm leading-relaxed">{summary}</p>
            
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
              <div className="text-xs font-bold text-brand-400 uppercase tracking-wider">Agent Recommendation</div>
              <p className="text-xs text-slate-200 leading-relaxed font-medium">{recommendation}</p>
            </div>
          </div>

          {/* Recharts Donut Chart with Dominant Center Display */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 flex flex-col items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 w-full">
              <PieIcon className="w-4 h-4 text-brand-400" /> Claims Status Breakdown
            </h3>
            
            <div className="relative w-full h-48 my-2 flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={safeChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {safeChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name) => [
                      `${value} claim(s) (${Math.round((value / totalClaimsCount) * 100)}%)`,
                      name
                    ]}
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                  />
                </PieChart>
              </ResponsiveContainer>

              {/* Prominent Overlay in Center of Donut */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                <span className="text-2xl sm:text-3xl font-black tracking-tight" style={{ color: dominantColor }}>
                  {dominantPct}%
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {dominantCategory}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 w-full text-center text-xs pt-2 border-t border-slate-800">
              <div>
                <div className="font-bold text-emerald-400">{breakdown?.verified} <span className="text-[10px] font-medium text-slate-400">({vPct}%)</span></div>
                <div className="text-slate-500">Verified</div>
              </div>
              <div>
                <div className="font-bold text-amber-400">{breakdown?.suspicious} <span className="text-[10px] font-medium text-slate-400">({sPct}%)</span></div>
                <div className="text-slate-500">Suspicious</div>
              </div>
              <div>
                <div className="font-bold text-red-400">{breakdown?.false} <span className="text-[10px] font-medium text-slate-400">({fPct}%)</span></div>
                <div className="text-slate-500">False</div>
              </div>
            </div>
          </div>
        </div>

        {/* Claims Breakdown & Source Evidence Links */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-brand-400" /> Claims & Source Evidence ({claims?.length || 0})
            </h2>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
              {['ALL', 'TRUSTED', 'SUSPICIOUS', 'FABRICATED'].map((status) => (
                <button
                  key={status}
                  onClick={() => setClaimFilter(status)}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                    claimFilter === status
                      ? 'bg-brand-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          {/* Pipeline Observability & Inspection Panel */}
          {report.observability && (
            <ObservabilityPanel observability={report.observability} reportData={report} />
          )}

          {/* Claims List */}
          <div className="space-y-4">
            {filteredClaims.map((c) => {
              const isTrusted = c.status === 'TRUSTED' || c.status === 'Verified';
              const isFabricated = c.status === 'FABRICATED' || c.status === 'False';

              return (
                <div key={c.claimId} className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3 shadow-lg">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      {isTrusted ? (
                        <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
                      ) : isFabricated ? (
                        <XCircle className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
                      ) : (
                        <HelpCircle className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <p className="text-base sm:text-lg font-bold text-white leading-snug">{c.claimText}</p>
                        <div className="flex items-center gap-2 text-xs text-slate-400 mt-1.5">
                          <span className="bg-slate-800 px-2.5 py-0.5 rounded text-slate-200 font-semibold">{c.category}</span>
                          <span>•</span>
                          <span className="font-semibold">{c.claimScope || 'Regional'} Scope</span>
                          <span>•</span>
                          <span className="font-bold text-white">Trust Confidence: {c.confidence}%</span>
                        </div>
                      </div>
                    </div>

                    <span className={`px-3.5 py-1 rounded-full text-xs sm:text-sm font-extrabold uppercase shrink-0 tracking-wider ${
                      isTrusted ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-emerald-950/30' :
                      isFabricated ? 'bg-red-500/20 text-red-300 border border-red-500/40 shadow-red-950/30' :
                      'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-amber-950/30'
                    }`}>
                      {isTrusted ? 'TRUSTED' : isFabricated ? 'FABRICATED' : 'SUSPICIOUS'}
                    </span>
                  </div>

                <p className="text-xs text-slate-300 pl-7 leading-relaxed bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/80">
                  <span className="font-semibold text-slate-400">Agent Reasoning:</span> {c.explanation}
                </p>

                {c.plausibilityFlag && (
                  <p className="text-xs text-purple-300 pl-7 leading-relaxed bg-purple-950/20 p-2.5 rounded-lg border border-purple-500/30 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-purple-200">Additional note:</strong> {c.plausibilityReasoning || "this claim's described process is atypical for how such actions normally occur."}
                    </span>
                  </p>
                )}

                <div className="flex items-center justify-between pl-7 pt-1 border-t border-slate-800/60 mt-2">
                  <button
                    onClick={() => setAuditModalClaim(c)}
                    className="flex items-center gap-1.5 px-3 py-1 bg-brand-950/60 hover:bg-brand-900/60 text-brand-300 border border-brand-800/60 rounded-lg text-xs font-semibold transition-colors"
                  >
                    <Search className="w-3.5 h-3.5 text-brand-400" />
                    Inspect Diagnostic Audit Trail
                  </button>
                </div>

                {/* Source Links with Categorized Stances */}
                {c.sources && c.sources.length > 0 ? (
                  <div className="pl-7 pt-1 space-y-2">
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Source Evidence Links:</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {c.sources.map((src, idx) => {
                        const stance = src.stance || (isTrusted ? 'SUPPORTS' : isFabricated ? 'REFUTES' : 'NEUTRAL');
                        const badgeColor = stance === 'SUPPORTS' 
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' 
                          : stance === 'REFUTES' 
                            ? 'bg-red-500/20 text-red-300 border-red-500/30' 
                            : 'bg-amber-500/20 text-amber-300 border-amber-500/30';

                        return (
                          <a
                            key={idx}
                            href={src.url || src.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 hover:border-brand-500/40 text-xs transition-colors group flex items-start justify-between gap-2"
                          >
                            <div className="space-y-1 overflow-hidden">
                              <div className="flex items-center gap-2">
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase border ${badgeColor}`}>
                                  {stance}
                                </span>
                                <span className="text-[11px] text-slate-500 truncate">{src.domain}</span>
                              </div>
                              <div className="font-semibold text-brand-300 group-hover:underline truncate">{src.title}</div>
                              {src.snippet && <p className="text-[11px] text-slate-400 line-clamp-2">{src.snippet}</p>}
                            </div>
                            <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-brand-400 shrink-0 mt-0.5" />
                          </a>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="pl-7 text-xs text-slate-500 italic">
                    No reliable external evidence was found to confirm or refute this claim.
                  </div>
                )}
              </div>
            );
          })}

            {filteredClaims.length === 0 && (
              <div className="text-center py-8 text-slate-500 text-sm">
                No claims found matching status filter: <span className="font-bold text-slate-300">{claimFilter}</span>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Deep Claim Audit & Telemetry Inspector Modal */}
      <ClaimAuditModal
        claim={auditModalClaim}
        isOpen={!!auditModalClaim}
        onClose={() => setAuditModalClaim(null)}
      />
    </div>
  );
}
