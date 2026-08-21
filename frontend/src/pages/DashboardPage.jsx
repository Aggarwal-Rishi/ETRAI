import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { PlusCircle, FileText, CheckCircle2, AlertTriangle, XCircle, ArrowRight, Activity, Shield } from 'lucide-react';
import { apiUrl } from '../utils/api';

export default function DashboardPage() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(apiUrl('/api/v1/reports'), { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setReports(data.reports || []);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Compute summary stats across user's history
  const totalAnalyses = reports.length;
  let totalVerified = 0;
  let totalSuspicious = 0;
  let totalFalse = 0;

  reports.forEach(r => {
    if (r.reportData?.breakdown) {
      totalVerified += r.reportData.breakdown.verified || 0;
      totalSuspicious += r.reportData.breakdown.suspicious || 0;
      totalFalse += r.reportData.breakdown.false || 0;
    }
  });

  return (
    <div className="min-h-screen bg-slateDark-950 text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Banner */}
        <div className="glass-panel rounded-2xl p-6 sm:p-8 relative overflow-hidden border border-slate-800">
          <div className="absolute right-0 top-0 w-96 h-96 bg-brand-500/10 blur-3xl rounded-full pointer-events-none"></div>
          <div className="max-w-2xl space-y-4 relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400 text-xs font-semibold uppercase tracking-wider">
              <Shield className="w-3.5 h-3.5" /> AI Multi-Agent Pipeline Active
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
              Fact-Checking & Content Verification
            </h1>
            <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
              Verify claims, detect manipulation tactics, and audit business reports using custom Serper search and Google Gemini verification agents.
            </p>
            <div className="pt-2">
              <Link
                to="/analysis"
                className="inline-flex items-center gap-2 px-5 py-3 bg-brand-600 hover:bg-brand-500 text-white font-medium rounded-xl shadow-lg shadow-brand-600/25 transition-all group"
              >
                <PlusCircle className="w-5 h-5" />
                <span>Start New Analysis</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="glass-card rounded-xl p-5 space-y-2">
            <div className="text-slate-400 text-xs font-medium uppercase tracking-wider flex items-center justify-between">
              <span>Total Analyses</span>
              <FileText className="w-4 h-4 text-brand-400" />
            </div>
            <div className="text-3xl font-extrabold text-white">{totalAnalyses}</div>
            <div className="text-xs text-slate-500">{loading ? 'Loading...' : 'Total reports generated'}</div>
          </div>

          <div className="glass-card rounded-xl p-5 space-y-2">
            <div className="text-slate-400 text-xs font-medium uppercase tracking-wider flex items-center justify-between">
              <span>Claims Verified</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-3xl font-extrabold text-emerald-400">{totalVerified}</div>
            <div className="text-xs text-slate-500">Cross-referenced with Serper</div>
          </div>

          <div className="glass-card rounded-xl p-5 space-y-2">
            <div className="text-slate-400 text-xs font-medium uppercase tracking-wider flex items-center justify-between">
              <span>Suspicious Claims</span>
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-3xl font-extrabold text-amber-400">{totalSuspicious}</div>
            <div className="text-xs text-slate-500">Unverifiable or unconfirmed</div>
          </div>

          <div className="glass-card rounded-xl p-5 space-y-2">
            <div className="text-slate-400 text-xs font-medium uppercase tracking-wider flex items-center justify-between">
              <span>False Claims</span>
              <XCircle className="w-4 h-4 text-rose-400" />
            </div>
            <div className="text-3xl font-extrabold text-rose-400">{totalFalse}</div>
            <div className="text-xs text-slate-500">Contradicted by trusted sources</div>
          </div>
        </div>

        {/* Recent Verification History Table */}
        <div className="glass-panel rounded-2xl border border-slate-800 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-brand-400" />
              <h2 className="text-lg font-bold text-white">Recent Analyses</h2>
            </div>
            <Link to="/history" className="text-xs font-semibold text-brand-400 hover:text-brand-300 flex items-center gap-1">
              View All History <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-slate-400 uppercase bg-slate-900/60 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3 font-semibold">Title / Source</th>
                  <th className="px-4 py-3 font-semibold">Input Type</th>
                  <th className="px-4 py-3 font-semibold">Categories</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {reports.slice(0, 5).map((r) => (
                  <tr key={r.id} className="hover:bg-slate-900/40 transition-colors">
                    <td className="px-4 py-3.5 font-medium text-white max-w-xs truncate">
                      {r.title}
                    </td>
                    <td className="px-4 py-3.5 text-slate-400 text-xs">{r.inputType}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex gap-1 flex-wrap">
                        {r.selectedTypes?.map(t => (
                          <span key={t} className="px-2 py-0.5 rounded text-[11px] font-medium bg-brand-500/20 text-brand-300 border border-brand-500/30">
                            {t.replace('_', ' ')}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <CheckCircle2 className="w-3.5 h-3.5" /> {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <Link to={`/results/${r.id}`} className="text-xs font-medium text-brand-400 hover:underline">
                        View Report
                      </Link>
                    </td>
                  </tr>
                ))}

                {reports.length === 0 && !loading && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500 text-sm">
                      No verification reports found. Click "Start New Analysis" above to verify your first document!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
