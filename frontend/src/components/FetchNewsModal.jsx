import React, { useState, useEffect } from 'react';
import { X, RefreshCw, Check, Search, Globe, Shield, Sparkles, Filter, Clock, Layers } from 'lucide-react';

const SOURCES_POOL = [
  { n: 'The Standard Ledger', r: 1, a: 96, p: 'Primary corroboration · settles a claim on its own', st: 'Active' },
  { n: 'Meridian Post', r: 1, a: 93, p: 'Primary corroboration · national desk', st: 'Active' },
  { n: 'National Gazette index', r: 1, a: 99, p: 'Document authority · validates circulars and notices', st: 'Active' },
  { n: 'Ledger Analytics', r: 2, a: 81, p: 'Sector data · business and market figures', st: 'Active' },
  { n: 'Wire archive (agency)', r: 1, a: 95, p: 'Image provenance · original frame recovery', st: 'Active' },
  { n: 'VerifyIndia fact desk', r: 2, a: 86, p: 'Prior-debunk lookup · avoids duplicate work', st: 'Active' },
  { n: 'newspulse-now.in', r: 3, a: 52, p: 'Signal only · flags what is spreading', st: 'Active' },
  { n: 'citizenfeed.social', r: 4, a: 24, p: 'Spread tracking · origin and amplification', st: 'Active' },
  { n: 'bharatwire-live.co', r: 4, a: 11, p: 'Watchlist · repeat fabrications', st: 'Flagged' },
  { n: 'taxupdate-express.co', r: 3, a: 44, p: 'Signal only · frequent misreadings', st: 'Active' },
  { n: 'Cap Table Weekly', r: 2, a: 84, p: 'Funding and equity · registrar filings', st: 'Active' },
  { n: 'Bench Report', r: 2, a: 87, p: 'Law · case numbers and orders', st: 'Active' },
  { n: 'startupbuzz-daily.co', r: 4, a: 19, p: 'Watchlist · unverified founder claims', st: 'Flagged' }
];

const CATEGORIES = ['All', 'AI', 'Funding', 'Policy & Governance', 'Finance & Markets', 'Health', 'Elections', 'Law', 'Infrastructure', 'Weather'];

export default function FetchNewsModal({ isOpen, onClose, onFetchComplete, scope = 'latest' }) {
  const [selectedSources, setSelectedSources] = useState(SOURCES_POOL.map(s => s.n));
  const [category, setCategory] = useState('All');
  const [catSearch, setCatSearch] = useState('');
  const [topic, setTopic] = useState('');
  const [timeWindow, setTimeWindow] = useState('24');
  const [itemCap, setItemCap] = useState('10');
  
  const [isFetching, setIsFetching] = useState(false);
  const [fetchProgress, setFetchProgress] = useState(0);
  const [fetchLog, setFetchLog] = useState([]);
  const [fetchClock, setFetchClock] = useState('0.0s');

  useEffect(() => {
    if (!isOpen) {
      setIsFetching(false);
      setFetchProgress(0);
      setFetchLog([]);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSourcePreset = (preset) => {
    if (preset === 'tier1') {
      setSelectedSources(SOURCES_POOL.filter(s => s.r <= 2).map(s => s.n));
    } else if (preset === 'all') {
      setSelectedSources(SOURCES_POOL.map(s => s.n));
    } else {
      setSelectedSources([]);
    }
  };

  const toggleSource = (name) => {
    setSelectedSources(prev => 
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
  };

  const startFetching = () => {
    if (selectedSources.length === 0) return;
    setIsFetching(true);
    setFetchProgress(0);
    setFetchLog([]);
    
    const startTime = Date.now();
    const interval = setInterval(() => {
      setFetchClock(((Date.now() - startTime) / 1000).toFixed(1) + 's');
    }, 100);

    const sourcesToFetch = [...selectedSources];
    let step = 0;
    
    const stepInterval = setInterval(() => {
      if (step < sourcesToFetch.length) {
        const sourceName = sourcesToFetch[step];
        const newCount = Math.floor(Math.random() * 4);
        setFetchLog(prev => [
          ...prev, 
          { source: sourceName, count: newCount, status: newCount > 0 ? `${newCount} new items` : 'No new items' }
        ]);
        step++;
        setFetchProgress(Math.round((step / sourcesToFetch.length) * 100));
      } else {
        clearInterval(stepInterval);
        clearInterval(interval);
        setTimeout(() => {
          setIsFetching(false);
          const totalFetched = Math.floor(Math.random() * 6) + 4;
          onFetchComplete(totalFetched);
          onClose();
        }, 500);
      }
    }, 280);
  };

  const filteredCategories = CATEGORIES.filter(c => c.toLowerCase().includes(catSearch.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-scaleUp">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-400">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Live News Intake & Fetch</h3>
              <p className="text-xs text-slate-400">Pull fresh unverified items directly from your ranked sources.</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 custom-scrollbar text-sm text-slate-200">
          {!isFetching ? (
            <>
              {/* Source Picker */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Sources to Query</span>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleSourcePreset('tier1')} 
                      className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition"
                    >
                      Rank 1–2 Only
                    </button>
                    <button 
                      onClick={() => handleSourcePreset('all')} 
                      className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition"
                    >
                      All Sources
                    </button>
                    <button 
                      onClick={() => handleSourcePreset('none')} 
                      className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="max-h-48 overflow-y-auto border border-slate-800 bg-slate-950/60 rounded-xl p-2 space-y-1 custom-scrollbar">
                  {SOURCES_POOL.map((source) => {
                    const isSelected = selectedSources.includes(source.n);
                    return (
                      <label 
                        key={source.n}
                        onClick={() => toggleSource(source.n)}
                        className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition text-xs select-none ${
                          isSelected ? 'bg-indigo-500/10 border border-indigo-500/30 text-white' : 'hover:bg-slate-800/60 text-slate-400 border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <input 
                            type="checkbox" 
                            checked={isSelected}
                            onChange={() => {}}
                            className="rounded border-slate-700 text-indigo-600 focus:ring-0 w-3.5 h-3.5 bg-slate-800 pointer-events-none"
                          />
                          <div>
                            <span className="font-medium text-slate-200">{source.n}</span>
                            <span className="ml-2 text-[10px] text-slate-500">{source.p}</span>
                          </div>
                        </div>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                          source.r === 1 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                          source.r === 2 ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                          'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}>
                          Rank {source.r}
                        </span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">
                  <span className="text-indigo-400 font-semibold">{selectedSources.length}</span> sources selected.
                </p>
              </div>

              {/* Category Selector */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Category Filter</span>
                  <div className="relative w-44">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input 
                      type="text" 
                      placeholder="Filter category..."
                      value={catSearch}
                      onChange={(e) => setCatSearch(e.target.value)}
                      className="w-full pl-8 pr-2 py-1 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1 bg-slate-950/40 rounded-xl border border-slate-800/80">
                  {filteredCategories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setCategory(cat)}
                      className={`px-3 py-1 text-xs rounded-full border transition ${
                        category === cat 
                          ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm' 
                          : 'bg-slate-800/80 border-slate-700/80 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Topic Query */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Or Specify Topic Keyword (Optional)
                </label>
                <input 
                  type="text"
                  placeholder="e.g. ₹500 currency circular, Metro tender, fuel subsidy rollback"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>

              {/* Window & Cap Options */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Time Horizon</label>
                  <select 
                    value={timeWindow}
                    onChange={(e) => setTimeWindow(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="6">Past 6 hours</option>
                    <option value="24">Past 24 hours</option>
                    <option value="72">Past 3 days</option>
                    <option value="168">Past 7 days</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Item Cap per Source</label>
                  <select 
                    value={itemCap}
                    onChange={(e) => setItemCap(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="5">5 items / source</option>
                    <option value="10">10 items / source</option>
                    <option value="25">25 items / source</option>
                  </select>
                </div>
              </div>

              {/* Zero Token Notice */}
              <div className="p-3 bg-indigo-950/40 border border-indigo-800/40 rounded-xl text-xs text-indigo-300 flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Zero Token Cost:</strong> Fetching headlines is free and consumes 0 tokens from your plan. Tokens are only billed when you select an item to run a DeepTrust verification.
                </span>
              </div>
            </>
          ) : (
            /* Live Fetching Progress State */
            <div className="py-6 space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-mono text-indigo-400 font-medium">Querying {selectedSources.length} sources concurrently...</span>
                <span className="font-mono">{fetchClock}</span>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-all duration-300"
                  style={{ width: `${fetchProgress}%` }}
                />
              </div>

              {/* Live Log */}
              <div className="max-h-56 overflow-y-auto border border-slate-800 bg-slate-950 rounded-xl p-3 space-y-2 font-mono text-xs custom-scrollbar">
                {fetchLog.map((log, i) => (
                  <div key={i} className="flex items-center justify-between text-slate-300 border-b border-slate-900 pb-1">
                    <span className="text-slate-400">{log.source}</span>
                    <span className={log.count > 0 ? 'text-emerald-400 font-semibold' : 'text-slate-500'}>
                      {log.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-900 border-t border-slate-800 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isFetching}
            className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={startFetching}
            disabled={isFetching || selectedSources.length === 0}
            className="px-5 py-2 text-xs font-semibold text-white bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 rounded-xl shadow-lg shadow-indigo-500/20 transition flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            {isFetching ? 'Fetching Live Feeds...' : 'Fetch News'}
          </button>
        </div>
      </div>
    </div>
  );
}
