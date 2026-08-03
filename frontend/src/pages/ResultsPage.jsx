import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
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
  Info
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

export default function ResultsPage() {
  const { id } = useParams();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
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
        const res = await fetch(`/api/v1/reports/${id}`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setReport(data.report.reportData || data.report);
          setLoading(false);
          return true;
        }
      } catch (e) {
        // Report detail not ready in DB yet
      }
      return false;
    };

    const init = async () => {
      const exists = await fetchReportDetail();
      if (exists) return;

      // Connect to SSE stream
      eventSource = new EventSource(`/api/v1/verify/stream/${id}`);

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setProgressState(data);

          if (data.status === 'COMPLETED') {
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

  if (loading && !report) {
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
              to="/new-analysis"
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold rounded-xl"
            >
              <ArrowLeft className="w-4 h-4" /> Try Another Analysis
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const { sourceTitle, selectedTypes, scores, breakdown, summary, recommendation, manipulationAnalysis, chartData, claims, truncated } = report;

  const filteredClaims = claims ? claims.filter(c => claimFilter === 'ALL' || c.status === claimFilter) : [];

  return (
    <div className="min-h-screen bg-slateDark-950 text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
        
        {/* Back Link & Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <Link to="/dashboard" className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1 mb-2 font-medium">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
            </Link>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Verification Report
            </h1>
            <p className="text-slate-400 text-sm mt-0.5 font-medium">{sourceTitle}</p>
          </div>

          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
              manipulationAnalysis?.verdict === 'HIGH_TRUST' 
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : manipulationAnalysis?.verdict === 'LOW_TRUST'
                ? 'bg-red-500/10 text-red-400 border-red-500/30'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
            }`}>
              {manipulationAnalysis?.verdict || 'COMPLETED'}
            </span>
          </div>
        </div>

        {/* Truncation Warning Notice Banner */}
        {truncated && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs sm:text-sm flex items-center gap-3">
            <Info className="w-5 h-5 shrink-0 text-amber-400" />
            <span>Note: Document text exceeded token limits and was automatically truncated to ~12,000 tokens. Analysis was conducted on the leading portion.</span>
          </div>
        )}

        {/* Per-Category Score Visualizations */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {scores.factCheckingScore !== undefined && (
            <div className="glass-panel p-5 rounded-2xl border border-slate-800 flex flex-col justify-between">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Fact Checking Score</div>
              <div className="flex items-baseline gap-2 my-2">
                <span className="text-3xl sm:text-4xl font-extrabold text-white">{scores.factCheckingScore}%</span>
                <span className="text-xs text-emerald-400 font-medium">Verified claims ratio</span>
              </div>
              <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${scores.factCheckingScore}%` }} />
              </div>
            </div>
          )}

          {scores.fakeNewsScore !== undefined && (
            <div className="glass-panel p-5 rounded-2xl border border-slate-800 flex flex-col justify-between">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Fake News & Credibility</div>
              <div className="flex items-baseline gap-2 my-2">
                <span className="text-3xl sm:text-4xl font-extrabold text-white">{scores.fakeNewsScore}%</span>
                <span className="text-xs text-brand-400 font-medium">Low manipulation index</span>
              </div>
              <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                <div className="bg-brand-500 h-full rounded-full" style={{ width: `${scores.fakeNewsScore}%` }} />
              </div>
            </div>
          )}

          {scores.businessReportScore !== undefined && (
            <div className="glass-panel p-5 rounded-2xl border border-slate-800 flex flex-col justify-between">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Business Metric Precision</div>
              <div className="flex items-baseline gap-2 my-2">
                <span className="text-3xl sm:text-4xl font-extrabold text-white">{scores.businessReportScore}%</span>
                <span className="text-xs text-amber-400 font-medium">Numerical & date accuracy</span>
              </div>
              <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                <div className="bg-amber-500 h-full rounded-full" style={{ width: `${scores.businessReportScore}%` }} />
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

          {/* Recharts Claims Breakdown Pie Chart */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 flex flex-col items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 w-full">
              <PieIcon className="w-4 h-4 text-brand-400" /> Claims Status Breakdown
            </h3>
            
            <div className="w-full h-48 my-2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={65}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                  />
                  <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-3 gap-2 w-full text-center text-xs pt-2 border-t border-slate-800">
              <div>
                <div className="font-bold text-emerald-400">{breakdown?.verified}</div>
                <div className="text-slate-500">Verified</div>
              </div>
              <div>
                <div className="font-bold text-amber-400">{breakdown?.suspicious}</div>
                <div className="text-slate-500">Suspicious</div>
              </div>
              <div>
                <div className="font-bold text-red-400">{breakdown?.false}</div>
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
              {['ALL', 'Verified', 'Suspicious', 'False'].map((status) => (
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

          {/* Claims List */}
          <div className="space-y-4">
            {filteredClaims.map((c) => (
              <div key={c.claimId} className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    {c.status === 'Verified' ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    ) : c.status === 'False' ? (
                      <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                    ) : (
                      <HelpCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className="text-sm font-semibold text-white leading-snug">{c.claimText}</p>
                      <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                        <span className="bg-slate-800 px-2 py-0.5 rounded text-slate-300 font-mono">{c.category}</span>
                        <span>•</span>
                        <span>Confidence: {c.confidence}%</span>
                      </div>
                    </div>
                  </div>

                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold shrink-0 ${
                    c.status === 'Verified' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' :
                    c.status === 'False' ? 'bg-red-500/10 text-red-400 border border-red-500/30' :
                    'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                  }`}>
                    {c.status}
                  </span>
                </div>

                <p className="text-xs text-slate-300 pl-7 leading-relaxed bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/80">
                  <span className="font-semibold text-slate-400">Agent Reasoning:</span> {c.explanation}
                </p>

                {/* Source Links */}
                {c.sources && c.sources.length > 0 && (
                  <div className="pl-7 pt-1 space-y-2">
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Source Evidence Links:</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {c.sources.map((src, idx) => (
                        <a
                          key={idx}
                          href={src.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 hover:border-brand-500/40 text-xs transition-colors group flex items-start justify-between gap-2"
                        >
                          <div className="space-y-0.5 overflow-hidden">
                            <div className="font-semibold text-brand-300 group-hover:underline truncate">{src.title}</div>
                            <div className="text-[11px] text-slate-500 truncate">{src.domain}</div>
                          </div>
                          <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-brand-400 shrink-0 mt-0.5" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {filteredClaims.length === 0 && (
              <div className="text-center py-8 text-slate-500 text-sm">
                No claims found matching status filter: <span className="font-bold text-slate-300">{claimFilter}</span>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
