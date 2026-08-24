import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import VerdictBadge from '../components/VerdictBadge';
import { useAuth } from '../context/AuthContext';
import { apiUrl } from '../utils/api';
import { FEATURE_FLAGS } from '../utils/featureFlags';
import {
  ShieldCheck,
  Plus,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Clock,
  AlertTriangle,
  FileText,
  Radio,
  Image,
  Film,
  Sparkles,
  Layers,
  Search,
  ExternalLink,
  ChevronRight,
  ShieldAlert,
  Info,
  Activity,
  CheckCircle,
  XCircle,
  Shield
} from 'lucide-react';

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [telemetry, setTelemetry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Time-of-day greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const userName = user?.fullName || (user?.email ? user.email.split('@')[0] : 'Analyst');

  useEffect(() => {
    let isMounted = true;
    async function loadDashboard() {
      try {
        setLoading(true);
        const token = localStorage.getItem('etrai_token');
        const headers = token ? { Authorization: `Bearer ${token}` } : {};

        const res = await fetch(apiUrl('/api/v1/dashboard'), {
          headers,
          credentials: 'include'
        });

        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setTelemetry(data);
          }
        } else {
          throw new Error('Failed to load dashboard telemetry.');
        }
      } catch (err) {
        if (isMounted) setError(err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadDashboard();
    return () => { isMounted = false; };
  }, []);

  const metrics = telemetry?.metrics || {
    verifiedToday: { count: 0, delta: 0 },
    flaggedFake: { count: 0, percentage: 0 },
    medianTrust: { score: 0, delta: 0, totalWeek: 0 },
    manipulatedMedia: { total: 0, imageCount: 0, videoCount: 0 }
  };

  const verdictMix = telemetry?.verdictMix || {
    total: 0,
    verified: { count: 0, pct: 0 },
    suspicious: { count: 0, pct: 0 },
    false: { count: 0, pct: 0 },
    insufficient: { count: 0, pct: 0 }
  };

  const needsReadQueue = telemetry?.needsReadQueue || [];
  const narrativeClusters = telemetry?.narrativeClusters?.clusters || [];
  const recentReports = telemetry?.recentReports || [];
  const suspiciousWeekCount = telemetry?.suspiciousWeekCount || 0;

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col font-sans select-none">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-fadeIn">
        
        {/* ========================================================================= */}
        {/* 1. CONTEXTUAL GREETING & ACTIVITY HEADER                                  */}
        {/* ========================================================================= */}
        <div className="p-6 sm:p-8 rounded-2xl bg-[#0b1329] border border-[#17233f] shadow-2xl relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 relative z-10 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#131f38] text-blue-300 border border-blue-800/40 text-xs font-semibold uppercase tracking-wider">
              <Shield className="w-3.5 h-3.5 text-blue-400" />
              <span>AI MULTI-AGENT PIPELINE ACTIVE</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Fact-Checking &amp; Content Verification
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
              Verify claims, detect manipulation tactics, and audit business reports using custom Serper search and Google Gemini verification agents.
            </p>
          </div>

          <div className="flex items-center gap-3 relative z-10 flex-shrink-0">
            <Link
              to="/analysis"
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-xs shadow-lg shadow-indigo-600/30 transition flex items-center gap-2 group"
            >
              <Plus className="w-4 h-4" />
              <span>Start New Analysis</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 2. 4 METRIC CARDS (COMPUTED FROM REAL DB DATA)                            */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Card 1: Verified Today */}
          <div className="p-5 bg-[#0c1427] border border-[#17233f] rounded-2xl space-y-3 shadow-lg">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase font-mono">
              <span>Verified Today</span>
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold font-mono text-white">
                {metrics.verifiedToday.count}
              </span>
              <span className="text-xs text-slate-400 font-mono">items</span>
            </div>
            <div className="text-[11px] font-mono flex items-center gap-1.5 text-slate-400">
              {metrics.verifiedToday.delta >= 0 ? (
                <span className="text-emerald-400 flex items-center font-bold">
                  +{metrics.verifiedToday.delta} vs yesterday
                </span>
              ) : (
                <span className="text-rose-400 flex items-center font-bold">
                  {metrics.verifiedToday.delta} vs yesterday
                </span>
              )}
            </div>
          </div>

          {/* Card 2: Flagged Fake */}
          <div className="p-5 bg-[#0c1427] border border-[#17233f] rounded-2xl space-y-3 shadow-lg">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase font-mono">
              <span>Flagged Fake</span>
              <ShieldAlert className="w-4 h-4 text-rose-500" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold font-mono text-rose-400">
                {metrics.flaggedFake.count}
              </span>
              <span className="text-xs text-slate-400 font-mono">
                ({metrics.flaggedFake.percentage}% of today)
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-mono">
              Below 40 trust threshold
            </div>
          </div>

          {/* Card 3: Median Trust */}
          <div className="p-5 bg-[#0c1427] border border-[#17233f] rounded-2xl space-y-3 shadow-lg">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase font-mono">
              <span>Median Trust (7d)</span>
              <TrendingUp className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold font-mono text-indigo-400">
                {metrics.medianTrust.score}
              </span>
              <span className="text-xs text-slate-400 font-mono">/ 100</span>
            </div>
            <div className="text-[11px] font-mono text-slate-400">
              {metrics.medianTrust.delta >= 0 ? (
                <span className="text-emerald-400 font-bold">+{metrics.medianTrust.delta} pts vs prior 7d</span>
              ) : (
                <span className="text-rose-400 font-bold">{metrics.medianTrust.delta} pts vs prior 7d</span>
              )}
            </div>
          </div>

          {/* Card 4: Manipulated Media */}
          <div className="p-5 bg-[#0c1427] border border-[#17233f] rounded-2xl space-y-3 shadow-lg">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase font-mono">
              <span>Manipulated Media</span>
              <Film className="w-4 h-4 text-blue-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold font-mono text-white">
                {metrics.manipulatedMedia.total}
              </span>
              <span className="text-xs text-slate-400 font-mono">assets</span>
            </div>
            <div className="text-[11px] font-mono text-slate-400 flex items-center gap-2">
              <span>{metrics.manipulatedMedia.imageCount} images</span>
              <span>·</span>
              <span>{metrics.manipulatedMedia.videoCount} videos</span>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 3. PROPORTIONAL VERDICT MIX BAR                                           */}
        {/* ========================================================================= */}
        <div className="p-6 bg-[#0c1427] border border-[#17233f] rounded-2xl space-y-4 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                Verdict Distribution (Last 30 Days)
              </h3>
              <p className="text-xs text-slate-400">
                {verdictMix.total} total verified analyses across your beats
              </p>
            </div>
            <span className="text-xs font-mono text-slate-400">
              Real Multi-Agent Aggregation
            </span>
          </div>

          {/* Proportional Segmented Bar */}
          {verdictMix.total > 0 ? (
            <div className="space-y-3">
              <div className="h-4 w-full bg-[#070b14] rounded-full overflow-hidden flex border border-[#17233f] p-0.5 gap-0.5">
                {verdictMix.verified.pct > 0 && (
                  <div
                    title={`Verified Real: ${verdictMix.verified.count} (${verdictMix.verified.pct}%)`}
                    style={{ width: `${verdictMix.verified.pct}%` }}
                    className="h-full bg-emerald-500 rounded-l-full transition-all duration-700"
                  />
                )}
                {verdictMix.suspicious.pct > 0 && (
                  <div
                    title={`Suspicious: ${verdictMix.suspicious.count} (${verdictMix.suspicious.pct}%)`}
                    style={{ width: `${verdictMix.suspicious.pct}%` }}
                    className="h-full bg-amber-500 transition-all duration-700"
                  />
                )}
                {verdictMix.false.pct > 0 && (
                  <div
                    title={`Flagged Fake: ${verdictMix.false.count} (${verdictMix.false.pct}%)`}
                    style={{ width: `${verdictMix.false.pct}%` }}
                    className="h-full bg-rose-500 transition-all duration-700"
                  />
                )}
                {verdictMix.insufficient.pct > 0 && (
                  <div
                    title={`Unverified / Neutral: ${verdictMix.insufficient.count} (${verdictMix.insufficient.pct}%)`}
                    style={{ width: `${verdictMix.insufficient.pct}%` }}
                    className="h-full bg-slate-700 rounded-r-full transition-all duration-700"
                  />
                )}
              </div>

              {/* Legend */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1 font-mono">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-emerald-500/80 border border-emerald-400" />
                  <span className="text-slate-300">Verified Real ({verdictMix.verified.pct}%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-amber-500/80 border border-amber-400" />
                  <span className="text-slate-300">Suspicious ({verdictMix.suspicious.pct}%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-rose-500/80 border border-rose-400" />
                  <span className="text-slate-300">Flagged Fake ({verdictMix.false.pct}%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-slate-700 border border-slate-600" />
                  <span className="text-slate-300">Unverified ({verdictMix.insufficient.pct}%)</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-6 px-4 text-center bg-[#070b14]/40 rounded-2xl border border-dashed border-[#17233f] text-xs text-slate-400">
              <Info className="w-5 h-5 text-indigo-400 mx-auto mb-1.5" />
              <p className="font-semibold text-slate-300">No verification volume recorded in the last 30 days</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Run your first analysis to see live verdict distribution charts.</p>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* 4 & 5. NARRATIVE CLUSTERS & "NEEDS YOUR READ" QUEUE                       */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* 4. Narrative Clusters Widget */}
          <div className="p-6 bg-[#0c1427] border border-[#17233f] rounded-2xl space-y-4 flex flex-col justify-between shadow-xl">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white uppercase font-mono">
                  Emerging Narrative Clusters
                </h3>
                <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded text-[9.5px] font-mono font-bold">
                  Basic Entity Grouping
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Stories grouped by shared subject matter and entities.
              </p>
            </div>

            <div className="space-y-2.5 flex-1">
              {narrativeClusters.length > 0 ? (
                narrativeClusters.map((cl, idx) => (
                  <div
                    key={idx}
                    onClick={() => navigate(`/results/${cl.leadReportId}`)}
                    className="p-3.5 bg-[#070b14]/70 border border-[#17233f] hover:border-indigo-500/40 rounded-xl cursor-pointer transition space-y-2 group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-xs group-hover:text-indigo-300 transition truncate max-w-[240px]">
                        {cl.topic}
                      </span>
                      <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                        cl.avgTrustScore < 40 ? 'bg-rose-500/20 text-rose-300' : 'bg-amber-500/20 text-amber-300'
                      }`}>
                        {cl.count} Analyses Linked
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 truncate">Lead: {cl.leadTitle}</p>
                  </div>
                ))
              ) : (
                <div className="py-8 px-4 text-center bg-[#070b14]/40 rounded-xl border border-dashed border-[#17233f] text-xs text-slate-400 space-y-1">
                  <Layers className="w-5 h-5 text-indigo-400 mx-auto mb-1" />
                  <p className="font-medium text-slate-300">No narrative clusters detected yet</p>
                  <p className="text-[11px] text-slate-500">Analyses with overlapping named entities will group here automatically.</p>
                </div>
              )}
            </div>

            {FEATURE_FLAGS.SHOW_FAKE_NEWS_SECTION && (
              <Link
                to="/fake-news"
                className="text-xs font-semibold text-blue-400 hover:underline flex items-center gap-1 pt-2"
              >
                <span>Explore Fake News Desk</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>

          {/* 5. "Needs Your Read" Queue */}
          <div className="p-6 bg-[#0c1427] border border-[#17233f] rounded-2xl space-y-4 flex flex-col justify-between shadow-xl">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white uppercase font-mono">
                  Needs Your Read Queue
                </h3>
                <span className="text-[10px] font-mono text-amber-400 font-bold px-2 py-0.5 bg-amber-500/10 border border-amber-500/30 rounded">
                  {needsReadQueue.length} Pending Review
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Ambiguous cases scored between 40–74 requiring human editorial decision.
              </p>
            </div>

            <div className="space-y-2.5 flex-1">
              {needsReadQueue.length > 0 ? (
                needsReadQueue.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => navigate(`/results/${item.id}`)}
                    className="p-3.5 bg-[#070b14]/70 border border-[#17233f] hover:border-amber-500/40 rounded-xl cursor-pointer transition flex items-center justify-between gap-3 group"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.2 bg-slate-800 text-slate-400 rounded text-[9.5px] font-mono uppercase">
                          {item.inputType || 'TEXT'}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">Run {item.id}</span>
                      </div>
                      <h4 className="text-xs font-medium text-white group-hover:text-amber-300 transition truncate">
                        {item.title}
                      </h4>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <VerdictBadge status={item.verdict} size="sm" />
                      <span className="font-mono text-xs font-bold text-amber-400">
                        {item.trustScore}/100
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-8 px-4 text-center bg-[#070b14]/40 rounded-xl border border-dashed border-[#17233f] text-xs text-slate-400 space-y-1">
                  <ShieldCheck className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
                  <p className="font-medium text-slate-300">Queue is completely clear</p>
                  <p className="text-[11px] text-slate-500">No ambiguous or unreviewed claims currently pending.</p>
                </div>
              )}
            </div>

            <Link
              to="/history"
              className="text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1 pt-2"
            >
              <span>View Full History &amp; Audit Ledger</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 6. RECENT REPORTS & DOSSIERS FEED                                         */}
        {/* ========================================================================= */}
        <div className="p-6 bg-[#0c1427] border border-[#17233f] rounded-2xl space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-400" />
              <h3 className="text-base font-bold text-white tracking-tight">
                Recent Verification Dossiers
              </h3>
            </div>
            <Link
              to="/history"
              className="text-xs font-semibold text-indigo-400 hover:underline flex items-center gap-1 font-mono"
            >
              <span>View All History</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="space-y-2.5">
            {recentReports.length > 0 ? (
              recentReports.map((r) => {
                const categories = Array.isArray(r.selectedTypes)
                  ? r.selectedTypes
                  : (typeof r.selectedTypes === 'string' && r.selectedTypes.startsWith('['))
                    ? JSON.parse(r.selectedTypes)
                    : ['FACT_CHECKING'];

                const primaryCat = categories[0] || 'FACT_CHECKING';
                const categoryLabel = primaryCat.replace(/_/g, ' ');

                return (
                  <div
                    key={r.id}
                    onClick={() => navigate(`/results/${r.id}`)}
                    className="p-4 bg-[#070b14]/80 hover:bg-[#101a33]/60 border border-[#17233f] hover:border-slate-700 rounded-xl cursor-pointer transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                  >
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap text-xs text-slate-400">
                        <span className="font-mono text-indigo-400 text-[11px] font-semibold">{r.id}</span>
                        <span>·</span>
                        <span className="text-slate-300 font-medium">{r.inputSource || 'Input Text'}</span>
                        <span>·</span>
                        <span className="px-1.5 py-0.2 bg-[#131f38] text-indigo-300 rounded text-[10px] font-mono uppercase">
                          {categoryLabel}
                        </span>
                      </div>
                      <h4 className="text-xs sm:text-sm font-semibold text-white group-hover:text-indigo-300 transition truncate">
                        {r.title}
                      </h4>
                    </div>

                    <div className="flex items-center gap-4 flex-shrink-0 self-end sm:self-center">
                      <VerdictBadge status={r.verdict} size="sm" />
                      <div className="text-right">
                        <span className={`font-mono text-base font-bold block ${
                          r.trustScore >= 75 ? 'text-emerald-400' : r.trustScore >= 40 ? 'text-amber-400' : 'text-rose-400'
                        }`}>
                          {r.trustScore}
                        </span>
                        <span className="text-[9px] uppercase font-mono text-slate-500">Trust / 100</span>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-12 px-4 text-center bg-[#070b14]/40 rounded-xl border border-dashed border-[#17233f] text-xs text-slate-400 space-y-2">
                <FileText className="w-6 h-6 text-indigo-400 mx-auto" />
                <p className="font-bold text-white text-sm">No verification dossiers generated yet</p>
                <p className="text-slate-400 max-w-sm mx-auto">
                  Submit your first claim, article URL, photo, or video to launch the multi-agent AI verification rail.
                </p>
                <Link
                  to="/analysis"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs shadow-md mt-2 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Run First Verification</span>
                </Link>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
