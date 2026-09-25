import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { generateClaimDiagnosticJson } from '../utils/claimDiagnosticExport';
import { 
  Activity, 
  Search, 
  Cpu, 
  Layers, 
  ArrowRight, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  ExternalLink, 
  Copy, 
  Check, 
  Code, 
  Clock, 
  Globe, 
  Database,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  Zap,
  Terminal,
  FileJson
} from 'lucide-react';

export default function Agent3DebugPanel({ claim, onClose }) {
  const [activeTab, setActiveTab] = useState('flow'); // 'flow' | 'apiCalls' | 'fuzzyMath' | 'evidence'
  const [selectedCallId, setSelectedCallId] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);
  const [activeStepIdx, setActiveStepIdx] = useState(0);

  if (!claim) return null;

  const audit = claim.auditTrail || {};
  const apiCalls = claim.apiCalls || audit.apiCalls || [];
  const exactFlow = claim.exactFlow || audit.exactFlow || [];
  const fuzzy = audit.fuzzyMathTrace || {};
  const rawHits = audit.rawSearchHits || {};
  const evidenceEvaluations = claim.evidenceEvaluations || audit.evidenceEvaluations || [];

  // Set default selected call if not set
  const currentCall = apiCalls.find(c => c.id === selectedCallId) || apiCalls[0] || null;

  const handleCopy = (text, key) => {
    if (!text) return;
    navigator.clipboard.writeText(typeof text === 'string' ? text : JSON.stringify(text, null, 2));
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const getStatusBadge = (status) => {
    const s = (status || '').toUpperCase();
    if (s === 'VERIFIED' || s === 'TRUSTED' || s === 'COMPLETED' || s === '200') {
      return 'bg-[#E4EFE7] text-[#2C5B3E] border-[#C5DEC9]';
    }
    if (s === 'FALSE' || s === 'FABRICATED' || s === 'FAILED' || s.startsWith('5')) {
      return 'bg-[#F7E3E0] text-[#B23F35] border-[#EBC7C2]';
    }
    return 'bg-[#F7EEDA] text-[#B98520] border-[#E8D4B0]';
  };

  // Lock document body scroll while Agent 3 Inspector is open
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md overflow-y-auto animate-fadeIn"
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', margin: 0 }}
      onClick={onClose}
    >
      <div
        className="bg-white border border-[#CECECE] rounded-3xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-xs text-[#2C4E86] my-auto"
        onClick={e => e.stopPropagation()}
      >
        
        {/* Panel Header */}
        <div className="p-5 bg-[#000D59] text-white border-b border-[rgba(240,237,233,0.16)] flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-[#D97757] text-white">
                Agent 3 Inspector
              </span>
              <span className="text-[11px] font-mono text-[#A7B0D4]">
                Multi-Perspective Verification Telemetry &amp; Serper APIs
              </span>
            </div>
            <h3 className="text-base font-bold text-[#F0EDE9] leading-snug">
              "{claim.claimText || claim.text || claim.claim || 'Selected Claim Assertion'}"
            </h3>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="bg-[#031246] px-3 py-1.5 rounded-xl border border-[rgba(240,237,233,0.2)] text-right font-mono">
              <div className="text-[10px] text-[#A7B0D4] uppercase">Verdict &amp; Confidence</div>
              <div className="text-sm font-bold text-[#F0EDE9]">
                {claim.verdict || claim.status || 'UNVERIFIED'} ({claim.confidence || 0}%)
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const diag = generateClaimDiagnosticJson(claim);
                handleCopy(diag, 'headerDiagJson');
              }}
              className="px-3 py-2 bg-[#D97757] hover:bg-[#B0512F] text-white font-bold rounded-xl text-xs transition shadow-sm flex items-center gap-1.5 cursor-pointer"
              title="Copy Complete Diagnostic JSON for this claim to Clipboard"
            >
              {copiedKey === 'headerDiagJson' ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5 text-white" />}
              {copiedKey === 'headerDiagJson' ? 'Copied JSON!' : 'Copy Diagnostic JSON'}
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 bg-[#EFEEE9] hover:bg-[#CECECE] text-[#000D59] font-bold rounded-xl text-xs transition shadow-sm"
              >
                Close
              </button>
            )}
          </div>
        </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-[#CECECE] bg-[#EFEEE9] px-5 gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('flow')}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'flow'
              ? 'border-[#D97757] text-[#D97757] bg-white shadow-xs'
              : 'border-transparent text-[#7386A8] hover:text-[#0B5CD5]'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          1. Exact Verification Flow ({exactFlow.length || 6} Steps)
        </button>

        <button
          onClick={() => setActiveTab('apiCalls')}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'apiCalls'
              ? 'border-[#D97757] text-[#D97757] bg-white shadow-xs'
              : 'border-transparent text-[#7386A8] hover:text-[#0B5CD5]'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          2. API Calls &amp; Payloads ({apiCalls.length} executed)
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
          onClick={() => setActiveTab('evidence')}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'evidence'
              ? 'border-[#D97757] text-[#D97757] bg-white shadow-xs'
              : 'border-transparent text-[#7386A8] hover:text-[#0B5CD5]'
          }`}
        >
          <Search className="w-3.5 h-3.5" />
          4. Evidence &amp; Stance Matrix ({evidenceEvaluations.length} sources)
        </button>

        <button
          onClick={() => setActiveTab('diagnosticJson')}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'diagnosticJson'
              ? 'border-[#D97757] text-[#D97757] bg-white shadow-xs'
              : 'border-transparent text-[#7386A8] hover:text-[#0B5CD5]'
          }`}
        >
          <FileJson className="w-3.5 h-3.5 text-[#D97757]" />
          5. Claim Diagnostic JSON (Full Audit)
        </button>
      </div>

      {/* Main Content Area */}
      <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-[#F8F8F6]">

        {/* ========================================================================= */}
        {/* TAB 1: EXACT STEP-BY-STEP FLOW                                            */}
        {/* ========================================================================= */}
        {activeTab === 'flow' && (
          <div className="space-y-6">
            <div className="bg-white p-4 rounded-2xl border border-[#CECECE] flex items-center justify-between">
              <div>
                <h4 className="font-bold text-[#0B5CD5] text-sm">Lifecycle Execution Flow</h4>
                <p className="text-xs text-[#7386A8]">
                  Deterministic progression from claim decomposition to multi-perspective search, LLM stance checking, and fuzzy synthesis.
                </p>
              </div>
              <span className="font-mono text-xs font-bold text-[#3E7A55] bg-[#E4EFE7] px-2.5 py-1 rounded-lg border border-[#C5DEC9]">
                Deterministic Pipeline
              </span>
            </div>

            {/* Stepper Timeline */}
            <div className="space-y-3">
              {exactFlow.length > 0 ? (
                exactFlow.map((step, idx) => (
                  <div
                    key={idx}
                    className="bg-white border border-[#CECECE] rounded-2xl overflow-hidden shadow-xs"
                  >
                    <div className="p-4 flex items-start justify-between gap-4 border-b border-[#CECECE]/60">
                      <div className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-lg bg-[#D97757] text-white flex items-center justify-center font-mono font-bold text-xs flex-shrink-0 mt-0.5">
                          {step.step || idx + 1}
                        </div>
                        <div>
                          <h5 className="font-bold text-sm text-[#0B5CD5]">{step.name}</h5>
                          <p className="text-xs text-[#2C4E86] mt-0.5">{step.description}</p>
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${getStatusBadge(step.status)}`}>
                        {step.status || 'COMPLETED'}
                      </span>
                    </div>

                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 bg-[#F8F8F6]/50 text-[11px]">
                      {/* Inputs */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[#7386A8] font-mono text-[10px] uppercase font-bold">
                          <span>Inputs</span>
                          <button
                            onClick={() => handleCopy(step.inputs, `flow-in-${idx}`)}
                            className="hover:text-[#0B5CD5] flex items-center gap-1"
                          >
                            {copiedKey === `flow-in-${idx}` ? <Check className="w-3 h-3 text-[#3E7A55]" /> : <Copy className="w-3 h-3" />}
                            <span>Copy</span>
                          </button>
                        </div>
                        <pre className="p-2.5 bg-white border border-[#CECECE] rounded-xl font-mono text-[10px] text-[#0B5CD5] overflow-x-auto whitespace-pre-wrap max-h-36">
                          {JSON.stringify(step.inputs || {}, null, 2)}
                        </pre>
                      </div>

                      {/* Outputs */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[#7386A8] font-mono text-[10px] uppercase font-bold">
                          <span>Outputs</span>
                          <button
                            onClick={() => handleCopy(step.outputs, `flow-out-${idx}`)}
                            className="hover:text-[#0B5CD5] flex items-center gap-1"
                          >
                            {copiedKey === `flow-out-${idx}` ? <Check className="w-3 h-3 text-[#3E7A55]" /> : <Copy className="w-3 h-3" />}
                            <span>Copy</span>
                          </button>
                        </div>
                        <pre className="p-2.5 bg-white border border-[#CECECE] rounded-xl font-mono text-[10px] text-[#3E7A55] overflow-x-auto whitespace-pre-wrap max-h-36">
                          {JSON.stringify(step.outputs || {}, null, 2)}
                        </pre>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-6 bg-white rounded-2xl border border-[#CECECE] text-center text-[#7386A8]">
                  Detailed flow telemetry not recorded for this execution.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: API CALLS & PAYLOADS                                               */}
        {/* ========================================================================= */}
        {activeTab === 'apiCalls' && (
          <div className="space-y-6">
            <div className="bg-white p-4 rounded-2xl border border-[#CECECE] flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h4 className="font-bold text-[#0B5CD5] text-sm">External API Invocations &amp; Telemetry</h4>
                <p className="text-xs text-[#7386A8]">
                  Inspect the exact endpoints, request payloads sent, latency in milliseconds, and raw responses returned.
                </p>
              </div>
              <span className="font-mono text-xs font-bold text-[#0B5CD5] bg-[#EFEEE9] px-2.5 py-1 rounded-lg border border-[#CECECE]">
                {apiCalls.length} Calls Recorded
              </span>
            </div>

            {apiCalls.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Calls Selector List */}
                <div className="space-y-2 lg:col-span-1">
                  <span className="text-[10px] font-mono font-bold uppercase text-[#7386A8] block px-1">
                    Executed Calls:
                  </span>
                  {apiCalls.map((call, idx) => {
                    const isSelected = (currentCall?.id === call.id) || (!selectedCallId && idx === 0);
                    return (
                      <button
                        key={call.id || idx}
                        onClick={() => setSelectedCallId(call.id)}
                        className={`w-full p-3.5 rounded-2xl border text-left transition flex flex-col gap-1.5 ${
                          isSelected
                            ? 'bg-[#EFEEE9] border-[#D97757] shadow-sm ring-1 ring-[#D97757]/30'
                            : 'bg-white border-[#CECECE] hover:border-[#D97757]/50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="px-1.5 py-0.5 rounded text-[9.5px] font-mono font-bold uppercase bg-[#F6E7DF] text-[#B0512F]">
                            {call.method || 'POST'}
                          </span>
                          <span className="text-[11px] font-mono font-bold text-[#D97757]">
                            {call.latencyMs ? `${call.latencyMs}ms` : 'Recorded'}
                          </span>
                        </div>
                        <div className="font-bold text-xs text-[#0B5CD5] truncate">
                          {call.service}: {call.operation}
                        </div>
                        <div className="text-[10px] font-mono text-[#7386A8] truncate">
                          {call.endpoint || call.model || 'External Service'}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Selected Call Inspector Detail */}
                <div className="lg:col-span-2 space-y-4">
                  {currentCall ? (
                    <div className="bg-white border border-[#CECECE] rounded-2xl p-5 space-y-5">
                      {/* Meta Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#CECECE] pb-4">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-[#0B5CD5]">
                              {currentCall.service}
                            </span>
                            <span className="text-xs text-[#7386A8]">·</span>
                            <span className="text-xs font-semibold text-[#2C4E86]">
                              {currentCall.operation}
                            </span>
                          </div>
                          <div className="font-mono text-[10px] text-[#7386A8] break-all">
                            {currentCall.endpoint}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-[#E4EFE7] text-[#2C5B3E] border border-[#C5DEC9]">
                            Status: {currentCall.status || 200}
                          </span>
                          <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-[#EFEEE9] text-[#0B5CD5]">
                            Latency: {currentCall.latencyMs || 0}ms
                          </span>
                        </div>
                      </div>

                      {/* Request Payload */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[10px] font-bold uppercase text-[#7386A8] flex items-center gap-1.5">
                            <Code className="w-3.5 h-3.5 text-[#D97757]" />
                            Request Payload
                          </span>
                          <button
                            onClick={() => handleCopy(currentCall.requestPayload, 'reqPayload')}
                            className="text-[10px] font-mono text-[#0B5CD5] hover:underline flex items-center gap-1"
                          >
                            {copiedKey === 'reqPayload' ? <Check className="w-3 h-3 text-[#3E7A55]" /> : <Copy className="w-3 h-3" />}
                            <span>Copy Request JSON</span>
                          </button>
                        </div>
                        <pre className="p-3 bg-[#F8F8F6] border border-[#CECECE] rounded-xl font-mono text-[10.5px] text-[#0B5CD5] overflow-x-auto whitespace-pre-wrap max-h-56 leading-relaxed">
                          {JSON.stringify(currentCall.requestPayload || {}, null, 2)}
                        </pre>
                      </div>

                      {/* Response Payload */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[10px] font-bold uppercase text-[#7386A8] flex items-center gap-1.5">
                            <FileJson className="w-3.5 h-3.5 text-[#3E7A55]" />
                            Response Payload ({currentCall.resultCount !== undefined ? `${currentCall.resultCount} items` : 'Parsed JSON'})
                          </span>
                          <button
                            onClick={() => handleCopy(currentCall.responsePayload, 'resPayload')}
                            className="text-[10px] font-mono text-[#0B5CD5] hover:underline flex items-center gap-1"
                          >
                            {copiedKey === 'resPayload' ? <Check className="w-3 h-3 text-[#3E7A55]" /> : <Copy className="w-3 h-3" />}
                            <span>Copy Response JSON</span>
                          </button>
                        </div>
                        <pre className="p-3 bg-[#F8F8F6] border border-[#CECECE] rounded-xl font-mono text-[10.5px] text-[#2C4E86] overflow-x-auto whitespace-pre-wrap max-h-72 leading-relaxed">
                          {JSON.stringify(currentCall.responsePayload || currentCall.error || {}, null, 2)}
                        </pre>
                      </div>
                    </div>
                  ) : (
                    <div className="p-6 bg-white rounded-2xl border border-[#CECECE] text-center text-[#7386A8]">
                      Select an API call to inspect payloads.
                    </div>
                  )}
                </div>

              </div>
            ) : (
              <div className="p-8 bg-white rounded-2xl border border-[#CECECE] text-center space-y-2">
                <p className="text-sm font-semibold text-[#0B5CD5]">No individual API call records logged.</p>
                <p className="text-xs text-[#7386A8]">
                  External calls will populate here automatically during live or recently analyzed claim verification runs.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: 9-SIGNAL FUZZY LOGIC TRACE                                         */}
        {/* ========================================================================= */}
        {activeTab === 'fuzzyMath' && (
          <div className="space-y-6">
            {/* Crisp Inputs Matrix */}
            <div className="space-y-2">
              <div className="font-semibold text-[#0B5CD5] text-sm">9 Continuous Crisp Input Signals:</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 text-center">
                <div className="bg-white p-3 rounded-xl border border-[#CECECE] shadow-xs">
                  <span className="text-[10px] text-[#7386A8] block">1. Corroboration</span>
                  <span className="font-bold text-[#B98520] text-base">{fuzzy.rawInputs?.corroborationScore ?? 'N/A'}/10</span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-[#CECECE] shadow-xs">
                  <span className="text-[10px] text-[#7386A8] block">2. Source Credibility</span>
                  <span className="font-bold text-[#3E7A55] text-base">{fuzzy.rawInputs?.sourceCredibilityScore ?? 'N/A'}</span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-[#CECECE] shadow-xs">
                  <span className="text-[10px] text-[#7386A8] block">3. Sentiment Intensity</span>
                  <span className="font-bold text-[#0B5CD5] text-base">{fuzzy.rawInputs?.sentimentIntensity ?? 'N/A'}</span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-[#CECECE] shadow-xs">
                  <span className="text-[10px] text-[#7386A8] block">4. Significance</span>
                  <span className="font-bold text-[#0B5CD5] text-base">{fuzzy.rawInputs?.claimSignificance ?? 'N/A'}/100</span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-[#CECECE] shadow-xs">
                  <span className="text-[10px] text-[#7386A8] block">5. Model Confidence</span>
                  <span className="font-bold text-[#D97757] text-base">{fuzzy.rawInputs?.modelConfidence ?? 'N/A'}%</span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-[#CECECE] shadow-xs">
                  <span className="text-[10px] text-[#7386A8] block">6. Discourse Volume</span>
                  <span className="font-bold text-[#0B5CD5] text-base">{fuzzy.rawInputs?.discourseVolume ?? '0'}</span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-[#CECECE] shadow-xs">
                  <span className="text-[10px] text-[#7386A8] block">7. Social Corroboration</span>
                  <span className="font-bold text-[#3E7A55] text-base">{fuzzy.rawInputs?.socialCorroborationScore ?? '0'}</span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-[#CECECE] shadow-xs">
                  <span className="text-[10px] text-[#7386A8] block">8. Skepticism Density</span>
                  <span className="font-bold text-[#B23F35] text-base">{fuzzy.rawInputs?.communitySkepticismScore ?? '0'}</span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-[#CECECE] shadow-xs sm:col-span-2">
                  <span className="text-[10px] text-[#7386A8] block">9. Scope &amp; Plausibility</span>
                  <span className="font-bold text-[#0B5CD5] text-sm">
                    {fuzzy.rawInputs?.claimScope || 'Regional'} · {fuzzy.rawInputs?.plausibilityFlag ? 'Implausible Flag' : 'Normal'}
                  </span>
                </div>
              </div>
            </div>

            {/* Defuzzification Math Card */}
            {fuzzy.defuzzificationMath && (
              <div className="bg-white p-5 rounded-2xl border border-[#CECECE] space-y-2 shadow-xs">
                <div className="font-semibold text-[#0B5CD5] text-sm flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#D97757]" />
                  Centroid Defuzzification Formulation:
                </div>
                <div className="p-3 bg-[#EFEEE9] rounded-xl font-mono text-xs text-[#0B5CD5] break-all">
                  {fuzzy.defuzzificationMath.formula}
                </div>
                <div className="grid grid-cols-3 gap-2 text-center pt-1 font-mono text-xs">
                  <div className="bg-[#F8F8F6] p-2 rounded-lg border border-[#CECECE]">
                    <span className="text-[#7386A8] text-[10px] block">Numerator (∫ x·μ(x))</span>
                    <span className="font-bold text-[#0B5CD5]">{fuzzy.defuzzificationMath.numerator}</span>
                  </div>
                  <div className="bg-[#F8F8F6] p-2 rounded-lg border border-[#CECECE]">
                    <span className="text-[#7386A8] text-[10px] block">Denominator (∫ μ(x))</span>
                    <span className="font-bold text-[#0B5CD5]">{fuzzy.defuzzificationMath.denominator}</span>
                  </div>
                  <div className="bg-[#F8F8F6] p-2 rounded-lg border border-[#CECECE]">
                    <span className="text-[#7386A8] text-[10px] block">Crisp Defuzzified Score</span>
                    <span className="font-bold text-[#D97757]">{claim.fuzzySignalBreakdown?.crispDefuzzifiedScore || claim.confidence}%</span>
                  </div>
                </div>
              </div>
            )}

            {/* Activated Rules */}
            <div className="bg-white p-5 rounded-2xl border border-[#CECECE] space-y-3 shadow-xs">
              <div className="font-semibold text-[#0B5CD5] text-sm">
                Activated Mamdani Inference Rules ({(fuzzy.activatedRules || []).length} active):
              </div>
              <div className="space-y-1.5 font-mono text-[11px]">
                {(fuzzy.activatedRules || []).map((rule, idx) => (
                  <div key={idx} className="p-2.5 bg-[#F8F8F6] rounded-xl border border-[#CECECE] flex items-center justify-between text-[#2C4E86]">
                    <span>{rule}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: EVIDENCE & STANCE MATRIX                                           */}
        {/* ========================================================================= */}
        {activeTab === 'evidence' && (
          <div className="space-y-6">
            <div className="bg-white p-4 rounded-2xl border border-[#CECECE] flex items-center justify-between">
              <div>
                <h4 className="font-bold text-[#0B5CD5] text-sm">Source Evidence &amp; Semantic Stances</h4>
                <p className="text-xs text-[#7386A8]">
                  Direct semantic alignment evaluation comparing retrieved articles with claim assertions.
                </p>
              </div>
              <span className="font-mono text-xs font-bold text-[#0B5CD5] bg-[#EFEEE9] px-2.5 py-1 rounded-lg border border-[#CECECE]">
                {evidenceEvaluations.length} Sources Evaluated
              </span>
            </div>

            {/* Claim Stance Summary Banner */}
            <div className="bg-[#EFEEE9] p-4 rounded-2xl border border-[#CECECE] space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-[#0B5CD5] text-xs uppercase font-mono">Claim Stance Reason &amp; Decision</span>
                <span className="font-mono text-xs font-bold text-[#D97757]">{claim.verdict || claim.status}</span>
              </div>
              <p className="text-xs text-[#2C4E86] font-medium leading-relaxed">
                {claim.claimStanceReason || claim.claimVerificationResult?.claimStanceReason || claim.explanation}
              </p>
            </div>

            {/* Evidence Guard Gate Telemetry (Grounded Engine Safeguards) */}
            {claim.evidenceGuardChecks && (
              <div className="bg-white p-4 rounded-2xl border border-[#0B5CD5]/20 space-y-2.5 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#0B5CD5] text-xs uppercase font-mono flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-[#3E7A55]" />
                    Evidence Guard Gate (Safeguard Telemetry)
                  </span>
                  <span className="text-[10px] font-mono text-[#7386A8]">
                    Retrieval: <strong className="text-[#0B5CD5]">{claim.retrievalMethod || 'GROUNDED'}</strong>
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
                  <div className="p-2 rounded-xl bg-[#F8F8F6] border border-[#CECECE]">
                    <span className="text-[#7386A8] text-[10px] block">Temporal Match</span>
                    <span className={`font-bold ${claim.evidenceGuardChecks.hasYearMatch !== false ? 'text-[#3E7A55]' : 'text-[#B23F35]'}`}>
                      {claim.evidenceGuardChecks.hasYearMatch !== false ? 'PASS' : 'YEAR MISMATCH'}
                    </span>
                  </div>
                  <div className="p-2 rounded-xl bg-[#F8F8F6] border border-[#CECECE]">
                    <span className="text-[#7386A8] text-[10px] block">Quantity Check</span>
                    <span className={`font-bold ${!claim.evidenceGuardChecks.hasQuantityMismatch ? 'text-[#3E7A55]' : 'text-[#B23F35]'}`}>
                      {!claim.evidenceGuardChecks.hasQuantityMismatch ? 'PASS' : 'SCALE CONFLICT'}
                    </span>
                  </div>
                  <div className="p-2 rounded-xl bg-[#F8F8F6] border border-[#CECECE]">
                    <span className="text-[#7386A8] text-[10px] block">Authority Tiering</span>
                    <span className="font-bold text-[#0B5CD5]">
                      T0:{claim.evidenceGuardChecks.authorityDistribution?.tier0 || 0} | T1:{claim.evidenceGuardChecks.authorityDistribution?.tier1 || 0} | T2:{claim.evidenceGuardChecks.authorityDistribution?.tier2 || 0}
                    </span>
                  </div>
                  <div className="p-2 rounded-xl bg-[#F8F8F6] border border-[#CECECE]">
                    <span className="text-[#7386A8] text-[10px] block">Contradictions</span>
                    <span className={`font-bold ${!claim.evidenceGuardChecks.hasContradiction ? 'text-[#3E7A55]' : 'text-[#B23F35]'}`}>
                      {!claim.evidenceGuardChecks.hasContradiction ? 'NONE' : 'CONTRADICTION DETECTED'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {evidenceEvaluations.length > 0 ? (
                evidenceEvaluations.map((evalObj, idx) => {
                  const source = (claim.sources || [])[evalObj.sourceIndex] || (rawHits.webHits || [])[evalObj.sourceIndex] || {};
                  return (
                    <div key={idx} className="bg-white border border-[#CECECE] rounded-2xl p-4 space-y-3 shadow-xs">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#CECECE]/60 pb-2.5">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                            evalObj.stance === 'SUPPORTS' ? 'bg-[#E4EFE7] text-[#2C5B3E]' :
                            evalObj.stance === 'REFUTES' ? 'bg-[#F7E3E0] text-[#B23F35]' : 'bg-[#EFEEE9] text-[#7386A8]'
                          }`}>
                            {evalObj.stance}
                          </span>
                          <span className="font-bold text-xs text-[#0B5CD5] truncate max-w-sm">
                            {source.title || `Evidence Source ${idx + 1}`}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-[10px] font-mono">
                          <span className="text-[#7386A8]">Relevance: <strong className="text-[#0B5CD5]">{evalObj.relevanceScore || 50}%</strong></span>
                          {source.domain && (
                            <span className="px-2 py-0.5 rounded bg-[#EFEEE9] text-[#2C4E86]">
                              {source.domain}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Snippet / Passage */}
                      {(source.snippet || source.fetchedPassage) && (
                        <p className="text-xs text-[#2C4E86] bg-[#F8F8F6] p-3 rounded-xl border border-[#CECECE] italic">
                          "{source.fetchedPassage || source.snippet}"
                        </p>
                      )}

                      {/* Alignment Checkmarks & Reason */}
                      <div className="flex flex-wrap items-center gap-2 text-[10.5px] font-mono">
                        <span className={`px-2 py-0.5 rounded border ${evalObj.entityMatch ? 'bg-[#E4EFE7] text-[#2C5B3E] border-[#C5DEC9]' : 'bg-[#EFEEE9] text-[#7386A8]'}`}>
                          Entity: {evalObj.entityMatch ? 'MATCH' : 'MISMATCH'}
                        </span>
                        <span className={`px-2 py-0.5 rounded border ${evalObj.eventMatch ? 'bg-[#E4EFE7] text-[#2C5B3E] border-[#C5DEC9]' : 'bg-[#EFEEE9] text-[#7386A8]'}`}>
                          Event: {evalObj.eventMatch ? 'MATCH' : 'MISMATCH'}
                        </span>
                        <span className={`px-2 py-0.5 rounded border ${evalObj.temporalMatch ? 'bg-[#E4EFE7] text-[#2C5B3E] border-[#C5DEC9]' : 'bg-[#EFEEE9] text-[#7386A8]'}`}>
                          Temporal: {evalObj.temporalMatch ? 'MATCH' : 'MISMATCH'}
                        </span>
                        <span className={`px-2 py-0.5 rounded border ${evalObj.locationMatch ? 'bg-[#E4EFE7] text-[#2C5B3E] border-[#C5DEC9]' : 'bg-[#EFEEE9] text-[#7386A8]'}`}>
                          Location: {evalObj.locationMatch ? 'MATCH' : 'MISMATCH'}
                        </span>
                      </div>

                      {evalObj.reason && (
                        <p className="text-xs text-[#2C4E86] pt-1">
                          <strong className="text-[#D97757]">Evaluation Reasoning:</strong> {evalObj.reason}
                        </p>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="p-6 bg-white rounded-2xl border border-[#CECECE] text-center text-[#7386A8]">
                  No evidence evaluations found. Zero search candidates matched this claim.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 5: CLAIM DIAGNOSTIC JSON REPORT                                       */}
        {/* ========================================================================= */}
        {activeTab === 'diagnosticJson' && (() => {
          const diagData = generateClaimDiagnosticJson(claim);
          const jsonString = JSON.stringify(diagData, null, 2);
          return (
            <div className="space-y-4">
              <div className="bg-white p-5 rounded-2xl border border-[#CECECE] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
                <div>
                  <h4 className="font-bold text-[#0B5CD5] text-sm flex items-center gap-2">
                    <FileJson className="w-4 h-4 text-[#D97757]" />
                    Complete Claim Evidentiary &amp; Diagnostic Audit Report
                  </h4>
                  <p className="text-[#7386A8] text-xs mt-0.5">
                    Deterministic ledger containing all weights, per-source scores, stance reasons, and override flags.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(jsonString, 'tabDiagJson')}
                  className="px-4 py-2 bg-[#D97757] hover:bg-[#B0512F] text-white font-bold rounded-xl text-xs transition shadow-sm flex items-center gap-2 self-start sm:self-auto cursor-pointer flex-shrink-0"
                >
                  {copiedKey === 'tabDiagJson' ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4 text-white" />}
                  {copiedKey === 'tabDiagJson' ? 'Diagnostic JSON Copied!' : 'Copy Diagnostic JSON'}
                </button>
              </div>

              {/* Formula & Key Diagnostics Highlights Pill Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                <div className="bg-white p-3 rounded-xl border border-[#CECECE]">
                  <span className="text-[10px] text-[#7386A8] block uppercase">Final Confidence</span>
                  <span className="text-sm font-bold text-[#0B5CD5]">{diagData.verdictOutcome?.confidenceScore}%</span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-[#CECECE]">
                  <span className="text-[10px] text-[#7386A8] block uppercase">Source Agreement</span>
                  <span className="text-sm font-bold text-[#2C5B3E]">{diagData.scoringFormulaBreakdown?.factorScores?.sourceAgreement}%</span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-[#CECECE]">
                  <span className="text-[10px] text-[#7386A8] block uppercase">Source Authority</span>
                  <span className="text-sm font-bold text-[#D97757]">{diagData.scoringFormulaBreakdown?.factorScores?.sourceAuthority}/100</span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-[#CECECE]">
                  <span className="text-[10px] text-[#7386A8] block uppercase">Canonical Verdict</span>
                  <span className={`text-sm font-bold ${
                    diagData.verdictOutcome?.canonicalVerdict === 'VERIFIED' ? 'text-[#2C5B3E]' :
                    diagData.verdictOutcome?.canonicalVerdict === 'FALSE' ? 'text-[#B23F35]' : 'text-[#B98520]'
                  }`}>
                    {diagData.verdictOutcome?.canonicalVerdict}
                  </span>
                </div>
              </div>

              {/* JSON Preformatted Code Viewer */}
              <div className="relative rounded-2xl bg-[#031246] border border-[#2C4E86]/30 overflow-hidden shadow-inner">
                <div className="p-3 bg-[#000D59] border-b border-[rgba(240,237,233,0.12)] flex items-center justify-between text-[11px] font-mono text-[#A7B0D4]">
                  <span>claim_diagnostic_report.json ({Math.round(jsonString.length / 1024 * 10) / 10} KB)</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(jsonString, 'codeBlockDiagJson')}
                    className="flex items-center gap-1 text-[#F0EDE9] hover:text-[#D97757] transition"
                  >
                    {copiedKey === 'codeBlockDiagJson' ? <Check className="w-3.5 h-3.5 text-[#2C5B3E]" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedKey === 'codeBlockDiagJson' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="p-4 text-[11px] font-mono text-[#E2E8F0] overflow-x-auto max-h-[450px] leading-relaxed select-all">
                  {jsonString}
                </pre>
              </div>
            </div>
          );
        })()}

      </div>
    </div>
  </div>,
  document.body
);
}
