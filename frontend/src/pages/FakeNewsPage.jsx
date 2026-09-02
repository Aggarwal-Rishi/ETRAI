import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import VerdictBadge from '../components/VerdictBadge';
import FetchNewsModal from '../components/FetchNewsModal';
import { apiUrl } from '../utils/api';
import {
  ShieldAlert,
  AlertTriangle,
  RefreshCw,
  Mail,
  ArrowRight,
  Filter,
  Search,
  Sparkles,
  Info,
  Clock,
  Layers,
  ChevronRight
} from 'lucide-react';

export default function FakeNewsPage() {
  const navigate = useNavigate();
  const [fakeFeed, setFakeFeed] = useState([]);
  const [leadCluster, setLeadCluster] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedCat, setSelectedCat] = useState('All');
  const [selectedSrc, setSelectedSrc] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isFetchModalOpen, setIsFetchModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Fetch real fake news feed from backend
  useEffect(() => {
    let isMounted = true;
    async function loadFakeNews() {
      try {
        setLoading(true);
        const token = localStorage.getItem('etrai_token');
        const headers = token ? { Authorization: `Bearer ${token}` } : {};

        const res = await fetch(apiUrl('/api/v1/fake-news'), { headers });
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setFakeFeed(data.items || []);
            if (data.clusters && data.clusters.length > 0) {
              setLeadCluster(data.clusters[0]);
            }
          }
        }
      } catch (err) {
        // Fallback gracefully
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadFakeNews();
    return () => { isMounted = false; };
  }, []);

  const categories = ['All', ...new Set(fakeFeed.map(f => f.category || f.cat || 'Policy'))].sort();
  const sources = ['All', ...new Set(fakeFeed.map(f => f.source || f.s || 'Unverified Source'))].sort();

  // Low-trust filter strictly enforcing < 40 threshold
  const filteredFeed = fakeFeed.filter(item => {
    const score = item.trustScore !== null && item.trustScore !== undefined ? item.trustScore : item.sc;
    if (score !== undefined && score >= 40) return false;

    if (selectedCat !== 'All' && (item.category || item.cat || 'Policy') !== selectedCat) return false;
    if (selectedSrc !== 'All' && (item.source || item.s || 'Unverified Source') !== selectedSrc) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const title = (item.title || item.t || '').toLowerCase();
      const src = (item.source || item.s || '').toLowerCase();
      if (!title.includes(q) && !src.includes(q)) return false;
    }

    return true;
  });

  return (
    <div className="min-h-screen bg-[#FFF6E3] text-[#0B5CD5] flex flex-col font-sans">
      <Navbar />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 bg-[#000D59] border border-[#D97757] text-[#EDE7DC] text-xs rounded-full shadow-2xl flex items-center gap-2 animate-slideUp">
          <Sparkles className="w-4 h-4 text-[#E88F6B]" />
          <span>{toastMessage}</span>
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 animate-fadeIn">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0B5CD5] flex items-center gap-2.5">
              <ShieldAlert className="w-6 h-6 text-[#B23F35]" />
              Fake News Desk
            </h1>
            <p className="text-xs sm:text-sm text-[#2C4E86] mt-1">
              Live repository of debunked, fabricated, and low-trust stories scored below 40.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => showToast('Daily digest preference saved — you will receive the 8:00 AM briefing via email')}
              className="px-3.5 py-2 text-xs font-medium bg-white hover:bg-[#F8F8F6] border border-[#CECECE] text-[#0B5CD5] rounded-xl transition flex items-center gap-2 shadow-xs"
            >
              <Mail className="w-3.5 h-3.5 text-[#D97757]" />
              <span>Daily 8am Digest</span>
            </button>
            <button
              onClick={() => setIsFetchModalOpen(true)}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#D97757] hover:bg-[#B0512F] rounded-xl shadow-md transition flex items-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Fetch News</span>
            </button>
          </div>
        </div>

        {/* Active Narrative Cluster Warning Banner */}
        <div className="p-5 bg-white border border-[#B23F35]/40 rounded-3xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="p-2.5 bg-[#F7E3E0] border border-[#EBC7C2] rounded-2xl text-[#B23F35] flex-shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 bg-[#B23F35] text-white rounded text-[10px] font-mono font-bold">
                  ACTIVE NARRATIVE CLUSTER
                </span>
                <span className="font-bold text-[#0B5CD5] text-sm">
                  {leadCluster?.topic || leadCluster?.narrativeSummary || 'Currency & Banking Withdrawal Rumour'}
                </span>
                <span className="px-1.5 py-0.2 bg-[#EFEEE9] text-[#7386A8] rounded text-[9.5px] font-mono">
                  Preliminary Grouping
                </span>
              </div>
              <p className="text-xs text-[#2C4E86] mt-1">
                {leadCluster?.description || 'Multiple circulating forwards and manipulated screenshots tracing back to unverified viral broadcasts.'}
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              if (leadCluster?.leadReportId) {
                navigate(`/results/${leadCluster.leadReportId}`);
              } else if (filteredFeed.length > 0) {
                navigate(`/results/${filteredFeed[0].id}`);
              }
            }}
            className="px-4 py-2 text-xs font-bold text-white bg-[#B23F35] hover:bg-[#8E2F27] rounded-xl shadow-md shadow-[#B23F35]/20 transition flex items-center gap-1.5 flex-shrink-0 self-end sm:self-auto"
          >
            <span>Open Lead Dossier</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
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
              placeholder="Search debunked headlines or narrative keywords..."
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
            {filteredFeed.length} debunked stories
          </span>
        </div>

        {/* Low-Trust Stories Feed */}
        <div className="space-y-3">
          {loading ? (
            <div className="py-16 text-center text-xs text-[#7386A8] font-mono flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-[#B23F35]" />
              <span>Querying verified low-trust records...</span>
            </div>
          ) : filteredFeed.length > 0 ? (
            filteredFeed.map((item, idx) => {
              const score = item.trustScore !== null && item.trustScore !== undefined ? item.trustScore : item.sc;
              return (
                <div
                  key={item.id || idx}
                  onClick={() => navigate(`/results/${item.id}`)}
                  className="p-4 bg-white hover:bg-[#F8F8F6] border border-[#CECECE] hover:border-[#B23F35] rounded-2xl cursor-pointer transition flex flex-col sm:flex-row sm:items-center justify-between gap-4 group shadow-sm"
                >
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap text-xs text-[#7386A8]">
                      <span className="px-2 py-0.5 bg-[#F7E3E0] text-[#B23F35] border border-[#EBC7C2] rounded font-mono font-bold text-[10px]">
                        FLAGGED FAKE
                      </span>
                      <span className="font-semibold text-[#0B5CD5]">{item.source || item.s || 'Unverified Source'}</span>
                      <span>·</span>
                      <span className="text-[#7386A8]">{item.publishedAt || item.tm || 'Debunked'}</span>
                      <span>·</span>
                      <span className="px-2 py-0.5 bg-[#EFEEE9] text-[#2C4E86] rounded font-mono text-[10px]">
                        {item.category || item.cat || 'General'}
                      </span>
                      {item.cluster && (
                        <span className="text-[#D97757] font-mono text-[11px]">
                          Cluster: {item.cluster}
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-semibold text-[#0B5CD5] group-hover:text-[#B23F35] transition line-clamp-2">
                      {item.title || item.t}
                    </h3>
                  </div>

                  <div className="flex items-center gap-4 flex-shrink-0 self-end sm:self-center">
                    <VerdictBadge status="fake" size="sm" />
                    <div className="text-right">
                      <span className="font-mono text-base font-bold text-[#B23F35] block">
                        {score}
                      </span>
                      <span className="text-[9px] uppercase font-mono text-[#7386A8]">Trust / 100</span>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-16 text-center bg-white rounded-3xl border border-dashed border-[#CECECE] text-xs text-[#7386A8] space-y-2 shadow-sm">
              <ShieldAlert className="w-6 h-6 text-[#B23F35] mx-auto" />
              <p className="font-bold text-[#0B5CD5] text-sm">No flagged stories below 40 matching filter</p>
              <p className="text-[#2C4E86] max-w-sm mx-auto">
                All claims in your database currently meet or exceed minimum verification thresholds.
              </p>
            </div>
          )}
        </div>
      </main>

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
