import React, { useState } from 'react';
import { Activity, Clock, ShieldAlert, CheckCircle, Search, Cpu, FileText, BarChart2, ChevronDown, ChevronRight, Info } from 'lucide-react';

export default function ObservabilityPanel({ observability, reportData }) {
  const [activeTab, setActiveTab] = useState('phase3');
  const [expandedClaimId, setExpandedClaimId] = useState(null);

  if (!observability || !observability.phases) {
    return (
      <div className="bg-white border border-[#CECECE] rounded-2xl p-6 text-[#7386A8] text-xs">
        <p className="flex items-center gap-2">
          <Info className="w-4 h-4 text-[#0B5CD5]" />
          Observability telemetry payload not available for this run.
        </p>
      </div>
    );
  }

  const { phases, summary, totalDurationMs } = observability;

  const toggleClaimExpand = (id) => {
    setExpandedClaimId(expandedClaimId === id ? null : id);
  };

  return (
    <div className="bg-white border border-[#CECECE] rounded-3xl p-6 shadow-sm space-y-6 text-xs text-[#2C4E86]">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-[#CECECE]">
        <div>
          <div className="flex items-center gap-2 text-[#D97757] font-bold text-xs uppercase tracking-wider mb-1 font-mono">
            <Activity className="w-4 h-4" />
            System Observability & Agent Inspection Engine
          </div>
          <h3 className="text-xl font-bold text-[#0B5CD5]">Phase-by-Phase Telemetry & Execution Audit</h3>
        </div>

        {/* Execution Duration Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="bg-[#EFEEE9] border border-[#CECECE] rounded-xl px-3 py-1.5 flex items-center gap-2 text-xs">
            <Clock className="w-3.5 h-3.5 text-[#D97757]" />
            <span className="text-[#7386A8]">Total:</span>
            <span className="font-bold text-[#0B5CD5] font-mono">{totalDurationMs}ms</span>
          </div>
          <div className="bg-[#EFEEE9] border border-[#CECECE] rounded-xl px-2.5 py-1 text-xs font-mono">
            <span className="text-[#7386A8]">P1:</span> <span className="text-[#3E7A55] font-bold">{summary.phase1DurationMs}ms</span>
          </div>
          <div className="bg-[#EFEEE9] border border-[#CECECE] rounded-xl px-2.5 py-1 text-xs font-mono">
            <span className="text-[#7386A8]">P2:</span> <span className="text-[#0B5CD5] font-bold">{summary.phase2DurationMs}ms</span>
          </div>
          <div className="bg-[#EFEEE9] border border-[#CECECE] rounded-xl px-2.5 py-1 text-xs font-mono">
            <span className="text-[#7386A8]">P3:</span> <span className="text-[#B98520] font-bold">{summary.phase3DurationMs}ms</span>
          </div>
          <div className="bg-[#EFEEE9] border border-[#CECECE] rounded-xl px-2.5 py-1 text-xs font-mono">
            <span className="text-[#7386A8]">P4:</span> <span className="text-[#D97757] font-bold">{summary.phase4DurationMs}ms</span>
          </div>
        </div>
      </div>

      {/* Phase Navigation Tabs */}
      <div className="flex border-b border-[#CECECE] overflow-x-auto gap-2">
        <button
          onClick={() => setActiveTab('phase1')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-colors whitespace-nowrap border-b-2 ${
            activeTab === 'phase1'
              ? 'bg-[#EFEEE9] text-[#0B5CD5] border-[#0B5CD5]'
              : 'text-[#7386A8] hover:text-[#0B5CD5] border-transparent'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          Agent 1: Content Reader
        </button>

        <button
          onClick={() => setActiveTab('phase2')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-colors whitespace-nowrap border-b-2 ${
            activeTab === 'phase2'
              ? 'bg-[#EFEEE9] text-[#0B5CD5] border-[#0B5CD5]'
              : 'text-[#7386A8] hover:text-[#0B5CD5] border-transparent'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          Agent 2: Claim Extractor
        </button>

        <button
          onClick={() => setActiveTab('phase3')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-colors whitespace-nowrap border-b-2 ${
            activeTab === 'phase3'
              ? 'bg-[#EFEEE9] text-[#D97757] border-[#D97757]'
              : 'text-[#7386A8] hover:text-[#0B5CD5] border-transparent'
          }`}
        >
          <Search className="w-3.5 h-3.5" />
          Agent 3: Fact Verifier & 9-Fuzzy Logic Engine
        </button>

        <button
          onClick={() => setActiveTab('phase4')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-colors whitespace-nowrap border-b-2 ${
            activeTab === 'phase4'
              ? 'bg-[#EFEEE9] text-[#D97757] border-[#D97757]'
              : 'text-[#7386A8] hover:text-[#0B5CD5] border-transparent'
          }`}
        >
          <BarChart2 className="w-3.5 h-3.5" />
          Agent 4: Category Score Audit
        </button>
      </div>

      {/* Phase 1 Content Reader View */}
      {activeTab === 'phase1' && (
        <div className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-[#F8F8F6] p-3 rounded-2xl border border-[#CECECE]">
              <span className="text-[#7386A8] block mb-1">Document Word Count</span>
              <span className="text-base font-bold text-[#0B5CD5]">{phases.phase1_contentReader.outputs?.wordCount || 0} words</span>
            </div>
            <div className="bg-[#F8F8F6] p-3 rounded-2xl border border-[#CECECE]">
              <span className="text-[#7386A8] block mb-1">Token Truncation Status</span>
              <span className={`text-base font-bold ${phases.phase1_contentReader.outputs?.truncated ? 'text-[#B98520]' : 'text-[#3E7A55]'}`}>
                {phases.phase1_contentReader.outputs?.truncated ? 'Truncated (>12,000 tokens)' : 'Full Context Ingested'}
              </span>
            </div>
            <div className="bg-[#F8F8F6] p-3 rounded-2xl border border-[#CECECE]">
              <span className="text-[#7386A8] block mb-1">Article Sentiment Intensity</span>
              <span className="text-base font-bold text-[#0B5CD5]">
                {phases.phase1_contentReader.outputs?.articleSentiment?.intensity || 0.0} (VADER)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Phase 2 Claim Extractor View */}
      {activeTab === 'phase2' && (
        <div className="space-y-4 text-xs">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-[#F8F8F6] p-3 rounded-2xl border border-[#CECECE]">
              <span className="text-[#7386A8] block mb-1">Total Claims Extracted</span>
              <span className="text-base font-bold text-[#0B5CD5]">{phases.phase2_claimExtractor.metadata?.totalClaims || 0} claims</span>
            </div>
            <div className="bg-[#F8F8F6] p-3 rounded-2xl border border-[#CECECE]">
              <span className="text-[#7386A8] block mb-1">International Scope</span>
              <span className="text-base font-bold text-[#0B5CD5]">{phases.phase2_claimExtractor.metadata?.scopeCounts?.International || 0}</span>
            </div>
            <div className="bg-[#F8F8F6] p-3 rounded-2xl border border-[#CECECE]">
              <span className="text-[#7386A8] block mb-1">Regional/Local Scope</span>
              <span className="text-base font-bold text-[#3E7A55]">
                {(phases.phase2_claimExtractor.metadata?.scopeCounts?.Regional || 0) + (phases.phase2_claimExtractor.metadata?.scopeCounts?.Local || 0)}
              </span>
            </div>
            <div className="bg-[#F8F8F6] p-3 rounded-2xl border border-[#CECECE]">
              <span className="text-[#7386A8] block mb-1">Breaking News Claims</span>
              <span className="text-base font-bold text-[#B98520]">{phases.phase2_claimExtractor.metadata?.recentBreakingCount || 0}</span>
            </div>
          </div>
        </div>
      )}

      {/* Phase 3 Fact Verifier & 9-Signal Fuzzy Engine View */}
      {activeTab === 'phase3' && (
        <div className="space-y-4 text-xs">
          <div className="bg-[#F8F8F6] border border-[#CECECE] rounded-2xl p-4">
            <h4 className="text-sm font-bold text-[#0B5CD5] mb-2 flex items-center gap-2">
              <Search className="w-4 h-4 text-[#D97757]" />
              9-Signal Mamdani Fuzzy Verdict Engine Telemetry
            </h4>
            <p className="text-[#2C4E86] text-xs mb-3">
              Click any claim below to inspect its exact search queries, X discourse volume, continuous domain trust score, 9 fuzzy signal membership values, and activated Mamdani rules.
            </p>

            <div className="space-y-2">
              {(reportData?.claims || []).map((claim, idx) => {
                const isExpanded = expandedClaimId === claim.claimId;
                const b = claim.fuzzySignalBreakdown || {};

                return (
                  <div key={claim.claimId || idx} className="bg-white border border-[#CECECE] rounded-2xl overflow-hidden shadow-xs">
                    <button
                      onClick={() => toggleClaimExpand(claim.claimId)}
                      className="w-full p-3 flex items-center justify-between text-left hover:bg-[#F8F8F6] transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {isExpanded ? <ChevronDown className="w-4 h-4 text-[#D97757] flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-[#7386A8] flex-shrink-0" />}
                        <span className="font-bold text-[#0B5CD5] flex-shrink-0">[Claim {idx + 1}]</span>
                        <span className="text-[#2C4E86] truncate max-w-md">"{claim.claimText}"</span>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                          claim.claimScope === 'International' ? 'bg-[#EFEEE9] text-[#0B5CD5]' : 'bg-[#E4EFE7] text-[#2C5B3E]'
                        }`}>
                          {claim.claimScope || 'Regional'} Scope
                        </span>
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                          claim.status === 'Verified' ? 'bg-[#E4EFE7] text-[#2C5B3E] border border-[#C5DEC9]' :
                          claim.status === 'False' ? 'bg-[#F7E3E0] text-[#B23F35] border border-[#EBC7C2]' : 'bg-[#F7EEDA] text-[#B98520] border border-[#E8D4B0]'
                        }`}>
                          {claim.status} ({claim.confidence}%)
                        </span>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="p-4 bg-[#F8F8F6] border-t border-[#CECECE] space-y-4">
                        {/* Part A AI-Generated Correction Display Block */}
                        {claim.hasCorrection && (
                          <div className="bg-[#F6E7DF] border border-[#E88F6B]/40 rounded-2xl p-4 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-[#B0512F] flex items-center gap-1.5 uppercase tracking-wider">
                                🤖 AI-Corrected, Based on Evidence Found
                              </span>
                              {claim.partiallyAccurate && (
                                <span className="bg-[#F7EEDA] text-[#B98520] text-[10px] font-bold px-2 py-0.5 rounded border border-[#E8D4B0]">
                                  Partially Accurate (Core Event Verified, Sub-detail Differs)
                                </span>
                              )}
                            </div>
                            <p className="text-sm font-semibold text-[#0B5CD5] bg-white p-3 rounded-xl border border-[#CECECE]">
                              "{claim.correctedClaim}"
                            </p>
                            <p className="text-xs text-[#2C4E86] flex items-center gap-1">
                              <span className="font-bold text-[#D97757]">Basis:</span> {claim.correctionBasis}
                            </p>
                            <p className="text-[10px] text-[#7386A8] italic border-t border-[#E88F6B]/30 pt-1.5 mt-1">
                              Disclaimer: This is an AI-generated correction derived strictly from cited sources, not an independently guaranteed fact.
                            </p>
                          </div>
                        )}

                        {/* Part B Deep Research Status Badge */}
                        {claim.deepResearch && (
                          <div className="bg-[#E4EFE7] border border-[#C5DEC9] p-3 rounded-xl flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2 text-[#2C5B3E]">
                              <span className="font-bold">🔬 Deep Research Applied:</span>
                              <span>{claim.deepResearch.decomposedQueries?.length || 0} query angles decomposed, {claim.deepResearch.fullPagesFetchedCount || 0} full pages read.</span>
                            </div>
                            <span className="text-[10px] font-mono bg-white text-[#2C5B3E] px-2 py-0.5 rounded font-bold">
                              {claim.deepResearch.triggerType} ESCALATION
                            </span>
                          </div>
                        )}

                        {/* 9 Signal Breakdown Grid */}
                        <div className="grid grid-cols-3 md:grid-cols-9 gap-2 text-center">
                          <div className="bg-white p-2 rounded-xl border border-[#CECECE]">
                            <span className="text-[10px] text-[#7386A8] block">1. Corroboration</span>
                            <span className="font-bold text-[#B98520]">{b.corroborationScore}/10</span>
                          </div>
                          <div className="bg-white p-2 rounded-xl border border-[#CECECE]">
                            <span className="text-[10px] text-[#7386A8] block">2. Domain Trust</span>
                            <span className="font-bold text-[#3E7A55]">{b.sourceCredibilityScore}</span>
                          </div>
                          <div className="bg-white p-2 rounded-xl border border-[#CECECE]">
                            <span className="text-[10px] text-[#7386A8] block">3. Sentiment</span>
                            <span className="font-bold text-[#0B5CD5]">{b.sentimentIntensity}</span>
                          </div>
                          <div className="bg-white p-2 rounded-xl border border-[#CECECE]">
                            <span className="text-[10px] text-[#7386A8] block">4. Significance</span>
                            <span className="font-bold text-[#0B5CD5]">{b.claimSignificance}/100</span>
                          </div>
                          <div className="bg-white p-2 rounded-xl border border-[#CECECE]">
                            <span className="text-[10px] text-[#7386A8] block">5. Confidence</span>
                            <span className="font-bold text-[#D97757]">{b.modelConfidence}%</span>
                          </div>
                          <div className="bg-white p-2 rounded-xl border border-[#CECECE]">
                            <span className="text-[10px] text-[#7386A8] block">6. X Volume</span>
                            <span className="font-bold text-[#0B5CD5]">{b.discourseVolume} ({b.discourseVolumeLabel})</span>
                          </div>
                          <div className="bg-white p-2 rounded-xl border border-[#CECECE]">
                            <span className="text-[10px] text-[#7386A8] block">7. Social Corrob</span>
                            <span className="font-bold text-[#3E7A55]">{b.socialCorroborationLabel}</span>
                          </div>
                          <div className="bg-white p-2 rounded-xl border border-[#CECECE]">
                            <span className="text-[10px] text-[#7386A8] block">8. Skepticism</span>
                            <span className="font-bold text-[#B23F35]">{b.communitySkepticismLabel}</span>
                          </div>
                          <div className="bg-white p-2 rounded-xl border border-[#CECECE]">
                            <span className="text-[10px] text-[#7386A8] block">9. Scope</span>
                            <span className="font-bold text-[#0B5CD5]">{b.claimScope}</span>
                          </div>
                        </div>

                        {/* Activated Rules List */}
                        <div>
                          <span className="font-bold text-[#0B5CD5] block mb-1">Activated Mamdani Fuzzy Rules:</span>
                          <ul className="space-y-1">
                            {(b.activatedRules || []).map((rule, rIdx) => (
                              <li key={rIdx} className="text-[#2C4E86] font-mono text-[11px]">
                                • {rule}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Phase 4 Category Score Audit View */}
      {activeTab === 'phase4' && (
        <div className="space-y-4 text-xs font-mono bg-[#F8F8F6] p-4 rounded-2xl border border-[#CECECE] text-[#2C4E86]">
          <h4 className="font-sans font-bold text-[#0B5CD5] mb-2 text-sm">Deterministic Mathematical Score Audit</h4>
          
          <div className="space-y-3">
            <div>
              <span className="text-[#D97757] font-bold">1. Fact Checking Score Formula:</span>
              <p className="text-[#7386A8]">FactCheckingScore = Math.round((VerifiedClaims / TotalClaims) * 100)</p>
              <p className="text-[#3E7A55] font-bold">Output: {reportData?.scores?.factCheckingScore}%</p>
            </div>

            <div>
              <span className="text-[#D97757] font-bold">2. Fake News & Credibility Score Formula:</span>
              <p className="text-[#7386A8]">BaseCredibility = Math.round(((Verified * 1.0 + Suspicious * 0.2 + False * 0.0) / Total) * 100)</p>
              <p className="text-[#7386A8]">SentimentPenalty = Math.round(ArticleSentiment.intensity * 20)</p>
              <p className="text-[#7386A8]">FakeNewsScore = Math.max(0, Math.min(100, BaseCredibility - SentimentPenalty))</p>
              <p className="text-[#B98520] font-bold">
                Output: {reportData?.scores?.fakeNewsScore}% (Base: {reportData?.scores?.sentimentAdjustmentApplied?.baseCredibility}%, Penalty: {reportData?.scores?.sentimentAdjustmentApplied?.sentimentPenalty}%)
              </p>
            </div>

            <div>
              <span className="text-[#D97757] font-bold">3. Business Metric Precision Score Formula:</span>
              <p className="text-[#7386A8]">BusinessReportScore = Math.round((VerifiedBusinessClaims / TotalBusinessClaims) * 100)</p>
              <p className="text-[#0B5CD5] font-bold">Output: {String(reportData?.scores?.businessReportScore)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
