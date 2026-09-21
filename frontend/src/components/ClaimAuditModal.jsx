import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Cpu, BarChart2, ShieldCheck, AlertTriangle, ExternalLink, Code, Layers, FileText, Terminal, Copy, Check, Clock, FileJson } from 'lucide-react';
import { generateClaimDiagnosticJson } from '../utils/claimDiagnosticExport';

export default function ClaimAuditModal({ claim, isOpen, onClose, onOpenDebugPanel }) {
  const [activeTab, setActiveTab] = useState('searchApi');
  const [copiedId, setCopiedId] = useState(null);

  // Lock document body scroll when modal is open
  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  if (!isOpen || !claim || typeof document === 'undefined') return null;

  const audit = claim.auditTrail || {};
  const fuzzy = audit.fuzzyMathTrace || {};
  const gpt = audit.gptCrossVerification || {};
  const rawHits = audit.rawSearchHits || {};
  const searchQueries = audit.searchQueries || {};
  const apiCalls = claim.apiCalls || audit.apiCalls || [];
  const exactFlow = claim.exactFlow || audit.exactFlow || [];

  const copyText = (text, id) => {
    navigator.clipboard.writeText(typeof text === 'string' ? text : JSON.stringify(text, null, 2));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

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
        
        {/* Header */}
        <div className="p-5 border-b border-[#CECECE] flex items-start justify-between gap-4 bg-[#F8F8F6]">
          <div className="space-y-1.5 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-2.5 py-0.5 rounded text-xs font-extrabold uppercase ${
                claim.status === 'TRUSTED' || claim.status === 'Verified' ? 'bg-[#E4EFE7] text-[#2C5B3E] border border-[#C5DEC9]' :
                claim.status === 'FABRICATED' || claim.status === 'False' ? 'bg-[#F7E3E0] text-[#B23F35] border border-[#EBC7C2]' :
                'bg-[#F7EEDA] text-[#B98520] border border-[#E8D4B0]'
              }`}>
                {claim.status === 'TRUSTED' || claim.status === 'Verified' ? 'TRUSTED' : claim.status === 'FABRICATED' || claim.status === 'False' ? 'FABRICATED' : 'SUSPICIOUS'} ({claim.confidence}%)
              </span>

              <span className="px-2 py-0.5 rounded text-xs font-semibold bg-[#EFEEE9] text-[#2C4E86]">
                {claim.claimScope || 'Regional'} Scope
              </span>

              {claim.isRecentBreaking && (
                <span className="px-2 py-0.5 rounded text-xs font-semibold bg-[#F7EEDA] text-[#B98520] border border-[#E8D4B0]">
                  Recent News Flag
                </span>
              )}

              {onOpenDebugPanel && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenDebugPanel(claim);
                  }}
                  className="px-2.5 py-0.5 rounded bg-[#0B5CD5] text-white text-[11px] font-mono font-bold flex items-center gap-1 hover:bg-[#0033C4] transition shadow-xs cursor-pointer"
                >
                  <Terminal className="w-3 h-3" />
                  Open Agent 3 Flow &amp; APIs
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  const diag = generateClaimDiagnosticJson(claim);
                  copyText(diag, 'modalClaimDiagJson');
                }}
                className="px-2.5 py-0.5 rounded bg-[#D97757] text-white text-[11px] font-mono font-bold flex items-center gap-1 hover:bg-[#B0512F] transition shadow-xs cursor-pointer"
                title="Copy Full Claim Diagnostic JSON to Clipboard"
              >
                {copiedId === 'modalClaimDiagJson' ? <Check className="w-3 h-3 text-white" /> : <FileJson className="w-3 h-3 text-white" />}
                {copiedId === 'modalClaimDiagJson' ? 'Copied JSON!' : 'Copy Diagnostic JSON'}
              </button>
            </div>

            <h3 className="text-base font-semibold text-[#0B5CD5] leading-snug">"{claim.claimText || claim.claim}"</h3>

            {(claim.originalSentence || claim.sourceContext?.originalSentence || claim.sourceExcerpt || claim.quoteText) && (
              <div className="p-2.5 bg-[#EFEEE9] border border-[#CECECE] rounded-xl text-xs">
                <span className="text-[10px] font-mono uppercase text-[#D97757] font-bold block mb-0.5">
                  Original News Passage / Excerpt:
                </span>
                <p className="text-[#2C4E86] italic font-serif leading-relaxed">
                  "{claim.originalSentence || claim.sourceContext?.originalSentence || claim.sourceExcerpt || claim.quoteText}"
                </p>
              </div>
            )}
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-[#EFEEE9] hover:bg-[#CECECE] text-[#7386A8] hover:text-[#0B5CD5] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="flex border-b border-[#CECECE] bg-[#EFEEE9] px-5 gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('searchApi')}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'searchApi'
                ? 'border-[#D97757] text-[#D97757] bg-white shadow-xs'
                : 'border-transparent text-[#7386A8] hover:text-[#0B5CD5]'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            1. Raw Serper Search API Evidence
          </button>

          <button
            onClick={() => setActiveTab('gptPayload')}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'gptPayload'
                ? 'border-[#D97757] text-[#D97757] bg-white shadow-xs'
                : 'border-transparent text-[#7386A8] hover:text-[#0B5CD5]'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            2. Agent 3 Gemini Semantic Verification
          </button>

          <button
            onClick={() => setActiveTab('fuzzyMath')}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'fuzzyMath'
                ? 'border-[#D97757] text-[#D97757] bg-white shadow-xs'
                : 'border-transparent text-[#7386A8] hover:text-[#0B5CD5]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            3. 9-Signal Fuzzy Engine Trace
          </button>

          <button
            onClick={() => setActiveTab('decisionSummary')}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'decisionSummary'
                ? 'border-[#D97757] text-[#D97757] bg-white shadow-xs'
                : 'border-transparent text-[#7386A8] hover:text-[#0B5CD5]'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            4. Verdict &amp; Scope Summary
          </button>

          <button
            onClick={() => setActiveTab('apiCallsLedger')}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'apiCallsLedger'
                ? 'border-[#D97757] text-[#D97757] bg-white shadow-xs font-bold'
                : 'border-transparent text-[#7386A8] hover:text-[#0B5CD5]'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            5. Raw API Calls &amp; Exact Flow ({apiCalls.length})
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs text-[#2C4E86]">

          {/* TAB 1: RAW SEARCH API EVIDENCE */}
          {activeTab === 'searchApi' && (
            <div className="space-y-6">
              {/* Queries Executed Box */}
              <div className="bg-[#F8F8F6] p-4 rounded-2xl border border-[#CECECE] space-y-2">
                <div className="font-semibold text-[#0B5CD5] flex items-center gap-2 text-sm">
                  <Code className="w-4 h-4 text-[#D97757]" />
                  Exact Search Queries Sent to Serper API:
                </div>
                
                <div className="space-y-1 font-mono text-[11px]">
                  <div className="flex gap-2">
                    <span className="text-[#7386A8] shrink-0">Pass 1 (Web Search):</span>
                    <span className="text-[#0B5CD5] bg-white px-2 py-0.5 rounded border border-[#CECECE] break-all">
                      {searchQueries.webQuery || 'N/A'}
                    </span>
                  </div>

                  {searchQueries.webRetryQuery && (
                    <div className="flex gap-2 text-[#B98520]">
                      <span className="text-[#B98520] shrink-0">Pass 1 Retry (Regional Broadened):</span>
                      <span className="bg-[#F7EEDA] px-2 py-0.5 rounded border border-[#E8D4B0] break-all">
                        {searchQueries.webRetryQuery}
                      </span>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <span className="text-[#7386A8] shrink-0">Pass 2 (X/Twitter Search):</span>
                    <span className="text-[#0B5CD5] bg-white px-2 py-0.5 rounded border border-[#CECECE] break-all">
                      {searchQueries.xQuery || 'N/A'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Search Diagnostics Metric Bar */}
              {audit.searchDiagnostics && (
                <div className="grid grid-cols-4 gap-2 text-center text-[11px]">
                  <div className="bg-[#F8F8F6] p-2.5 rounded-xl border border-[#CECECE]">
                    <div className="text-[#7386A8] text-[10px]">Raw Serper Hits</div>
                    <div className="text-sm font-bold text-[#0B5CD5]">{audit.searchDiagnostics.rawResultCount || rawHits.webHitsCount || 0}</div>
                  </div>
                  <div className="bg-[#F8F8F6] p-2.5 rounded-xl border border-[#CECECE]">
                    <div className="text-[#7386A8] text-[10px]">Normalized & Deduped</div>
                    <div className="text-sm font-bold text-[#0B5CD5]">{audit.searchDiagnostics.normalizedResultCount || rawHits.webHitsCount || 0}</div>
                  </div>
                  <div className="bg-[#F8F8F6] p-2.5 rounded-xl border border-[#CECECE]">
                    <div className="text-[#7386A8] text-[10px]">Full Articles Fetched</div>
                    <div className="text-sm font-bold text-[#D97757]">{audit.searchDiagnostics.fetchedArticleCount || 0}</div>
                  </div>
                  <div className="bg-[#F8F8F6] p-2.5 rounded-xl border border-[#CECECE]">
                    <div className="text-[#7386A8] text-[10px]">Sent to Gemini</div>
                    <div className="text-sm font-bold text-[#3E7A55]">{audit.searchDiagnostics.usableEvidenceCount || (audit.evidenceEvaluations || []).length}</div>
                  </div>
                </div>
              )}

              {/* Retrieved Hits Breakdown */}
              <div className="space-y-3">
                <div className="font-semibold text-[#0B5CD5] text-sm flex items-center justify-between">
                  <span>Pass 1: General Web Search Results ({rawHits.webHitsCount || 0} hits)</span>
                </div>

                {rawHits.webHits && rawHits.webHits.length > 0 ? (
                  <div className="space-y-2">
                    {rawHits.webHits.map((item, idx) => {
                      const trustScore = (audit.domainTrustEvaluations || [])[idx]?.trustScore || 0.50;
                      return (
                        <div key={idx} className="bg-[#F8F8F6] p-3 rounded-xl border border-[#CECECE] space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <a href={item.url} target="_blank" rel="noreferrer" className="font-semibold text-[#0B5CD5] hover:text-[#D97757] hover:underline flex items-center gap-1">
                              {item.title} <ExternalLink className="w-3 h-3 text-[#7386A8]" />
                            </a>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              trustScore >= 0.85 ? 'bg-[#E4EFE7] text-[#2C5B3E]' :
                              trustScore >= 0.65 ? 'bg-[#EFEEE9] text-[#0B5CD5]' : 'bg-[#EFEEE9] text-[#7386A8]'
                            }`}>
                              Domain Trust: {trustScore} ({item.domain})
                            </span>
                          </div>
                          <p className="text-[#2C4E86] text-xs">{item.snippet}</p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-[#7386A8] italic bg-[#F8F8F6] p-4 rounded-xl border border-[#CECECE] text-center">
                    No general web search results returned for this query.
                  </div>
                )}
              </div>

              {/* X Search Hits */}
              <div className="space-y-3">
                <div className="font-semibold text-[#0B5CD5] text-sm">
                  Pass 2: X/Twitter Social Search Results ({rawHits.xHitsCount || 0} hits)
                </div>

                {rawHits.xHits && rawHits.xHits.length > 0 ? (
                  <div className="space-y-2">
                    {rawHits.xHits.map((item, idx) => (
                      <div key={idx} className="bg-[#F8F8F6] p-3 rounded-xl border border-[#CECECE] space-y-1">
                        <div className="font-semibold text-[#3E7A55] flex items-center gap-1">
                          {item.title}
                        </div>
                        <p className="text-[#2C4E86] text-xs">{item.snippet}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[#7386A8] italic bg-[#F8F8F6] p-4 rounded-xl border border-[#CECECE] text-center">
                    No social media (X/Twitter) discourse items retrieved for this claim.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: GEMINI SEMANTIC VERIFICATION */}
          {activeTab === 'gptPayload' && (
            <div className="space-y-4">
              <div className="bg-[#F8F8F6] p-4 rounded-2xl border border-[#CECECE] space-y-2">
                <div className="font-semibold text-[#0B5CD5] text-sm flex items-center gap-2">
                  <Code className="w-4 h-4 text-[#D97757]" />
                  Exact Prompt Sent to Gemini (Agent 3):
                </div>
                <pre className="text-[#0B5CD5] bg-white p-3 rounded-xl border border-[#CECECE] font-mono text-[11px] whitespace-pre-wrap overflow-x-auto">
                  {gpt.promptSent || 'No search evidence was passed to Gemini (zero results returned).'}
                </pre>
              </div>

              <div className="bg-[#F8F8F6] p-4 rounded-2xl border border-[#CECECE] space-y-2">
                <div className="font-semibold text-[#3E7A55] text-sm flex items-center gap-2">
                  <Code className="w-4 h-4" />
                  Raw JSON Completion Returned by Gemini:
                </div>
                <pre className="text-[#0B5CD5] bg-white p-3 rounded-xl border border-[#CECECE] font-mono text-[11px] whitespace-pre-wrap overflow-x-auto">
                  {gpt.rawCompletion ? JSON.stringify(gpt.rawCompletion, null, 2) : 'N/A — Gemini verification API not invoked or unconfigured.'}
                </pre>
              </div>
            </div>
          )}

          {/* TAB 3: 9-SIGNAL FUZZY LOGIC TRACE */}
          {activeTab === 'fuzzyMath' && (
            <div className="space-y-6">
              {/* Crisp Inputs Table */}
              <div className="space-y-2">
                <div className="font-semibold text-[#0B5CD5] text-sm">9 Continuous Crisp Input Signals:</div>
                <div className="grid grid-cols-3 md:grid-cols-5 gap-2 text-center">
                  <div className="bg-[#F8F8F6] p-2.5 rounded-xl border border-[#CECECE]">
                    <span className="text-[10px] text-[#7386A8] block">1. Corroboration</span>
                    <span className="font-bold text-[#B98520] text-sm">{fuzzy.rawInputs?.corroborationScore} / 10</span>
                  </div>
                  <div className="bg-[#F8F8F6] p-2.5 rounded-xl border border-[#CECECE]">
                    <span className="text-[10px] text-[#7386A8] block">2. Source Credibility</span>
                    <span className="font-bold text-[#3E7A55] text-sm">{fuzzy.rawInputs?.sourceCredibilityScore}</span>
                  </div>
                  <div className="bg-[#F8F8F6] p-2.5 rounded-xl border border-[#CECECE]">
                    <span className="text-[10px] text-[#7386A8] block">3. Sentiment Intensity</span>
                    <span className="font-bold text-[#0B5CD5] text-sm">{fuzzy.rawInputs?.sentimentIntensity}</span>
                  </div>
                  <div className="bg-[#F8F8F6] p-2.5 rounded-xl border border-[#CECECE]">
                    <span className="text-[10px] text-[#7386A8] block">4. Significance</span>
                    <span className="font-bold text-[#0B5CD5] text-sm">{fuzzy.rawInputs?.claimSignificance} / 100</span>
                  </div>
                  <div className="bg-[#F8F8F6] p-2.5 rounded-xl border border-[#CECECE]">
                    <span className="text-[10px] text-[#7386A8] block">5. Model Confidence</span>
                    <span className="font-bold text-[#D97757] text-sm">{fuzzy.rawInputs?.modelConfidence}%</span>
                  </div>
                  <div className="bg-[#F8F8F6] p-2.5 rounded-xl border border-[#CECECE]">
                    <span className="text-[10px] text-[#7386A8] block">6. Discourse Volume</span>
                    <span className="font-bold text-[#0B5CD5] text-sm">{fuzzy.rawInputs?.discourseVolume}</span>
                  </div>
                  <div className="bg-[#F8F8F6] p-2.5 rounded-xl border border-[#CECECE]">
                    <span className="text-[10px] text-[#7386A8] block">7. Social Corrob</span>
                    <span className="font-bold text-[#3E7A55] text-sm">{fuzzy.rawInputs?.socialCorroborationScore}</span>
                  </div>
                  <div className="bg-[#F8F8F6] p-2.5 rounded-xl border border-[#CECECE]">
                    <span className="text-[10px] text-[#7386A8] block">8. Skepticism</span>
                    <span className="font-bold text-[#B23F35] text-sm">{fuzzy.rawInputs?.communitySkepticismScore}</span>
                  </div>
                  <div className="bg-[#F8F8F6] p-2.5 rounded-xl border border-[#CECECE] col-span-1">
                    <span className="text-[10px] text-[#7386A8] block">9. Scope</span>
                    <span className="font-bold text-[#0B5CD5] text-sm">{fuzzy.rawInputs?.claimScope}</span>
                  </div>
                </div>
              </div>

              {/* Activated Rules Trace */}
              <div className="space-y-2">
                <div className="font-semibold text-[#0B5CD5] text-sm">Activated Mamdani Fuzzy Rules:</div>
                <div className="bg-[#F8F8F6] p-4 rounded-2xl border border-[#CECECE] space-y-1.5 font-mono text-[11px]">
                  {(fuzzy.activatedRules || []).map((rule, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-[#2C4E86]">
                      <span className="text-[#D97757] font-bold">•</span>
                      <span>{rule}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Defuzzification Math Trace */}
              <div className="bg-[#F6E7DF] border border-[#E88F6B]/40 p-4 rounded-2xl space-y-2 font-mono">
                <div className="font-sans font-semibold text-[#B0512F] text-sm">Centroid Defuzzification Mathematical Trace:</div>
                <p className="text-[#2C4E86]">{fuzzy.defuzzificationMath?.formula}</p>
                <div className="grid grid-cols-2 gap-2 text-center text-xs pt-1">
                  <div className="bg-white p-2 rounded-xl border border-[#CECECE]">
                    <span className="text-[#7386A8] text-[10px] block">Numerator Integral ∫(x * μ(x)):</span>
                    <span className="font-bold text-[#B0512F]">{fuzzy.defuzzificationMath?.numerator}</span>
                  </div>
                  <div className="bg-white p-2 rounded-xl border border-[#CECECE]">
                    <span className="text-[#7386A8] text-[10px] block">Denominator Integral ∫(μ(x)):</span>
                    <span className="font-bold text-[#B0512F]">{fuzzy.defuzzificationMath?.denominator}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: DECISION SUMMARY */}
          {activeTab === 'decisionSummary' && (
            <div className="space-y-4">
              <div className="bg-[#F8F8F6] p-4 rounded-2xl border border-[#CECECE] space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h4 className="font-semibold text-[#0B5CD5] text-sm">Verdict Determination Analysis</h4>
                  <span className="font-mono text-xs font-bold text-[#D97757]">
                    Stance: {claim.verdict || claim.status}
                  </span>
                </div>
                <div className="p-3 bg-white rounded-xl border border-[#CECECE] text-xs font-medium text-[#2C4E86]">
                  <span className="font-bold text-[#0B5CD5] block font-mono text-[10px] uppercase mb-1">Stance Determination Reason:</span>
                  {claim.claimStanceReason || claim.claimVerificationResult?.claimStanceReason || claim.explanation}
                </div>
                {claim.technicalExplanation && (
                  <p className="text-[#7386A8] leading-relaxed text-[11px] font-mono">{claim.technicalExplanation}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#F8F8F6] p-3 rounded-xl border border-[#CECECE]">
                  <span className="text-[#7386A8] block mb-1">Scope Rules Applied</span>
                  <span className="font-semibold text-[#0B5CD5]">
                    {claim.claimScope === 'International' || claim.claimScope === 'National'
                      ? 'Global Scope: Absence of news is treated as strong fabrication evidence.'
                      : 'Regional Scope: Absence of global news is expected and normal (Rule R15).'
                    }
                  </span>
                </div>

                <div className="bg-[#F8F8F6] p-3 rounded-xl border border-[#CECECE]">
                  <span className="text-[#7386A8] block mb-1">Final Verdict Threshold Mapping</span>
                  <span className="font-semibold text-[#0B5CD5]">
                    Crisp Score {claim.confidence}% {claim.confidence >= 75 ? '>= 75% -> VERIFIED' : claim.confidence < 40 ? '< 40% -> FALSE' : '>= 40% & < 75% -> SUSPICIOUS'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: RAW API CALLS & EXACT FLOW */}
          {activeTab === 'apiCallsLedger' && (
            <div className="space-y-6">
              {/* Exact Pipeline Flow Stages */}
              {exactFlow && exactFlow.length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-semibold text-[#0B5CD5] text-sm flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#D97757]" />
                    Exact Step-by-Step Verification Flow ({exactFlow.length} Stages)
                  </h4>
                  <div className="space-y-2">
                    {exactFlow.map((step, sIdx) => (
                      <div key={sIdx} className="bg-[#F8F8F6] p-3 rounded-xl border border-[#CECECE] flex items-start gap-3">
                        <span className="w-6 h-6 rounded-lg bg-[#0B5CD5] text-white flex items-center justify-center font-bold text-xs font-mono shrink-0 mt-0.5">
                          {sIdx + 1}
                        </span>
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="font-bold text-[#0B5CD5]">{step.title}</span>
                            <span className="font-mono text-[10px] text-[#7386A8]">
                              {step.durationMs ? `${step.durationMs}ms` : ''} · {step.status}
                            </span>
                          </div>
                          <p className="text-xs text-[#2C4E86]">{step.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Raw API Calls */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-[#0B5CD5] text-sm flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-[#D97757]" />
                    Raw Outbound API Calls &amp; Payloads ({apiCalls.length})
                  </h4>
                  {onOpenDebugPanel && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenDebugPanel(claim);
                      }}
                      className="text-xs text-[#0B5CD5] hover:underline font-mono font-bold"
                    >
                      Open Full Interactive Inspector →
                    </button>
                  )}
                </div>

                {apiCalls.length === 0 ? (
                  <div className="p-6 bg-[#F8F8F6] border border-dashed border-[#CECECE] rounded-xl text-center text-[#7386A8]">
                    No captured API call objects for this claim record.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {apiCalls.map((call, cIdx) => (
                      <div key={call.id || cIdx} className="bg-[#F8F8F6] p-4 rounded-2xl border border-[#CECECE] space-y-3 font-mono text-[11px]">
                        <div className="flex items-center justify-between gap-2 flex-wrap border-b border-[#CECECE] pb-2">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 bg-[#0B5CD5] text-white rounded font-bold text-[10px]">
                              {call.method || 'POST'}
                            </span>
                            <span className="font-bold text-[#0B5CD5]">{call.service}</span>
                            <span className="text-[#7386A8] text-[10px] break-all">{call.endpoint}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {call.latencyMs && (
                              <span className="px-2 py-0.5 bg-[#EFEEE9] text-[#2C4E86] rounded border border-[#CECECE]">
                                {call.latencyMs}ms
                              </span>
                            )}
                            <span className="px-2 py-0.5 bg-[#E4EFE7] text-[#2C5B3E] rounded font-bold border border-[#C5DEC9]">
                              {call.status || 200}
                            </span>
                          </div>
                        </div>

                        {/* Request Payload */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[#7386A8]">
                            <span>Request Payload:</span>
                            <button
                              type="button"
                              onClick={() => copyText(call.requestPayload, `req-${cIdx}`)}
                              className="text-[#0B5CD5] hover:underline flex items-center gap-1 text-[10px]"
                            >
                              {copiedId === `req-${cIdx}` ? <Check className="w-3 h-3 text-[#2C5B3E]" /> : <Copy className="w-3 h-3" />}
                              <span>{copiedId === `req-${cIdx}` ? 'Copied' : 'Copy'}</span>
                            </button>
                          </div>
                          <pre className="p-2.5 bg-white border border-[#CECECE] rounded-xl overflow-x-auto max-h-40 text-[10.5px] text-[#2C4E86]">
                            {typeof call.requestPayload === 'string' ? call.requestPayload : JSON.stringify(call.requestPayload, null, 2)}
                          </pre>
                        </div>

                        {/* Response Payload */}
                        {call.responsePayload && (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[#7386A8]">
                              <span>Response Payload / Extract:</span>
                              <button
                                type="button"
                                onClick={() => copyText(call.responsePayload, `res-${cIdx}`)}
                                className="text-[#0B5CD5] hover:underline flex items-center gap-1 text-[10px]"
                              >
                                {copiedId === `res-${cIdx}` ? <Check className="w-3 h-3 text-[#2C5B3E]" /> : <Copy className="w-3 h-3" />}
                                <span>{copiedId === `res-${cIdx}` ? 'Copied' : 'Copy'}</span>
                              </button>
                            </div>
                            <pre className="p-2.5 bg-white border border-[#CECECE] rounded-xl overflow-x-auto max-h-40 text-[10.5px] text-[#2C4E86]">
                              {typeof call.responsePayload === 'string' ? call.responsePayload : JSON.stringify(call.responsePayload, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#CECECE] bg-[#F8F8F6] flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-[#EFEEE9] hover:bg-[#CECECE] text-[#0B5CD5] font-semibold rounded-xl transition-colors text-xs shadow-xs"
          >
            Close Audit Trail
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
