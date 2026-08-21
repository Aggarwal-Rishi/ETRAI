import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, AlertTriangle, RefreshCw, Mail, ArrowRight, Filter, Search, Sparkles } from 'lucide-react';
import FetchNewsModal from '../components/FetchNewsModal';

const FAKE_FEED = [
  { id: 'DT-041-018', t: 'Leaked circular: all ₹500 notes stop being legal tender from 1 October', s: 'bharatwire-live.co', tm: '2h ago', v: 'fake', sc: 23, cat: 'Currency policy', media: 'Image + video', lead: true, cluster: 'Currency withdrawal rumour' },
  { id: 'DT-041-014', t: '“Bank holiday for 9 days” list circulating on WhatsApp merges three different years', s: 'forwarded message', tm: '7h ago', v: 'fake', sc: 18, cat: 'Banking', media: 'Image', cluster: '9-day bank holiday list' },
  { id: 'DT-041-013', t: 'Photo of flooded international airport terminal is from a 2022 storm, not this week', s: 'citizenfeed.social', tm: '8h ago', v: 'fake', sc: 26, cat: 'Weather', media: 'Image', cluster: 'Airport flood recycle' },
  { id: 'DT-041-011', t: 'Screenshot of a “court order” banning a mobile app has no matching case number', s: 'legalbrief-daily.co', tm: '11h ago', v: 'fake', sc: 21, cat: 'Judiciary', media: 'Image', cluster: 'App ban order fake' },
  { id: 'DT-041-009', t: 'Audio clip attributed to state official is a voice clone, spectral analysis shows', s: 'statewatch.today', tm: '15h ago', v: 'fake', sc: 14, cat: 'Politics', media: 'Audio', cluster: 'Official voice clone' },
  { id: 'DT-041-005', t: '“$12M seed round” claimed by an AI startup has no registrar filing 40 days on', s: 'startupbuzz-daily.co', tm: '1d ago', v: 'fake', sc: 22, cat: 'Funding', media: 'Text', cluster: 'Unregistered funding' },
  { id: 'DT-041-004', t: 'Screenshot of a court order “banning an AI model” carries no case number', s: 'legalbrief-daily.co', tm: '1d ago', v: 'fake', sc: 17, cat: 'Law', media: 'Image', cluster: 'AI ban order fake' },
  { id: 'DT-041-003', t: 'Scheme promising guaranteed 24% monthly returns is unregistered, filings show', s: 'Bench Report', tm: '1d ago', v: 'fake', sc: 31, cat: 'Investment', media: 'Text', cluster: 'Ponzi scheme advisory' }
];

export default function FakeNewsPage() {
  const navigate = useNavigate();
  const [feed, setFeed] = useState(FAKE_FEED);
  const [selectedCat, setSelectedCat] = useState('all');
  const [selectedSrc, setSelectedSrc] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isFetchModalOpen, setIsFetchModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  const categories = ['all', ...new Set(feed.map(f => f.cat))].sort();
  const sources = ['all', ...new Set(feed.map(f => f.s))].sort();

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const filteredFeed = feed.filter(item => {
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
            <ShieldAlert className="w-6 h-6 text-rose-500" />
            Fake News Desk
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Stories scored below 40 with confirmed contradictions, grouped by the narrative they push.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => showToast('Daily digest queued — you will receive it at 8:00 AM')}
            className="px-3.5 py-2 text-xs font-medium bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 rounded-xl transition flex items-center gap-2"
          >
            <Mail className="w-3.5 h-3.5 text-indigo-400" />
            Daily 8am Digest
          </button>
          <button
            onClick={() => setIsFetchModalOpen(true)}
            className="px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 rounded-xl shadow-lg shadow-rose-500/20 transition flex items-center gap-2"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Fetch News
          </button>
        </div>
      </div>

      {/* Active Narrative Cluster Warning Banner */}
      <div className="p-4.5 bg-rose-950/40 border border-rose-500/40 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg shadow-rose-950/30">
        <div className="flex items-start sm:items-center gap-3">
          <div className="p-2 bg-rose-500/20 border border-rose-500/30 rounded-xl text-rose-400 flex-shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-rose-500 text-white rounded text-[10px] font-mono font-bold">
                ACTIVE CLUSTER
              </span>
              <span className="font-semibold text-white text-sm">Currency withdrawal rumour</span>
            </div>
            <p className="text-xs text-rose-200/80 mt-1">
              38 posts across 6 domains, all tracing back to a single anonymous Telegram forward at 04:12 IST.
            </p>
          </div>
        </div>
        <button
          onClick={() => navigate('/results/DT-041-018')}
          className="px-3.5 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-xl shadow-md shadow-rose-600/30 transition flex items-center gap-1.5 flex-shrink-0"
        >
          Open Lead Report <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Filter Control Bar */}
      <div className="p-3.5 bg-slate-900/80 border border-slate-800 rounded-2xl flex flex-wrap items-center gap-3 text-xs">
        <div className="flex items-center gap-2 text-slate-400 font-medium">
          <Filter className="w-3.5 h-3.5" /> Filter:
        </div>
        <select
          value={selectedCat}
          onChange={(e) => setSelectedCat(e.target.value)}
          className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-rose-500"
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
          className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-rose-500"
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
            placeholder="Search debunked headlines or clusters..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-rose-500"
          />
        </div>
        {(selectedCat !== 'all' || selectedSrc !== 'all' || searchQuery) && (
          <button
            onClick={() => {
              setSelectedCat('all');
              setSelectedSrc('all');
              setSearchQuery('');
            }}
            className="text-slate-400 hover:text-white font-medium"
          >
            Clear
          </button>
        )}
        <span className="text-slate-500 font-mono ml-auto text-[11px]">
          {filteredFeed.length} debunked stories
        </span>
      </div>

      {/* Feed List */}
      <div className="space-y-2.5">
        {filteredFeed.map(item => (
          <div
            key={item.id}
            onClick={() => navigate(`/results/${item.id}`)}
            className="p-4 bg-slate-900/60 hover:bg-slate-850 border border-slate-800/80 hover:border-rose-500/30 rounded-2xl flex items-center justify-between gap-4 cursor-pointer transition group shadow-sm"
          >
            <div className="space-y-1.5 flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-md text-[10px] font-mono font-bold">
                  FLAGGED FAKE
                </span>
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
                <span className="text-xs text-indigo-400 font-mono ml-1">
                  Cluster: {item.cluster}
                </span>
              </div>
              <h3 className="text-sm font-medium text-white group-hover:text-rose-300 transition line-clamp-2">
                {item.t}
              </h3>
            </div>

            {/* Trust Score */}
            <div className="flex-shrink-0 text-right">
              <span className="text-xl font-bold font-mono text-rose-400 block">
                {item.sc}
              </span>
              <span className="text-[10px] uppercase font-mono text-slate-400">Trust Score</span>
            </div>
          </div>
        ))}
      </div>

      {/* Fetch News Modal */}
      <FetchNewsModal
        isOpen={isFetchModalOpen}
        onClose={() => setIsFetchModalOpen(false)}
        onFetchComplete={(c) => showToast(`Fetched ${c} items · zero tokens consumed`)}
        scope="fake"
      />
    </div>
  );
}
