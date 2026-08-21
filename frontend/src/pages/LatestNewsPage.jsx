import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Radio, RefreshCw, Filter, Search, ShieldCheck, AlertTriangle, ShieldX, Sparkles, Clock, FileText, CheckCircle2 } from 'lucide-react';
import FetchNewsModal from '../components/FetchNewsModal';

const INITIAL_NEWS = [
  { id: 'DT-041-018', t: 'Leaked circular: all ₹500 notes stop being legal tender from 1 October', s: 'bharatwire-live.co', tm: '2h ago', v: 'fake', sc: 23, cat: 'Currency policy', media: 'Image + video', lead: true },
  { id: 'DT-041-017', t: 'Video: minister appears to announce fuel subsidy rollback in Parliament', s: 'newspulse-now.in', tm: '4h ago', v: 'susp', sc: 41, cat: 'Energy', media: 'Video' },
  { id: 'DT-041-016', t: 'Monsoon deficit revised to 8% below normal; sowing window narrows in three states', s: 'The Standard Ledger', tm: '5h ago', v: 'real', sc: 91, cat: 'Agriculture', media: 'Image' },
  { id: 'DT-041-015', t: 'Metro Phase-4 tender awarded to consortium; three outlets confirm filing', s: 'Meridian Post', tm: '6h ago', v: 'real', sc: 84, cat: 'Infrastructure', media: 'Text' },
  { id: 'DT-041-014', t: '“Bank holiday for 9 days” list circulating on WhatsApp merges three different years', s: 'forwarded message', tm: '7h ago', v: 'fake', sc: 18, cat: 'Banking', media: 'Image' },
  { id: 'DT-041-013', t: 'Photo of flooded international airport terminal is from a 2022 storm, not this week', s: 'citizenfeed.social', tm: '8h ago', v: 'fake', sc: 26, cat: 'Weather', media: 'Image' },
  { id: 'DT-041-012', t: 'Edtech funding rebounds 14% in Q2, driven by four late-stage rounds', s: 'Ledger Analytics', tm: '9h ago', v: 'real', sc: 88, cat: 'Business', media: 'Text' },
  { id: 'DT-041-011', t: 'Screenshot of a “court order” banning a mobile app has no matching case number', s: 'legalbrief-daily.co', tm: '11h ago', v: 'fake', sc: 21, cat: 'Judiciary', media: 'Image' },
  { id: 'DT-041-010', t: 'Health ministry advisory on seasonal flu is genuine but two years out of date', s: 'wellnessdesk.in', tm: '13h ago', v: 'susp', sc: 47, cat: 'Health', media: 'Text' },
  { id: 'DT-041-009', t: 'Audio clip attributed to state official is a voice clone, spectral analysis shows', s: 'statewatch.today', tm: '15h ago', v: 'fake', sc: 14, cat: 'Politics', media: 'Audio' },
  { id: 'DT-041-008', t: 'Rail fare revision notice matches published gazette entry line for line', s: 'The Standard Ledger', tm: '18h ago', v: 'real', sc: 93, cat: 'Transport', media: 'Text' },
  { id: 'DT-041-007', t: 'Claim that new tax slab applies retroactively rests on misread footnote', s: 'taxupdate-express.co', tm: '21h ago', v: 'susp', sc: 38, cat: 'Taxation', media: 'Text' }
];

export default function LatestNewsPage() {
  const navigate = useNavigate();
  const [feed, setFeed] = useState(INITIAL_NEWS);
  const [verdictFilter, setVerdictFilter] = useState('all');
  const [selectedCat, setSelectedCat] = useState('all');
  const [selectedSrc, setSelectedSrc] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isFetchModalOpen, setIsFetchModalOpen] = useState(false);
  const [autoFetch, setAutoFetch] = useState(true);
  const [toastMessage, setToastMessage] = useState(null);

  const categories = ['all', ...new Set(feed.map(f => f.cat))].sort();
  const sources = ['all', ...new Set(feed.map(f => f.s))].sort();

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleFetchComplete = (count) => {
    const newItems = [
      {
        id: 'DT-041-N' + Date.now().toString().slice(-4),
        t: 'RBI releases updated Master Circular on priority sector lending targets',
        s: 'The Standard Ledger',
        tm: 'just now',
        v: 'unv',
        sc: null,
        cat: 'Finance & Markets',
        media: 'PDF',
        isNew: true
      },
      {
        id: 'DT-041-N' + (Date.now() + 1).toString().slice(-4),
        t: 'Claims of nationwide fuel supply disruption dismissed by ministry',
        s: 'Meridian Post',
        tm: 'just now',
        v: 'unv',
        sc: null,
        cat: 'Energy',
        media: 'Text',
        isNew: true
      }
    ];
    setFeed(prev => [...newItems, ...prev]);
    showToast(`Fetched ${count} items from active news feeds · zero tokens consumed`);
  };

  const filteredFeed = feed.filter(item => {
    if (verdictFilter === 'real' && item.v !== 'real') return false;
    if (verdictFilter === 'susp' && item.v !== 'susp') return false;
    if (verdictFilter === 'fake' && item.v !== 'fake') return false;
    if (verdictFilter === 'unv' && item.v !== 'unv') return false;
    if (verdictFilter === 'media' && item.media === 'Text') return false;
    if (selectedCat !== 'all' && item.cat !== selectedCat) return false;
    if (selectedSrc !== 'all' && item.s !== selectedSrc) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!item.t.toLowerCase().includes(q) && !item.s.toLowerCase().includes(q) && !item.cat.toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 animate-fadeIn">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 bg-slate-800 border border-slate-700 text-white text-xs rounded-full shadow-2xl flex items-center gap-2 animate-slideUp">
          <Sparkles className="w-4 h-4 text-indigo-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <Radio className="w-6 h-6 text-indigo-400 animate-pulse" />
            Live News Desk
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Real-time feed from your ranked news outlets and watchlists, scored on intake.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setAutoFetch(!autoFetch);
              showToast(`Auto-fetch ${!autoFetch ? 'enabled (15 min interval)' : 'paused'}`);
            }}
            className={`px-3.5 py-2 text-xs font-medium rounded-xl border transition flex items-center gap-2 ${
              autoFetch
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Auto-fetch: {autoFetch ? 'On (15m)' : 'Off'}
          </button>
          <button
            onClick={() => setIsFetchModalOpen(true)}
            className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-lg shadow-indigo-500/20 transition flex items-center gap-2"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Fetch News
          </button>
        </div>
      </div>

      {/* Verdict Filter Buttons */}
      <div className="flex flex-wrap gap-2 pt-1">
        {[
          { key: 'all', label: 'All Items' },
          { key: 'real', label: 'Verified Real' },
          { key: 'susp', label: 'Suspicious' },
          { key: 'fake', label: 'Flagged Fake' },
          { key: 'unv', label: 'Unverified Intake' },
          { key: 'media', label: 'Has Media Assets' }
        ].map(btn => (
          <button
            key={btn.key}
            onClick={() => setVerdictFilter(btn.key)}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-full border transition ${
              verdictFilter === btn.key
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm'
                : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
            }`}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* Filter Control Bar */}
      <div className="p-3.5 bg-slate-900/80 border border-slate-800 rounded-2xl flex flex-wrap items-center gap-3 text-xs">
        <div className="flex items-center gap-2 text-slate-400 font-medium">
          <Filter className="w-3.5 h-3.5" /> Filter:
        </div>
        <select
          value={selectedCat}
          onChange={(e) => setSelectedCat(e.target.value)}
          className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-indigo-500"
        >
          {categories.map(c => (
            <option key={c} value={c}>
              {c === 'all' ? 'All Categories' : c}
            </option>
          ))}
        </select>
        <select
          value={selectedSrc}
          onChange={(e) => setSelectedSrc(e.target.value)}
          className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-indigo-500"
        >
          {sources.map(s => (
            <option key={s} value={s}>
              {s === 'all' ? 'All Sources' : s}
            </option>
          ))}
        </select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search news headlines or sources..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-indigo-500"
          />
        </div>
        {(selectedCat !== 'all' || selectedSrc !== 'all' || searchQuery || verdictFilter !== 'all') && (
          <button
            onClick={() => {
              setSelectedCat('all');
              setSelectedSrc('all');
              setSearchQuery('');
              setVerdictFilter('all');
            }}
            className="text-slate-400 hover:text-white font-medium"
          >
            Clear
          </button>
        )}
        <span className="text-slate-500 font-mono ml-auto text-[11px]">
          {filteredFeed.length} stories
        </span>
      </div>

      {/* Feed List */}
      <div className="space-y-2.5">
        {filteredFeed.map(item => {
          const isVerified = item.sc !== null;
          return (
            <div
              key={item.id}
              onClick={() => {
                if (isVerified) {
                  navigate(`/results/${item.id}`);
                } else {
                  navigate('/analysis');
                }
              }}
              className="p-4 bg-slate-900/60 hover:bg-slate-850 border border-slate-800/80 hover:border-slate-700 rounded-2xl flex items-center justify-between gap-4 cursor-pointer transition group shadow-sm"
            >
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {item.isNew && (
                    <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-md text-[10px] font-mono font-bold animate-pulse">
                      NEW INTAKE
                    </span>
                  )}
                  <span className="text-xs font-semibold text-slate-300">{item.s}</span>
                  <span className="text-slate-600">·</span>
                  <span className="text-xs text-slate-400">{item.tm}</span>
                  <span className="text-slate-600">·</span>
                  <span className="px-2 py-0.5 bg-slate-800 text-slate-400 rounded-md text-[10px] font-mono">
                    {item.cat}
                  </span>
                  <span className="px-2 py-0.5 bg-slate-800 text-slate-400 rounded-md text-[10px] font-mono">
                    {item.media}
                  </span>
                </div>
                <h3 className="text-sm font-medium text-white group-hover:text-indigo-300 transition line-clamp-2">
                  {item.t}
                </h3>
              </div>

              {/* Trust Score or Run CTA */}
              <div className="flex-shrink-0 text-right">
                {isVerified ? (
                  <div className="flex flex-col items-end">
                    <span className={`text-xl font-bold font-mono ${
                      item.sc >= 75 ? 'text-emerald-400' :
                      item.sc >= 40 ? 'text-amber-400' : 'text-rose-400'
                    }`}>
                      {item.sc}
                    </span>
                    <span className="text-[10px] uppercase font-mono text-slate-400">Trust Score</span>
                  </div>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate('/analysis');
                    }}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-medium shadow-md shadow-indigo-500/20 transition"
                  >
                    Run DeepTrust
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Fetch News Modal */}
      <FetchNewsModal
        isOpen={isFetchModalOpen}
        onClose={() => setIsFetchModalOpen(false)}
        onFetchComplete={handleFetchComplete}
        scope="latest"
      />
    </div>
  );
}
