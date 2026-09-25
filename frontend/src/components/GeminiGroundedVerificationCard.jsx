import React, { useState } from 'react';
import {
  Sparkles,
  Globe,
  Search,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  FileText,
  FileJson,
  Download,
  Check,
  Copy,
  Sliders,
  Terminal
} from 'lucide-react';
import {
  generateGeminiGroundingDiagnosticJson,
  generateSingleClaimGroundingDiagnosticJson
} from '../utils/geminiGroundingDiagnosticExport';

export default function GeminiGroundedVerificationCard({
  groundingData = null,
  className = '',
  id = 'claims',
  onOpenWeights = null,
  isDebug = false,
  onOpenDebug = null
}) {
  const [expandedClaimIdx, setExpandedClaimIdx] = useState(0);
  const [copiedFullJson, setCopiedFullJson] = useState(false);
  const [copiedClaimIdx, setCopiedClaimIdx] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);

  // If no grounding data is available at all
  if (!groundingData || !Array.isArray(groundingData.claims) || groundingData.claims.length === 0) {
    return null;
  }

  const {
    overallVerdict = 'UNVERIFIED',
    totalClaims = 0,
    verifiedCount = 0,
    partialCount = 0,
    falseCount = 0,
    unverifiedCount = 0,
    claims = [],
    allSearchQueries = [],
    allGroundedSources = [],
    summary = '',
    status = 'SUCCESS'
  } = groundingData;

  const getVerdictStyle = (v) => {
    switch (v) {
      case 'VERIFIED':
      case 'Real':
      case 'TRUSTED':
        return {
          bg: 'bg-[#EBF7EE] border-[#C2E7CA] text-[#1E7E34]',
          badge: 'bg-[#1E7E34] text-white',
          bar: 'bg-[#1E7E34]',
          icon: CheckCircle2,
          label: 'VERIFIED'
        };
      case 'PARTIALLY_VERIFIED':
      case 'Suspicious':
        return {
          bg: 'bg-[#FFF8E7] border-[#FFE0B2] text-[#B76E00]',
          badge: 'bg-[#E65100] text-white',
          bar: 'bg-[#E65100]',
          icon: AlertTriangle,
          label: 'PARTIALLY VERIFIED'
        };
      case 'FALSE':
      case 'Fake':
      case 'FABRICATED':
        return {
          bg: 'bg-[#FDF2F2] border-[#F8C8C8] text-[#D32F2F]',
          badge: 'bg-[#D32F2F] text-white',
          bar: 'bg-[#D32F2F]',
          icon: XCircle,
          label: 'FALSE / CONTRADICTED'
        };
      default:
        return {
          bg: 'bg-[#F4F5F7] border-[#CECECE] text-[#5A6A85]',
          badge: 'bg-[#5A6A85] text-white',
          bar: 'bg-[#5A6A85]',
          icon: HelpCircle,
          label: 'UNVERIFIED'
        };
    }
  };

  const gStyle = getVerdictStyle(overallVerdict);

  // Copy full section diagnostic JSON
  const handleCopyFullJson = (e) => {
    e?.stopPropagation();
    try {
      const diagData = generateGeminiGroundingDiagnosticJson(groundingData);
      navigator.clipboard.writeText(JSON.stringify(diagData, null, 2));
      setCopiedFullJson(true);
      setToastMsg('Gemini Grounding Diagnostic JSON copied to clipboard!');
      setTimeout(() => {
        setCopiedFullJson(false);
        setToastMsg(null);
      }, 2500);
    } catch (err) {
      console.error('Failed to copy Gemini Grounding diagnostic JSON:', err);
    }
  };

  // Download full section diagnostic JSON file
  const handleDownloadFullJson = (e) => {
    e?.stopPropagation();
    try {
      const diagData = generateGeminiGroundingDiagnosticJson(groundingData);
      const blob = new Blob([JSON.stringify(diagData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `etrai-gemini-live-search-grounding-diagnostic-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setToastMsg('Diagnostic JSON file downloaded!');
      setTimeout(() => setToastMsg(null), 2500);
    } catch (err) {
      console.error('Failed to download diagnostic JSON file:', err);
    }
  };

  // Copy single claim diagnostic JSON
  const handleCopyClaimJson = (claim, idx, e) => {
    e?.stopPropagation();
    try {
      const singleDiag = generateSingleClaimGroundingDiagnosticJson(claim, idx, groundingData);
      navigator.clipboard.writeText(JSON.stringify(singleDiag, null, 2));
      setCopiedClaimIdx(idx);
      setToastMsg(`Claim #${idx + 1} Grounding Diagnostic JSON copied!`);
      setTimeout(() => {
        setCopiedClaimIdx(null);
        setToastMsg(null);
      }, 2500);
    } catch (err) {
      console.error('Failed to copy claim diagnostic JSON:', err);
    }
  };

  return (
    <section
      id={id}
      className={`p-6 bg-white border border-[#CECECE] rounded-3xl space-y-6 shadow-sm scroll-mt-24 relative ${className}`}
    >
      {/* Toast Feedback Notification */}
      {toastMsg && (
        <div className="absolute top-4 right-6 z-20 px-3.5 py-1.5 rounded-xl bg-[#2C4E86] text-white text-xs font-mono font-medium shadow-lg animate-in fade-in slide-in-from-top-2 duration-200 flex items-center gap-2">
          <Check className="w-3.5 h-3.5 text-[#C2E7CA]" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* 1. Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#CECECE] pb-4">
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-mono font-bold text-[#D97757]">03 ·</span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold uppercase tracking-wider font-mono text-[#0B5CD5] flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-[#D97757]" />
                Atomic Claim Decomposition &amp; Verification
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#EBF3FF] text-[#0B5CD5] border border-[#B3D4FF]">
                Live Search Grounded
              </span>
            </div>
            <p className="text-[11px] text-[#7386A8] font-mono mt-0.5">
              Independent claim-by-claim verification powered by Gemini with real-time Google search sources
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Overall Verdict Badge */}
          <span className={`px-3 py-1 rounded-full text-[11px] font-mono font-bold border flex items-center gap-1.5 ${gStyle.bg}`}>
            <gStyle.icon className="w-3.5 h-3.5" />
            Overall: {gStyle.label}
          </span>

          {onOpenWeights && (
            <button
              type="button"
              onClick={onOpenWeights}
              className="px-2.5 py-1 bg-[#EFEEE9] hover:bg-[#CECECE] border border-[#CECECE] text-[#0B5CD5] rounded-xl text-[11px] font-mono font-bold flex items-center gap-1.5 transition cursor-pointer"
              title="Adjust global scoring formula weights"
            >
              <Sliders className="w-3 h-3 text-[#D97757]" />
              Weights
            </button>
          )}

          {isDebug && onOpenDebug && (
            <button
              type="button"
              onClick={() => onOpenDebug(claims[expandedClaimIdx >= 0 ? expandedClaimIdx : 0])}
              className="px-2.5 py-1 bg-[#0B5CD5] text-white rounded-xl text-[11px] font-mono font-bold flex items-center gap-1.5 hover:bg-[#0033C4] transition shadow-xs cursor-pointer"
              title="Inspect active claim in Agent 3 Debug Panel"
            >
              <Terminal className="w-3 h-3" />
              Agent 3 Live Inspector
            </button>
          )}

          {/* Copy Full Diagnostic JSON Button */}
          <button
            type="button"
            onClick={handleCopyFullJson}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#D97757]/40 bg-[#F6E7DF] px-2.5 py-1 font-sans text-[10px] font-bold text-[#B0512F] transition hover:bg-[#D97757] hover:text-white cursor-pointer shadow-2xs"
            title="Copy Complete Diagnostic JSON report for Gemini Live Search Grounding to clipboard"
          >
            {copiedFullJson ? (
              <Check className="h-3 w-3 text-[#1E7E34]" />
            ) : (
              <FileJson className="h-3 w-3 text-[#D97757]" />
            )}
            <span>{copiedFullJson ? 'Copied JSON!' : 'Copy Diagnostic JSON'}</span>
          </button>

          {/* Download Full Diagnostic JSON File Button */}
          <button
            type="button"
            onClick={handleDownloadFullJson}
            className="inline-flex items-center justify-center p-1.5 rounded-lg border border-[#CECECE] bg-[#F8F8F6] text-[#7386A8] hover:text-[#0B5CD5] hover:border-[#0B5CD5] transition cursor-pointer shadow-2xs"
            title="Download Gemini Grounding Diagnostic JSON file"
          >
            <Download className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* 2. Overview Banner & Stat Pills */}
      <div className="p-4 rounded-2xl bg-[#F8F8F6] border border-[#CECECE] space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <span className="text-[11px] font-mono font-bold text-[#7386A8] uppercase tracking-wider">
              Gemini Verification Summary
            </span>
            <p className="text-xs text-[#2C4E86] leading-relaxed">
              {summary || `Each atomic claim was submitted individually to Gemini with live Google Search retrieval to evaluate factual accuracy and extract grounded web citations.`}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[#CECECE]/60">
          <div className="bg-white p-2.5 rounded-xl border border-[#CECECE] text-center">
            <span className="text-[10px] font-mono font-bold text-[#7386A8] uppercase block">Total Claims</span>
            <span className="text-sm font-bold font-mono text-[#2C4E86]">{totalClaims}</span>
          </div>
          <div className="bg-white p-2.5 rounded-xl border border-[#CECECE] text-center">
            <span className="text-[10px] font-mono font-bold text-[#1E7E34] uppercase block">Verified</span>
            <span className="text-sm font-bold font-mono text-[#1E7E34]">{verifiedCount}</span>
          </div>
          <div className="bg-white p-2.5 rounded-xl border border-[#CECECE] text-center">
            <span className="text-[10px] font-mono font-bold text-[#B76E00] uppercase block">Partially Verified</span>
            <span className="text-sm font-bold font-mono text-[#B76E00]">{partialCount}</span>
          </div>
          <div className="bg-white p-2.5 rounded-xl border border-[#CECECE] text-center">
            <span className="text-[10px] font-mono font-bold text-[#D32F2F] uppercase block">Contradicted</span>
            <span className="text-sm font-bold font-mono text-[#D32F2F]">{falseCount}</span>
          </div>
        </div>
      </div>

      {/* 3. Individual Claim Cards */}
      <div className="space-y-3.5">
        {claims.map((claim, idx) => {
          const isOpen = expandedClaimIdx === idx;
          const cvStyle = getVerdictStyle(claim.verdict);
          const isCopiedThisClaim = copiedClaimIdx === idx;

          return (
            <div
              key={claim.claimId || idx}
              className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
                isOpen
                  ? 'border-[#0B5CD5] shadow-sm bg-white'
                  : 'border-[#CECECE] bg-white hover:border-[#7386A8]'
              }`}
            >
              {/* Claim Accordion Header */}
              <button
                type="button"
                onClick={() => setExpandedClaimIdx(isOpen ? -1 : idx)}
                className="w-full p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left transition cursor-pointer"
              >
                <div className="flex items-start gap-3 flex-1">
                  <span className="text-xs font-mono font-bold text-[#D97757] mt-0.5 flex-shrink-0">
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <div className="space-y-1.5 flex-1">
                    <p className="text-xs font-medium text-[#2C4E86] leading-relaxed">
                      {claim.claimText || claim.text || 'Unspecified assertion'}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap text-[11px] font-mono">
                      {/* Gemini Verdict Badge */}
                      <span className={`px-2 py-0.5 rounded-full font-bold border flex items-center gap-1 ${cvStyle.bg}`}>
                        <cvStyle.icon className="w-3 h-3" />
                        {cvStyle.label}
                      </span>

                      {/* Confidence Rating */}
                      <span className="px-2 py-0.5 rounded-full bg-[#F8F8F6] text-[#2C4E86] border border-[#CECECE] font-semibold">
                        Confidence: {claim.confidence ?? claim.confidenceScore ?? 50}%
                      </span>

                      {/* Sources Count Badge */}
                      <span className="px-2 py-0.5 rounded-full bg-[#EFEEE9] text-[#7386A8] border border-[#CECECE] flex items-center gap-1">
                        <Globe className="w-2.5 h-2.5" />
                        {(claim.groundedSources?.length || claim.sources?.length || claim.citedSources?.length || 0)} Live Citations
                      </span>

                      {/* Copy Single Claim Diagnostic JSON Button */}
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => handleCopyClaimJson(claim, idx, e)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            handleCopyClaimJson(claim, idx, e);
                          }
                        }}
                        className="inline-flex items-center gap-1 rounded-md border border-[#D97757]/40 bg-[#F6E7DF] px-2 py-0.5 font-sans text-[10px] font-bold text-[#B0512F] transition hover:bg-[#D97757] hover:text-white cursor-pointer ml-auto sm:ml-0"
                        title="Copy diagnostic JSON for this specific grounded claim"
                      >
                        {isCopiedThisClaim ? (
                          <Check className="h-2.5 w-2.5 text-[#1E7E34]" />
                        ) : (
                          <FileJson className="h-2.5 w-2.5 text-[#D97757]" />
                        )}
                        <span>{isCopiedThisClaim ? 'Copied JSON!' : 'Copy Diagnostic JSON'}</span>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <div className="w-7 h-7 rounded-full bg-[#F8F8F6] border border-[#CECECE] flex items-center justify-center text-[#7386A8]">
                    {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </div>
              </button>

              {/* Accordion Content Body */}
              {isOpen && (
                <div className="p-4 sm:p-5 border-t border-[#CECECE] bg-[#FAFAF8] space-y-4">
                  {/* Executive Reason / Explanation */}
                  <div className="p-3.5 rounded-xl bg-white border border-[#CECECE] space-y-1.5 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono font-bold text-[#7386A8] uppercase tracking-wider flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-[#0B5CD5]" />
                        Gemini Grounded Assessment
                      </span>
                      <button
                        type="button"
                        onClick={(e) => handleCopyClaimJson(claim, idx, e)}
                        className="text-[10px] font-mono font-bold text-[#0B5CD5] hover:text-[#0033C4] flex items-center gap-1 transition cursor-pointer"
                        title="Copy single claim diagnostic JSON"
                      >
                        {isCopiedThisClaim ? <Check className="w-3 h-3 text-[#1E7E34]" /> : <Copy className="w-3 h-3" />}
                        <span>{isCopiedThisClaim ? 'Copied' : 'JSON Trace'}</span>
                      </button>
                    </div>
                    <p className="text-xs text-[#2C4E86] leading-relaxed">
                      {claim.explanation}
                    </p>

                    {/* Confidence Meter */}
                    <div className="pt-2 space-y-1">
                      <div className="flex justify-between text-[10px] font-mono text-[#7386A8]">
                        <span>Evidentiary Confidence</span>
                        <span className="font-bold text-[#2C4E86]">{claim.confidence ?? 50}%</span>
                      </div>
                      <div className="w-full bg-[#EFEEE9] h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${cvStyle.bar}`}
                          style={{ width: `${Math.max(5, Math.min(100, claim.confidence ?? 50))}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Key Findings */}
                  {Array.isArray(claim.keyFindings) && claim.keyFindings.length > 0 && (
                    <div className="p-3.5 rounded-xl bg-white border border-[#CECECE] space-y-2 shadow-2xs">
                      <span className="text-[11px] font-mono font-bold text-[#7386A8] uppercase tracking-wider flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-[#D97757]" />
                        Key Corroborating Findings
                      </span>
                      <ul className="space-y-1.5">
                        {claim.keyFindings.map((finding, fIdx) => (
                          <li key={fIdx} className="text-xs text-[#2C4E86] flex items-start gap-2">
                            <span className="text-[#0B5CD5] font-bold mt-0.5">•</span>
                            <span className="leading-relaxed">{finding}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Real-time Google Search Queries */}
                  {Array.isArray(claim.searchQueries) && claim.searchQueries.length > 0 && (
                    <div className="p-3.5 rounded-xl bg-white border border-[#CECECE] space-y-2 shadow-2xs">
                      <span className="text-[11px] font-mono font-bold text-[#7386A8] uppercase tracking-wider flex items-center gap-1.5">
                        <Search className="w-3.5 h-3.5 text-[#0B5CD5]" />
                        Live Google Search Queries
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {claim.searchQueries.map((q, qIdx) => (
                          <span
                            key={qIdx}
                            className="px-2.5 py-1 rounded-lg text-xs font-mono bg-[#F8F8F6] border border-[#CECECE] text-[#2C4E86]"
                          >
                            "{q}"
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Grounded Sources & Citations */}
                  {(() => {
                    const claimSources = (Array.isArray(claim.groundedSources) && claim.groundedSources.length > 0)
                      ? claim.groundedSources
                      : (Array.isArray(claim.sources) && claim.sources.length > 0
                        ? claim.sources
                        : (Array.isArray(claim.citedSources) ? claim.citedSources : []));

                    return (
                      <div className="space-y-2">
                        <span className="text-[11px] font-mono font-bold text-[#7386A8] uppercase tracking-wider flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5 text-[#0B5CD5]" />
                          Live Grounded Web Sources ({claimSources.length})
                        </span>

                        {claimSources.length > 0 ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {claimSources.map((source, sIdx) => {
                              const sUrl = source.url || source.link || '';
                              const sDomain = source.domain || (sUrl ? (() => { try { return new URL(sUrl).hostname.replace(/^www\./, ''); } catch (e) { return 'source'; } })() : 'web-source');
                              return (
                                <a
                                  key={sUrl || sIdx}
                                  href={sUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-3 rounded-xl bg-white border border-[#CECECE] hover:border-[#0B5CD5] hover:shadow-xs transition group flex flex-col justify-between"
                                >
                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between gap-1.5">
                                      <span className="text-[10px] font-mono font-bold text-[#D97757] uppercase truncate">
                                        {sDomain}
                                      </span>
                                      <ExternalLink className="w-3 h-3 text-[#7386A8] group-hover:text-[#0B5CD5] flex-shrink-0" />
                                    </div>
                                    <p className="text-xs font-medium text-[#2C4E86] group-hover:text-[#0B5CD5] line-clamp-2 leading-snug">
                                      {source.title || source.name || sUrl}
                                    </p>
                                  </div>
                                  <span className="text-[10px] font-mono text-[#7386A8] truncate mt-2 block">
                                    {sUrl}
                                  </span>
                                </a>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="p-3 rounded-xl bg-white border border-[#CECECE] text-xs font-mono text-[#7386A8] italic">
                            No direct external source citations returned for this assertion.
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
