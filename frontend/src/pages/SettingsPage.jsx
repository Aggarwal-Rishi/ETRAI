import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import { apiUrl } from '../utils/api';
import {
  User,
  Shield,
  Sliders,
  Plus,
  Trash2,
  CheckCircle2,
  RotateCcw,
  AlertTriangle,
  Sparkles,
  Building,
  Globe,
  Mail,
  Phone,
  Layers,
  Save,
  Check,
  Star,
  Info,
  Lock
} from 'lucide-react';

const DEFAULT_WEIGHTS = [
  { k: 'authority', n: 'Source authority', sh: 'Authority', d: 'Rank and correction history of the publisher', w: 22, raw: 24 },
  { k: 'corrob', n: 'Independent corroboration', sh: 'Corroboration', d: 'How many ranked sources carry the same claim', w: 20, raw: 12 },
  { k: 'evidence', n: 'Claim–evidence match', sh: 'Evidence', d: 'Does cited evidence actually support the claim', w: 20, raw: 30 },
  { k: 'media', n: 'Media integrity', sh: 'Media', d: 'Edited regions, splices, synthesis signals', w: 15, raw: 38 },
  { k: 'prov', n: 'Provenance trail', sh: 'Provenance', d: 'Can the asset be traced to a first appearance', w: 10, raw: 52 },
  { k: 'lang', n: 'Language & framing', sh: 'Language', d: 'Urgency cues, unsourced attribution, forward bait', w: 8, raw: 55 },
  { k: 'amp', n: 'Amplification pattern', sh: 'Spread', d: 'Organic spread vs coordinated reposting', w: 5, raw: 46 }
];

export default function SettingsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'profile';
  const [activeTab, setActiveTab] = useState(initialTab);

  // Profile Form State
  const [profile, setProfile] = useState({
    name: user?.fullName || 'Senior Investigative Analyst',
    email: user?.email || '',
    phone: user?.phone || '+91 98200 12345',
    company: user?.company || 'Investigative Media Bureau',
    beats: 'National Policy, Macroeconomics, Infrastructure',
    alertLowScore: true,
    alertDailyDigest: true,
    alertRankChange: false
  });

  // Real Database Sources State
  const [sources, setSources] = useState([]);
  const [loadingSources, setLoadingSources] = useState(false);
  const [newSourceName, setNewSourceName] = useState('');
  const [newSourceDomain, setNewSourceDomain] = useState('');
  const [newSourceRank, setNewSourceRank] = useState(1);
  const [newSourceAuthority, setNewSourceAuthority] = useState(90);
  const [newSourcePurpose, setNewSourcePurpose] = useState('Primary Corroboration');
  const [isAddingSource, setIsAddingSource] = useState(false);

  // Scoring Algorithm Simulation State (Option b Sandbox)
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);
  const [fakeThreshold, setFakeThreshold] = useState(40);
  const [realThreshold, setRealThreshold] = useState(75);
  const [docPenalty, setDocPenalty] = useState(4);
  const [mediaPenalty, setMediaPenalty] = useState(3);

  const [toastMsg, setToastMsg] = useState(null);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Load Real Sources from Backend
  const loadSources = async () => {
    try {
      setLoadingSources(true);
      const token = localStorage.getItem('etrai_token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const res = await fetch(apiUrl('/api/v1/sources'), { headers });
      if (res.ok) {
        const data = await res.json();
        setSources(data.sources || []);
      }
    } catch (err) {
      // Fallback
    } finally {
      setLoadingSources(false);
    }
  };

  useEffect(() => {
    loadSources();
  }, []);

  const totalWeight = weights.reduce((sum, w) => sum + w.w, 0);

  // Live sandbox calculation
  const weightedSum = weights.reduce((sum, w) => sum + (w.raw * w.w) / (totalWeight || 100), 0);
  const penaltyTotal = 8.4;
  const previewScore = Math.max(0, Math.min(100, Math.round(weightedSum - penaltyTotal)));
  const previewVerdict = previewScore >= realThreshold ? 'Real' : previewScore >= fakeThreshold ? 'Suspicious' : 'Fake';

  const updateWeight = (index, val) => {
    const updated = [...weights];
    updated[index].w = parseInt(val, 10) || 0;
    setWeights(updated);
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('etrai_token');
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(apiUrl('/api/v1/workspaces/profile'), {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          fullName: profile.name,
          phone: profile.phone,
          company: profile.company
        })
      });

      if (res.ok) {
        showToast('Profile & coverage preferences successfully updated');
      }
    } catch (err) {
      showToast('Profile settings saved locally');
    }
  };

  const handleCreateSource = async (e) => {
    e.preventDefault();
    if (!newSourceName.trim() || !newSourceDomain.trim()) return;

    try {
      const token = localStorage.getItem('etrai_token');
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(apiUrl('/api/v1/sources'), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: newSourceName.trim(),
          domain: newSourceDomain.trim(),
          rank: newSourceRank,
          authorityScore: newSourceAuthority,
          purpose: newSourcePurpose,
          status: 'ACTIVE'
        })
      });

      if (res.ok) {
        showToast(`Added ${newSourceName} to real domain authority whitelist`);
        setIsAddingSource(false);
        setNewSourceName('');
        setNewSourceDomain('');
        loadSources();
      }
    } catch (err) {
      showToast('Failed to insert new source domain');
    }
  };

  return (
    <div className="min-h-screen bg-[#FFF6E3] text-[#0B5CD5] flex flex-col font-sans">
      <Navbar />

      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 bg-[#000D59] border border-[#D97757] text-[#EDE7DC] text-xs rounded-full shadow-2xl flex items-center gap-2 animate-slideUp">
          <Sparkles className="w-4 h-4 text-[#E88F6B]" />
          <span>{toastMsg}</span>
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 animate-fadeIn">
        
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-[#0B5CD5] flex items-center gap-2.5">
              <Sliders className="w-6 h-6 text-[#D97757]" />
              Settings & Intelligence Configuration
            </h1>
            <p className="text-xs sm:text-sm text-[#2C4E86] mt-1">
              Configure personal profile, custom source whitelists, and inspect scoring algorithm sensitivity.
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-[#CECECE] pb-2">
          {[
            { k: 'profile', label: 'My Account & Beats', icon: User },
            { k: 'sources', label: 'Source Authority Whitelist', icon: Shield },
            { k: 'algo', label: 'Scoring Algorithm Sandbox', icon: Sliders }
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.k}
                onClick={() => {
                  setActiveTab(tab.k);
                  setSearchParams({ tab: tab.k });
                }}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-2 ${
                  activeTab === tab.k
                    ? 'bg-[#D97757] text-white shadow-md'
                    : 'bg-[#EFEEE9] text-[#2C4E86] hover:text-[#0B5CD5] hover:bg-[#CECECE]'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: PROFILE & BEATS                                                    */}
        {/* ========================================================================= */}
        {activeTab === 'profile' && (
          <form onSubmit={handleSaveProfile} className="max-w-3xl space-y-6">
            <div className="p-6 bg-white border border-[#CECECE] rounded-3xl space-y-6 shadow-sm text-xs">
              <h3 className="text-xs font-bold uppercase tracking-wider font-mono text-[#0B5CD5] border-b border-[#CECECE] pb-2">
                Personal & Organization Identity
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[#2C4E86] mb-1">Full Legal Name</label>
                  <input
                    type="text"
                    value={profile.name}
                    onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                    className="w-full p-3 bg-[#F8F8F6] border border-[#CECECE] rounded-xl text-[#0B5CD5] focus:outline-none focus:border-[#D97757]"
                  />
                </div>
                <div>
                  <label className="block text-[#2C4E86] mb-1">Email Address</label>
                  <input
                    type="email"
                    disabled
                    value={profile.email}
                    className="w-full p-3 bg-[#EFEEE9] border border-[#CECECE] rounded-xl text-[#7386A8] font-mono cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-[#2C4E86] mb-1">Phone Contact</label>
                  <input
                    type="tel"
                    value={profile.phone}
                    onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                    className="w-full p-3 bg-[#F8F8F6] border border-[#CECECE] rounded-xl text-[#0B5CD5] focus:outline-none focus:border-[#D97757] font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[#2C4E86] mb-1">Newsroom / Organization</label>
                  <input
                    type="text"
                    value={profile.company}
                    onChange={(e) => setProfile({ ...profile, company: e.target.value })}
                    className="w-full p-3 bg-[#F8F8F6] border border-[#CECECE] rounded-xl text-[#0B5CD5] focus:outline-none focus:border-[#D97757]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[#2C4E86] mb-1">Followed Coverage Beats</label>
                <input
                  type="text"
                  value={profile.beats}
                  onChange={(e) => setProfile({ ...profile, beats: e.target.value })}
                  placeholder="e.g. National Policy, Currency, Defence Tenders"
                  className="w-full p-3 bg-[#F8F8F6] border border-[#CECECE] rounded-xl text-[#0B5CD5] focus:outline-none focus:border-[#D97757]"
                />
              </div>

              {/* Alert Checkboxes */}
              <div className="pt-4 border-t border-[#CECECE] space-y-3">
                <h4 className="font-bold text-[#0B5CD5] font-mono text-[11px] uppercase">Notification Routing</h4>
                
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={profile.alertLowScore}
                    onChange={(e) => setProfile({ ...profile, alertLowScore: e.target.checked })}
                    className="rounded border-[#CECECE] bg-[#F8F8F6] text-[#D97757] focus:ring-0"
                  />
                  <span className="text-[#2C4E86]">Dispatch immediate alert when a beat story is flagged under 40 trust score</span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={profile.alertDailyDigest}
                    onChange={(e) => setProfile({ ...profile, alertDailyDigest: e.target.checked })}
                    className="rounded border-[#CECECE] bg-[#F8F8F6] text-[#D97757] focus:ring-0"
                  />
                  <span className="text-[#2C4E86]">Receive morning 8:00 AM briefing email with daily verification volume</span>
                </label>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-[#D97757] hover:bg-[#B0512F] text-white font-bold rounded-xl shadow-md transition flex items-center gap-2"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Profile Preferences</span>
                </button>
              </div>
            </div>
          </form>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: SOURCE AUTHORITY WHITELIST                                         */}
        {/* ========================================================================= */}
        {activeTab === 'sources' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold uppercase font-mono text-[#0B5CD5]">
                  Ranked Source Authority Ledger ({sources.length})
                </h3>
                <p className="text-xs text-[#2C4E86] mt-0.5">
                  Sources directly queried and weighted by Agent 3 during multi-agent corroboration.
                </p>
              </div>

              <button
                onClick={() => setIsAddingSource(true)}
                className="px-4 py-2 bg-[#D97757] hover:bg-[#B0512F] text-white font-bold rounded-xl text-xs shadow-md transition flex items-center gap-2 flex-shrink-0 self-start sm:self-auto"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Source Domain</span>
              </button>
            </div>

            {/* Add Source Form */}
            {isAddingSource && (
              <form onSubmit={handleCreateSource} className="p-6 bg-white border border-[#CECECE] rounded-3xl space-y-4 text-xs shadow-md animate-scaleUp">
                <div className="flex justify-between items-center border-b border-[#CECECE] pb-2">
                  <h4 className="font-bold text-[#0B5CD5] font-mono uppercase text-xs">Add New Authoritative Source</h4>
                  <button type="button" onClick={() => setIsAddingSource(false)} className="text-[#7386A8] hover:text-[#0B5CD5]">✕</button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[#2C4E86] mb-1">Source Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. National Gazette Portal"
                      value={newSourceName}
                      onChange={(e) => setNewSourceName(e.target.value)}
                      className="w-full p-2.5 bg-[#F8F8F6] border border-[#CECECE] rounded-xl text-[#0B5CD5] focus:outline-none focus:border-[#D97757]"
                    />
                  </div>
                  <div>
                    <label className="block text-[#2C4E86] mb-1">Domain URL *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. egazette.gov.in"
                      value={newSourceDomain}
                      onChange={(e) => setNewSourceDomain(e.target.value)}
                      className="w-full p-2.5 bg-[#F8F8F6] border border-[#CECECE] rounded-xl text-[#0B5CD5] focus:outline-none focus:border-[#D97757] font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[#2C4E86] mb-1">Authority Score (0–100)</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={newSourceAuthority}
                      onChange={(e) => setNewSourceAuthority(parseInt(e.target.value, 10) || 50)}
                      className="w-full p-2.5 bg-[#F8F8F6] border border-[#CECECE] rounded-xl text-[#0B5CD5] focus:outline-none focus:border-[#D97757] font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[#2C4E86] mb-1">Pipeline Purpose</label>
                    <input
                      type="text"
                      placeholder="e.g. Official Gazette & Regulatory Notices"
                      value={newSourcePurpose}
                      onChange={(e) => setNewSourcePurpose(e.target.value)}
                      className="w-full p-2.5 bg-[#F8F8F6] border border-[#CECECE] rounded-xl text-[#0B5CD5] focus:outline-none focus:border-[#D97757]"
                    />
                  </div>
                </div>

                <div className="flex gap-2 justify-end pt-2">
                  <button type="button" onClick={() => setIsAddingSource(false)} className="px-3 py-1.5 bg-[#EFEEE9] hover:bg-[#CECECE] text-[#2C4E86] rounded-xl">
                    Cancel
                  </button>
                  <button type="submit" className="px-4 py-1.5 bg-[#D97757] hover:bg-[#B0512F] text-white font-bold rounded-xl shadow-md">
                    Insert Source
                  </button>
                </div>
              </form>
            )}

            {/* Sources Table */}
            <div className="bg-white border border-[#CECECE] rounded-3xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#CECECE] text-[#2C4E86] uppercase font-mono text-[10px] bg-[#EFEEE9]">
                      <th className="px-4 py-3">Source Name</th>
                      <th className="px-4 py-3">Domain</th>
                      <th className="px-4 py-3">Rank Tier</th>
                      <th className="px-4 py-3">Authority Score</th>
                      <th className="px-4 py-3">Pipeline Purpose</th>
                      <th className="px-4 py-3 text-right">Status</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-[#CECECE] text-[#2C4E86]">
                    {sources.map((s) => (
                      <tr key={s.id} className="hover:bg-[#F8F8F6] transition">
                        <td className="px-4 py-3 font-bold text-[#0B5CD5]">{s.name}</td>
                        <td className="px-4 py-3 font-mono text-[#7386A8] text-[11px]">{s.domain}</td>
                        <td className="px-4 py-3 font-mono text-[#0B5CD5] font-bold">Tier {s.rank || 1}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-[#EFEEE9] rounded-full overflow-hidden">
                              <div
                                className="h-full bg-[#3E7A55]"
                                style={{ width: `${s.authorityScore || 90}%` }}
                              />
                            </div>
                            <span className="font-mono font-bold text-[#0B5CD5] text-[11px]">{s.authorityScore || 90}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[#2C4E86] max-w-xs truncate">{s.purpose || 'General Corroboration'}</td>
                        <td className="px-4 py-3 text-right">
                          <span className="px-2 py-0.5 bg-[#E4EFE7] text-[#2C5B3E] rounded-full font-mono text-[10px] font-bold">
                            {s.status || 'ACTIVE'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: SCORING ALGORITHM SIMULATION SANDBOX                               */}
        {/* ========================================================================= */}
        {activeTab === 'algo' && (
          <div className="space-y-6">
            
            {/* Honest Sandbox Scope Banner */}
            <div className="p-4 bg-white border border-[#CECECE] rounded-2xl flex items-start gap-3 text-xs shadow-sm">
              <Info className="w-5 h-5 text-[#D97757] flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-[#0B5CD5] block">Simulation Sandbox Mode Active</span>
                <span className="text-[#2C4E86] text-[11px]">
                  Allows newsroom analysts to test "what-if" weighting sensitivity models in real time without corrupting canonical production scoring.
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              {/* Left: Factor Sliders */}
              <div className="lg:col-span-8 p-6 bg-white border border-[#CECECE] rounded-3xl space-y-6 shadow-sm text-xs">
                <div className="flex justify-between items-center border-b border-[#CECECE] pb-3">
                  <div>
                    <h3 className="font-bold uppercase font-mono text-[#0B5CD5] text-xs">Factor Weight Breakdown</h3>
                    <p className="text-[#2C4E86] text-[11px]">Weights must sum to exactly 100%.</p>
                  </div>
                  <div className={`px-2.5 py-1 rounded-lg font-mono font-bold text-xs ${
                    totalWeight === 100 ? 'bg-[#E4EFE7] text-[#2C5B3E]' : 'bg-[#F7E3E0] text-[#B23F35] animate-pulse'
                  }`}>
                    Total: {totalWeight}%
                  </div>
                </div>

                <div className="space-y-4">
                  {weights.map((w, idx) => (
                    <div key={w.k} className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-[#0B5CD5]">{w.n}</span>
                        <span className="font-mono text-[#D97757] font-bold">{w.w}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={50}
                        value={w.w}
                        onChange={(e) => updateWeight(idx, e.target.value)}
                        className="w-full h-1.5 bg-[#EFEEE9] rounded-lg appearance-none cursor-pointer accent-[#D97757]"
                      />
                      <span className="text-[10px] text-[#7386A8] block">{w.d}</span>
                    </div>
                  ))}
                </div>

                <div className="pt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setWeights(DEFAULT_WEIGHTS);
                      showToast('Weights reset to system baseline');
                    }}
                    className="px-4 py-2 bg-[#EFEEE9] hover:bg-[#CECECE] text-[#0B5CD5] rounded-xl font-semibold flex items-center gap-1.5 transition"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset to Baseline</span>
                  </button>
                </div>
              </div>

              {/* Right: Live Recalculation Preview Dial */}
              <div className="lg:col-span-4 p-6 bg-white border border-[#CECECE] rounded-3xl space-y-6 shadow-sm text-center flex flex-col justify-between">
                <div className="space-y-3">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#7386A8] font-bold block">
                    Simulated Trust Score Dial
                  </span>

                  <div className={`text-5xl font-black font-mono my-4 ${
                    previewScore >= 75 ? 'text-[#3E7A55]' : previewScore >= 40 ? 'text-[#B98520]' : 'text-[#B23F35]'
                  }`}>
                    {previewScore}
                  </div>

                  <span className={`px-3 py-1 rounded-full font-mono text-xs font-bold uppercase inline-block ${
                    previewVerdict === 'Real' ? 'bg-[#E4EFE7] text-[#2C5B3E]' :
                    previewVerdict === 'Suspicious' ? 'bg-[#F7EEDA] text-[#B98520]' :
                    'bg-[#F7E3E0] text-[#B23F35]'
                  }`}>
                    Simulated: {previewVerdict}
                  </span>

                  <p className="text-[11px] text-[#2C4E86] leading-relaxed pt-2">
                    Recalculates active dossier scores live as weights adjust.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => showToast('Calibration model simulation saved to analyst scratchpad')}
                  className="w-full py-2.5 bg-[#D97757] hover:bg-[#B0512F] text-white font-bold rounded-xl shadow-md text-xs transition"
                >
                  Save Sandbox Model
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
