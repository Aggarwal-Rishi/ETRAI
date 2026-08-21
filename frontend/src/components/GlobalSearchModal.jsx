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
  X
} from 'lucide-react';

const QUICK_PAGES = [
  { t: 'Dashboard', m: 'Today’s volume, verdict mix and narrative clusters', path: '/dashboard', ic: FileText },
  { t: 'Latest News Desk', m: 'Live intake from your ranked sources', path: '/news', ic: Radio },
  { t: 'Fake News Desk', m: 'Everything under 40, grouped by narrative', path: '/fake-news', ic: ShieldAlert },
  { t: 'History & Sealed Ledger', m: 'Runs, tokens and cost per verification', path: '/history', ic: Clock },
  { t: 'New DeepTrust Analysis', m: 'Verify a link, video, image, PDF or text', path: '/analysis', ic: Sparkles },
  { t: 'Scoring Algorithm', m: 'Factor weights, thresholds and penalties', path: '/settings?tab=algo', ic: Sliders },
  { t: 'Source Authority Rankings', m: 'Rank 1–4 tables and purpose in pipeline', path: '/settings?tab=sources', ic: Shield },
  { t: 'Upgrade Plan & Billing', m: 'Compare Starter, Team, Newsroom and Enterprise', path: '/billing', ic: CreditCard },
  { t: 'My Team & Workspace', m: 'Members, roles and invite links', path: '/workspace', ic: Users }
];

const STATIC_CLAIMS = [
  { t: 'All ₹500 banknotes stop being legal tender from 1 October 2026', m: 'In run DT-041-018 · False', path: '/results/DT-041-018', sc: 23 },
  { t: 'A leaked internal circular numbered DCM/1284/2026 authorises the withdrawal', m: 'In run DT-041-018 · False', path: '/results/DT-041-018', sc: 23 },
  { t: 'Minister subsidy rollback in Parliament', m: 'In run DT-041-017 · Questionable', path: '/results/DT-041-017', sc: 41 },
  { t: 'Monsoon deficit revised to 8% below normal', m: 'In run DT-041-016 · Verified Real', path: '/results/DT-041-016', sc: 91 }
];

const STATIC_SOURCES = [
  { t: 'The Standard Ledger', m: 'Rank 1 · National authority · 96/100', path: '/settings?tab=sources', sc: 96 },
  { t: 'Meridian Post', m: 'Rank 1 · National news desk · 93/100', path: '/settings?tab=sources', sc: 93 },
  { t: 'National Gazette index', m: 'Rank 1 · Gazette authority · 99/100', path: '/settings?tab=sources', sc: 99 },
  { t: 'bharatwire-live.co', m: 'Rank 4 · Repeat fabrications · 11/100', path: '/settings?tab=sources', sc: 11 }
];

export default function GlobalSearchModal({ isOpen, onClose }) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const q = query.trim().toLowerCase();

  const matchedPages = QUICK_PAGES.filter(p => !q || p.t.toLowerCase().includes(q) || p.m.toLowerCase().includes(q));
  const matchedClaims = STATIC_CLAIMS.filter(c => q && (c.t.toLowerCase().includes(q) || c.m.toLowerCase().includes(q)));
  const matchedSources = STATIC_SOURCES.filter(s => q && (s.t.toLowerCase().includes(q) || s.m.toLowerCase().includes(q)));

  const allResults = q
    ? [
        ...matchedClaims.map(c => ({ ...c, group: 'Claims', icon: AlertTriangle })),
        ...matchedSources.map(s => ({ ...s, group: 'Sources', icon: Shield })),
        ...matchedPages.map(p => ({ ...p, group: 'Jump to', icon: p.ic }))
      ]
    : matchedPages.slice(0, 6).map(p => ({ ...p, group: 'Quick Jump', icon: p.ic }));

  const handleSelect = (item) => {
    onClose();
    if (item.path) {
      navigate(item.path);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1 < allResults.length ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 >= 0 ? prev - 1 : allResults.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (allResults[selectedIndex]) {
        handleSelect(allResults[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div 
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 sm:pt-24 bg-black/80 backdrop-blur-md animate-fadeIn"
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-scaleUp text-xs text-slate-200"
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-800 bg-slate-950/80">
          <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search reports, claims, sources, or jump to page..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            className="w-full bg-transparent border-0 text-sm text-white focus:outline-none focus:ring-0 placeholder-slate-500"
          />
          <button 
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1 custom-scrollbar">
          {allResults.length > 0 ? (
            allResults.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = selectedIndex === idx;
              return (
                <div
                  key={idx}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`px-3 py-2.5 rounded-xl cursor-pointer transition flex items-center justify-between gap-3 ${
                    isSelected ? 'bg-indigo-600/20 text-white border border-indigo-500/30' : 'hover:bg-slate-800/60 text-slate-300 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-1.5 rounded-lg flex-shrink-0 ${
                      isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'
                    }`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <span className="font-medium text-slate-100 block truncate">{item.t}</span>
                      <span className="text-[11px] text-slate-400 block truncate">{item.m}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {item.sc !== undefined && (
                      <span className={`font-mono font-bold text-[11px] ${
                        item.sc >= 75 ? 'text-emerald-400' : item.sc >= 40 ? 'text-amber-400' : 'text-rose-400'
                      }`}>
                        {item.sc}
                      </span>
                    )}
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-mono uppercase bg-slate-800 text-slate-400">
                      {item.group}
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-6 text-center text-slate-500">
              No matching claims, sources, or reports found for "{query}".
            </div>
          )}
        </div>

        {/* Footer Hints */}
        <div className="px-4 py-2 bg-slate-950 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400 font-mono">
          <span>
            <kbd className="px-1 py-0.2 bg-slate-800 rounded">↑</kbd> <kbd className="px-1 py-0.2 bg-slate-800 rounded">↓</kbd> navigate · <kbd className="px-1 py-0.2 bg-slate-800 rounded">↵</kbd> select
          </span>
          <span>
            <kbd className="px-1 py-0.2 bg-slate-800 rounded">ESC</kbd> to close
          </span>
        </div>
      </div>
    </div>
  );
}
