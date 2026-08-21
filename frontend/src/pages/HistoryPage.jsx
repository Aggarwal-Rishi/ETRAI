import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { History, Trash2, ExternalLink, Calendar, Filter, FileText } from 'lucide-react';
import { apiUrl } from '../utils/api';

export default function HistoryPage() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchReports = async () => {
    try {
      const res = await fetch(apiUrl('/api/v1/reports'), { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setReports(data.reports || []);
      }
    } catch (e) {
      console.error('[Fetch History Error]:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this analysis report from your history?')) {
      return;
    }

    try {
      const res = await fetch(apiUrl(`/api/v1/reports/${id}`), {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) {
        setReports((prev) => prev.filter(r => r.id !== id));
      }
    } catch (e) {
      alert('Failed to delete report.');
    }
  };

  return (
    <div className="min-h-screen bg-slateDark-950 text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
              <History className="w-7 h-7 text-brand-400" /> Analysis History
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Browse and review all past verification reports, scores, and source evidence stored in your account.
            </p>
          </div>

          <Link
            to="/analysis"
            className="inline-flex items-center justify-center px-4 py-2.5 bg-brand-600 hover:bg-brand-500 text-white font-bold text-sm rounded-xl shadow-lg transition-all"
          >
            + New Analysis
          </Link>
        </div>

        {/* History List */}
        <div className="glass-panel rounded-2xl border border-slate-800 p-6 space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-slate-400 uppercase bg-slate-900/60 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3 font-semibold">Title / Document</th>
                  <th className="px-4 py-3 font-semibold">Input Mode</th>
                  <th className="px-4 py-3 font-semibold">Selected Types</th>
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {reports.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-900/40 transition-colors">
                    <td className="px-4 py-4 font-medium text-white max-w-sm truncate">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-brand-400 shrink-0" />
                        <span className="truncate">{r.title}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-slate-400 text-xs font-mono">{r.inputType}</td>
                    <td className="px-4 py-4">
                      <div className="flex gap-1 flex-wrap">
                        {r.selectedTypes?.map(t => (
                          <span key={t} className="px-2 py-0.5 rounded text-[11px] font-medium bg-brand-500/20 text-brand-300 border border-brand-500/30">
                            {t.replace('_', ' ')}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-slate-400 text-xs font-mono">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <Link
                          to={`/results/${r.id}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-400 hover:text-brand-300"
                        >
                          View <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                        <button
                          onClick={() => handleDelete(r.id)}
                          className="text-slate-500 hover:text-red-400 transition-colors"
                          title="Delete Report"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {reports.length === 0 && !loading && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-slate-500 text-sm">
                      No past analysis reports saved in your history.
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
