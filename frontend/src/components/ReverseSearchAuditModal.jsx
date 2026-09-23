import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Search,
  Camera,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  ExternalLink,
  Copy,
  Check,
  FileJson,
  Download,
  Image as ImageIcon,
  Layers,
  Sparkles,
  Sliders,
  CheckCircle2,
  XCircle,
  FileText
} from 'lucide-react';
import { generateReverseSearchDiagnosticJson } from '../utils/reverseSearchDiagnosticExport';

export default function ReverseSearchAuditModal({ asset, reportData, isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('summary');
  const [copiedId, setCopiedId] = useState(null);

  // Lock document body scroll when modal is open
  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return undefined;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  const diag = generateReverseSearchDiagnosticJson(asset, reportData);
  if (!diag) return null;

  const copyText = (text, id) => {
    navigator.clipboard.writeText(typeof text === 'string' ? text : JSON.stringify(text, null, 2));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const downloadJson = () => {
    try {
      const blob = new Blob([JSON.stringify(diag, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `etrai-reverse-search-diagnostic-${diag.imageMetadata.filename || 'image'}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Failed to download diagnostic JSON:', e);
    }
  };

  const isVerifiedFound = diag.reverseSearchSummary.originalFoundStatus === 'FOUND';
  const isCandidate = diag.reverseSearchSummary.originalFoundStatus === 'CANDIDATE';

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md overflow-y-auto animate-fadeIn"
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', margin: 0 }}
      onClick={onClose}
    >
      <div
        className="bg-white border border-[#CECECE] rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-xs my-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-5 border-b border-[#CECECE] flex items-start justify-between gap-4 bg-[#F8F8F6]">
          <div className="space-y-1.5 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-2.5 py-0.5 rounded text-xs font-extrabold uppercase font-mono ${
                isVerifiedFound
                  ? 'bg-[#E4EFE7] text-[#2C5B3E] border border-[#C5DEC9]'
                  : isCandidate
                  ? 'bg-[#F7EEDA] text-[#B98520] border border-[#E8D4B0]'
                  : 'bg-[#EFEEE9] text-[#7386A8] border border-[#CECECE]'
              }`}>
                {diag.reverseSearchSummary.originalFoundStatus} ({diag.reverseSearchSummary.verifiedMatchesCount} Verified Match)
              </span>

              <span className="px-2.5 py-0.5 rounded text-xs font-semibold font-mono bg-[#EFEEE9] text-[#2C4E86]">
                Provider: {diag.reverseSearchSummary.provider}
              </span>

              {diag.sourceContextComparison?.status && diag.sourceContextComparison.status !== 'UNAVAILABLE' && (
                <span className={`px-2 py-0.5 rounded text-xs font-mono font-semibold ${
                  diag.sourceContextComparison.status === 'MATCHED'
                    ? 'bg-[#E4EFE7] text-[#2C5B3E]'
                    : diag.sourceContextComparison.status === 'CONTRADICTED'
                    ? 'bg-[#F7E3E0] text-[#B23F35]'
                    : 'bg-[#F7EEDA] text-[#B98520]'
                }`}>
                  Context: {diag.sourceContextComparison.status}
                </span>
              )}

              <button
                type="button"
                onClick={() => copyText(diag, 'modalReverseDiagJson')}
                className="px-2.5 py-0.5 rounded bg-[#D97757] text-white text-[11px] font-mono font-bold flex items-center gap-1 hover:bg-[#B0512F] transition shadow-xs cursor-pointer ml-auto"
                title="Copy Complete Reverse Search Diagnostic JSON to Clipboard"
              >
                {copiedId === 'modalReverseDiagJson' ? <Check className="w-3 h-3 text-white" /> : <FileJson className="w-3 h-3 text-white" />}
                {copiedId === 'modalReverseDiagJson' ? 'Copied JSON!' : 'Copy Diagnostic JSON'}
              </button>

              <button
                type="button"
                onClick={downloadJson}
                className="px-2.5 py-0.5 rounded bg-[#0B5CD5] text-white text-[11px] font-mono font-bold flex items-center gap-1 hover:bg-[#0033C4] transition shadow-xs cursor-pointer"
                title="Download Diagnostic JSON file"
              >
                <Download className="w-3 h-3 text-white" />
                Download JSON
              </button>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Camera className="w-4 h-4 text-[#D97757] flex-shrink-0" />
              <h3 className="text-base font-bold text-[#0B5CD5] font-mono truncate">
                Reverse-Image Provenance Audit: {diag.imageMetadata.filename}
              </h3>
            </div>
            <p className="text-[11px] text-[#7386A8]">
              {diag.reverseSearchSummary.originalFoundDescription}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-[#CECECE] text-[#7386A8] hover:text-black transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[#CECECE] bg-[#EFEEE9] px-4 gap-1 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('summary')}
            className={`py-2.5 px-3 font-mono font-bold text-xs border-b-2 transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'summary'
                ? 'border-[#0B5CD5] text-[#0B5CD5] bg-white rounded-t-lg'
                : 'border-transparent text-[#7386A8] hover:text-[#0B5CD5]'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            Reverse Search &amp; Candidates ({diag.candidateImagesLedger.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('context')}
            className={`py-2.5 px-3 font-mono font-bold text-xs border-b-2 transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'context'
                ? 'border-[#0B5CD5] text-[#0B5CD5] bg-white rounded-t-lg'
                : 'border-transparent text-[#7386A8] hover:text-[#0B5CD5]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Source Context vs Visual Summary
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('forensics')}
            className={`py-2.5 px-3 font-mono font-bold text-xs border-b-2 transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'forensics'
                ? 'border-[#0B5CD5] text-[#0B5CD5] bg-white rounded-t-lg'
                : 'border-transparent text-[#7386A8] hover:text-[#0B5CD5]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Forensic Signals &amp; Integrity ({diag.visualForensicSignals.detectedModificationsCount} Diffs)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('json')}
            className={`py-2.5 px-3 font-mono font-bold text-xs border-b-2 transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'json'
                ? 'border-[#0B5CD5] text-[#0B5CD5] bg-white rounded-t-lg'
                : 'border-transparent text-[#7386A8] hover:text-[#0B5CD5]'
            }`}
          >
            <FileJson className="w-3.5 h-3.5" />
            Raw Telemetry JSON
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          
          {/* TAB 1: SUMMARY & CANDIDATES */}
          {activeTab === 'summary' && (
            <div className="space-y-4">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 bg-[#F8F8F6] border border-[#CECECE] rounded-xl space-y-1">
                  <span className="text-[10px] font-mono uppercase text-[#7386A8] block">Search Provider</span>
                  <span className="font-bold font-mono text-[#0B5CD5] text-xs">{diag.reverseSearchSummary.provider}</span>
                </div>
                <div className="p-3 bg-[#F8F8F6] border border-[#CECECE] rounded-xl space-y-1">
                  <span className="text-[10px] font-mono uppercase text-[#7386A8] block">Found Status</span>
                  <span className="font-bold font-mono text-[#0B5CD5] text-xs">{diag.reverseSearchSummary.originalFoundStatus}</span>
                </div>
                <div className="p-3 bg-[#F8F8F6] border border-[#CECECE] rounded-xl space-y-1">
                  <span className="text-[10px] font-mono uppercase text-[#7386A8] block">Candidates Discovered</span>
                  <span className="font-bold font-mono text-[#0B5CD5] text-xs">{diag.reverseSearchSummary.totalCandidatesDiscovered} images</span>
                </div>
                <div className="p-3 bg-[#F8F8F6] border border-[#CECECE] rounded-xl space-y-1">
                  <span className="text-[10px] font-mono uppercase text-[#7386A8] block">Verified Match (&ge;78%)</span>
                  <span className="font-bold font-mono text-[#2C5B3E] text-xs">{diag.reverseSearchSummary.verifiedMatchesCount} verified</span>
                </div>
              </div>

              {diag.reverseSearchSummary.recognitionQuery && (
                <div className="p-3 bg-[#F8F8F6] border border-[#CECECE] rounded-xl space-y-1">
                  <span className="text-[10px] font-mono uppercase text-[#7386A8] block font-bold">Search Query / Basis</span>
                  <p className="font-mono text-xs text-[#2C4E86]">{diag.reverseSearchSummary.recognitionQuery}</p>
                </div>
              )}

              {diag.reverseSearchSummary.limitations.length > 0 && (
                <div className="p-3 bg-[#F7EEDA] border border-[#E8D4B0] rounded-xl space-y-1 text-xs text-[#8A6318]">
                  <span className="font-bold uppercase text-[10px] block font-mono">Provider Limitations &amp; Notes</span>
                  <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                    {diag.reverseSearchSummary.limitations.map((lim, i) => (
                      <li key={i}>{lim}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Candidate Images Ledger */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-[#0B5CD5] uppercase tracking-wider">
                    Indexed Visual Candidate Ledger ({diag.candidateImagesLedger.length})
                  </span>
                  <span className="text-[10px] text-[#7386A8] font-mono">
                    Thresholds: &ge;78% Verified Original · &ge;60% Presentable Candidate
                  </span>
                </div>

                {diag.candidateImagesLedger.length > 0 ? (
                  <div className="border border-[#CECECE] rounded-xl overflow-hidden divide-y divide-[#CECECE]">
                    {diag.candidateImagesLedger.map((c, idx) => (
                      <div key={idx} className="p-3 bg-white hover:bg-[#F8F8F6] transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-3 min-w-0">
                          {c.thumbnailUrl ? (
                            <img
                              src={c.thumbnailUrl}
                              alt={c.title}
                              className="w-12 h-12 object-cover rounded-lg border border-[#CECECE] flex-shrink-0 bg-slate-100"
                              onError={(e) => { e.target.style.display = 'none'; }}
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-lg border border-[#CECECE] bg-slate-100 flex items-center justify-center flex-shrink-0">
                              <ImageIcon className="w-5 h-5 text-slate-400" />
                            </div>
                          )}

                          <div className="space-y-0.5 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-bold text-[#0B5CD5] truncate max-w-xs">{c.domain}</span>
                              {c.isWireArchive && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-[#E4EFE7] text-[#2C5B3E] border border-[#C5DEC9]">
                                  WIRE ARCHIVE
                                </span>
                              )}
                              <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold ${
                                c.matchClassification === 'VERIFIED_VISUAL_MATCH'
                                  ? 'bg-[#E4EFE7] text-[#2C5B3E]'
                                  : 'bg-[#F7EEDA] text-[#B98520]'
                              }`}>
                                {c.matchClassification}
                              </span>
                            </div>
                            <p className="text-[11px] text-[#7386A8] truncate max-w-md">{c.title}</p>
                            {c.publishedDate && (
                              <span className="text-[10px] font-mono text-[#7386A8]">Date: {c.publishedDate}</span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 flex-shrink-0">
                          {c.visualSimilarityScore !== null ? (
                            <div className="text-right">
                              <span className="text-[10px] text-[#7386A8] block font-mono">Similarity</span>
                              <span className={`font-mono font-bold text-xs ${
                                c.visualSimilarityScore >= 78 ? 'text-[#2C5B3E]' : 'text-[#B98520]'
                              }`}>
                                {c.visualSimilarityScore}%
                              </span>
                            </div>
                          ) : (
                            <span className="text-[10px] font-mono text-[#7386A8]">Visual match</span>
                          )}

                          {c.sourceUrl && (
                            <a
                              href={c.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 rounded-lg border border-[#CECECE] hover:border-[#0B5CD5] text-[#D97757] hover:text-[#B0512F] transition"
                              title="Open original page"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 bg-[#F8F8F6] border border-[#CECECE] rounded-xl text-center text-[#7386A8]">
                    No external candidate images indexed or returned by provider.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: CONTEXT COMPARISON */}
          {activeTab === 'context' && (
            <div className="space-y-4">
              <div className="p-4 bg-[#F8F8F6] border border-[#CECECE] rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {diag.sourceContextComparison.status === 'MATCHED' ? (
                      <ShieldCheck className="w-5 h-5 text-[#2C5B3E]" />
                    ) : diag.sourceContextComparison.status === 'CONTRADICTED' ? (
                      <ShieldAlert className="w-5 h-5 text-[#B23F35]" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-[#B98520]" />
                    )}
                    <span className="font-mono font-bold text-sm text-[#0B5CD5] uppercase">
                      Context Verdict: {diag.sourceContextComparison.contextualVerdict}
                    </span>
                  </div>
                  {diag.sourceContextComparison.confidenceScore !== null && (
                    <span className="px-2.5 py-0.5 rounded font-mono font-bold text-xs bg-white border border-[#CECECE] text-[#0B5CD5]">
                      {diag.sourceContextComparison.confidenceScore}% Confidence
                    </span>
                  )}
                </div>
                {diag.sourceContextComparison.rationale && (
                  <p className="text-xs text-[#2C4E86] leading-relaxed">
                    {diag.sourceContextComparison.rationale}
                  </p>
                )}
              </div>

              {/* Two Column Context Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-white border border-[#CECECE] rounded-xl space-y-2">
                  <span className="text-[10px] font-mono uppercase font-bold text-[#7386A8] block">
                    1. AI Visual Summary (Observed Pixels)
                  </span>
                  <p className="text-xs text-[#2C4E86] leading-relaxed whitespace-pre-wrap">
                    {diag.sourceContextComparison.aiVisualSummary}
                  </p>
                </div>

                <div className="p-4 bg-white border border-[#CECECE] rounded-xl space-y-2">
                  <span className="text-[10px] font-mono uppercase font-bold text-[#7386A8] block">
                    2. Matched Source Story Context
                  </span>
                  <p className="text-xs text-[#2C4E86] leading-relaxed whitespace-pre-wrap">
                    {diag.sourceContextComparison.matchedSourceSummary}
                  </p>
                  {diag.sourceContextComparison.matchedSource && (
                    <div className="pt-2 border-t border-dashed border-[#CECECE] space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <strong className="text-[#0B5CD5] truncate">{diag.sourceContextComparison.matchedSource.title || diag.sourceContextComparison.matchedSource.domain}</strong>
                        {diag.sourceContextComparison.matchedSource.url && (
                          <a
                            href={diag.sourceContextComparison.matchedSource.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[#D97757] hover:underline flex items-center gap-1 font-mono text-[10px]"
                          >
                            Source link <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Matching Details & Contradictions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {diag.sourceContextComparison.matchingDetails.length > 0 && (
                  <div className="p-3 bg-[#E4EFE7] border border-[#C5DEC9] rounded-xl space-y-1.5">
                    <span className="font-mono text-[10px] font-bold uppercase text-[#2C5B3E] block">
                      Confirmed Context Alignments
                    </span>
                    <ul className="space-y-1 text-xs text-[#2C5B3E]">
                      {diag.sourceContextComparison.matchingDetails.map((item, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {diag.sourceContextComparison.contradictions.length > 0 && (
                  <div className="p-3 bg-[#F7E3E0] border border-[#EBC7C2] rounded-xl space-y-1.5">
                    <span className="font-mono text-[10px] font-bold uppercase text-[#B23F35] block">
                      Context Contradictions / Discrepancies
                    </span>
                    <ul className="space-y-1 text-xs text-[#B23F35]">
                      {diag.sourceContextComparison.contradictions.map((item, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <XCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: FORENSICS & METADATA */}
          {activeTab === 'forensics' && (
            <div className="space-y-4">
              {/* Metadata Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 text-xs font-mono">
                <div className="p-2.5 bg-[#F8F8F6] border border-[#CECECE] rounded-xl space-y-0.5">
                  <span className="text-[10px] text-[#7386A8] uppercase block">Dimensions</span>
                  <strong className="text-[#0B5CD5]">{diag.imageMetadata.dimensions}</strong>
                </div>
                <div className="p-2.5 bg-[#F8F8F6] border border-[#CECECE] rounded-xl space-y-0.5">
                  <span className="text-[10px] text-[#7386A8] uppercase block">File Size</span>
                  <strong className="text-[#0B5CD5]">{diag.imageMetadata.fileSize}</strong>
                </div>
                <div className="p-2.5 bg-[#F8F8F6] border border-[#CECECE] rounded-xl space-y-0.5">
                  <span className="text-[10px] text-[#7386A8] uppercase block">Format &amp; Quality</span>
                  <strong className="text-[#0B5CD5]">{diag.imageMetadata.formatQuality}</strong>
                </div>
                <div className="p-2.5 bg-[#F8F8F6] border border-[#CECECE] rounded-xl space-y-0.5">
                  <span className="text-[10px] text-[#7386A8] uppercase block">EXIF State</span>
                  <strong className="text-[#0B5CD5]">{diag.imageMetadata.exifStatus}</strong>
                </div>
              </div>

              {/* Manipulation Risk Bar */}
              <div className="p-4 bg-white border border-[#CECECE] rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-[#0B5CD5] uppercase">
                    Forensic Manipulation Assessment
                  </span>
                  <span className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${
                    diag.visualForensicSignals.manipulationRisk === 'HIGH'
                      ? 'bg-[#F7E3E0] text-[#B23F35]'
                      : diag.visualForensicSignals.manipulationRisk === 'MEDIUM'
                      ? 'bg-[#F7EEDA] text-[#B98520]'
                      : 'bg-[#E4EFE7] text-[#2C5B3E]'
                  }`}>
                    {diag.visualForensicSignals.manipulationRisk} RISK ({Math.round(diag.visualForensicSignals.manipulationLikelihood * 100)}%)
                  </span>
                </div>
                <p className="text-xs text-[#7386A8]">
                  Verdict Chip: <strong className="text-[#0B5CD5]">{diag.visualForensicSignals.chipText}</strong>
                </p>
              </div>

              {/* Detected Diffs / Modifications */}
              {diag.visualForensicSignals.differenceRegions.length > 0 && (
                <div className="space-y-2">
                  <span className="font-mono text-xs font-bold text-[#0B5CD5] uppercase block">
                    Detected Difference Regions ({diag.visualForensicSignals.differenceRegions.length})
                  </span>
                  <div className="space-y-2">
                    {diag.visualForensicSignals.differenceRegions.map((diff, i) => (
                      <div key={i} className="p-3 bg-white border border-[#CECECE] rounded-xl space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-[#D97757] text-white flex items-center justify-center font-bold text-[10px]">
                            {diff.markerId}
                          </span>
                          <strong className="text-xs text-[#0B5CD5]">{diff.title}</strong>
                        </div>
                        <p className="text-xs text-[#2C4E86] pl-7">{diff.technicalDetail || diff.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Hashes & C2PA */}
              <div className="p-3 bg-[#F8F8F6] border border-[#CECECE] rounded-xl space-y-2 font-mono text-[11px]">
                <span className="font-bold text-[#7386A8] uppercase text-[10px] block">Cryptographic &amp; Perceptual Hashes</span>
                {diag.imageMetadata.sha256 && (
                  <div><span className="text-[#7386A8]">SHA-256: </span><code className="text-[#0B5CD5]">{diag.imageMetadata.sha256}</code></div>
                )}
                {diag.imageMetadata.dHash && (
                  <div><span className="text-[#7386A8]">dHash (Perceptual): </span><code className="text-[#0B5CD5]">{diag.imageMetadata.dHash}</code></div>
                )}
                <div><span className="text-[#7386A8]">C2PA Content Credentials: </span><strong className="text-[#0B5CD5]">{diag.imageMetadata.hasC2PACredentials ? 'Verified Signed Manifest' : 'None Detected'}</strong></div>
              </div>
            </div>
          )}

          {/* TAB 4: RAW JSON TELEMETRY */}
          {activeTab === 'json' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-[#7386A8]">
                  Complete Auditable ETRAI Reverse-Image Telemetry JSON
                </span>
                <button
                  type="button"
                  onClick={() => copyText(diag, 'rawJsonTab')}
                  className="px-2.5 py-1 rounded bg-[#0B5CD5] text-white font-mono text-xs flex items-center gap-1.5 hover:bg-[#0033C4] transition cursor-pointer"
                >
                  {copiedId === 'rawJsonTab' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedId === 'rawJsonTab' ? 'Copied!' : 'Copy JSON'}
                </button>
              </div>
              <pre className="p-4 bg-slate-950 text-slate-100 rounded-2xl overflow-x-auto text-[11px] font-mono leading-relaxed max-h-[55vh]">
                {JSON.stringify(diag, null, 2)}
              </pre>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-[#CECECE] bg-[#F8F8F6] flex items-center justify-between text-xs text-[#7386A8]">
          <span className="font-mono">
            Generated: {new Date(diag.reportTimestamp).toLocaleTimeString()} · ETRAI Multi-Agent Pipeline
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl border border-[#CECECE] bg-white hover:bg-[#CECECE] text-[#0B5CD5] font-mono font-bold transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
