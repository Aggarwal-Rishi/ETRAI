import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import ReverifyModal from '../components/ReverifyModal';
import { apiUrl } from '../utils/api';
import { 
  Clock, 
  Search, 
  Filter, 
  ExternalLink, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Lock, 
  Unlock, 
  Download, 
  Mail, 
  Sparkles, 
  DollarSign, 
  Zap, 
  Layers 
} from 'lucide-react';

const SAMPLE_HISTORY_RUNS = [
  { id: 'DT-041-018', t: 'Leaked circular: all ₹500 notes stop being legal tender from 1 October', cat: 'Currency policy', s: 'bharatwire-live.co', nd: '17 Aug 2026', rd: '17 Aug 2026 · 19:06', media: 'Image + Video', v: 'fake', sc: 23, tok: 412800, cost: 2.64, runs: 1 },
  { id: 'DT-041-017', t: 'Video: minister appears to announce fuel subsidy rollback in Parliament', cat: 'Energy', s: 'newspulse-now.in', nd: '17 Aug 2026', rd: '17 Aug 2026 · 17:22', media: 'Video', v: 'susp', sc: 41, tok: 298400, cost: 1.91, runs: 1 },
  { id: 'DT-041-016', t: 'Monsoon deficit revised to 8% below normal; sowing window narrows', cat: 'Agriculture', s: 'The Standard Ledger', nd: '17 Aug 2026', rd: '17 Aug 2026 · 16:04', media: 'Image', v: 'real', sc: 91, tok: 96200, cost: 0.58, runs: 1 },
  { id: 'DT-041-015', t: 'Metro Phase-4 tender awarded to consortium; three outlets confirm filing', cat: 'Infrastructure', s: 'Meridian Post', nd: '16 Aug 2026', rd: '17 Aug 2026 · 15:10', media: 'Text', v: 'real', sc: 84, tok: 54600, cost: 0.31, runs: 1 },
  { id: 'DT-041-014', t: '“Bank holiday for 9 days” list circulating on WhatsApp merges 3 years', cat: 'Banking', s: 'forwarded message', nd: '14 Aug 2026', rd: '17 Aug 2026 · 14:02', media: 'Image', v: 'fake', sc: 18, tok: 141900, cost: 0.86, runs: 1 },
  { id: 'DT-041-013', t: 'Photo of flooded international airport terminal is from a 2022 storm', cat: 'Weather', s: 'citizenfeed.social', nd: '11 Jul 2022', rd: '17 Aug 2026 · 12:48', media: 'Image', v: 'fake', sc: 26, tok: 168300, cost: 1.04, runs: 1 },
  { id: 'DT-041-012', t: 'Edtech funding rebounds 14% in Q2, driven by four late-stage rounds', cat: 'Business', s: 'Ledger Analytics', nd: '16 Aug 2026', rd: '17 Aug 2026 · 11:30', media: 'Text', v: 'real', sc: 88, tok: 48100, cost: 0.27, runs: 1 },
  { id: 'DT-041-011', t: 'Screenshot of a “court order” banning a mobile app has no case number', cat: 'Judiciary', s: 'legalbrief-daily.co', nd: '15 Aug 2026', rd: '17 Aug 2026 · 09:55', media: 'Image', v: 'fake', sc: 21, tok: 132700, cost: 0.79, runs: 1 },
  { id: 'DT-041-010', t: 'Health ministry advisory on seasonal flu is genuine but 2 years out of date', cat: 'Health', s: 'wellnessdesk.in', nd: '02 Sep 2024', rd: '17 Aug 2026 · 08:12', media: 'Text', v: 'susp', sc: 47, tok: 61400, cost: 0.36, runs: 1 },
  { id: 'DT-041-009', t: 'Audio clip attributed to state official is a voice clone, spectral analysis shows', cat: 'Politics', s: 'statewatch.today', nd: '16 Aug 2026', rd: '16 Aug 2026 · 23:40', media: 'Audio', v: 'fake', sc: 14, tok: 224500, cost: 1.42, runs: 1 },
  { id: 'DT-041-008', t: 'Rail fare revision notice matches published gazette entry line for line', cat: 'Transport', s: 'The Standard Ledger', nd: '16 Aug 2026', rd: '16 Aug 2026 · 21:18', media: 'Text', v: 'real', sc: 93, tok: 39800, cost: 0.22, runs: 1 },
  { id: 'DT-041-007', t: 'Claim that new tax slab applies retroactively rests on misread footnote', cat: 'Taxation', s: 'taxupdate-express.co', nd: '15 Aug 2026', rd: '16 Aug 2026 · 19:02', media: 'Text', v: 'susp', sc: 38, tok: 57300, cost: 0.33, runs: 1 }
];

export default function HistoryPage() {
  const navigate = useNavigate();
  const [runs, setRuns] = useState(SAMPLE_HISTORY_RUNS);
  const [loading, setLoading] = useState(false);
  
  // Filters
  const [mediaFilter, setMediaFilter] = useState('all');
  const [catFilter, setCatFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState('rd');
  const [sortDir, setSortDir] = useState(-1);

  // Modal
  const [reverifyReport, setReverifyReport] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const categories = ['all', ...new Set(runs.map(r => r.cat))].sort();

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(-sortDir);
    } else {
      setSortKey(key);
      setSortDir(-1);
    }
  };

  const filteredRuns = runs.filter(r => {
    if (mediaFilter !== 'all' && !r.media.toLowerCase().includes(mediaFilter.toLowerCase())) return false;
    if (catFilter !== 'all' && r.cat !== catFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!r.t.toLowerCase().includes(q) && !r.s.toLowerCase().includes(q) && !r.id.toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  }).sort((a, b) => {
    const valA = a[sortKey];
    const valB = b[sortKey];
    if (typeof valA === 'number') return (valA - valB) * sortDir;
    return String(valA).localeCompare(String(valB)) * sortDir;
  });

  const totalTokens = filteredRuns.reduce((acc, r) => acc + r.tok, 0);
  const totalCost = filteredRuns.reduce((acc, r) => acc + r.cost, 0);
  const avgCost = filteredRuns.length > 0 ? (totalCost / filteredRuns.length).toFixed(2) : '0.00';
  const avgTok = filteredRuns.length > 0 ? Math.round(totalTokens / filteredRuns.length).toLocaleString() : '0';

  const exportCSV = () => {
    const headers = 'Run ID,Subject,Category,Source,News Date,Run Date,Media,Verdict,Trust Score,Tokens,Cost (USD)\n';
    const rows = filteredRuns.map(r => 
      `"${r.id}","${r.t.replace(/"/g, '""')}","${r.cat}","${r.s}","${r.nd}","${r.rd}","${r.media}","${r.v}","${r.sc}","${r.tok}","${r.cost}"`
    ).join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `etrai-verification-ledger-${Date.now()}.csv`;
    a.click();
    showToast(`Exported ${filteredRuns.length} rows to CSV`);
  };

  const handleRerunNow = (report) => {
    const updated = runs.map(r => {
      if (r.id === report.id) {
        return {
          ...r,
          runs: (r.runs || 1) + 1,
          rd: 'Just now · 20 Aug',
          tok: r.tok + Math.round(r.tok * 0.95),
          cost: +(r.cost * 1.95).toFixed(2)
        };
      }
      return r;
    });
    setRuns(updated);
    showToast(`Re-verification completed · archived as v${(report.runs || 1) + 1}`);
  };

  const handleRerunWatch = (report) => {
    navigate('/analysis');
  };

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

      <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-6 flex-1 animate-fadeIn">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
              <Clock className="w-6 h-6 text-indigo-400" />
              Verification History & Sealed Ledger
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Every verification run you have generated, with exact tokens consumed, runtime audit logs, and billed costs.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => showToast('Cost breakdown report emailed to your accounts desk')}
              className="px-3.5 py-2 text-xs font-medium bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 rounded-xl transition flex items-center gap-2"
            >
              <Mail className="w-3.5 h-3.5 text-indigo-400" />
              Send Cost Report
            </button>
            <button
              onClick={exportCSV}
              className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-lg shadow-indigo-500/20 transition flex items-center gap-2"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          </div>
        </div>

        {/* 4 Financial & Usage Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl">
            <span className="text-[10px] uppercase font-mono text-slate-400 block mb-1">Runs Shown</span>
            <div className="text-2xl font-bold font-mono text-white">{filteredRuns.length}</div>
            <span className="text-[11px] text-slate-500">310 total this billing cycle</span>
          </div>
          <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl">
            <span className="text-[10px] uppercase font-mono text-slate-400 block mb-1">Tokens Consumed</span>
            <div className="text-2xl font-bold font-mono text-indigo-400">{(totalTokens / 1e6).toFixed(2)}M</div>
            <span className="text-[11px] text-slate-500">Input + output across all agents</span>
          </div>
          <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl">
            <span className="text-[10px] uppercase font-mono text-slate-400 block mb-1">Total Billed Cost</span>
            <div className="text-2xl font-bold font-mono text-emerald-400">${totalCost.toFixed(2)}</div>
            <span className="text-[11px] text-slate-500">Deducted from monthly allowance</span>
          </div>
          <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl">
            <span className="text-[10px] uppercase font-mono text-slate-400 block mb-1">Average Cost / Run</span>
            <div className="text-2xl font-bold font-mono text-cyan-400">${avgCost}</div>
            <span className="text-[11px] text-slate-500 font-mono">~{avgTok} tokens avg</span>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="p-3.5 bg-slate-900/80 border border-slate-800 rounded-2xl flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-400 font-medium">
            <Filter className="w-3.5 h-3.5" /> Filters:
          </div>
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            {categories.map(c => (
              <option key={c} value={c}>
                {c === 'all' ? 'All Categories' : c}
              </option>
            ))}
          </select>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search subject, source or run ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div className="flex items-center gap-1.5">
            {['all', 'image', 'video', 'pdf', 'text'].map(m => (
              <button
                key={m}
                onClick={() => setMediaFilter(m)}
                className={`px-2.5 py-1 rounded-lg capitalize border transition ${
                  mediaFilter === m
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          {(catFilter !== 'all' || searchQuery || mediaFilter !== 'all') && (
            <button
              onClick={() => {
                setCatFilter('all');
                setSearchQuery('');
                setMediaFilter('all');
              }}
              className="text-slate-400 hover:text-white font-medium"
            >
              Clear
            </button>
          )}
        </div>

        {/* 13-Column Ledger Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950 text-slate-400 uppercase font-mono text-[10px]">
                  <th className="px-3 py-3 w-10 text-center" title="Sealed report">
                    <Lock className="w-3.5 h-3.5 mx-auto" />
                  </th>
                  <th className="px-3 py-3 cursor-pointer hover:text-white" onClick={() => handleSort('id')}>
                    Run ID {sortKey === 'id' && (sortDir === 1 ? '↑' : '↓')}
                  </th>
                  <th className="px-4 py-3 cursor-pointer hover:text-white" onClick={() => handleSort('t')}>
                    Subject / Headline {sortKey === 't' && (sortDir === 1 ? '↑' : '↓')}
                  </th>
                  <th className="px-3 py-3 cursor-pointer hover:text-white" onClick={() => handleSort('cat')}>
                    Category {sortKey === 'cat' && (sortDir === 1 ? '↑' : '↓')}
                  </th>
                  <th className="px-3 py-3 cursor-pointer hover:text-white" onClick={() => handleSort('s')}>
                    Source {sortKey === 's' && (sortDir === 1 ? '↑' : '↓')}
                  </th>
                  <th className="px-3 py-3 cursor-pointer hover:text-white" onClick={() => handleSort('nd')}>
                    News Date {sortKey === 'nd' && (sortDir === 1 ? '↑' : '↓')}
                  </th>
                  <th className="px-3 py-3 cursor-pointer hover:text-white" onClick={() => handleSort('rd')}>
                    Run Date {sortKey === 'rd' && (sortDir === 1 ? '↑' : '↓')}
                  </th>
                  <th className="px-3 py-3">Media</th>
                  <th className="px-3 py-3">Verdict</th>
                  <th className="px-3 py-3 text-right cursor-pointer hover:text-white" onClick={() => handleSort('sc')}>
                    Trust {sortKey === 'sc' && (sortDir === 1 ? '↑' : '↓')}
                  </th>
                  <th className="px-3 py-3 text-right cursor-pointer hover:text-white" onClick={() => handleSort('tok')}>
                    Tokens {sortKey === 'tok' && (sortDir === 1 ? '↑' : '↓')}
                  </th>
                  <th className="px-3 py-3 text-right cursor-pointer hover:text-white" onClick={() => handleSort('cost')}>
                    Cost {sortKey === 'cost' && (sortDir === 1 ? '↑' : '↓')}
                  </th>
                  <th className="px-3 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {filteredRuns.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-850 transition">
                    <td className="px-3 py-2.5 text-center">
                      <button
                        onClick={() => setReverifyReport(r)}
                        className="p-1 hover:bg-slate-800 rounded text-slate-500 hover:text-indigo-400 transition"
                        title="Sealed report · click to re-verify against today's sources"
                      >
                        <Lock className="w-3.5 h-3.5" />
                      </button>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] whitespace-nowrap">
                      {r.id}
                      {r.runs > 1 && (
                        <span className="ml-1 px-1.5 py-0.2 bg-indigo-500/20 text-indigo-300 rounded text-[9px] font-bold">
                          v{r.runs}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 max-w-xs font-medium text-white truncate" title={r.t}>
                      {r.t}
                    </td>
                    <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">{r.cat}</td>
                    <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">{r.s}</td>
                    <td className="px-3 py-2.5 text-slate-500 font-mono text-[11px] whitespace-nowrap">{r.nd}</td>
                    <td className="px-3 py-2.5 text-slate-500 font-mono text-[11px] whitespace-nowrap">{r.rd}</td>
                    <td className="px-3 py-2.5 text-slate-400 text-[11px] whitespace-nowrap">{r.media}</td>
                    <td className="px-3 py-2.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                        r.v === 'fake' ? 'bg-rose-500/20 text-rose-300' :
                        r.v === 'susp' ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'
                      }`}>
                        {r.v}
                      </span>
                    </td>
                    <td className={`px-3 py-2.5 text-right font-mono font-bold ${
                      r.sc >= 75 ? 'text-emerald-400' : r.sc >= 40 ? 'text-amber-400' : 'text-rose-400'
                    }`}>
                      {r.sc}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-400">
                      {r.tok.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-emerald-400 font-medium">
                      ${r.cost.toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <button
                        onClick={() => navigate(`/results/${r.id}`)}
                        className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition"
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-800 bg-slate-950/80 font-mono font-semibold text-xs text-slate-300">
                <tr>
                  <td colSpan="10" className="px-4 py-3 text-right text-slate-400">
                    Cumulative Total ({filteredRuns.length} Runs)
                  </td>
                  <td className="px-3 py-3 text-right text-indigo-400">
                    {totalTokens.toLocaleString()}
                  </td>
                  <td className="px-3 py-3 text-right text-emerald-400">
                    ${totalCost.toFixed(2)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <p className="text-xs text-slate-500 italic">
          * Every report is cryptographic sealed upon generation. Running re-verification applies today's sources and stores a fresh version while preserving original v1 audit records.
        </p>
      </main>

      {/* Reverify Modal */}
      <ReverifyModal
        isOpen={!!reverifyReport}
        onClose={() => setReverifyReport(null)}
        report={reverifyReport}
        onRerunNow={handleRerunNow}
        onRerunWatch={handleRerunWatch}
      />
    </div>
  );
}
