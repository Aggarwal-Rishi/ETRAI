import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiUrl } from '../utils/api';
import {
  Search,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Globe,
  Database,
  Building2,
  Newspaper,
  X,
  CornerDownLeft,
  ArrowUpDown
} from 'lucide-react';

export default function GlobalSearchModal({ isOpen, onClose }) {
  const [query, setQuery] = useState('');
  const [activeType, setActiveType] = useState('ALL');
  const [results, setResults] = useState([]);
  const [resultsByType, setResultsByType] = useState({});
  const [totalMatches, setTotalMatches] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  const inputRef = useRef(null);
  const navigate = useNavigate();

  // Global Ctrl+K / Cmd+K listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) {
          onClose();
        }
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Debounced search query
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setTotalMatches(0);
      setResultsByType({});
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('etrai_token');
        const params = new URLSearchParams({ q: query, type: activeType, limit: '30' });
        const res = await fetch(apiUrl(`/api/v1/search?${params.toString()}`), {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        const data = await res.json();
        if (data && data.items) {
          setResults(data.items);
          setTotalMatches(data.totalMatches || data.items.length);
          setResultsByType(data.resultsByType || {});
          setSelectedIndex(0);
        }
      } catch (err) {
        console.error('Global search error:', err);
      } finally {
        setLoading(false);
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [query, activeType]);

  // Keyboard navigation
  const handleInputKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1 < results.length ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : results.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIndex]) {
        handleSelectItem(results[selectedIndex]);
      }
    }
  };

  const handleSelectItem = (item) => {
    onClose();
    if (item.type === 'REPORT' && item.metadata?.reportId) {
      navigate(`/reports/${item.metadata.reportId}`);
    } else if (item.type === 'CLAIM' && item.metadata?.reportId) {
      navigate(`/reports/${item.metadata.reportId}`);
    } else if (item.type === 'EVIDENCE' && item.metadata?.reportId) {
      navigate(`/reports/${item.metadata.reportId}`);
    } else if (item.type === 'NEWS') {
      navigate('/dashboard');
    } else if (item.type === 'SOURCE') {
      navigate('/history');
    }
  };

  if (!isOpen) return null;

  const getTypeIcon = (type) => {
    switch (type) {
      case 'REPORT':
        return <FileText className="w-4 h-4 text-brand-400" />;
      case 'CLAIM':
        return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
      case 'EVIDENCE':
        return <Globe className="w-4 h-4 text-cyan-400" />;
      case 'ENTITY':
        return <Building2 className="w-4 h-4 text-amber-400" />;
      case 'SOURCE':
        return <Database className="w-4 h-4 text-purple-400" />;
      case 'NEWS':
        return <Newspaper className="w-4 h-4 text-blue-400" />;
      default:
        return <Search className="w-4 h-4 text-slate-400" />;
    }
  };

  const typesList = [
    { key: 'ALL', label: 'All' },
    { key: 'REPORTS', label: `Reports (${resultsByType.REPORT || 0})` },
    { key: 'CLAIMS', label: `Claims (${resultsByType.CLAIM || 0})` },
    { key: 'EVIDENCE', label: `Evidence (${resultsByType.EVIDENCE || 0})` },
    { key: 'ENTITIES', label: `Entities (${resultsByType.ENTITY || 0})` },
    { key: 'SOURCES', label: `Sources (${resultsByType.SOURCE || 0})` },
    { key: 'NEWS', label: `News (${resultsByType.NEWS || 0})` }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div
        className="w-full max-w-3xl glass-panel rounded-2xl border border-slate-700/80 shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-scaleUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Header */}
        <div className="p-4 border-b border-slate-800/80 flex items-center gap-3 bg-slate-900/60">
          <Search className="w-5 h-5 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Search reports, claims, evidence, sources, entities, news..."
            className="w-full bg-transparent text-slate-100 placeholder-slate-500 text-base focus:outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 text-slate-400 hover:text-slate-200 rounded-md transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-mono font-medium text-slate-400 bg-slate-800 border border-slate-700 rounded shadow-sm">
            ESC
          </kbd>
        </div>

        {/* Filter Pills */}
        <div className="px-4 py-2 border-b border-slate-800/60 bg-slate-900/30 flex items-center gap-1.5 overflow-x-auto scrollbar-none text-xs">
          {typesList.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveType(t.key)}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors shrink-0 ${
                activeType === t.key
                  ? 'bg-brand-600/30 text-brand-300 border border-brand-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1 divide-y divide-slate-800/30">
          {loading && (
            <div className="p-8 text-center text-sm text-slate-400 animate-pulse">
              Searching global verification index...
            </div>
          )}

          {!loading && query && results.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-400">
              No matching records discovered for "{query}".
            </div>
          )}

          {!loading && !query && (
            <div className="p-8 text-center text-xs text-slate-500 space-y-2">
              <p>Type keywords to omni-search across all verification models.</p>
              <div className="flex justify-center gap-4 text-[11px] text-slate-400">
                <span className="flex items-center gap-1"><ArrowUpDown className="w-3 h-3" /> Navigate</span>
                <span className="flex items-center gap-1"><CornerDownLeft className="w-3 h-3" /> Select</span>
                <span className="flex items-center gap-1"><kbd className="px-1 bg-slate-800 rounded">ESC</kbd> Close</span>
              </div>
            </div>
          )}

          {!loading && results.map((item, index) => {
            const isSelected = index === selectedIndex;
            return (
              <div
                key={item.id}
                onClick={() => handleSelectItem(item)}
                onMouseEnter={() => setSelectedIndex(index)}
                className={`p-3 rounded-xl cursor-pointer transition-all flex items-start gap-3 ${
                  isSelected
                    ? 'bg-brand-600/20 border border-brand-500/30 text-white'
                    : 'text-slate-300 hover:bg-slate-800/40'
                }`}
              >
                <div className="mt-0.5 p-2 rounded-lg bg-slate-800/80 shrink-0 border border-slate-700/50">
                  {getTypeIcon(item.type)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h4
                      className="text-sm font-semibold text-slate-100 truncate"
                      dangerouslySetInnerHTML={{ __html: item.highlightedTitle || item.title }}
                    />
                    <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-md bg-slate-800 border border-slate-700 text-slate-300 shrink-0">
                      {item.type}
                    </span>
                  </div>

                  <p
                    className="text-xs text-slate-400 line-clamp-2 mt-1"
                    dangerouslySetInnerHTML={{ __html: item.highlightedSnippet || item.snippet }}
                  />

                  {/* Metadata Chips */}
                  <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px] text-slate-400">
                    {item.metadata?.verdict && (
                      <span
                        className={`px-1.5 py-0.5 rounded font-semibold text-[10px] ${
                          item.metadata.verdict === 'VERIFIED'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : item.metadata.verdict === 'FALSE'
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}
                      >
                        {item.metadata.verdict}
                      </span>
                    )}

                    {item.metadata?.trustScore !== undefined && (
                      <span className="text-brand-300 font-medium">
                        Score: {item.metadata.trustScore}/100
                      </span>
                    )}

                    {item.metadata?.domain && (
                      <span className="text-slate-400">
                        {item.metadata.domain}
                      </span>
                    )}

                    {item.metadata?.authorityScore !== undefined && (
                      <span className="text-purple-300">
                        Authority: {item.metadata.authorityScore}
                      </span>
                    )}
                  </div>
                </div>

                {isSelected && (
                  <CornerDownLeft className="w-4 h-4 text-brand-400 shrink-0 mt-2" />
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-900/60 flex items-center justify-between text-xs text-slate-500">
          <div>
            Showing {results.length} of {totalMatches} result(s)
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-slate-800 text-[10px] rounded border border-slate-700 text-slate-400">↑</kbd>
              <kbd className="px-1.5 py-0.5 bg-slate-800 text-[10px] rounded border border-slate-700 text-slate-400">↓</kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-slate-800 text-[10px] rounded border border-slate-700 text-slate-400">Enter</kbd>
              Select
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
