import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import ObservabilityPanel from '../components/ObservabilityPanel';
import ClaimAuditModal from '../components/ClaimAuditModal';
import ScoreDerivationView from '../components/ScoreDerivationView';
import ImageForensicsCompare from '../components/ImageForensicsCompare';
import VideoForensicsViewer from '../components/VideoForensicsViewer';
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
  Check,
  Clock,
  Layers,
  Sparkles,
  ChevronDown
} from 'lucide-react';

const STATIC_SAMPLE_LINKS = [
  { u: 'pay.depositsafe-helpline.co/₹500-window', a: 'Deposit before 30 September', t: 'Affiliate', st: '200', n: 'Payments funnel · registered 3 days ago', v: 'fake' },
  { u: 'pay.depositsafe-helpline.co/upi-guide', a: 'How to deposit via UPI', t: 'Affiliate', st: '200', n: 'Same funnel, second entry point', v: 'fake' },
  { u: 'bharatwire-live.co/tag/currency-alert', a: 'More currency alerts', t: 'Internal', st: '200', n: '11 items, 9 previously debunked', v: 'susp' },
  { u: 'rbi-circulars-archive.net/dcm-1284', a: 'Read the full circular', t: 'Citation', st: '404', n: 'Domain resolves to a parked page — not an official archive', v: 'fake' },
  { u: 't.me/policyleaks_in/4128', a: 'Original forward', t: 'Origin', st: '200', n: 'Earliest instance · 04:12 IST', v: 'unv' },
  { u: 'cdn.trk-pixel.io/e?id=bw88', a: '—', t: 'Tracker', st: '204', n: 'Third-party pixel, no consent notice', v: 'unv' },
  { u: 'standardledger.example/monetary-policy-review-aug', a: 'Briefing coverage', t: 'Citation', st: '200', n: 'Contradicts the article headline', v: 'real' }
];

const STATIC_SAMPLE_NUMBERS = [
  { p: '₹500', m: 'Denomination said to be withdrawn', a: 'Still legal tender · no change proposed', v: 'fake' },
  { p: '1 October 2026', m: 'Claimed date legal tender ends', a: 'No such date exists in any notification', v: 'fake' },
  { p: '30 September', m: 'Claimed deposit deadline', a: 'No deadline — nothing to deposit against', v: 'fake' },
  { p: 'DCM/1284/2026', m: 'Circular reference number', a: 'Does not resolve in public circular index', v: 'fake' },
  { p: '2016', m: 'Year of template reused by document', a: 'Confirmed — 91% overlap with 2016 release', v: 'real' },
  { p: '0:18', m: 'Point video is cut at', a: 'Confirmed — splice detected at 0:18 of 41s', v: 'real' },
  { p: '99.2%', m: 'Audio fingerprint match to full briefing', a: 'Confirmed by acoustic fingerprint match', v: 'real' },
  { p: '38', m: 'Reposts across web', a: 'Confirmed — 38 across 6 domains', v: 'real' },
  { p: '11', m: 'Outbound affiliate links on page', a: 'Confirmed — all point to payments funnel', v: 'real' }
];

export default function ResultsPage() {
  const { id } = useParams();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [auditModalClaim, setAuditModalClaim] = useState(null);
  const [activeReportTab, setActiveReportTab] = useState('full'); // 'full' | 'text' | 'links' | 'images' | 'videos' | 'numbers'
  const [openClaimIdx, setOpenClaimIdx] = useState(0);
  const [toastMsg, setToastMsg] = useState(null);

  // SSE progress state
  const [progressState, setProgressState] = useState({
    status: 'PROCESSING',
    progress: 10,
    step: 'Connecting to 4-Agent Verification Engine...'
  });

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  useEffect(() => {
    let eventSource = null;

    const fetchReportDetail = async () => {
      try {
        const token = localStorage.getItem('etrai_token');
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(apiUrl(`/api/v1/reports/${id}`), { headers, credentials: 'include' });
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

  const scrollToAnchor = (anchorId) => {
    setActiveReportTab('full');
    setTimeout(() => {
      const el = document.getElementById(anchorId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 relative mb-6">
            <div className="w-16 h-16 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center text-xs font-mono text-indigo-400">
              {progressState.progress}%
            </div>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Analyzing Subject Matter...</h2>
          <p className="text-sm text-slate-400 max-w-md font-mono">{progressState.step}</p>
          <div className="w-64 h-2 bg-slate-800 rounded-full overflow-hidden mt-6">
            <div 
              className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-all duration-300"
              style={{ width: `${progressState.progress}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center p-6 text-center">
          <div className="max-w-md p-8 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl">
            <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
            <h2 className="text-lg font-bold text-white mb-2">Verification Failed</h2>
            <p className="text-xs text-slate-400 mb-6">{error || 'Could not load report dossier.'}</p>
            <Link to="/analysis" className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold">
              Start New Analysis
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const scores = report.scores || {};
  const trustScore = scores.overallTrustScore !== undefined ? scores.overallTrustScore : 23;
  const isFake = trustScore < 40;
  const isSusp = trustScore >= 40 && trustScore < 75;
  const isReal = trustScore >= 75;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar />

      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 bg-slate-800 border border-slate-700 text-white text-xs rounded-full shadow-2xl flex items-center gap-2 animate-slideUp">
          <Sparkles className="w-4 h-4 text-indigo-400" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Main Dossier Container */}
      <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-6 flex-1">
        {/* Top Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <Link 
              to="/analysis"
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-300 flex items-center gap-1.5 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> New Run
            </Link>
            <span className="px-2.5 py-1 bg-indigo-500/10 border border-indigo-500/30 rounded-full font-mono text-indigo-300 text-[11px]">
              Run {id}
            </span>
            <span className="text-slate-400 font-mono text-[11px] hidden sm:inline">
              Sealed 17 Aug 2026, 19:06 IST · 34.2s runtime
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                navigator.clipboard?.writeText(window.location.href);
                showToast('Report link copied to clipboard');
              }}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-300 flex items-center gap-1.5 transition"
            >
              <Share2 className="w-3.5 h-3.5" /> Share
            </button>
            <button
              onClick={() => window.print()}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl shadow-lg shadow-indigo-500/20 flex items-center gap-1.5 transition"
            >
              <Download className="w-3.5 h-3.5" /> Export PDF
            </button>
          </div>
        </div>

        {/* Verdict Header Hero Card */}
        <div className={`p-6 sm:p-8 rounded-3xl border shadow-2xl relative overflow-hidden ${
          isFake ? 'bg-gradient-to-br from-rose-950/40 via-slate-900 to-slate-950 border-rose-500/30' :
          isSusp ? 'bg-gradient-to-br from-amber-950/40 via-slate-900 to-slate-950 border-amber-500/30' :
          'bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-950 border-emerald-500/30'
        }`}>
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-3 max-w-2xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold uppercase tracking-wider ${
                  isFake ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' :
                  isSusp ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' :
                  'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                }`}>
                  {isFake ? 'Fabricated' : isSusp ? 'Suspicious' : 'Verified Real'}
                </span>
                <span className="px-2 py-0.5 bg-slate-800/80 text-slate-300 rounded text-xs font-mono">
                  Manipulated Image
                </span>
                <span className="px-2 py-0.5 bg-slate-800/80 text-slate-300 rounded text-xs font-mono">
                  Recycled Video
                </span>
                <span className="px-2 py-0.5 bg-slate-800/80 text-slate-300 rounded text-xs font-mono">
                  Zero Tier-1 Corroboration
                </span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-serif font-semibold text-white leading-tight">
                {report.claimSummary || '“Leaked circular: all ₹500 notes stop being legal tender from 1 October — deposit before 30 September.”'}
              </h1>
              <p className="text-xs text-slate-400 font-mono">
                {report.domain || 'bharatwire-live.co'} · published 17 Aug 2026, 05:40 IST · no named author
              </p>
            </div>

            {/* Circular Trust Dial */}
            <div className="flex flex-col items-center flex-shrink-0">
              <div className="relative w-32 h-32 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 112 112">
                  <circle cx="56" cy="56" r="47" fill="none" stroke="#1e293b" strokeWidth="9" />
                  <circle
                    cx="56"
                    cy="56"
                    r="47"
                    fill="none"
                    stroke={isReal ? '#10b981' : isSusp ? '#f59e0b' : '#f43f5e'}
                    strokeWidth="9"
                    strokeLinecap="round"
                    strokeDasharray="295.3"
                    strokeDashoffset={295.3 - (295.3 * trustScore) / 100}
                    className="transition-all duration-700"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`text-3xl font-bold font-mono ${
                    isReal ? 'text-emerald-400' : isSusp ? 'text-amber-400' : 'text-rose-400'
                  }`}>
                    {trustScore}
                  </span>
                  <span className="text-[9px] uppercase font-mono text-slate-400">Trust / 100</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6 mt-6 border-t border-slate-800 text-xs">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-mono">Confidence</span>
              <span className="font-semibold text-white">High · 0.91</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-mono">Evidence Items</span>
              <span className="font-semibold text-white font-mono">42 Checked</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-mono">Sources Queried</span>
              <span className="font-semibold text-white font-mono">31 Desks</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-mono">Direct Contradictions</span>
              <span className="font-semibold text-rose-400 font-mono">6 Contradictions</span>
            </div>
          </div>
        </div>

        {/* 6 Report Sub-Tabs Navigation */}
        <div className="flex gap-2 border-b border-slate-800 pb-1 overflow-x-auto custom-scrollbar">
          {[
            { key: 'full', label: 'Full Dossier', count: null },
            { key: 'text', label: 'Article Text', count: '412 w' },
            { key: 'links', label: 'Links Inspected', count: '22' },
            { key: 'images', label: 'Altered Images', count: '2' },
            { key: 'videos', label: 'Video Forensics', count: '1' },
            { key: 'numbers', label: 'Figures Checked', count: '9' }
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveReportTab(tab.key)}
              className={`px-4 py-2 text-xs font-semibold rounded-xl border transition flex items-center gap-2 whitespace-nowrap ${
                activeReportTab === tab.key
                  ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-500/20'
                  : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              {tab.label}
              {tab.count && (
                <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                  activeReportTab === tab.key ? 'bg-indigo-700 text-white' : 'bg-slate-800 text-slate-400'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* SUB-PANE: FULL REPORT */}
        {activeReportTab === 'full' && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-3 space-y-8">
              {/* 01: TOP HIGHLIGHTS */}
              <section id="anchor-hl" className="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-4">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 font-mono text-[10px] font-bold rounded">
                    01
                  </span>
                  <h2 className="text-base font-semibold text-white">Top Highlights</h2>
                  <span className="text-xs text-slate-400 ml-auto">Core takeaways from the 9-agent rail</span>
                </div>
                <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
                  <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl flex items-start gap-3">
                    <span className="px-1.5 py-0.5 bg-rose-500/20 text-rose-300 font-mono text-[10px] font-bold rounded mt-0.5">01</span>
                    <p><strong className="text-white">No such circular exists.</strong> The document is a re-typed 2016 press note. Reference number DCM/1284/2026 does not resolve in the central bank circular index, and the seal is a raster lifted from a 2019 PDF.</p>
                  </div>
                  <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl flex items-start gap-3">
                    <span className="px-1.5 py-0.5 bg-rose-500/20 text-rose-300 font-mono text-[10px] font-bold rounded mt-0.5">02</span>
                    <p><strong className="text-white">Photo altered in three places.</strong> Banner text replaced, fake currency bundles inserted on podium, and press row cloned to double apparent attendance. Original frame found in wire archive dated 8 August.</p>
                  </div>
                  <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl flex items-start gap-3">
                    <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300 font-mono text-[10px] font-bold rounded mt-0.5">03</span>
                    <p><strong className="text-white">Video is real footage with a deceptive cut.</strong> 41 seconds from a routine monetary policy briefing, cut at 0:18 so the sentence “no change to the currency in circulation” never plays.</p>
                  </div>
                  <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl flex items-start gap-3">
                    <span className="px-1.5 py-0.5 bg-slate-800 text-slate-300 font-mono text-[10px] font-bold rounded mt-0.5">04</span>
                    <p><strong className="text-white">Origins trace to single anonymous forward.</strong> All 38 reposts descend from one Telegram message at 04:12 IST. Zero tier-1 outlets carry the claim; two have published explicit denials.</p>
                  </div>
                </div>
              </section>

              {/* 02: SCORE DERIVATION */}
              <section id="anchor-score" className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 font-mono text-[10px] font-bold rounded">
                    02
                  </span>
                  <h2 className="text-base font-semibold text-white">How the {trustScore} Was Calculated</h2>
                  <span className="text-xs text-slate-400 ml-auto">Mathematical derivation</span>
                </div>
                <ScoreDerivationView />
              </section>

              {/* 03: CLAIM BY CLAIM */}
              <section id="anchor-claims" className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 font-mono text-[10px] font-bold rounded">
                    03
                  </span>
                  <h2 className="text-base font-semibold text-white">Claim by Claim Analysis</h2>
                  <span className="text-xs text-slate-400 ml-auto">4 claims extracted · 1 partly true</span>
                </div>
                <div className="space-y-2">
                  {[
                    {
                      q: 'All ₹500 banknotes stop being legal tender from 1 October 2026.',
                      v: 'False',
                      color: 'text-rose-400 bg-rose-500/20 border-rose-500/30',
                      actual: 'No such decision exists. Denomination remains legal tender with no proposal before the committee.',
                      ev: 'Gazette index returns no matching notification. Two tier-1 desks published denials within 6 hours.',
                      src: 'National Gazette index · The Standard Ledger · Meridian Post'
                    },
                    {
                      q: 'A leaked internal circular numbered DCM/1284/2026 authorises the withdrawal.',
                      v: 'False',
                      color: 'text-rose-400 bg-rose-500/20 border-rose-500/30',
                      actual: 'Reference number does not resolve. Document is a re-typed 2016 press note with a copied seal.',
                      ev: 'Template diff shows 91% overlap with 2016 release. Seal is a 300 dpi raster lifted from 2019 PDF.',
                      src: 'Gazette index · template diff · seal match'
                    },
                    {
                      q: 'The deputy governor announced the change at a press briefing.',
                      v: 'Partly True',
                      color: 'text-amber-400 bg-amber-500/20 border-amber-500/30',
                      actual: 'A briefing took place on 8 August on monetary transmission, but words in the article appear nowhere in transcript.',
                      ev: 'Full recording matched at 99.2%. The clip in the article is cut at 0:18 immediately before the denial.',
                      src: 'Full briefing recording · official transcript'
                    },
                    {
                      q: 'Deposits made after 30 September will not be accepted.',
                      v: 'False',
                      color: 'text-rose-400 bg-rose-500/20 border-rose-500/30',
                      actual: 'No deadline exists because no withdrawal exists. The deposit helpline in the article is a 3-day old VoIP funnel.',
                      ev: 'Number lookup shows personal VoIP registration. 11 outbound affiliate links lead to payments funnel.',
                      src: 'Telecom registry · link audit'
                    }
                  ].map((claim, idx) => (
                    <div key={idx} className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-900/60">
                      <button
                        onClick={() => setOpenClaimIdx(openClaimIdx === idx ? -1 : idx)}
                        className="w-full p-4 text-left flex items-center justify-between gap-3 hover:bg-slate-850 transition"
                      >
                        <span className="font-medium text-slate-200 text-xs">{claim.q}</span>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${claim.color}`}>
                            {claim.v}
                          </span>
                          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${openClaimIdx === idx ? 'rotate-180' : ''}`} />
                        </div>
                      </button>
                      {openClaimIdx === idx && (
                        <div className="p-4 bg-slate-950/80 border-t border-slate-800 space-y-2 text-xs text-slate-300">
                          <div>
                            <span className="text-[10px] uppercase font-mono text-slate-400 block">What is Actually True</span>
                            <p className="text-slate-200">{claim.actual}</p>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-mono text-slate-400 block">Verified Evidence</span>
                            <p className="text-slate-300">{claim.ev}</p>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-mono text-slate-400 block">Corroborated In</span>
                            <p className="text-indigo-400 font-mono text-[11px]">{claim.src}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              {/* 04: IMAGE FORENSICS */}
              <section id="anchor-image" className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 font-mono text-[10px] font-bold rounded">
                    04
                  </span>
                  <h2 className="text-base font-semibold text-white">Image Forensics: Provided vs Original</h2>
                  <span className="text-xs text-slate-400 ml-auto">Wire archive match: 8 Aug 2026</span>
                </div>
                <ImageForensicsCompare />
              </section>

              {/* 05: VIDEO FORENSICS */}
              <section id="anchor-video" className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 font-mono text-[10px] font-bold rounded">
                    05
                  </span>
                  <h2 className="text-base font-semibold text-white">Video Forensics: Deceptive Cut Point</h2>
                  <span className="text-xs text-slate-400 ml-auto">41s clip · 6m 12s source</span>
                </div>
                <VideoForensicsViewer />
              </section>
            </div>

            {/* RIGHT RAIL TOC & SUMMARY */}
            <aside className="space-y-4">
              <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-3 text-xs sticky top-24">
                <span className="text-[10px] uppercase font-mono text-slate-400 block">Report Navigation</span>
                <div className="space-y-1">
                  {[
                    { id: 'anchor-hl', label: '01 · Top Highlights' },
                    { id: 'anchor-score', label: '02 · Score Derivation' },
                    { id: 'anchor-claims', label: '03 · Claim by Claim' },
                    { id: 'anchor-image', label: '04 · Image Forensics' },
                    { id: 'anchor-video', label: '05 · Video Forensics' }
                  ].map(link => (
                    <button
                      key={link.id}
                      onClick={() => scrollToAnchor(link.id)}
                      className="w-full text-left px-2.5 py-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
                    >
                      {link.label}
                    </button>
                  ))}
                </div>

                <div className="pt-3 border-t border-slate-800 space-y-2">
                  <span className="text-[10px] uppercase font-mono text-slate-400 block">Agents Deployed</span>
                  {[
                    'Intake & OCR v4',
                    'Provenance & WHOIS',
                    'SourceRank Ledger',
                    'ClaimSplit Engine',
                    'Cross-source Fact Match',
                    'Document Integrity',
                    'ELA Image Forensics',
                    'Audio Splice Fingerprint',
                    'Entity & Intent Classifier'
                  ].map((ag, i) => (
                    <div key={i} className="flex justify-between items-center text-[11px] text-slate-400">
                      <span>{ag}</span>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        )}

        {/* SUB-PANE: TEXT */}
        {activeReportTab === 'text' && (
          <div className="space-y-6">
            <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-4 text-xs text-slate-300">
              <h3 className="text-sm font-semibold text-white">Extracted Article Text & Markup Analysis</h3>
              <div className="flex flex-wrap gap-4 text-xs">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-rose-500/30 border border-rose-500 rounded"></span> Factually False</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-amber-500/30 border border-amber-500 rounded"></span> Urgency / Forward Bait</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-slate-700 border border-slate-500 rounded"></span> Unverified Quote</span>
              </div>
              <div className="p-5 bg-slate-950 rounded-xl space-y-3 font-serif text-sm leading-relaxed border border-slate-800">
                <p><span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300 rounded font-sans text-xs">*URGENT*</span> In what may be the biggest currency decision in a decade, <span className="px-1.5 py-0.5 bg-rose-500/20 text-rose-200 border-b border-rose-500">all ₹500 banknotes will stop being legal tender from 1 October</span>, according to a circular reviewed by this publication.</p>
                <p>The document, numbered <span className="px-1.5 py-0.5 bg-rose-500/20 text-rose-200 border-b border-rose-500">DCM/1284/2026</span>, instructs banks to stop dispensing the denomination and accept deposits only until <span className="px-1.5 py-0.5 bg-rose-500/20 text-rose-200 border-b border-rose-500">30 September</span>. <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300">Account holders who miss the window may lose access to their money.</span></p>
                <p>Speaking at a press briefing, the deputy governor said, <span className="px-1.5 py-0.5 bg-slate-800 text-slate-300 border-b border-slate-600">“the transition will be orderly and the public should not panic”</span>, <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300">it is learnt from sources present at the venue.</span></p>
              </div>
            </div>

            {/* OCR Extracted Text from Image */}
            <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-3 text-xs">
              <h3 className="text-sm font-semibold text-white">OCR Extracted Document Layer</h3>
              <pre className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-slate-300 font-mono text-xs overflow-x-auto leading-relaxed">
{`GOVERNMENT NOTICE — DEPARTMENT OF CURRENCY MANAGEMENT
Ref: DCM/1284/2026                    Dated: 14 August 2026

Subject: Withdrawal of ₹500 denomination from circulation

1. With effect from 01 October 2026, banknotes of the ₹500
   denomination shall cease to be legal tender.
2. Deposits shall be accepted at all branches until
   30 September 2026.
                                        (Seal affixed)`}
              </pre>
            </div>
          </div>
        )}

        {/* SUB-PANE: LINKS */}
        {activeReportTab === 'links' && (
          <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-4 text-xs">
            <h3 className="text-sm font-semibold text-white">Links Extracted & Threat Analysis</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-mono text-[10px] uppercase">
                    <th className="py-2.5">Destination URL</th>
                    <th className="py-2.5">Anchor Text</th>
                    <th className="py-2.5">Type</th>
                    <th className="py-2.5">HTTP Status</th>
                    <th className="py-2.5">Threat Analysis</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {STATIC_SAMPLE_LINKS.map((lnk, i) => (
                    <tr key={i} className="hover:bg-slate-850">
                      <td className="py-2.5 font-mono text-[11px] text-indigo-400">{lnk.u}</td>
                      <td className="py-2.5">{lnk.a}</td>
                      <td className="py-2.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                          lnk.v === 'fake' ? 'bg-rose-500/20 text-rose-300' :
                          lnk.v === 'susp' ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'
                        }`}>
                          {lnk.t}
                        </span>
                      </td>
                      <td className="py-2.5 font-mono">{lnk.st}</td>
                      <td className="py-2.5 text-slate-400">{lnk.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SUB-PANE: IMAGES */}
        {activeReportTab === 'images' && (
          <div className="space-y-6">
            <ImageForensicsCompare />
          </div>
        )}

        {/* SUB-PANE: VIDEOS */}
        {activeReportTab === 'videos' && (
          <div className="space-y-6">
            <VideoForensicsViewer />
          </div>
        )}

        {/* SUB-PANE: NUMBERS */}
        {activeReportTab === 'numbers' && (
          <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-4 text-xs">
            <h3 className="text-sm font-semibold text-white">Quantitative Figures & Numerical Claims</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-mono text-[10px] uppercase">
                    <th className="py-2.5">As Printed</th>
                    <th className="py-2.5">Contextual Claim</th>
                    <th className="py-2.5">Verified Truth</th>
                    <th className="py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {STATIC_SAMPLE_NUMBERS.map((num, i) => (
                    <tr key={i} className="hover:bg-slate-850">
                      <td className="py-2.5 font-mono text-sm font-bold text-white">{num.p}</td>
                      <td className="py-2.5">{num.m}</td>
                      <td className="py-2.5 text-slate-400">{num.a}</td>
                      <td className="py-2.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                          num.v === 'fake' ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'
                        }`}>
                          {num.v === 'fake' ? 'FALSE' : 'VERIFIED'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Claim Audit Modal */}
      {auditModalClaim && (
        <ClaimAuditModal
          isOpen={true}
          onClose={() => setAuditModalClaim(null)}
          claim={auditModalClaim}
          reportId={id}
        />
      )}
    </div>
  );
}
