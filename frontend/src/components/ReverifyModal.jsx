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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fadeIn">
      <div className="bg-white border border-[#CECECE] rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-scaleUp text-[#2C4E86] text-xs">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#CECECE] bg-[#F8F8F6]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#F6E7DF] border border-[#E88F6B]/30 rounded-xl text-[#D97757]">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#0B5CD5]">Re-Verify Stored Report?</h3>
              <p className="text-xs text-[#7386A8] truncate max-w-xs">{report.claim || report.title || report.id}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-[#7386A8] hover:text-[#0B5CD5] rounded-lg hover:bg-[#EFEEE9] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 space-y-4">
          <p className="text-xs text-[#2C4E86] leading-relaxed">
            Re-verifying will run the current verification pipeline over the same subject against today's ranked sources, recent debunks, and available archives.
          </p>

          {/* Token & Cost Estimates */}
          <div className="grid grid-cols-2 gap-3 p-4 bg-[#F8F8F6] border border-[#CECECE] rounded-2xl">
            <div>
              <span className="text-[10px] uppercase font-mono text-[#7386A8] block mb-1 font-semibold">Estimated Tokens</span>
              <span className="font-mono text-base font-bold text-[#0B5CD5]">
                ~{(estimatedTokens / 1000).toFixed(0)}k
              </span>
              <span className="text-[10px] text-[#7386A8] block">Based on prior run complexity</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-mono text-[#7386A8] block mb-1 font-semibold">Estimated Cost</span>
              <span className="font-mono text-base font-bold text-[#3E7A55]">
                ~${estimatedCost}
              </span>
              <span className="text-[10px] text-[#7386A8] block">Billed to monthly allowance</span>
            </div>
          </div>

          <div className="p-3 bg-[#F7EEDA] border border-[#E8D4B0] rounded-2xl text-xs text-[#2C4E86] flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-[#B98520] flex-shrink-0 mt-0.5" />
            <span>
              The existing version is retained in your ledger under <strong className="text-[#0B5CD5]">v1</strong>. The re-verification will be stored as <strong className="text-[#0B5CD5]">v2</strong>.
            </span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-[#F8F8F6] border-t border-[#CECECE] flex items-center justify-end gap-2.5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-[#2C4E86] hover:text-[#0B5CD5] bg-[#EFEEE9] hover:bg-[#CECECE] rounded-xl transition shadow-xs"
          >
            Keep Current Version
          </button>
          <button
            onClick={() => { onRerunWatch(report); onClose(); }}
            className="px-4 py-2 text-xs font-semibold text-[#0B5CD5] bg-[#EFEEE9] hover:bg-[#CECECE] border border-[#CECECE] rounded-xl transition flex items-center gap-1.5 shadow-xs"
          >
            <Eye className="w-3.5 h-3.5 text-[#D97757]" />
            Run & Watch
          </button>
          <button
            onClick={() => { onRerunNow(report); onClose(); }}
            className="px-4 py-2 text-xs font-bold text-white bg-[#D97757] hover:bg-[#B0512F] rounded-xl shadow-md transition flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Re-verify Now
          </button>
        </div>
      </div>
    </div>
  );
}
