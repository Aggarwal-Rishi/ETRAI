import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiUrl } from '../utils/api';
import {
  Search,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Globe,
  Radio,
  ShieldAlert,
  Shield,
  Clock,
  Sparkles,
  ArrowRight,
  Sliders,
  CreditCard,
  Users,
  X,
  Layers,
  ChevronRight
} from 'lucide-react';

import { FEATURE_FLAGS } from '../utils/featureFlags';

const QUICK_PAGES = [
  { t: 'Dashboard', m: 'Today’s volume, verdict mix and narrative clusters', path: '/dashboard', ic: FileText },
  { t: 'Latest News Desk', m: 'Live intake from your ranked sources', path: '/news', ic: Radio },
  ...(FEATURE_FLAGS.SHOW_FAKE_NEWS_SECTION ? [{ t: 'Fake News Desk', m: 'Debunked stories scored under 40', path: '/fake-news', ic: ShieldAlert }] : []),
  { t: 'History & Sealed Ledger', m: 'Runs, tokens and cost per verification', path: '/history', ic: Clock },
  { t: 'New DeepTrust Analysis', m: 'Verify a link, video, image, PDF or text', path: '/analysis', ic: Sparkles },
  { t: 'Scoring Algorithm', m: 'Factor weights, thresholds and penalties', path: '/settings?tab=algo', ic: Sliders },
  { t: 'Source Authority Rankings', m: 'Rank 1–4 tables and purpose in pipeline', path: '/settings?tab=sources', ic: Shield },
  { t: 'Upgrade Plan & Billing', m: 'Compare Starter, Team, Newsroom and Enterprise', path: '/billing', ic: CreditCard },
  { t: 'My Team & Workspace', m: 'Members, roles and invite links', path: '/workspace', ic: Users }
];

export default function GlobalSearchModal({ isOpen, onClose }) {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setSearchResults([]);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Query real backend search endpoint
  useEffect(() => {
    if (!query.trim()) {
      setSearchResults([]);
      setLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('etrai_token');
        const headers = token ? { Authorization: `Bearer ${token}` } : {};

        const res = await fetch(apiUrl(`/api/v1/search?q=${encodeURIComponent(query.trim())}`), { headers });
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.items || []);
        }
      } catch (err) {
        // Fallback
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  if (!isOpen) return null;

  const q = query.trim().toLowerCase();
  const matchedPages = QUICK_PAGES.filter(p => !q || p.t.toLowerCase().includes(q) || p.m.toLowerCase().includes(q));

  const allItems = q
    ? [
        ...searchResults.map(item => ({
          t: item.title,
          m: `${item.type.toUpperCase()} · ${item.snippet || 'Dossier record'}`,
          path: item.link || (item.analysisId ? `/results/${item.analysisId}` : '/history'),
          group: item.type === 'claim' ? 'Extracted Claims' : item.type === 'report' ? 'Verification Dossiers' : 'Source Intelligence',
          score: item.trustScore,
          ic: item.type === 'claim' ? AlertTriangle : item.type === 'report' ? FileText : Shield
        })),
        ...matchedPages.map(p => ({ ...p, group: 'Quick Navigation', ic: p.ic }))
      ]
    : matchedPages.slice(0, 6).map(p => ({ ...p, group: 'Suggested Navigation', ic: p.ic }));

  const handleSelect = (item) => {
    onClose();
    if (item.path) {
      navigate(item.path);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1 < allItems.length ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 >= 0 ? prev - 1 : allItems.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (allItems[selectedIndex]) {
        handleSelect(allItems[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const highlightMatch = (text) => {
    if (!q || !text) return text;
    const parts = text.split(new RegExp(`(${q})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === q ? (
        <mark key={i} className="bg-[#E88F6B]/30 text-white font-bold rounded-sm px-0.5">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-20 p-4 animate-fadeIn"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-white border border-[#CECECE] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-scaleUp"
      >
        {/* Search Input */}
        <div className="p-4 border-b border-[#CECECE] flex items-center gap-3 bg-[#F8F8F6]">
          <Search className="w-5 h-5 text-[#D97757] flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search claims, reports, sources, or jump to navigation..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent text-sm text-[#0B5CD5] placeholder-[#7386A8] focus:outline-none font-medium"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 hover:bg-[#EFEEE9] rounded-lg text-[#7386A8] hover:text-[#0B5CD5]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="px-2 py-0.5 bg-[#EFEEE9] border border-[#CECECE] text-[#7386A8] rounded text-[10px] font-mono">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar text-xs">
          {loading ? (
            <div className="p-8 text-center text-[#7386A8] font-mono flex items-center justify-center gap-2">
              <Search className="w-4 h-4 animate-spin text-[#D97757]" />
              <span>Searching real database indices...</span>
            </div>
          ) : allItems.length > 0 ? (
            allItems.map((item, idx) => {
              const isSelected = selectedIndex === idx;
              const Icon = item.ic;
              return (
                <div
                  key={idx}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`p-3 rounded-2xl flex items-center justify-between gap-3 cursor-pointer transition ${
                    isSelected
                      ? 'bg-[#D97757] text-white shadow-md'
                      : 'hover:bg-[#F8F8F6] text-[#2C4E86]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2 rounded-xl flex-shrink-0 ${isSelected ? 'bg-white/20' : 'bg-[#EFEEE9] text-[#0B5CD5]'}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="font-bold block truncate text-xs">{highlightMatch(item.t)}</span>
                      <span className={`text-[11px] block truncate ${isSelected ? 'text-white/90' : 'text-[#7386A8]'}`}>
                        {item.m}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {item.score !== undefined && (
                      <span className={`px-1.5 py-0.2 rounded font-mono font-bold text-[10px] ${
                        item.score >= 75 ? 'bg-[#E4EFE7] text-[#2C5B3E]' :
                        item.score >= 40 ? 'bg-[#F7EEDA] text-[#B98520]' :
                        'bg-[#F7E3E0] text-[#B23F35]'
                      }`}>
                        {item.score}/100
                      </span>
                    )}
                    <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-[#EFEEE9] text-[#7386A8]'
                    }`}>
                      {item.group}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-8 text-center text-[#7386A8] text-xs">
              No matching records found across your active database.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[#CECECE] bg-[#F8F8F6] flex items-center justify-between text-[11px] text-[#7386A8] font-mono">
          <span>Navigate with ↑ ↓ · Select with ↵</span>
          <span>Global Search Engine</span>
        </div>
      </div>
    </div>
  );
}
