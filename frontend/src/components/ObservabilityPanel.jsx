import React, { useState } from 'react';
import { Activity, Clock, ShieldAlert, CheckCircle, Search, Cpu, FileText, BarChart2, ChevronDown, ChevronRight, Info } from 'lucide-react';

export default function ObservabilityPanel({ observability, reportData }) {
  const [activeTab, setActiveTab] = useState('phase3');
  const [expandedClaimId, setExpandedClaimId] = useState(null);

  if (!observability || !observability.phases) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-slate-400 text-sm">
        <p className="flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-400" />
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
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-blue-400 font-semibold text-xs uppercase tracking-wider mb-1">
            <Activity className="w-4 h-4" />
            System Observability & Agent Inspection Engine
          </div>
          <h3 className="text-xl font-bold text-slate-100">Phase-by-Phase Telemetry & Execution Audit</h3>
        </div>

        {/* Execution Duration Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 flex items-center gap-2 text-xs">
            <Clock className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-slate-400">Total:</span>
            <span className="font-semibold text-slate-200">{totalDurationMs}ms</span>
          </div>
          <div className="bg-slate-800/80 border border-slate-700/60 rounded-lg px-2.5 py-1 text-xs">
            <span className="text-slate-400">P1:</span> <span className="text-emerald-400 font-medium">{summary.phase1DurationMs}ms</span>
          </div>
          <div className="bg-slate-800/80 border border-slate-700/60 rounded-lg px-2.5 py-1 text-xs">
            <span className="text-slate-400">P2:</span> <span className="text-indigo-400 font-medium">{summary.phase2DurationMs}ms</span>
          </div>
          <div className="bg-slate-800/80 border border-slate-700/60 rounded-lg px-2.5 py-1 text-xs">
            <span className="text-slate-400">P3:</span> <span className="text-amber-400 font-medium">{summary.phase3DurationMs}ms</span>
          </div>
          <div className="bg-slate-800/80 border border-slate-700/60 rounded-lg px-2.5 py-1 text-xs">
            <span className="text-slate-400">P4:</span> <span className="text-purple-400 font-medium">{summary.phase4DurationMs}ms</span>
          </div>
        </div>
      </div>

      {/* Phase Navigation Tabs */}
      <div className="flex border-b border-slate-800 overflow-x-auto gap-2">
        <button
          onClick={() => setActiveTab('phase1')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors whitespace-nowrap border-b-2 ${
            activeTab === 'phase1'
              ? 'bg-slate-800 text-blue-400 border-blue-500'
              : 'text-slate-400 hover:text-slate-200 border-transparent'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          Agent 1: Content Reader
        </button>

        <button
          onClick={() => setActiveTab('phase2')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors whitespace-nowrap border-b-2 ${
            activeTab === 'phase2'
              ? 'bg-slate-800 text-indigo-400 border-indigo-500'
              : 'text-slate-400 hover:text-slate-200 border-transparent'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          Agent 2: Claim Extractor
        </button>

        <button
          onClick={() => setActiveTab('phase3')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors whitespace-nowrap border-b-2 ${
            activeTab === 'phase3'
              ? 'bg-slate-800 text-amber-400 border-amber-500'
              : 'text-slate-400 hover:text-slate-200 border-transparent'
          }`}
        >
          <Search className="w-3.5 h-3.5" />
          Agent 3: Fact Verifier & 9-Fuzzy Logic Engine
        </button>

        <button
          onClick={() => setActiveTab('phase4')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors whitespace-nowrap border-b-2 ${
            activeTab === 'phase4'
              ? 'bg-slate-800 text-purple-400 border-purple-500'
              : 'text-slate-400 hover:text-slate-200 border-transparent'
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
            <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/50">
              <span className="text-slate-400 block mb-1">Document Word Count</span>
              <span className="text-base font-bold text-slate-100">{phases.phase1_contentReader.outputs?.wordCount || 0} words</span>
            </div>
            <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/50">
              <span className="text-slate-400 block mb-1">Token Truncation Status</span>
              <span className={`text-base font-bold ${phases.phase1_contentReader.outputs?.truncated ? 'text-amber-400' : 'text-emerald-400'}`}>
                {phases.phase1_contentReader.outputs?.truncated ? 'Truncated (>12,000 tokens)' : 'Full Context Ingested'}
              </span>
            </div>
            <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/50">
              <span className="text-slate-400 block mb-1">Article Sentiment Intensity</span>
              <span className="text-base font-bold text-blue-400">
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
            <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/50">
              <span className="text-slate-400 block mb-1">Total Claims Extracted</span>
              <span className="text-base font-bold text-indigo-400">{phases.phase2_claimExtractor.metadata?.totalClaims || 0} claims</span>
            </div>
            <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/50">
              <span className="text-slate-400 block mb-1">International Scope</span>
              <span className="text-base font-bold text-blue-400">{phases.phase2_claimExtractor.metadata?.scopeCounts?.International || 0}</span>
            </div>
            <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/50">
              <span className="text-slate-400 block mb-1">Regional/Local Scope</span>
              <span className="text-base font-bold text-emerald-400">
                {(phases.phase2_claimExtractor.metadata?.scopeCounts?.Regional || 0) + (phases.phase2_claimExtractor.metadata?.scopeCounts?.Local || 0)}
              </span>
            </div>
            <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/50">
              <span className="text-slate-400 block mb-1">Breaking News Claims</span>
              <span className="text-base font-bold text-amber-400">{phases.phase2_claimExtractor.metadata?.recentBreakingCount || 0}</span>
            </div>
          </div>
        </div>
      )}

      {/* Phase 3 Fact Verifier & 9-Signal Fuzzy Engine View */}
      {activeTab === 'phase3' && (
        <div className="space-y-4 text-xs">
          <div className="bg-amber-950/30 border border-amber-800/40 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-amber-300 mb-2 flex items-center gap-2">
              <Search className="w-4 h-4 text-amber-400" />
              9-Signal Mamdani Fuzzy Verdict Engine Telemetry
            </h4>
            <p className="text-slate-300 text-xs mb-3">
              Click any claim below to inspect its exact search queries, X discourse volume, continuous domain trust score, 9 fuzzy signal membership values, and activated Mamdani rules.
            </p>

            <div className="space-y-2">
              {(reportData?.claims || []).map((claim, idx) => {
                const isExpanded = expandedClaimId === claim.claimId;
                const b = claim.fuzzySignalBreakdown || {};

                return (
                  <div key={claim.claimId || idx} className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleClaimExpand(claim.claimId)}
                      className="w-full p-3 flex items-center justify-between text-left hover:bg-slate-850 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {isExpanded ? <ChevronDown className="w-4 h-4 text-amber-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                        <span className="font-semibold text-slate-200">[Claim {idx + 1}]</span>
                        <span className="text-slate-300 truncate max-w-md">"{claim.claimText}"</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                          claim.claimScope === 'International' ? 'bg-blue-900/60 text-blue-300' : 'bg-emerald-900/60 text-emerald-300'
                        }`}>
                          {claim.claimScope || 'Regional'} Scope
                        </span>
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                          claim.status === 'Verified' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                          claim.status === 'False' ? 'bg-rose-950 text-rose-400 border border-rose-800' : 'bg-amber-950 text-amber-400 border border-amber-800'
                        }`}>
                          {claim.status} ({claim.confidence}%)
                        </span>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="p-4 bg-slate-950/80 border-t border-slate-800 space-y-4">
                        {/* Part A AI-Generated Correction Display Block */}
                        {claim.hasCorrection && (
                          <div className="bg-indigo-950/40 border border-indigo-700/50 rounded-xl p-4 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-indigo-300 flex items-center gap-1.5 uppercase tracking-wider">
                                🤖 AI-Corrected, Based on Evidence Found
                              </span>
                              {claim.partiallyAccurate && (
                                <span className="bg-amber-900/80 text-amber-300 text-[10px] font-semibold px-2 py-0.5 rounded border border-amber-600">
                                  Partially Accurate (Core Event Verified, Sub-detail Differs)
                                </span>
                              )}
                            </div>
                            <p className="text-sm font-semibold text-indigo-100 bg-slate-900/90 p-3 rounded-lg border border-indigo-900/60">
                              "{claim.correctedClaim}"
                            </p>
                            <p className="text-xs text-slate-300 flex items-center gap-1">
                              <span className="font-semibold text-indigo-400">Basis:</span> {claim.correctionBasis}
                            </p>
                            <p className="text-[10px] text-slate-400 italic border-t border-indigo-900/40 pt-1.5 mt-1">
                              Disclaimer: This is an AI-generated correction derived strictly from cited sources, not an independently guaranteed fact.
                            </p>
                          </div>
                        )}

                        {/* Part B Deep Research Status Badge */}
                        {claim.deepResearch && (
                          <div className="bg-emerald-950/30 border border-emerald-800/40 p-3 rounded-lg flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2 text-emerald-300">
                              <span className="font-bold">🔬 Deep Research Applied:</span>
                              <span>{claim.deepResearch.decomposedQueries?.length || 0} query angles decomposed, {claim.deepResearch.fullPagesFetchedCount || 0} full pages read.</span>
                            </div>
                            <span className="text-[10px] font-mono bg-emerald-900/60 text-emerald-200 px-2 py-0.5 rounded">
                              {claim.deepResearch.triggerType} ESCALATION
                            </span>
                          </div>
                        )}

                        {/* 9 Signal Breakdown Grid */}
                        <div className="grid grid-cols-3 md:grid-cols-9 gap-2 text-center">
                          <div className="bg-slate-900 p-2 rounded border border-slate-800">
                            <span className="text-[10px] text-slate-400 block">1. Corroboration</span>
                            <span className="font-bold text-amber-400">{b.corroborationScore}/10</span>
                          </div>
                          <div className="bg-slate-900 p-2 rounded border border-slate-800">
                            <span className="text-[10px] text-slate-400 block">2. Domain Trust</span>
                            <span className="font-bold text-emerald-400">{b.sourceCredibilityScore}</span>
                          </div>
                          <div className="bg-slate-900 p-2 rounded border border-slate-800">
                            <span className="text-[10px] text-slate-400 block">3. Sentiment</span>
                            <span className="font-bold text-blue-400">{b.sentimentIntensity}</span>
                          </div>
                          <div className="bg-slate-900 p-2 rounded border border-slate-800">
                            <span className="text-[10px] text-slate-400 block">4. Significance</span>
                            <span className="font-bold text-slate-200">{b.claimSignificance}/100</span>
                          </div>
                          <div className="bg-slate-900 p-2 rounded border border-slate-800">
                            <span className="text-[10px] text-slate-400 block">5. Confidence</span>
                            <span className="font-bold text-indigo-400">{b.modelConfidence}%</span>
                          </div>
                          <div className="bg-slate-900 p-2 rounded border border-slate-800">
                            <span className="text-[10px] text-slate-400 block">6. X Volume</span>
                            <span className="font-bold text-slate-200">{b.discourseVolume} ({b.discourseVolumeLabel})</span>
                          </div>
                          <div className="bg-slate-900 p-2 rounded border border-slate-800">
                            <span className="text-[10px] text-slate-400 block">7. Social Corrob</span>
                            <span className="font-bold text-emerald-400">{b.socialCorroborationLabel}</span>
                          </div>
                          <div className="bg-slate-900 p-2 rounded border border-slate-800">
                            <span className="text-[10px] text-slate-400 block">8. Skepticism</span>
                            <span className="font-bold text-rose-400">{b.communitySkepticismLabel}</span>
                          </div>
                          <div className="bg-slate-900 p-2 rounded border border-slate-800">
                            <span className="text-[10px] text-slate-400 block">9. Scope</span>
                            <span className="font-bold text-blue-400">{b.claimScope}</span>
                          </div>
                        </div>

                        {/* Activated Rules List */}
                        <div>
                          <span className="font-semibold text-slate-300 block mb-1">Activated Mamdani Fuzzy Rules:</span>
                          <ul className="space-y-1">
                            {(b.activatedRules || []).map((rule, rIdx) => (
                              <li key={rIdx} className="text-slate-400 font-mono text-[11px]">
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
        <div className="space-y-4 text-xs font-mono bg-slate-950 p-4 rounded-xl border border-slate-800 text-slate-300">
          <h4 className="font-sans font-semibold text-purple-300 mb-2">Deterministic Mathematical Score Audit</h4>
          
          <div className="space-y-3">
            <div>
              <span className="text-purple-400 font-bold">1. Fact Checking Score Formula:</span>
              <p className="text-slate-400">FactCheckingScore = Math.round((VerifiedClaims / TotalClaims) * 100)</p>
              <p className="text-emerald-400 font-semibold">Output: {reportData?.scores?.factCheckingScore}%</p>
            </div>

            <div>
              <span className="text-purple-400 font-bold">2. Fake News & Credibility Score Formula:</span>
              <p className="text-slate-400">BaseCredibility = Math.round(((Verified * 1.0 + Suspicious * 0.2 + False * 0.0) / Total) * 100)</p>
              <p className="text-slate-400">SentimentPenalty = Math.round(ArticleSentiment.intensity * 20)</p>
              <p className="text-slate-400">FakeNewsScore = Math.max(0, Math.min(100, BaseCredibility - SentimentPenalty))</p>
              <p className="text-amber-400 font-semibold">
                Output: {reportData?.scores?.fakeNewsScore}% (Base: {reportData?.scores?.sentimentAdjustmentApplied?.baseCredibility}%, Penalty: {reportData?.scores?.sentimentAdjustmentApplied?.sentimentPenalty}%)
              </p>
            </div>

            <div>
              <span className="text-purple-400 font-bold">3. Business Metric Precision Score Formula:</span>
              <p className="text-slate-400">BusinessReportScore = Math.round((VerifiedBusinessClaims / TotalBusinessClaims) * 100)</p>
              <p className="text-indigo-400 font-semibold">Output: {String(reportData?.scores?.businessReportScore)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
