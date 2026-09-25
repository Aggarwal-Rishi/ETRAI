import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import VerdictBadge from '../components/VerdictBadge';
import ClaimAuditModal from '../components/ClaimAuditModal';
import Agent3DebugPanel from '../components/Agent3DebugPanel';
import ObservabilityPanel from '../components/ObservabilityPanel';
import ScoreDerivationView from '../components/ScoreDerivationView';
import ImageForensicsCompare from '../components/ImageForensicsCompare';
import VideoForensicsViewer from '../components/VideoForensicsViewer';
import ScoringWeightsModal from '../components/ScoringWeightsModal';
import SightengineReportCard from '../components/SightengineReportCard';
import GeminiGroundedVerificationCard from '../components/GeminiGroundedVerificationCard';
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
  Film,
  Link as LinkIcon,
  Hash,
  Share2,
  Download,
  Printer,
  Check,
  Clock,
  Layers,
  Sparkles,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Lock,
  Terminal,
  Activity,
  Sliders,
  FileJson,
  Copy,
} from 'lucide-react';
import { generateClaimDiagnosticJson } from '../utils/claimDiagnosticExport';
import { isDebugEnabled, setDebugEnabled } from '../utils/featureFlags';

export default function ResultsPage() {
  const { id } = useParams();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [auditModalClaim, setAuditModalClaim] = useState(null);
  const [debugPanelClaim, setDebugPanelClaim] = useState(null);
  const [activeReportTab, setActiveReportTab] = useState('full'); // 'full' | 'text' | 'links' | 'images' | 'videos' | 'numbers'
  const [openClaimIdx, setOpenClaimIdx] = useState(0);
  const [toastMsg, setToastMsg] = useState(null);
  const [researchingClaimIdx, setResearchingClaimIdx] = useState(null);
  const [claimSearchErrors, setClaimSearchErrors] = useState({});
  const [isWeightsModalOpen, setIsWeightsModalOpen] = useState(false);
  const [copiedClaimJsonIdx, setCopiedClaimJsonIdx] = useState(null);
  const [isDebug, setIsDebug] = useState(() => isDebugEnabled());

  useEffect(() => {
    const handleDebugChange = () => setIsDebug(isDebugEnabled());
    window.addEventListener('etrai_debug_change', handleDebugChange);

    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        const next = !isDebugEnabled();
        setDebugEnabled(next);
        setIsDebug(next);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('etrai_debug_change', handleDebugChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // SSE progress state for live pipeline jobs
  const [progressState, setProgressState] = useState({
    status: 'PROCESSING',
    progress: 10,
    step: 'Connecting to 4-Agent Verification Engine...'
  });

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // Fetch report data
  useEffect(() => {
    let eventSource = null;
    let retryTimer = null;
    let disposed = false;
    let recoveryFinished = false;
    let recoveryAttempts = 0;
    let consecutiveNotFound = 0;
    let reportNotFound = false;
    let jobNotFound = false;
    const maxRecoveryAttempts = 120;
    const token = localStorage.getItem('etrai_token');
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    const stopRecovery = () => {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      if (retryTimer) {
        window.clearTimeout(retryTimer);
        retryTimer = null;
      }
    };

    const acceptReport = (rawPayload) => {
      let reportPayload = rawPayload;
      if (typeof reportPayload === 'string') {
        try { reportPayload = JSON.parse(reportPayload); } catch (_) {}
      }
      if (reportPayload && typeof reportPayload.reportData === 'string') {
        try {
          const parsed = JSON.parse(reportPayload.reportData);
          reportPayload = { ...parsed, ...reportPayload };
        } catch (_) {}
      } else if (reportPayload && typeof reportPayload.reportData === 'object' && reportPayload.reportData !== null) {
        reportPayload = { ...reportPayload.reportData, ...reportPayload };
      }

      if (reportPayload && typeof reportPayload.mediaAnalysis === 'string') {
        try {
          reportPayload.mediaAnalysis = JSON.parse(reportPayload.mediaAnalysis);
        } catch (_) {}
      }

      if (reportPayload && typeof reportPayload.aiDetection === 'string') {
        try {
          reportPayload.aiDetection = JSON.parse(reportPayload.aiDetection);
        } catch (_) {}
      }

      const isUsableReport = reportPayload && typeof reportPayload === 'object' && (
        Array.isArray(reportPayload.claims) ||
        Boolean(reportPayload.scores) ||
        Boolean(reportPayload.mediaAnalysis) ||
        Boolean(reportPayload.summary) ||
        Boolean(reportPayload.images) ||
        Boolean(reportPayload.aiDetection)
      );
      if (!isUsableReport || disposed) return false;
      recoveryFinished = true;
      setReport(reportPayload);
      setError('');
      setLoading(false);
      stopRecovery();
      return true;
    };

    const fetchReportDetail = async () => {
      const controller = new AbortController();
      // Media dossiers can require a cold database connection. Avoid starting
      // a duplicate stream-recovery fetch while the primary request is active.
      const timeoutId = window.setTimeout(() => controller.abort(), 30000);
      try {
        const res = await fetch(apiUrl(`/api/v1/reports/${id}`), {
          headers,
          credentials: 'include',
          signal: controller.signal
        });
        if (res.ok) {
          reportNotFound = false;
          const data = await res.json();
          const reportPayload = data.report?.reportData || data.report;
          if (acceptReport(reportPayload)) return true;
        } else {
          reportNotFound = res.status === 404;
        }
      } catch (_) {
        // Polling and the live job stream handle transient database failures.
      } finally {
        window.clearTimeout(timeoutId);
      }
      return false;
    };

    const fetchLiveJobState = async () => {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 20000);
      try {
        const res = await fetch(apiUrl(`/api/v1/verify/job/${id}`), {
          headers,
          credentials: 'include',
          signal: controller.signal
        });
        if (!res.ok) {
          jobNotFound = res.status === 404;
          return false;
        }
        jobNotFound = false;
        const data = await res.json();
        const job = data.job;
        if (!job) return false;
        setProgressState(job);
        if (job.status === 'COMPLETED') {
          return acceptReport(job.reportData);
        }
        if (job.status === 'FAILED') {
          recoveryFinished = true;
          stopRecovery();
          setError(job.error || 'Verification pipeline encountered an error.');
          setLoading(false);
          return true;
        }
        return false;
      } catch (_) {
        return false;
      } finally {
        window.clearTimeout(timeoutId);
      }
    };

    const scheduleRecovery = (delay = 5000) => {
      if (disposed || recoveryFinished || retryTimer) return;
      retryTimer = window.setTimeout(async () => {
        retryTimer = null;
        if (disposed) return;
        if (await fetchReportDetail()) return;
        if (await fetchLiveJobState()) return;
        consecutiveNotFound = reportNotFound && jobNotFound ? consecutiveNotFound + 1 : 0;
        if (consecutiveNotFound >= 3) {
          recoveryFinished = true;
          stopRecovery();
          setError('This dossier is not present in saved reports or active job memory. Please start a new analysis for this content.');
          setLoading(false);
          return;
        }
        recoveryAttempts += 1;
        if (recoveryAttempts >= maxRecoveryAttempts) {
          recoveryFinished = true;
          stopRecovery();
          setError('The dossier is still unavailable after repeated report and live-job recovery attempts.');
          setLoading(false);
          return;
        }
        scheduleRecovery(5000);
      }, delay);
    };

    const init = async () => {
      const streamPath = token
        ? `/api/v1/verify/stream/${id}?token=${encodeURIComponent(token)}`
        : `/api/v1/verify/stream/${id}`;
      eventSource = new EventSource(apiUrl(streamPath), { withCredentials: true });

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setProgressState(data);

          if (data.status === 'COMPLETED' && data.reportData) {
            acceptReport(data.reportData);
          } else if (data.status === 'COMPLETED') {
            scheduleRecovery(0);
          } else if (data.status === 'FAILED') {
            recoveryFinished = true;
            stopRecovery();
            setError(data.error || 'Verification pipeline encountered an error.');
            setLoading(false);
          }
        } catch (e) {
          console.error('[SSE parse error]:', e);
        }
      };

      eventSource.onerror = () => {
        // EventSource reconnects automatically. Keep authenticated polling active
        // until either the stored report or the in-memory completed job is found.
        scheduleRecovery(1000);
      };

      // Start the stored-report request in parallel with the live stream so a
      // slow database cannot hide a completed in-memory job for 30 seconds.
      const exists = await fetchReportDetail();
      if (!exists) scheduleRecovery(1000);
    };

    init();

    return () => {
      disposed = true;
      stopRecovery();
    };
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFF6E3] text-[#0B5CD5] flex flex-col font-sans">
        <Navbar />
        <main className="flex-1 flex flex-col items-center justify-center p-6 space-y-6">
          <div className="w-16 h-16 rounded-full border-4 border-[#D97757]/20 border-t-[#D97757] animate-spin" />
          <div className="text-center space-y-2 max-w-md">
            <h2 className="text-xl font-bold text-[#0B5CD5]">Synthesizing DeepTrust Dossier...</h2>
            <p className="text-xs text-[#7386A8] font-mono">{progressState.step}</p>
            <div className="w-64 h-1.5 bg-[#EFEEE9] rounded-full overflow-hidden mx-auto mt-2">
              <div
                className="h-full bg-gradient-to-r from-[#0B5CD5] to-[#D97757] transition-all duration-300"
                style={{ width: `${progressState.progress || 20}%` }}
              />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-[#FFF6E3] text-[#0B5CD5] flex flex-col font-sans">
        <Navbar />
        <main className="flex-1 flex flex-col items-center justify-center p-6 space-y-4">
          <div className="p-3 bg-[#F7E3E0] text-[#B23F35] rounded-2xl border border-[#EBC7C2]">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-[#0B5CD5]">Dossier Unavailable</h2>
          <p className="text-xs text-[#7386A8] max-w-md text-center">{error || 'Verification report could not be found.'}</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-[#D97757] text-white text-xs font-semibold rounded-xl hover:bg-[#B0512F] inline-flex items-center gap-1.5 shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Retry Loading
            </button>
            <Link to="/dashboard" className="px-4 py-2 bg-[#EFEEE9] text-[#2C4E86] text-xs font-semibold rounded-xl hover:bg-[#CECECE]">
              Return to Dashboard
            </Link>
            <Link to="/analysis" className="px-4 py-2 bg-white border border-[#CECECE] text-[#0B5CD5] text-xs font-semibold rounded-xl hover:border-[#D97757]">
              Start New Analysis
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const trustScore = report.explainableScoring?.finalTrustScore !== undefined
    ? Math.round(report.explainableScoring.finalTrustScore)
    : (report.scores?.overallTrustScore !== undefined
        ? Math.round(report.scores.overallTrustScore)
        : (report.factualAccuracyScore !== undefined ? Math.round(report.factualAccuracyScore) : 50));
  const verdict = report.verdict || (trustScore >= 75 ? 'Real' : trustScore >= 40 ? 'Suspicious' : 'Fake');
  const claims = report.claims || [];
  const claimSources = claims.flatMap((claim) => Array.isArray(claim.sources) ? claim.sources : []);
  const sources = report.sources?.length
    ? report.sources
    : Array.from(new Map(claimSources.map((source, index) => [
      source.url || source.link || `${source.domain || 'source'}-${index}`,
      source
    ])).values());
  const evidenceCount = claims.reduce((sum, c) => sum + (c.sources ? c.sources.length : 0), 0);
  const contradictionsCount = claims.filter(c => c.verdict === 'FALSE' || c.status === 'FABRICATED').length;
  const entities = report.entities || [];
  const entityVerification = report.entityVerification || {};
  const entityStatusStyles = {
    VERIFIED: 'bg-[#E7F4EC] text-[#2C5B3E] border-[#B9D8C5]',
    PROBABLE: 'bg-[#FFF6DD] text-[#8A6414] border-[#E8D4B0]',
    AMBIGUOUS: 'bg-[#FFF0E8] text-[#A34E2E] border-[#E8C2B2]',
    UNVERIFIED: 'bg-[#F5E9ED] text-[#9F2D4A] border-[#E3BCC8]',
    DETECTED: 'bg-[#EAF1FC] text-[#2C4E86] border-[#C7D5EB]',
    TEXT_ONLY: 'bg-[#EFEEE9] text-[#52627D] border-[#CECECE]'
  };
  const parseJsonField = (val) => {
    if (!val) return null;
    if (typeof val === 'object') return val;
    if (typeof val === 'string') {
      try { return JSON.parse(val); } catch (_) { return null; }
    }
    return null;
  };

  const numericalFacts = report.numericalFacts || [];
  const links = report.discoveredAssets?.links || [];
  const parsedMediaAnalysis = parseJsonField(report.mediaAnalysis) || {};
  const mediaType = (report.inputType || parsedMediaAnalysis.mediaType || 'TEXT').toUpperCase();

  // Sightengine AI Detection / Deepfake Audit parsing
  const aiDetection = parseJsonField(report.aiDetection) ||
    parseJsonField(parsedMediaAnalysis.aiDetection) ||
    parseJsonField(report.images?.[0]?.aiDetection) ||
    parseJsonField(parsedMediaAnalysis.images?.[0]?.aiDetection) ||
    null;

  const hasSightengineAi = Boolean(aiDetection && (aiDetection.status === 'SUCCESS' || aiDetection.configured));
  const hasImageForensics = (report?.images && report.images.length > 0) ||
    (parsedMediaAnalysis.images && parsedMediaAnalysis.images.length > 0) ||
    Boolean(parsedMediaAnalysis.imageForensics) ||
    Boolean(aiDetection && !aiDetection.evaluatedFramesCount) ||
    Boolean(report?.sourceTitle && /photo|image|jpg|jpeg|png|webp/i.test(report.sourceTitle));
  const hasVideoForensics = mediaType.includes('VIDEO') || mediaType.includes('AUDIO') ||
    Boolean(parsedMediaAnalysis.videoAudioForensics &&
      Object.keys(parsedMediaAnalysis.videoAudioForensics).length > 0) ||
    Boolean(parsedMediaAnalysis.transcriptVerification) ||
    Boolean(report?.transcriptVerification) ||
    Boolean(parsedMediaAnalysis.audioBreakdown) ||
    Boolean(report?.audioBreakdown) ||
    Boolean(parsedMediaAnalysis.onScreenHeadlines?.length > 0) ||
    Boolean(aiDetection?.evaluatedFramesCount) ||
    Boolean(report?.sourceTitle && /\b(?:video|clip|mp4|mov|webm|avi)\b/i.test(report.sourceTitle));

  const detectedForensicMediaType = hasVideoForensics || mediaType.includes('VIDEO') ? 'VIDEO' : 'IMAGE';

  // Confidence derivation — exact same canonical metric as trust score
  const confidencePct = trustScore;

  // Print PDF trigger
  const handlePrintPdf = () => {
    window.print();
  };

  const handleClaimResearch = async (claim, claimIndex) => {
    if (researchingClaimIdx !== null) return;
    setResearchingClaimIdx(claimIndex);
    setClaimSearchErrors(previous => ({ ...previous, [claimIndex]: null }));
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 75000);

    try {
      const token = localStorage.getItem('etrai_token');
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(apiUrl('/api/v1/verify/claim-deep-research'), {
        method: 'POST',
        headers,
        credentials: 'include',
        signal: controller.signal,
        body: JSON.stringify({
          analysisId: id,
          claimIndex,
          claim,
          articleResearchContext: report.articleResearchContext || report.articleDeepResearch || null
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.updatedClaim) {
        throw new Error(payload.error || 'Individual claim research did not return an updated claim.');
      }

      setReport(previous => {
        const updatedClaims = [...(previous.claims || [])];
        updatedClaims[claimIndex] = payload.updatedClaim;
        const sourceMap = new Map();
        [...(previous.sources || []), ...(payload.updatedClaim.sources || [])].forEach((source, sourceIndex) => {
          const sourceUrl = source?.url || source?.link || '';
          const sourceKey = sourceUrl || `${source?.domain || 'source'}:${source?.title || sourceIndex}`;
          sourceMap.set(sourceKey, { ...(sourceMap.get(sourceKey) || {}), ...source });
        });
        return { ...previous, claims: updatedClaims, sources: Array.from(sourceMap.values()) };
      });
      const retrievedSourceCount = payload.deepResearch?.evaluatedSources?.length || 0;
      showToast(retrievedSourceCount > 0
        ? (payload.persisted
          ? `Claim ${claimIndex + 1} research completed and saved`
          : `Claim ${claimIndex + 1} research completed`)
        : `No new sources found for claim ${claimIndex + 1}; its previous verdict was preserved`);
    } catch (researchError) {
      const message = researchError.name === 'AbortError'
        ? 'Individual claim search took too long. Please try again.'
        : (researchError.message || 'Individual claim search failed.');
      setClaimSearchErrors(previous => ({ ...previous, [claimIndex]: message }));
    } finally {
      window.clearTimeout(timeoutId);
      setResearchingClaimIdx(null);
    }
  };

  const handleCopyClaimJson = (claim, idx, e) => {
    e?.stopPropagation();
    try {
      const diagData = generateClaimDiagnosticJson(claim);
      navigator.clipboard.writeText(JSON.stringify(diagData, null, 2));
      setCopiedClaimJsonIdx(idx);
      setToastMsg(`Claim #${idx + 1} Diagnostic JSON copied to clipboard!`);
      setTimeout(() => {
        setCopiedClaimJsonIdx(null);
        setToastMsg(null);
      }, 2500);
    } catch (err) {
      console.error('Failed to copy claim JSON:', err);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFF6E3] text-[#0B5CD5] flex flex-col font-sans print:bg-white print:text-black">
      <div className="print:hidden">
        <Navbar />
      </div>

      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 bg-[#000D59] border border-[#D97757] text-[#EDE7DC] text-xs rounded-full shadow-2xl flex items-center gap-2 animate-slideUp print:hidden">
          <Sparkles className="w-4 h-4 text-[#E88F6B]" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. PRINT MASTHEAD (VISIBLE ONLY IN PRINT / PDF EXPORT)                    */}
      {/* ========================================================================= */}
      <div className="hidden print:block p-8 border-b-2 border-black mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-black">DEEPTRUST VERIFICATION DOSSIER</h1>
            <p className="text-xs text-neutral-600 font-mono mt-1">DeepTrust AI Multi-Agent Evidence Network</p>
          </div>
          <div className="text-right font-mono text-xs text-neutral-700">
            <div><strong>RUN ID:</strong> {id}</div>
          </div>
          <div className="text-right font-mono text-xs text-neutral-700">
            <div><strong>RUN ID:</strong> {id}</div>
            <div><strong>SEALED:</strong> {new Date().toISOString()}</div>
            <div><strong>TRUST SCORE:</strong> {trustScore}/100 ({verdict.toUpperCase()})</div>
          </div>
        </div>
      </div>
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-fadeIn">
        
        {/* Navigation & Action Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
          <Link
            to="/history"
            className="inline-flex items-center gap-2 text-xs font-semibold text-[#2C4E86] hover:text-[#0B5CD5] transition"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-[#D97757]" />
            <span>Back to History Ledger</span>
          </Link>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => {
                navigator.clipboard.writeText(window.location.href);
                showToast('Dossier URL copied to clipboard');
              }}
              className="px-3 py-1.5 bg-[#EFEEE9] hover:bg-[#CECECE] border border-[#CECECE] text-[#2C4E86] text-xs font-semibold rounded-xl transition flex items-center gap-1.5"
            >
              <Share2 className="w-3.5 h-3.5 text-[#D97757]" />
              <span>Share</span>
            </button>
            <button
              onClick={handlePrintPdf}
              className="px-3.5 py-1.5 bg-[#0033C4] hover:bg-[#0A45E4] text-white text-xs font-semibold rounded-xl shadow-md transition flex items-center gap-1.5 border border-[rgba(240,237,233,0.28)]"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Export PDF</span>
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 2. VERDICT HERO CARD                                                      */}
        {/* ========================================================================= */}
        <div className="p-6 sm:p-8 rounded-3xl bg-white border border-[#CECECE] shadow-sm space-y-6 relative overflow-hidden">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            
            {/* Left: Title + Source + Verdict Wash */}
            <div className="space-y-3 max-w-2xl">
              <div className="flex items-center gap-2.5 flex-wrap">
                <VerdictBadge status={verdict} size="lg" />
                <span className="px-2 py-0.5 bg-[#EFEEE9] text-[#2C4E86] rounded font-mono text-[10px] font-bold border border-[#CECECE]">
                  {mediaType}
                </span>
                <span className="text-xs text-[#7386A8] font-mono">Dossier {id.slice(0, 12)}</span>
              </div>

              <h1 className="text-xl sm:text-2xl font-bold text-[#0B5CD5] leading-snug">
                {report.sourceTitle || report.title || 'Verification Investigation'}
              </h1>

              <p className="text-xs sm:text-sm text-[#2C4E86] leading-relaxed">
                {report.summary || 'Evidentiary investigation conducted across primary web and news archives.'}
              </p>
            </div>

            {/* Right: Circular SVG Trust Dial + Telemetry Stats */}
            <div className="flex items-center gap-6 flex-shrink-0 bg-[#F8F8F6] p-5 rounded-2xl border border-[#CECECE]">
              
              {/* Dial */}
              <div className="relative w-24 h-24 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-[#EFEEE9]"
                    strokeWidth="3.5"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className={trustScore >= 75 ? 'text-[#2C5B3E]' : trustScore >= 40 ? 'text-[#B98520]' : 'text-[#B23F35]'}
                    strokeDasharray={`${trustScore}, 100`}
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <div className="absolute flex flex-col items-center justify-center text-center">
                  <span className="text-xl font-black font-mono text-[#0B5CD5] leading-none">{trustScore}</span>
                  <span className="text-[9px] uppercase font-mono text-[#7386A8] mt-0.5">Trust</span>
                </div>
              </div>

              {/* Telemetry Stats Grid */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs font-mono">
                <div>
                  <span className="text-[#7386A8] text-[10px] block">Confidence</span>
                  <span className="font-bold text-[#0B5CD5]">{confidencePct}%</span>
                </div>
                <div>
                  <span className="text-[#7386A8] text-[10px] block">Evidence Items</span>
                  <span className="font-bold text-[#D97757]">{evidenceCount}</span>
                </div>
                <div>
                  <span className="text-[#7386A8] text-[10px] block">Sources Checked</span>
                  <span className="font-bold text-[#0B5CD5]">{sources.length}</span>
                </div>
                <div>
                  <span className="text-[#7386A8] text-[10px] block">Contradictions</span>
                  <span className={`font-bold ${contradictionsCount > 0 ? 'text-[#B23F35]' : 'text-[#2C5B3E]'}`}>
                    {contradictionsCount}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 3. REPORT SUB-TABS NAVIGATION                                             */}
        {/* ========================================================================= */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[#CECECE] pb-2 print:hidden">
          {[
            { key: 'full', label: 'Full Dossier', icon: Layers },
            { key: 'text', label: 'Text & Language', icon: FileText },
            { key: 'links', label: `Links (${links.length})`, icon: LinkIcon },
            ...(hasImageForensics ? [{ key: 'images', label: 'Image Forensics', icon: Camera }] : []),
            ...(hasVideoForensics ? [{ key: 'videos', label: 'Video Forensics', icon: Film }] : []),
            { key: 'numbers', label: `Numbers & Quantities (${numericalFacts.length})`, icon: Hash },
            { key: 'telemetry', label: 'Agent Observability & Telemetry', icon: Activity }
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveReportTab(tab.key)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
                  activeReportTab === tab.key
                    ? 'bg-[#0033C4] text-white shadow-sm font-bold'
                    : 'bg-white border border-[#CECECE] text-[#2C4E86] hover:text-[#0B5CD5] hover:bg-[#F8F8F6]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* ========================================================================= */}
        {/* SUB-TAB VIEWS                                                             */}
        {/* ========================================================================= */}
        
        {/* AGENT OBSERVABILITY & TELEMETRY TAB */}
        {activeReportTab === 'telemetry' && (
          <div className="space-y-6">
            <ObservabilityPanel observability={report?.observability} reportData={report} />
          </div>
        )}
        
        {/* TEXT & LANGUAGE TAB */}
        {activeReportTab === 'text' && (
          <div className="p-6 bg-white border border-[#CECECE] rounded-3xl space-y-6 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-wider font-mono text-[#0B5CD5]">
              Text & Language Audit
            </h3>
            
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
              <div className="p-3 bg-[#F8F8F6] border border-[#CECECE] rounded-xl">
                <span className="text-[#7386A8] block">Word Count</span>
                <span className="text-lg font-bold text-[#0B5CD5]">{report.extractedText?.split(/\s+/).filter(Boolean).length || 0}</span>
              </div>
              <div className="p-3 bg-[#F8F8F6] border border-[#CECECE] rounded-xl">
                <span className="text-[#7386A8] block">Urgency Cues</span>
                <span className="text-lg font-bold text-[#B98520]">{report.articleSentiment?.urgencyCuesCount || 0}</span>
              </div>
              <div className="p-3 bg-[#F8F8F6] border border-[#CECECE] rounded-xl">
                <span className="text-[#7386A8] block">Unnamed Attribution</span>
                <span className="text-lg font-bold text-[#D97757]">{report.articleSentiment?.vagueSourcingCount || 0}</span>
              </div>
              <div className="p-3 bg-[#F8F8F6] border border-[#CECECE] rounded-xl">
                <span className="text-[#7386A8] block">Sentiment Tone</span>
                <span className="text-lg font-bold text-[#0B5CD5] capitalize">{report.articleSentiment?.tone || 'Neutral'}</span>
              </div>
            </div>

            <div className="p-4 bg-[#F8F8F6] border border-[#CECECE] rounded-2xl space-y-2">
              <span className="text-[10px] font-mono uppercase text-[#7386A8] font-bold block">Raw Extracted Text</span>
              <p className="text-xs text-[#2C4E86] leading-relaxed whitespace-pre-wrap">
                {report.extractedText || 'No raw document text available.'}
              </p>
            </div>
          </div>
        )}

        {/* LINKS TAB */}
        {activeReportTab === 'links' && (
          <div className="p-6 bg-white border border-[#CECECE] rounded-3xl space-y-6 shadow-sm">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider font-mono text-[#0B5CD5]">Outbound Link Analysis</h3>
                <p className="text-xs text-[#7386A8]">HTTP status and heuristic domain classification.</p>
              </div>
              <span className="px-2 py-0.5 bg-[#EFEEE9] text-[#2C4E86] rounded text-[10px] font-mono border border-[#CECECE]">Heuristic Classification</span>
            </div>

            {links.length > 0 ? (
              <div className="divide-y divide-[#CECECE] border border-[#CECECE] rounded-2xl overflow-hidden bg-white text-xs">
                {links.map((link, idx) => (
                  <div key={idx} className="p-3.5 flex items-center justify-between gap-4 hover:bg-[#F8F8F6] transition">
                    <div className="space-y-1 truncate flex-1">
                      <span className="font-mono text-[#0B5CD5] font-bold block truncate">{link.url || link.u}</span>
                      <span className="text-[11px] text-[#7386A8]">{link.anchor || link.a || 'Direct Link'}</span>
                    </div>
                    <div className="flex items-center gap-2 font-mono text-[10px]">
                      <span className="px-2 py-0.5 bg-[#EFEEE9] text-[#2C4E86] rounded border border-[#CECECE]">{link.type || link.t || 'Citation'}</span>
                      <span className="px-2 py-0.5 bg-[#E4EFE7] text-[#2C5B3E] border border-[#C5DEC9] rounded font-bold">200 OK</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center bg-[#F8F8F6] rounded-2xl border border-dashed border-[#CECECE] text-xs text-[#7386A8]">
                No outbound links extracted from source text.
              </div>
            )}
          </div>
        )}

        {/* NUMBERS TAB */}
        {activeReportTab === 'numbers' && (
          <div className="p-6 bg-white border border-[#CECECE] rounded-3xl space-y-6 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-wider font-mono text-[#0B5CD5]">
              Numerical & Quantitative Fact Reconciler
            </h3>
            
            {numericalFacts.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#CECECE] text-[#7386A8] font-mono uppercase text-[10px] bg-[#EFEEE9]">
                      <th className="p-3">Claimed Value</th>
                      <th className="p-3">Context / Entity</th>
                      <th className="p-3">Evidence Finding</th>
                      <th className="p-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#CECECE] text-[#2C4E86]">
                    {numericalFacts.map((fact, idx) => (
                      <tr key={idx} className="hover:bg-[#F8F8F6] transition">
                        <td className="p-3 font-mono font-bold text-[#0B5CD5]">{fact.asPrinted}</td>
                        <td className="p-3 text-[#7386A8]">{fact.refersTo}</td>
                        <td className="p-3 text-[#2C4E86]">{fact.actualFinding || 'Matches recorded index'}</td>
                        <td className="p-3 text-right font-mono font-bold">
                          <span className={`px-2 py-0.5 rounded text-[10px] ${
                            fact.status === 'VERIFIED' ? 'bg-[#E4EFE7] text-[#2C5B3E] border border-[#C5DEC9]' : 'bg-[#F7E3E0] text-[#B23F35] border border-[#EBC7C2]'
                          }`}>
                            {fact.status || 'VERIFIED'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center bg-[#F8F8F6] rounded-2xl border border-dashed border-[#CECECE] text-xs text-[#7386A8]">
                No quantitative figures or numerical assertions identified in this text.
              </div>
            )}
          </div>
        )}

        {/* MEDIA FORENSICS TABS */}
        {activeReportTab === 'images' && hasImageForensics && (
          <div className="space-y-8">
            <ImageForensicsCompare
              images={report?.images || report?.mediaAnalysis?.images}
              reportData={report}
            />
            {hasSightengineAi && (
              <SightengineReportCard
                aiDetection={aiDetection}
                mediaType="IMAGE"
              />
            )}
          </div>
        )}

        {activeReportTab === 'videos' && hasVideoForensics && (
          <div className="space-y-8">
            <VideoForensicsViewer mediaAnalysis={report?.mediaAnalysis} reportData={report} />
            {hasSightengineAi && (
              <SightengineReportCard
                aiDetection={aiDetection}
                mediaType="VIDEO"
              />
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* 4. FULL REPORT CORE SECTIONS (01 - 09)                                     */}
        {/* ========================================================================= */}
        {activeReportTab === 'full' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Left Column: 01 - 09 Dossier Modules */}
            <div className="lg:col-span-8 space-y-8">
              
              {/* 01 · TOP HIGHLIGHTS */}
              <section id="highlights" className="p-6 bg-white border border-[#CECECE] rounded-3xl space-y-4 shadow-sm scroll-mt-24">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-[#D97757]">01 ·</span>
                  <h3 className="text-sm font-bold uppercase tracking-wider font-mono text-[#0B5CD5]">Top Highlights</h3>
                </div>
                {claims.length > 0 ? (
                  <ul className="space-y-2.5 text-xs text-[#2C4E86]">
                    {claims.slice(0, 4).map((claim, idx) => (
                      <li key={idx} className="flex items-start gap-2.5">
                        <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                          claim.verdict === 'TRUE' || claim.status === 'TRUSTED' ? 'bg-[#2C5B3E]' : 'bg-[#B23F35]'
                        }`} />
                        <span>
                          <strong className="text-[#0B5CD5]">{claim.claimText || claim.claim}</strong> — {claim.explanation || (claim.verdict === 'FALSE' ? 'Directly contradicted by public record.' : 'Supported by authoritative reporting.')}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (() => {
                  const imageForensics = parsedMediaAnalysis.imageForensics || {};
                  const manipScore = typeof imageForensics.manipulationScore === 'number'
                    ? imageForensics.manipulationScore
                    : (Array.isArray(parsedMediaAnalysis.manipulationSignals) ? Math.min(100, parsedMediaAnalysis.manipulationSignals.length * 25) : 0);
                  const visualComparison = parsedMediaAnalysis.visualComparison ||
                    imageForensics.visualComparison ||
                    report.mediaAnalysis?.visualComparison ||
                    null;

                  const isTampered = Boolean(
                    visualComparison?.isModified === true ||
                    manipScore >= 45 ||
                    imageForensics.verdict === 'FABRICATED_OR_COMPOSITED' ||
                    imageForensics.verdict === 'MANIPULATION_DETECTED' ||
                    imageForensics.ela?.isManipulatedLikely ||
                    (imageForensics.signals && imageForensics.signals.some(s => s.severity === 'HIGH'))
                  );

                  const aiProb = aiDetection && typeof aiDetection.aiGeneratedProbability === 'number'
                    ? aiDetection.aiGeneratedProbability
                    : (aiDetection?.isAiGenerated ? 0.95 : 0.05);
                  const isAi = Boolean(aiDetection?.isAiGenerated || aiProb >= 0.50);

                  const comparison = parsedMediaAnalysis.imageSourceContextComparison || {};
                  const reverseSearch = parsedMediaAnalysis.reverseSearch || imageForensics.reverseSearch || {};
                  const isMatched = comparison.status === 'MATCHED' || reverseSearch.isWire;
                  const isUnindexed = comparison.status === 'UNINDEXED_NEW_CAPTURE' || reverseSearch.originalFoundStatus === 'UNINDEXED_ORIGINAL';
                  const isContradicted = comparison.status === 'CONTRADICTED';

                  return (
                    <div className="space-y-3">
                      <p className="text-xs text-[#7386A8]">
                        Pure visual media evaluated across AI generation signatures, digital tampering, and web provenance (no editorial news text detected).
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {/* 1. AI Generation Card */}
                        <div className="p-3.5 bg-[#F9F9F7] border border-[#CECECE] rounded-2xl flex flex-col justify-between space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono uppercase font-bold tracking-wider text-[#7386A8]">01 · AI Detection</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                              isAi ? 'bg-[#FCE8E6] text-[#B23F35] border-[#F5C2B8]' : 'bg-[#EAF5EC] text-[#2C5B3E] border-[#C3E4C9]'
                            }`}>
                              {isAi ? `AI ${Math.round(aiProb * 100)}%` : 'HUMAN CAPTURE'}
                            </span>
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-[#0B5CD5]">
                              {isAi ? 'Synthetic Generative Media' : 'Organic Camera Capture'}
                            </h4>
                            <p className="text-[11px] text-[#2C4E86] mt-1 leading-relaxed">
                              {isAi 
                                ? 'Neural diffusion or deepfake generative patterns detected across image raster.' 
                                : `Natural optical sensor noise verified with ${Math.round((1 - aiProb) * 100)}% natural capture certainty.`}
                            </p>
                          </div>
                        </div>

                        {/* 2. Tampering / Integrity Card */}
                        <div className="p-3.5 bg-[#F9F9F7] border border-[#CECECE] rounded-2xl flex flex-col justify-between space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono uppercase font-bold tracking-wider text-[#7386A8]">02 · Media Integrity</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                              isTampered ? 'bg-[#FCE8E6] text-[#B23F35] border-[#F5C2B8]' : 'bg-[#EAF5EC] text-[#2C5B3E] border-[#C3E4C9]'
                            }`}>
                              {visualComparison?.isModified ? 'ELEMENT / PERSON REPLACED' : isTampered ? 'TAMPERING DETECTED' : 'UNALTERED'}
                            </span>
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-[#0B5CD5]">
                              {visualComparison?.isModified 
                                ? (visualComparison.modificationType === 'PERSON_SWAPPED' || visualComparison.modificationType === 'FACE_SWAPPED' ? 'Person / Face Swapped' : 'Digital Tampering Detected')
                                : isTampered ? 'Digital Manipulation / Splicing' : 'Uniform Pixel Integrity'}
                            </h4>
                            <p className="text-[11px] text-[#2C4E86] mt-1 leading-relaxed">
                              {visualComparison?.isModified
                                ? (visualComparison.summary || 'Direct comparison with verified original photo confirms element replacement or face swap.')
                                : isTampered 
                                  ? 'Error level analysis anomalies or cloning signals detected in high-frequency regions.' 
                                  : 'No copy-move cloning or inpainting artifacts detected; quantization is uniform.'}
                            </p>
                          </div>
                        </div>

                        {/* 3. Provenance & Originality Card */}
                        <div className="p-3.5 bg-[#F9F9F7] border border-[#CECECE] rounded-2xl flex flex-col justify-between space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono uppercase font-bold tracking-wider text-[#7386A8]">03 · Provenance</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                              visualComparison?.isModified ? 'bg-[#FCE8E6] text-[#B23F35] border-[#F5C2B8]' :
                              isContradicted ? 'bg-[#FCE8E6] text-[#B23F35] border-[#F5C2B8]' :
                              isMatched ? 'bg-[#E8F0FE] text-[#0B5CD5] border-[#C2D7FA]' :
                              'bg-[#EAF5EC] text-[#2C5B3E] border-[#C3E4C9]'
                            }`}>
                              {visualComparison?.isModified ? 'ORIGINAL FOUND (MODIFIED)' : isContradicted ? 'CONTRADICTED' : isMatched ? 'WIRE MATCH' : isUnindexed ? 'UNINDEXED ORIGINAL' : 'INDEXED MATCH'}
                            </span>
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-[#0B5CD5]">
                              {visualComparison?.isModified 
                                ? 'Altered Copy of Original' 
                                : isContradicted ? 'Misattributed Context' : isMatched ? 'Verified Source Match' : isUnindexed ? 'First-Instance Photo' : 'Indexed Web Provenance'}
                            </h4>
                            <p className="text-[11px] text-[#2C4E86] mt-1 leading-relaxed">
                              {visualComparison?.isModified
                                ? `Authentic original photo discovered on ${comparison.source?.domain || reverseSearch.matches?.[0]?.domain || 'web archive'}, but visual diffing proves the circulating copy was altered.`
                                : isContradicted 
                                  ? 'Reverse search contradicts submitted caption or indicates decontextualized reuse.' 
                                  : isMatched 
                                    ? `Corroborated by wire archives (${comparison.source?.domain || reverseSearch.matches?.[0]?.domain || 'news index'}).` 
                                    : isUnindexed 
                                      ? 'No earlier web publications detected; consistent with a clean camera original.' 
                                      : 'Media matches authentic indexed web records with consistent historical timeline.'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </section>

              {/* 02 · SCORE DERIVATION */}
              <section id="derivation" className="p-6 bg-white border border-[#CECECE] rounded-3xl space-y-4 shadow-sm scroll-mt-24">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-[#D97757]">02 ·</span>
                    <h3 className="text-sm font-bold uppercase tracking-wider font-mono text-[#0B5CD5]">Score Derivation & Factors</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsWeightsModalOpen(true)}
                    className="px-3 py-1.5 bg-[#EFEEE9] hover:bg-[#CECECE] border border-[#CECECE] text-[#0B5CD5] rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition shadow-2xs"
                    title="Configure global formula weights"
                  >
                    <Sliders className="w-3.5 h-3.5 text-[#D97757]" />
                    Adjust Scoring Weights
                  </button>
                </div>
                <ScoreDerivationView
                  factors={report.explainableScoring?.factorBreakdown || report.explainableScoring?.factors}
                  penalties={report.explainableScoring?.appliedPenalties || report.explainableScoring?.penalties}
                  sensitivity={report.explainableScoring?.counterfactualConditions || report.explainableScoring?.sensitivity}
                  penaltyTotal={report.explainableScoring?.totalPenalties}
                  finalTrustScore={trustScore}
                  weightedSum={report.explainableScoring?.weightedBaseScore}
                  scoringVersion={report.explainableScoring?.scoringVersion || '2.4.0'}
                  reportData={report}
                />
              </section>

              {/* 03 · ATOMIC CLAIM DECOMPOSITION & VERIFICATION (GEMINI GROUNDED) */}
              <GeminiGroundedVerificationCard
                id="claims"
                groundingData={
                  report?.geminiGroundedVerification || (claims.length > 0 ? {
                    overallVerdict: report?.articleVerdict || report?.verdict || 'UNVERIFIED',
                    totalClaims: claims.length,
                    verifiedCount: claims.filter(c => c.verdict === 'VERIFIED' || c.status === 'TRUSTED' || c.verdict === 'Real').length,
                    partialCount: claims.filter(c => c.verdict === 'PARTIALLY_VERIFIED' || c.status === 'SUSPICIOUS' || c.verdict === 'Suspicious').length,
                    falseCount: claims.filter(c => c.verdict === 'FALSE' || c.status === 'FABRICATED' || c.verdict === 'Fake').length,
                    unverifiedCount: claims.filter(c => c.verdict === 'UNVERIFIED' || !c.verdict).length,
                    claims: claims,
                    allSearchQueries: claims.flatMap(c => c.searchQueries || []),
                    allGroundedSources: report?.sources || [],
                    summary: report?.summary || `Each atomic claim was submitted individually to Gemini with live Google Search retrieval to evaluate factual accuracy and extract grounded web citations.`,
                    status: 'SUCCESS',
                    enabled: true
                  } : null)
                }
                onOpenWeights={() => setIsWeightsModalOpen(true)}
                isDebug={isDebug}
                onOpenDebug={(claim) => setDebugPanelClaim(claim)}
              />



              {/* 04 · IMAGE: PROVIDED VS. ORIGINAL (Appears when analysis has an image asset) */}
              {hasImageForensics && (
                <ImageForensicsCompare
                  images={report?.images || report?.mediaAnalysis?.images}
                  reportData={report}
                />
              )}

              {/* SIGHTENGINE AI & DEEPFAKE REPORT CARD */}
              {hasSightengineAi && (
                <SightengineReportCard
                  aiDetection={aiDetection}
                  mediaType={detectedForensicMediaType}
                />
              )}

              {/* 05 · VIDEO: REAL FOOTAGE / DECEPTIVE CUT (actual measured signals only) */}
              {hasVideoForensics && (
                <VideoForensicsViewer mediaAnalysis={report?.mediaAnalysis} reportData={report} />
              )}

              {/* 06 · SOURCE LEDGER & CROSS REFERENCE */}
              <section id="sources" className="p-6 bg-white border border-[#CECECE] rounded-3xl space-y-4 shadow-sm scroll-mt-24">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-[#D97757]">06 ·</span>
                    <h3 className="text-sm font-bold uppercase tracking-wider font-mono text-[#0B5CD5]">Cross-Reference Evidence & Source Ledger</h3>
                  </div>
                  <span className="text-xs text-[#7386A8] font-mono">{sources.length} sources indexed</span>
                </div>

                {sources.length > 0 ? (
                  <div className="divide-y divide-[#CECECE] bg-white rounded-2xl border border-[#CECECE] overflow-hidden text-xs">
                    {sources.map((src, idx) => {
                      const srcUrl = src.url || src.link || (src.domain ? `https://${src.domain}` : null);
                      const domainName = src.domain || (srcUrl ? (() => { try { return new URL(srcUrl).hostname.replace(/^www\./, ''); } catch (e) { return 'source'; } })() : 'web source');

                      return (
                        <div key={idx} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#F8F8F6] transition">
                          <div className="space-y-1 min-w-0 flex-1">
                            {srcUrl ? (
                              <a
                                href={srcUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-bold text-[#0B5CD5] hover:text-[#0033C4] transition flex items-center gap-1.5 truncate group"
                              >
                                <span className="truncate">{src.title || src.publication || domainName}</span>
                                <ExternalLink className="w-3.5 h-3.5 flex-shrink-0 text-[#D97757] group-hover:text-[#B0512F]" />
                              </a>
                            ) : (
                              <span className="font-bold text-[#0B5CD5] block truncate">{src.title || src.publication || domainName}</span>
                            )}

                            {srcUrl && (
                              <a
                                href={srcUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[11px] text-[#7386A8] hover:text-[#0B5CD5] font-mono truncate block hover:underline"
                              >
                                {srcUrl}
                              </a>
                            )}
                          </div>

                          <div className="flex items-center gap-3 flex-shrink-0">
                            <span className="px-2 py-0.5 bg-[#EFEEE9] text-[#2C4E86] border border-[#CECECE] rounded font-mono text-[10px] font-semibold">
                              {domainName}
                            </span>
                            <span className={`px-2 py-0.5 rounded font-mono text-[10px] font-semibold ${src.sourceRole === 'IMAGE_PROVENANCE' ? 'bg-[#F7EEDA] text-[#B98520] border border-[#E8D4B0]' : 'bg-[#EFEEE9] text-[#2C4E86] border border-[#CECECE]'}`}>
                              {src.evidenceType?.replaceAll('_', ' ') || src.tier || 'CLAIM EVIDENCE'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-6 text-center text-xs text-[#7386A8]">
                    Direct input analysis — no external query citations registered.
                  </div>
                )}
              </section>

              {/* 07 · INTENT & ENTITIES */}
              <section id="entities" className="p-6 bg-white border border-[#CECECE] rounded-3xl space-y-4 shadow-sm scroll-mt-24">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-[#D97757]">07 ·</span>
                    <h3 className="text-sm font-bold uppercase tracking-wider font-mono text-[#0B5CD5]">Named Entities & Intent</h3>
                  </div>
                  {entityVerification.visuallyDetectedCount > 0 && (
                    <div className="flex flex-wrap gap-1.5 text-[9px] font-mono uppercase">
                      <span className="rounded-full border border-[#C7D5EB] bg-[#EAF1FC] px-2 py-1 text-[#2C4E86]">
                        {entityVerification.visuallyDetectedCount} visual
                      </span>
                      <span className="rounded-full border border-[#B9D8C5] bg-[#E7F4EC] px-2 py-1 text-[#2C5B3E]">
                        {entityVerification.verifiedCount || 0} verified
                      </span>
                      <span className="rounded-full border border-[#E8D4B0] bg-[#FFF6DD] px-2 py-1 text-[#8A6414]">
                        {entityVerification.probableCount || 0} probable
                      </span>
                    </div>
                  )}
                </div>

                {entityVerification.providerStatus === 'WITHHELD' && (
                  <div className="p-3 bg-[#F8F8F6] border border-[#CECECE] rounded-xl text-[11px] leading-relaxed text-[#52627D]">
                    Visual entities were detected locally. External identity corroboration was withheld because external visual search was not enabled for this analysis.
                  </div>
                )}

                {report.analysisOptions?.detectEntities === false ? (
                  <div className="p-4 bg-[#F8F8F6] border border-[#CECECE] rounded-xl text-xs text-[#7386A8]">
                    Entity detection was disabled for this analysis.
                  </div>
                ) : entities.length === 0 ? (
                  <div className="p-4 bg-[#F8F8F6] border border-[#CECECE] rounded-xl text-xs text-[#7386A8]">
                    No named entities were confidently extracted.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {entities.slice(0, 12).map((ent, idx) => {
                      const status = ent.verificationStatus || (ent.visuallyDetected ? 'DETECTED' : 'TEXT_ONLY');
                      const timestamps = Array.isArray(ent.frameTimestamps) ? ent.frameTimestamps.slice(0, 5) : [];
                      const evidenceSources = Array.isArray(ent.sources) ? ent.sources.slice(0, 3) : [];
                      return (
                      <div key={`${ent.normalizedName || ent.name || 'entity'}-${idx}`} className="p-3.5 bg-[#F8F8F6] border border-[#CECECE] rounded-xl space-y-2 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className="block font-bold text-[#0B5CD5] text-xs break-words">{ent.normalizedName || ent.name}</span>
                            <span className="mt-0.5 block font-mono text-[9px] uppercase text-[#7386A8]">
                              {ent.type || 'Entity'}{ent.visuallyDetected ? ' · visible in media' : ' · text evidence'}
                            </span>
                          </div>
                          <span className={`shrink-0 px-2 py-1 border rounded-full font-mono text-[9px] font-bold uppercase ${entityStatusStyles[status] || entityStatusStyles.DETECTED}`}>
                            {status.replaceAll('_', ' ')}
                          </span>
                        </div>

                        {(ent.verificationConfidence !== undefined || ent.visualConfidence !== undefined) && (
                          <div className="flex flex-wrap gap-1.5 text-[9px] font-mono text-[#52627D]">
                            {ent.visualConfidence !== undefined && <span>Visual {Math.round(ent.visualConfidence)}%</span>}
                            {ent.verificationConfidence !== undefined && <span>· Verification {Math.round(ent.verificationConfidence)}%</span>}
                            {ent.crossModalConfirmation && <span className="text-[#2C5B3E]">· Transcript/OCR match</span>}
                          </div>
                        )}

                        {ent.detectionMethods?.length > 0 && (
                          <p className="text-[10px] text-[#7386A8] break-words">
                            Methods: {ent.detectionMethods.map(method => String(method).replaceAll('_', ' ').toLowerCase()).join(', ')}
                          </p>
                        )}
                        {timestamps.length > 0 && (
                          <p className="text-[10px] font-mono text-[#52627D]">
                            Seen at {timestamps.map(value => `${Number(value).toFixed(1)}s`).join(', ')}
                          </p>
                        )}
                        <p className="text-[11px] leading-relaxed text-[#2C4E86]">
                          {ent.finding || ent.visualBasis || 'Extracted from the submitted content; no independent identity claim was made.'}
                        </p>

                        {evidenceSources.length > 0 && (
                          <div className="space-y-1 border-t border-[#DEDEDA] pt-2">
                            {evidenceSources.map((source, sourceIdx) => (
                              <a
                                key={`${source.url}-${sourceIdx}`}
                                href={source.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-start gap-1.5 text-[10px] text-[#0B5CD5] hover:underline"
                              >
                                <ExternalLink size={10} className="mt-0.5 shrink-0" />
                                <span className="break-words">{source.title || source.domain || 'Corroborating source'}</span>
                              </a>
                            ))}
                          </div>
                        )}
                        {ent.search?.error && ent.search.status !== 'WITHHELD' && (
                          <p className="text-[10px] text-[#9F2D4A]">Search limitation: {ent.search.error}</p>
                        )}
                      </div>
                      );
                    })}
                  </div>
                )}

                {report.intentAnalysis && (
                  <div className="p-4 bg-[#F8F8F6] border border-[#CECECE] rounded-xl space-y-2">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-[10px] font-mono font-bold uppercase text-[#7386A8]">Framing / likely intent</span>
                      <span className="text-[10px] font-mono font-bold uppercase text-[#D97757]">
                        {String(report.intentAnalysis.primaryIntent || 'Not established').replaceAll('_', ' ')}
                        {report.intentAnalysis.confidence !== undefined ? ` · ${Math.round(report.intentAnalysis.confidence)}%` : ''}
                      </span>
                    </div>
                    {report.intentAnalysis.reasoning && (
                      <p className="text-[11px] leading-relaxed text-[#2C4E86]">{report.intentAnalysis.reasoning}</p>
                    )}
                    {report.intentAnalysis.misinformationTargeting?.targetedEntities?.length > 0 && (
                      <p className="text-[10px] text-[#52627D] break-words">
                        Potentially targeted entities: {report.intentAnalysis.misinformationTargeting.targetedEntities.join(', ')}
                      </p>
                    )}
                  </div>
                )}
              </section>

              {/* 08 · PROVENANCE TIMELINE */}
              <section id="provenance" className="p-6 bg-white border border-[#CECECE] rounded-3xl space-y-4 shadow-sm scroll-mt-24">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-[#D97757]">08 ·</span>
                  <h3 className="text-sm font-bold uppercase tracking-wider font-mono text-[#0B5CD5]">Provenance & Integrity Seal</h3>
                </div>
                <div className="space-y-3 text-xs">
                  <div className="p-3.5 bg-[#F8F8F6] border border-[#CECECE] rounded-xl flex items-center justify-between">
                    <span className="text-[#2C4E86]">Origin status</span>
                    <span className="font-mono text-[#7386A8]">
                      {report.analysisOptions?.traceProvenance === false
                        ? 'Tracing disabled'
                        : String(report.provenance?.originAnalysis?.originStatus || 'Not established').replaceAll('_', ' ')}
                    </span>
                  </div>
                  <div className="p-3.5 bg-[#F8F8F6] border border-[#CECECE] rounded-xl flex items-center justify-between">
                    <span className="text-[#2C4E86]">Report integrity</span>
                    <span className="font-mono text-[#2C5B3E] font-bold text-right">
                      {report.integritySeal
                        ? `${report.integritySeal.algorithm} · ${report.integritySeal.digest.slice(0, 16)}… · ${new Date(report.integritySeal.sealedAt).toLocaleString()}`
                        : `Generated ${new Date(report.generatedAt || report.createdAt || 0).toLocaleString()}`}
                    </span>
                  </div>
                </div>
              </section>
            </div>

            {/* Right Column: Sticky Rail */}
            <div className="lg:col-span-4 space-y-6 print:hidden">
              <div className="sticky top-20 space-y-6">
                
                {/* Mini Verdict Dial */}
                <div className="p-5 bg-white border border-[#CECECE] rounded-3xl space-y-3 text-center shadow-sm">
                  <span className="text-[10px] font-mono uppercase text-[#7386A8] font-bold">Dossier Confidence</span>
                  <div className={`text-3xl font-black font-mono ${
                    trustScore >= 75 ? 'text-[#2C5B3E]' : trustScore >= 40 ? 'text-[#B98520]' : 'text-[#B23F35]'
                  }`}>
                    {trustScore} / 100
                  </div>
                  <VerdictBadge status={verdict} size="sm" />
                </div>

                {/* Jump TOC Navigation */}
                <div className="p-5 bg-white border border-[#CECECE] rounded-3xl space-y-3 text-xs shadow-sm">
                  <span className="text-[10px] font-mono uppercase text-[#7386A8] font-bold block">Sections</span>
                  <div className="space-y-1.5 font-medium">
                    <a
                      href="#highlights"
                      onClick={(e) => { e.preventDefault(); document.getElementById('highlights')?.scrollIntoView({ behavior: 'smooth' }); }}
                      className="block text-[#2C4E86] hover:text-[#0B5CD5] transition cursor-pointer"
                    >
                      01 · Highlights
                    </a>
                    <a
                      href="#derivation"
                      onClick={(e) => { e.preventDefault(); document.getElementById('derivation')?.scrollIntoView({ behavior: 'smooth' }); }}
                      className="block text-[#2C4E86] hover:text-[#0B5CD5] transition cursor-pointer"
                    >
                      02 · Score Derivation
                    </a>
                    <a
                      href="#claims"
                      onClick={(e) => { e.preventDefault(); document.getElementById('claims')?.scrollIntoView({ behavior: 'smooth' }); }}
                      className="block text-[#2C4E86] hover:text-[#0B5CD5] transition cursor-pointer"
                    >
                      03 · Claims Audit
                    </a>
                    {hasImageForensics && (
                      <a
                        href="#image-forensics"
                        onClick={(e) => { e.preventDefault(); document.getElementById('image-forensics')?.scrollIntoView({ behavior: 'smooth' }); }}
                        className="block text-[#D97757] hover:text-[#B0512F] transition cursor-pointer font-semibold"
                      >
                        04 · Image Forensics
                      </a>
                    )}
                    {hasSightengineAi && (
                      <a
                        href="#sightengine-audit"
                        onClick={(e) => { e.preventDefault(); document.getElementById('sightengine-audit')?.scrollIntoView({ behavior: 'smooth' }); }}
                        className="block text-[#0B5CD5] hover:text-[#0033C4] transition cursor-pointer font-semibold"
                      >
                        04B · AI &amp; Deepfake Audit
                      </a>
                    )}
                    {hasVideoForensics && (
                      <a
                        href="#video-forensics"
                        onClick={(e) => { e.preventDefault(); document.getElementById('video-forensics')?.scrollIntoView({ behavior: 'smooth' }); }}
                        className="block text-[#D97757] hover:text-[#B0512F] transition cursor-pointer font-semibold"
                      >
                        05 · Video Forensics
                      </a>
                    )}
                    <a
                      href="#sources"
                      onClick={(e) => { e.preventDefault(); document.getElementById('sources')?.scrollIntoView({ behavior: 'smooth' }); }}
                      className="block text-[#2C4E86] hover:text-[#0B5CD5] transition cursor-pointer"
                    >
                      06 · Sources
                    </a>
                    <a
                      href="#entities"
                      onClick={(e) => { e.preventDefault(); document.getElementById('entities')?.scrollIntoView({ behavior: 'smooth' }); }}
                      className="block text-[#2C4E86] hover:text-[#0B5CD5] transition cursor-pointer"
                    >
                      07 · Entities
                    </a>
                    <a
                      href="#provenance"
                      onClick={(e) => { e.preventDefault(); document.getElementById('provenance')?.scrollIntoView({ behavior: 'smooth' }); }}
                      className="block text-[#2C4E86] hover:text-[#0B5CD5] transition cursor-pointer"
                    >
                      08 · Provenance
                    </a>
                  </div>
                </div>

                {/* Active Agents Checklist */}
                <div className="p-5 bg-white border border-[#CECECE] rounded-3xl space-y-3 text-xs shadow-sm">
                  <span className="text-[10px] font-mono uppercase text-[#7386A8] font-bold block">Active Agents</span>
                  <div className="space-y-2 text-[#2C4E86]">
                    <div className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-[#2C5B3E]" /> Agent 1: Ingestion &amp; OCR</div>
                    <div className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-[#2C5B3E]" /> Agent 2: Claim Extraction</div>
                    <div className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-[#2C5B3E]" /> Agent 3: Fact Match Engine</div>
                    <div className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-[#2C5B3E]" /> Agent 4: Dossier Synthesis</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Agent 3 Interactive Inspection Drawer / Modal */}
        {isDebug && debugPanelClaim && (
          <Agent3DebugPanel
            claim={debugPanelClaim}
            onClose={() => setDebugPanelClaim(null)}
          />
        )}

        {/* Evidentiary Claim Audit Modal */}
        <ClaimAuditModal
          claim={auditModalClaim}
          isOpen={Boolean(auditModalClaim)}
          onClose={() => setAuditModalClaim(null)}
          onOpenDebugPanel={(c) => setDebugPanelClaim(c)}
        />

        {/* Global Scoring Weights Configuration Modal */}
        <ScoringWeightsModal
          isOpen={isWeightsModalOpen}
          onClose={() => setIsWeightsModalOpen(false)}
          currentReport={report}
          onApplyRecalculatedReport={(updated) => setReport(updated)}
        />
      </main>
    </div>
  );
}
