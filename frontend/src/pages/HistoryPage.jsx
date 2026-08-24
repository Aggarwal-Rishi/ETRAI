import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import VerdictBadge from '../components/VerdictBadge';
import ReverifyModal from '../components/ReverifyModal';
import { apiUrl } from '../utils/api';
import {
  Clock,
  Search,
  Filter,
  ExternalLink,
  Lock,
  Download,
  Mail,
  Sparkles,
  DollarSign,
  Zap,
  Layers,
  ArrowUpDown,
  RefreshCw,
  Info,
  Trash2,
  AlertTriangle,
  X
} from 'lucide-react';

export default function HistoryPage() {
  const navigate = useNavigate();
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [mediaFilter, setMediaFilter] = useState('ALL'); // 'ALL' | 'IMAGE' | 'VIDEO' | 'PDF' | 'TEXT'
  const [catFilter, setCatFilter] = useState('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState('createdAt');
  const [sortDir, setSortDir] = useState(-1);

  // Re-verification Modal
  const [reverifyReport, setReverifyReport] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);

  // Delete State
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setIsDeleting(true);
      const token = localStorage.getItem('etrai_token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const res = await fetch(apiUrl(`/api/v1/reports/${deleteTarget.id}`), {
        method: 'DELETE',
        headers,
        credentials: 'include'
      });

      if (res.ok) {
        setRuns(prev => prev.filter(r => r.id !== deleteTarget.id));
        showToast(`Report ${deleteTarget.id.slice(0, 12)} deleted successfully.`);
        setDeleteTarget(null);
      } else {
        const errData = await res.json().catch(() => ({}));
        showToast(errData.error || 'Failed to delete report.');
      }
    } catch (err) {
      showToast('Network error while deleting report.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Fetch real verification history from backend
  useEffect(() => {
    let isMounted = true;
    async function loadHistory() {
      try {
        setLoading(true);
        const token = localStorage.getItem('etrai_token');
        const headers = token ? { Authorization: `Bearer ${token}` } : {};

        const res = await fetch(apiUrl('/api/v1/reports?limit=100'), {
          headers,
          credentials: 'include'
        });

        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.reports) {
            setRuns(data.reports);
          }
        }
      } catch (err) {
        // Fallback gracefully
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadHistory();
    return () => { isMounted = false; };
  }, []);

  const categories = ['ALL', ...new Set(runs.map(r => r.category || 'General'))].sort();

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(-sortDir);
    } else {
      setSortKey(key);
      setSortDir(-1);
    }
  };

  // Dynamic filter logic
  const filteredRuns = runs.filter(r => {
    // Media filter
    if (mediaFilter !== 'ALL') {
      const type = (r.inputType || '').toUpperCase();
      if (mediaFilter === 'IMAGE' && !type.includes('IMAGE') && !type.includes('PHOTO')) return false;
      if (mediaFilter === 'VIDEO' && !type.includes('VIDEO')) return false;
      if (mediaFilter === 'PDF' && !type.includes('PDF') && !type.includes('FILE')) return false;
      if (mediaFilter === 'TEXT' && !type.includes('TEXT') && !type.includes('URL')) return false;
    }

    // Category filter
    if (catFilter !== 'ALL' && (r.category || 'General') !== catFilter) return false;

    // Date range filter
    if (fromDate) {
      const itemDate = new Date(r.createdAt);
      if (itemDate < new Date(fromDate)) return false;
    }
    if (toDate) {
      const itemDate = new Date(r.createdAt);
      const end = new Date(toDate);
      end.setHours(23, 59, 59);
      if (itemDate > end) return false;
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const title = (r.title || '').toLowerCase();
      const src = (r.inputSource || '').toLowerCase();
      const id = (r.id || '').toLowerCase();
      if (!title.includes(q) && !src.includes(q) && !id.includes(q)) return false;
    }

    return true;
  }).sort((a, b) => {
    let valA = a[sortKey];
    let valB = b[sortKey];
    if (sortKey === 'createdAt') {
      valA = new Date(a.createdAt).getTime();
      valB = new Date(b.createdAt).getTime();
    }
    if (typeof valA === 'number' && typeof valB === 'number') {
      return (valA - valB) * sortDir;
    }
    return String(valA || '').localeCompare(String(valB || '')) * sortDir;
  });

  // Real metric sums
  const totalTokens = filteredRuns.reduce((acc, r) => acc + (r.tokensConsumed || 0), 0);
  const totalCost = filteredRuns.reduce((acc, r) => acc + (r.costUsd || 0.0), 0);
  const avgCost = filteredRuns.length > 0 ? (totalCost / filteredRuns.length).toFixed(3) : '0.000';
  const avgTok = filteredRuns.length > 0 ? Math.round(totalTokens / filteredRuns.length).toLocaleString() : '0';

  // Real CSV Export
  const exportCSV = () => {
    if (filteredRuns.length === 0) {
      showToast('No records available to export');
      return;
    }

    const headers = 'Run ID,Version,Headline,Category,Input Source,Media Type,Verdict,Trust Score,Tokens Consumed,Cost USD,Created Date\n';
    const rows = filteredRuns.map(r => {
      const titleClean = `"${(r.title || '').replace(/"/g, '""')}"`;
      const srcClean = `"${(r.inputSource || '').replace(/"/g, '""')}"`;
      const catClean = `"${r.category || 'General'}"`;
      const dateClean = `"${new Date(r.createdAt).toISOString()}"`;
      return `${r.id},v${r.runVersion || 1},${titleClean},${catClean},${srcClean},${r.inputType || 'TEXT'},${r.verdict || 'UNVERIFIED'},${r.trustScore || 0},${r.tokensConsumed || 0},${(r.costUsd || 0).toFixed(4)},${dateClean}`;
    }).join('\n');

    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `etrai-verification-ledger-${Date.now()}.csv`;
    link.click();
    showToast(`Exported ${filteredRuns.length} verification records to CSV`);
  };

  const handleRerunNow = async (report) => {
    const targetReport = report || reverifyReport;
    if (!targetReport) return;
    try {
      showToast('Re-verification pipeline initiated...');
      const token = localStorage.getItem('etrai_token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const res = await fetch(apiUrl(`/api/v1/reports/${targetReport.id}/reverify`), {
        method: 'POST',
        headers,
        credentials: 'include'
      });

      if (res.ok) {
        showToast(`Report re-verified against latest sources · archived as v${(targetReport.runVersion || 1) + 1}`);
        setReverifyReport(null);
        // Refresh history
        const updatedRes = await fetch(apiUrl('/api/v1/reports?limit=100'), { headers, credentials: 'include' });
        if (updatedRes.ok) {
          const data = await updatedRes.json();
          setRuns(data.reports || []);
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        showToast(errData.error || 'Failed to re-verify report.');
      }
    } catch (err) {
      showToast('Re-verification failed: ' + err.message);
    }
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col font-sans">
      <Navbar />

      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 bg-[#0c1427] border border-[#17233f] text-white text-xs rounded-full shadow-2xl flex items-center gap-2 animate-slideUp">
          <Sparkles className="w-4 h-4 text-blue-400" />
          <span>{toastMsg}</span>
        </div>
      )}

      <main className="flex-1 max-w-[1520px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 animate-fadeIn">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
              <Clock className="w-6 h-6 text-indigo-400" />
              Verification History &amp; Report Ledger
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Every verification run you have executed, with recorded provider telemetry, creation timestamps, and billed costs.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => showToast('Cost breakdown report scheduled for your registered email contact')}
              className="px-3.5 py-2 text-xs font-medium bg-[#0c1427] hover:bg-[#101a33] border border-[#17233f] text-slate-300 rounded-xl transition flex items-center gap-2"
            >
              <Mail className="w-3.5 h-3.5 text-blue-400" />
              <span>Send Cost Report</span>
            </button>
            <button
              onClick={exportCSV}
              className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-lg shadow-indigo-600/30 transition flex items-center gap-2"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* 4 Real Usage & Financial Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          
          <div className="p-4.5 bg-[#0c1427] border border-[#17233f] rounded-2xl space-y-2">
            <span className="text-[10px] uppercase font-mono text-slate-400 block font-semibold">
              Runs Shown
            </span>
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-white">
              {filteredRuns.length}
            </div>
            <span className="text-[11px] text-slate-500 font-mono">
              {runs.length} total across all cycles
            </span>
          </div>

          <div className="p-4.5 bg-[#0c1427] border border-[#17233f] rounded-2xl space-y-2">
            <span className="text-[10px] uppercase font-mono text-slate-400 block font-semibold">
              Tokens Consumed
            </span>
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-indigo-400">
              {(totalTokens / 1e6).toFixed(3)}M
            </div>
            <span className="text-[11px] text-slate-500 font-mono">
              {totalTokens.toLocaleString()} total tokens
            </span>
          </div>

          <div className="p-4.5 bg-[#0c1427] border border-[#17233f] rounded-2xl space-y-2">
            <span className="text-[10px] uppercase font-mono text-slate-400 block font-semibold">
              Total Billed Cost
            </span>
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-emerald-400">
              ${totalCost.toFixed(3)}
            </div>
            <span className="text-[11px] text-slate-500 font-mono">
              ~₹{(totalCost * 86.5).toFixed(2)} INR equivalent
            </span>
          </div>

          <div className="p-4.5 bg-[#0c1427] border border-[#17233f] rounded-2xl space-y-2">
            <span className="text-[10px] uppercase font-mono text-slate-400 block font-semibold">
              Average Cost / Run
            </span>
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-blue-400">
              ${avgCost}
            </div>
            <span className="text-[11px] text-slate-500 font-mono">
              ~{avgTok} tokens / run avg
            </span>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="p-3.5 bg-slate-900/80 border border-slate-800 rounded-2xl flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-400 font-medium">
            <Filter className="w-3.5 h-3.5" /> Filters:
          </div>

          {/* Date range pickers */}
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-indigo-500"
              title="Filter From Date"
            />
            <span className="text-slate-500">to</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-indigo-500"
              title="Filter To Date"
            />
          </div>

          {/* Category Dropdown */}
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            className="px-3 py-1 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            {categories.map(c => (
              <option key={c} value={c}>{c === 'ALL' ? 'All Categories' : c}</option>
            ))}
          </select>

          {/* Search Query */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search headline, source or run ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Media Filter Chips */}
          <div className="flex items-center gap-1">
            {['ALL', 'IMAGE', 'VIDEO', 'PDF', 'TEXT'].map(m => (
              <button
                key={m}
                onClick={() => setMediaFilter(m)}
                className={`px-2.5 py-1 rounded-lg uppercase font-mono text-[10px] font-semibold border transition ${
                  mediaFilter === m
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          {(catFilter !== 'ALL' || searchQuery || mediaFilter !== 'ALL' || fromDate || toDate) && (
            <button
              onClick={() => {
                setCatFilter('ALL');
                setSearchQuery('');
                setMediaFilter('ALL');
                setFromDate('');
                setToDate('');
              }}
              className="text-slate-400 hover:text-white font-medium"
            >
              Clear
            </button>
          )}
        </div>

        {/* 13-Column Ledger Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto overscroll-x-contain">
            <table className="w-full min-w-[1390px] table-fixed text-left text-xs">
              <colgroup>
                <col className="w-[40px]" />
                <col className="w-[135px]" />
                <col className="w-[280px]" />
                <col className="w-[90px]" />
                <col className="w-[110px]" />
                <col className="w-[85px]" />
                <col className="w-[145px]" />
                <col className="w-[60px]" />
                <col className="w-[155px]" />
                <col className="w-[55px]" />
                <col className="w-[80px]" />
                <col className="w-[70px]" />
                <col className="w-[85px]" />
              </colgroup>
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950 text-slate-400 uppercase font-mono text-[10px]">
                  <th className="px-3 py-3 w-10 text-center" title="Stored Report">
                    <Lock className="w-3.5 h-3.5 mx-auto" />
                  </th>
                  <th className="px-3 py-3 cursor-pointer hover:text-white" onClick={() => handleSort('id')}>
                    Run ID {sortKey === 'id' && (sortDir === 1 ? '↑' : '↓')}
                  </th>
                  <th className="px-3 py-3 cursor-pointer hover:text-white" onClick={() => handleSort('title')}>
                    Subject / Headline {sortKey === 'title' && (sortDir === 1 ? '↑' : '↓')}
                  </th>
                  <th className="px-3 py-3">Category</th>
                  <th className="px-3 py-3">Source</th>
                  <th className="px-3 py-3">News Date</th>
                  <th className="px-3 py-3 cursor-pointer hover:text-white" onClick={() => handleSort('createdAt')}>
                    Run Date {sortKey === 'createdAt' && (sortDir === 1 ? '↑' : '↓')}
                  </th>
                  <th className="px-3 py-3">Media</th>
                  <th className="px-3 py-3">Verdict</th>
                  <th className="px-3 py-3 text-right cursor-pointer hover:text-white" onClick={() => handleSort('trustScore')}>
                    Trust {sortKey === 'trustScore' && (sortDir === 1 ? '↑' : '↓')}
                  </th>
                  <th className="px-3 py-3 text-right cursor-pointer hover:text-white" onClick={() => handleSort('tokensConsumed')}>
                    Tokens {sortKey === 'tokensConsumed' && (sortDir === 1 ? '↑' : '↓')}
                  </th>
                  <th className="px-3 py-3 text-right cursor-pointer hover:text-white" onClick={() => handleSort('costUsd')}>
                    Cost {sortKey === 'costUsd' && (sortDir === 1 ? '↑' : '↓')}
                  </th>
                  <th className="px-3 py-3 text-right">Action</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {loading ? (
                  <tr>
                    <td colSpan="13" className="py-16 text-center text-slate-400 font-mono">
                      <RefreshCw className="w-4 h-4 animate-spin text-indigo-400 mx-auto mb-2" />
                      Loading verification ledger from database...
                    </td>
                  </tr>
                ) : filteredRuns.length > 0 ? (
                  filteredRuns.map((r) => {
                    const score = r.trustScore !== null && r.trustScore !== undefined ? r.trustScore : 50;
                    const dateFormatted = new Date(r.createdAt).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric'
                    });
                    const timeFormatted = new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                    return (
                      <tr key={r.id} className="hover:bg-slate-850 transition">
                        
                        {/* 1. Lock Icon */}
                        <td className="px-3 py-2.5 text-center">
                          <button
                            onClick={() => setReverifyReport(r)}
                            className="p-1 hover:bg-slate-800 rounded text-slate-500 hover:text-indigo-400 transition"
                            title="Stored dossier · click to re-verify against today's sources"
                          >
                            <Lock className="w-3.5 h-3.5" />
                          </button>
                        </td>

                        {/* 2. Run ID + Version */}
                        <td className="px-3 py-2.5 font-mono text-[11px] overflow-hidden">
                          <div className="flex items-center gap-1 min-w-0 whitespace-nowrap">
                            <span className="text-indigo-400 truncate">{r.id.slice(0, 12)}</span>
                            <span className="px-1.5 py-0.2 bg-indigo-500/20 text-indigo-300 rounded text-[9px] font-bold flex-shrink-0">
                              v{r.runVersion || 1}
                            </span>
                          </div>
                        </td>

                        {/* 3. Headline */}
                        <td className="px-3 py-2.5 font-medium text-white overflow-hidden" title={r.title}>
                          <span className="block w-full truncate">{r.title || 'Untitled verification'}</span>
                        </td>

                        {/* 4. Category */}
                        <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">{r.category || 'General'}</td>

                        {/* 5. Source */}
                        <td className="px-3 py-2.5 text-slate-400 overflow-hidden" title={r.inputSource}>
                          <span className="block w-full truncate">{r.inputSource || 'Direct Input'}</span>
                        </td>

                        {/* 6. News Date */}
                        <td className="px-3 py-2.5 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                          {dateFormatted}
                        </td>

                        {/* 7. Run Date */}
                        <td className="px-3 py-2.5 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                          {dateFormatted} · {timeFormatted}
                        </td>

                        {/* 8. Media Tag */}
                        <td className="px-3 py-2.5 text-slate-400 text-[10px] font-mono whitespace-nowrap uppercase">
                          {r.inputType || 'TEXT'}
                        </td>

                        {/* 9. Verdict Badge */}
                        <td className="px-3 py-2.5 overflow-hidden">
                          <VerdictBadge status={r.verdict} size="sm" className="whitespace-nowrap max-w-full" />
                        </td>

                        {/* 10. Trust Score */}
                        <td className={`px-3 py-2.5 text-right font-mono font-bold ${
                          score >= 75 ? 'text-emerald-400' : score >= 40 ? 'text-amber-400' : 'text-rose-400'
                        }`}>
                          {score}
                        </td>

                        {/* 11. Tokens */}
                        <td className="px-3 py-2.5 text-right font-mono text-slate-400">
                          {(r.tokensConsumed || 0).toLocaleString()}
                        </td>

                        {/* 12. Cost */}
                        <td className="px-3 py-2.5 text-right font-mono text-emerald-400 font-medium">
                          ${(r.costUsd || 0.0).toFixed(3)}
                        </td>

                        {/* 13. Action */}
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => navigate(`/results/${r.id}`)}
                              className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition font-medium"
                              title="Open Report"
                            >
                              Open
                            </button>
                            <button
                              onClick={() => setDeleteTarget(r)}
                              className="p-1 hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 rounded-lg transition cursor-pointer"
                              title="Delete report from history"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="13" className="py-16 text-center text-slate-400 text-xs">
                      No verification runs found matching current filter parameters.
                    </td>
                  </tr>
                )}
              </tbody>

              {/* Table Footer: Real Cumulative Totals */}
              <tfoot className="border-t-2 border-slate-800 bg-slate-950/90 font-mono font-bold text-xs text-slate-200">
                <tr>
                  <td colSpan="10" className="px-4 py-3 text-right text-slate-400">
                    Cumulative Total ({filteredRuns.length} Runs Filtered)
                  </td>
                  <td className="px-3 py-3 text-right text-indigo-400">
                    {totalTokens.toLocaleString()}
                  </td>
                  <td className="px-3 py-3 text-right text-emerald-400">
                    ${totalCost.toFixed(3)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <p className="text-[11px] text-slate-500 italic">
          * New dossiers include a SHA-256 integrity seal. Running re-verification applies today's sources and stores a fresh v2 record while preserving the prior version.
        </p>
      </main>

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl animate-fadeIn">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Delete Report?</h3>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">Run ID: {deleteTarget.id.slice(0, 16)}</p>
                </div>
              </div>
              <button
                onClick={() => setDeleteTarget(null)}
                className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800 text-xs text-slate-300 space-y-1.5">
              <span className="font-semibold text-white block truncate" title={deleteTarget.title}>
                {deleteTarget.title || 'Untitled Verification Report'}
              </span>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Permanently removes this stored report, claims audit, evidence nodes, and provenance records from your workspace ledger. This action cannot be undone.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition flex items-center gap-2 shadow-lg shadow-rose-600/20 cursor-pointer"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Report</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reverify Modal */}
      <ReverifyModal
        isOpen={!!reverifyReport}
        onClose={() => setReverifyReport(null)}
        report={reverifyReport}
        onRerunNow={handleRerunNow}
        onRerunWatch={() => navigate('/analysis')}
      />
    </div>
  );
}
