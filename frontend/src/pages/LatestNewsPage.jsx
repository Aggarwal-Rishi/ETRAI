import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import VerdictBadge from '../components/VerdictBadge';
import FetchNewsModal from '../components/FetchNewsModal';
import { apiUrl } from '../utils/api';
import {
  Radio,
  Filter,
  Search,
  RefreshCw,
  Plus,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  Film,
  Image,
  Info,
  Clock,
  Sparkles
} from 'lucide-react';

export default function LatestNewsPage() {
  const navigate = useNavigate();
  const [newsFeed, setNewsFeed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedVerdict, setSelectedVerdict] = useState('ALL'); // 'ALL' | 'REAL' | 'SUSPICIOUS' | 'FAKE' | 'UNVERIFIED' | 'MEDIA'
  const [selectedCat, setSelectedCat] = useState('All');
  const [selectedSrc, setSelectedSrc] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isFetchModalOpen, setIsFetchModalOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Fetch live news from real backend endpoint
  useEffect(() => {
    let isMounted = true;
    async function loadNews() {
      try {
        setLoading(true);
        const token = localStorage.getItem('etrai_token');
        const headers = token ? { Authorization: `Bearer ${token}` } : {};

        const res = await fetch(apiUrl('/api/v1/news'), { headers });
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.items) {
            setNewsFeed(data.items);
          }
        }
      } catch (err) {
        // Feed will fall back gracefully
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadNews();
    return () => { isMounted = false; };
  }, []);

  const categories = ['All', ...new Set(newsFeed.map(i => i.category || 'General'))].sort();
  const sources = ['All', ...new Set(newsFeed.map(i => i.source || i.domain || 'Direct Input'))].sort();

  // Filter logic
  const filteredFeed = newsFeed.filter(item => {
    // Verdict Filter
    const score = item.trustScore !== null && item.trustScore !== undefined ? item.trustScore : item.score;
    const verdict = (item.verdict || '').toUpperCase();

    if (selectedVerdict === 'REAL' && !(score >= 75 || verdict === 'REAL' || verdict === 'VERIFIED')) return false;
    if (selectedVerdict === 'SUSPICIOUS' && !((score >= 40 && score < 75) || verdict === 'SUSPICIOUS')) return false;
    if (selectedVerdict === 'FAKE' && !(score < 40 || verdict === 'FAKE' || verdict === 'FALSE')) return false;
    if (selectedVerdict === 'UNVERIFIED' && score !== undefined && score !== null && !item.isUnverified) return false;
    if (selectedVerdict === 'MEDIA' && !['IMAGE', 'VIDEO'].includes((item.mediaType || item.media || '').toUpperCase())) return false;

    // Dropdown filters
    if (selectedCat !== 'All' && (item.category || 'General') !== selectedCat) return false;
    if (selectedSrc !== 'All' && (item.source || item.domain || 'Direct Input') !== selectedSrc) return false;

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const title = (item.title || item.t || '').toLowerCase();
      const src = (item.source || item.domain || '').toLowerCase();
      if (!title.includes(q) && !src.includes(q)) return false;
    }

    return true;
  });

  return (
    <div className="min-h-screen bg-[#FFF6E3] text-[#0B5CD5] flex flex-col font-sans">
      <Navbar />

      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 bg-[#000D59] border border-[#D97757] text-[#EDE7DC] text-xs rounded-full shadow-2xl flex items-center gap-2 animate-slideUp">
          <Sparkles className="w-4 h-4 text-[#E88F6B]" />
          <span>{toastMsg}</span>
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 animate-fadeIn">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0B5CD5] flex items-center gap-2.5">
              <Radio className="w-6 h-6 text-[#D97757]" />
              Latest News Desk
            </h1>
            <p className="text-xs sm:text-sm text-[#2C4E86] mt-1">
              Live intake of analyzed stories and candidate items across your ranked sources.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsFetchModalOpen(true)}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#D97757] hover:bg-[#B0512F] rounded-xl shadow-md transition flex items-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Fetch News</span>
            </button>
          </div>
        </div>

        {/* Auto-Fetch Status Banner (Honest Scope Declaration) */}
        <div className="p-4 bg-white border border-[#CECECE] rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#F6E7DF] text-[#B0512F] rounded-xl border border-[#E88F6B]/30">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <span className="font-semibold text-[#0B5CD5] block">
                Scheduled Ingestion: Manual & On-Demand
              </span>
              <span className="text-[#2C4E86] text-[11px]">
                Continuous automated cron polling is scheduled for Phase 2. Use "Fetch News" for on-demand multi-source intake.
              </span>
            </div>
          </div>
          <span className="px-2.5 py-1 bg-[#EFEEE9] text-[#0B5CD5] rounded-lg font-mono text-[10px] font-bold uppercase border border-[#CECECE]">
            On-Demand Active
          </span>
        </div>

        {/* Verdict Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 pb-1 border-b border-[#CECECE]">
          {[
            { key: 'ALL', label: 'All Items' },
            { key: 'REAL', label: 'Verified Real' },
            { key: 'SUSPICIOUS', label: 'Suspicious' },
            { key: 'FAKE', label: 'Flagged Fake' },
            { key: 'UNVERIFIED', label: 'Not Verified' },
            { key: 'MEDIA', label: 'Has Media Assets' }
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setSelectedVerdict(tab.key)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition ${
                selectedVerdict === tab.key
                  ? 'bg-[#D97757] border-[#D97757] text-white shadow-md'
                  : 'bg-[#EFEEE9] border-[#CECECE] text-[#2C4E86] hover:text-[#0B5CD5] hover:border-[#AAAAAA]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Filter Control Bar */}
        <div className="p-3.5 bg-white border border-[#CECECE] rounded-2xl flex flex-wrap items-center gap-3 text-xs shadow-sm">
          <div className="flex items-center gap-2 text-[#2C4E86] font-medium">
            <Filter className="w-3.5 h-3.5" /> Filters:
          </div>

          <select
            value={selectedCat}
            onChange={(e) => setSelectedCat(e.target.value)}
            className="px-3 py-1.5 bg-[#F8F8F6] border border-[#CECECE] rounded-xl text-[#0B5CD5] focus:outline-none focus:border-[#D97757]"
          >
            {categories.map(c => (
              <option key={c} value={c}>{c === 'All' ? 'All Categories' : c}</option>
            ))}
          </select>

          <select
            value={selectedSrc}
            onChange={(e) => setSelectedSrc(e.target.value)}
            className="px-3 py-1.5 bg-[#F8F8F6] border border-[#CECECE] rounded-xl text-[#0B5CD5] focus:outline-none focus:border-[#D97757]"
          >
            {sources.map(s => (
              <option key={s} value={s}>{s === 'All' ? 'All Sources' : s}</option>
            ))}
          </select>

          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-[#7386A8] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search headline, claim, or source domain..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-[#F8F8F6] border border-[#CECECE] rounded-xl text-[#0B5CD5] focus:outline-none focus:border-[#D97757]"
            />
          </div>

          {(selectedCat !== 'All' || selectedSrc !== 'All' || searchQuery) && (
            <button
              onClick={() => {
                setSelectedCat('All');
                setSelectedSrc('All');
                setSearchQuery('');
              }}
              className="text-[#7386A8] hover:text-[#0B5CD5] font-medium"
            >
              Clear
            </button>
          )}

          <span className="text-[#7386A8] font-mono text-[11px] ml-auto">
            {filteredFeed.length} items shown
          </span>
        </div>

        {/* Live News Feed List */}
        <div className="space-y-3">
          {loading ? (
            <div className="py-16 text-center text-xs text-[#7386A8] font-mono flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-[#D97757]" />
              <span>Querying verified intelligence feeds...</span>
            </div>
          ) : filteredFeed.length > 0 ? (
            filteredFeed.map((item, idx) => {
              const score = item.trustScore !== null && item.trustScore !== undefined ? item.trustScore : item.score;
              
              return (
                <div
                  key={item.id || idx}
                  onClick={() => {
                    if (item.analysisId || item.id) {
                      navigate(`/results/${item.analysisId || item.id}`);
                    }
                  }}
                  className="p-4 bg-white hover:bg-[#F8F8F6] border border-[#CECECE] hover:border-[#D97757] rounded-2xl cursor-pointer transition flex flex-col sm:flex-row sm:items-center justify-between gap-4 group shadow-sm"
                >
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap text-xs text-[#7386A8]">
                      <span className="font-semibold text-[#0B5CD5]">{item.source || item.domain || 'Direct Source'}</span>
                      <span>·</span>
                      <span className="text-[#7386A8]">{item.publishedAt || item.tm || 'Recent'}</span>
                      <span>·</span>
                      <span className="px-2 py-0.5 bg-[#EFEEE9] text-[#2C4E86] rounded font-mono text-[10px]">
                        {item.category || 'General'}
                      </span>
                      {item.mediaType && (
                        <span className="px-2 py-0.5 bg-[#EFEEE9] text-[#0B5CD5] rounded font-mono text-[10px]">
                          {item.mediaType}
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-semibold text-[#0B5CD5] group-hover:text-[#D97757] transition line-clamp-2">
                      {item.title || item.t}
                    </h3>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0 self-end sm:self-center">
                    {score !== undefined && score !== null ? (
                      <div className="flex items-center gap-3">
                        <VerdictBadge status={item.verdict} size="sm" />
                        <div className="text-right">
                          <span className={`font-mono text-base font-bold block ${
                            score >= 75 ? 'text-[#3E7A55]' : score >= 40 ? 'text-[#B98520]' : 'text-[#B23F35]'
                          }`}>
                            {score}
                          </span>
                          <span className="text-[9px] uppercase font-mono text-[#7386A8]">Trust / 100</span>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate('/analysis', { state: { initialText: item.title || item.t } });
                        }}
                        className="px-3.5 py-1.5 bg-[#D97757] hover:bg-[#B0512F] text-white font-bold rounded-xl text-xs shadow-md flex items-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Run DeepTrust</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-16 text-center bg-white rounded-3xl border border-dashed border-[#CECECE] text-xs text-[#7386A8] space-y-2 shadow-sm">
              <Radio className="w-6 h-6 text-[#D97757] mx-auto" />
              <p className="font-bold text-[#0B5CD5] text-sm">No news stories matching current filters</p>
              <p className="text-[#2C4E86] max-w-sm mx-auto">
                Adjust your category, source, or verdict filters to view analyzed items.
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Fetch News Modal */}
      <FetchNewsModal
        isOpen={isFetchModalOpen}
        onClose={() => setIsFetchModalOpen(false)}
        onFetchComplete={(c) => showToast(`Fetched ${c} new items · zero tokens consumed`)}
      />
    </div>
  );
}
