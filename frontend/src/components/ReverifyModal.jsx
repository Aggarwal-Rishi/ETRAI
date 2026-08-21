import React from 'react';
import { Lock, RefreshCw, Eye, Sparkles, X, AlertTriangle } from 'lucide-react';

export default function ReverifyModal({
  isOpen,
  onClose,
  report,
  onRerunNow,
  onRerunWatch
}) {
  if (!isOpen || !report) return null;

  const estimatedTokens = Math.round((report.tokens || 380000) * 0.98);
  const estimatedCost = ((report.cost || 2.45) * 0.98).toFixed(2);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-scaleUp text-slate-200 text-sm">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-400">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Re-Verify Sealed Report?</h3>
              <p className="text-xs text-slate-400 truncate max-w-xs">{report.claim || report.title || report.id}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 space-y-4">
          <p className="text-xs text-slate-300 leading-relaxed">
            This report was sealed upon generation. Re-verifying will deploy all nine agents back over the same subject against today's fresh ranked sources, recent debunks, and new wire archives.
          </p>

          {/* Token & Cost Estimates */}
          <div className="grid grid-cols-2 gap-3 p-4 bg-slate-950/80 border border-slate-800 rounded-xl">
            <div>
              <span className="text-[10px] uppercase font-mono text-slate-400 block mb-1">Estimated Tokens</span>
              <span className="font-mono text-base font-semibold text-indigo-400">
                ~{(estimatedTokens / 1000).toFixed(0)}k
              </span>
              <span className="text-[10px] text-slate-500 block">Based on prior run complexity</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-mono text-slate-400 block mb-1">Estimated Cost</span>
              <span className="font-mono text-base font-semibold text-emerald-400">
                ~${estimatedCost}
              </span>
              <span className="text-[10px] text-slate-500 block">Billed to monthly allowance</span>
            </div>
          </div>

          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <span>
              The existing sealed version is permanently retained in your ledger under <strong>v1</strong>. The re-verification will be archived as <strong>v2</strong>.
            </span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-900 border-t border-slate-800 flex items-center justify-end gap-2.5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-xl transition"
          >
            Keep Sealed
          </button>
          <button
            onClick={() => { onRerunWatch(report); onClose(); }}
            className="px-4 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition flex items-center gap-1.5"
          >
            <Eye className="w-3.5 h-3.5 text-indigo-400" />
            Run & Watch
          </button>
          <button
            onClick={() => { onRerunNow(report); onClose(); }}
            className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-lg shadow-indigo-500/20 transition flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Re-verify Now
          </button>
        </div>
      </div>
    </div>
  );
}
