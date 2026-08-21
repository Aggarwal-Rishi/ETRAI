import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { User, Shield, Sliders, Plus, Trash2, CheckCircle2, RotateCcw, AlertTriangle, Sparkles, Building, Globe, Mail, Phone } from 'lucide-react';

const DEFAULT_WEIGHTS = [
  { k: 'authority', n: 'Source authority', sh: 'Authority', d: 'Rank and correction history of the publisher', w: 22, raw: 24 },
  { k: 'corrob', n: 'Independent corroboration', sh: 'Corroboration', d: 'How many ranked sources carry the same claim', w: 20, raw: 12 },
  { k: 'evidence', n: 'Claim–evidence match', sh: 'Evidence', d: 'Does cited evidence actually support the claim', w: 20, raw: 30 },
  { k: 'media', n: 'Media integrity', sh: 'Media', d: 'Edited regions, splices, synthesis signals', w: 15, raw: 38 },
  { k: 'prov', n: 'Provenance trail', sh: 'Provenance', d: 'Can the asset be traced to a first appearance', w: 10, raw: 52 },
  { k: 'lang', n: 'Language & framing', sh: 'Language', d: 'Urgency cues, unsourced attribution, forward bait', w: 8, raw: 55 },
  { k: 'amp', n: 'Amplification pattern', sh: 'Spread', d: 'Organic spread vs coordinated reposting', w: 5, raw: 46 }
];

const INITIAL_SOURCES = [
  { n: 'The Standard Ledger', r: 1, a: 96, p: 'Primary corroboration · settles claim on its own', st: 'Active' },
  { n: 'Meridian Post', r: 1, a: 93, p: 'Primary corroboration · national desk', st: 'Active' },
  { n: 'National Gazette index', r: 1, a: 99, p: 'Document authority · validates circulars and notices', st: 'Active' },
  { n: 'Ledger Analytics', r: 2, a: 81, p: 'Sector data · business and market figures', st: 'Active' },
  { n: 'Wire archive (agency)', r: 1, a: 95, p: 'Image provenance · original frame recovery', st: 'Active' },
  { n: 'VerifyIndia fact desk', r: 2, a: 86, p: 'Prior-debunk lookup · avoids duplicate work', st: 'Active' },
  { n: 'newspulse-now.in', r: 3, a: 52, p: 'Signal only · flags what is spreading', st: 'Active' },
  { n: 'citizenfeed.social', r: 4, a: 24, p: 'Spread tracking · origin and amplification only', st: 'Active' },
  { n: 'bharatwire-live.co', r: 4, a: 11, p: 'Watchlist · repeat fabrications', st: 'Flagged' },
  { n: 'taxupdate-express.co', r: 3, a: 44, p: 'Signal only · frequent misreadings of primary text', st: 'Active' }
];

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'profile';
  const [activeTab, setActiveTab] = useState(initialTab);

  // Profile State
  const [profile, setProfile] = useState({
    name: 'Gajendra Singh',
    email: 'gajenn@caasaa.ai',
    phone: '+91 98110 42207',
    company: 'Caasaa AI Innovations Pvt. Ltd.',
    website: 'caasaa.ai',
    role: 'Product Manager',
    beats: 'Policy, currency, infrastructure tenders, edtech',
    alertLowScore: true,
    alertDailyDigest: true,
    alertRankChange: false
  });

  // Sources State
  const [sources, setSources] = useState(INITIAL_SOURCES);

  // Algorithm Weights & Thresholds
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);
  const [fakeThreshold, setFakeThreshold] = useState(40);
  const [realThreshold, setRealThreshold] = useState(75);
  const [docPenalty, setDocPenalty] = useState(4);
  const [mediaPenalty, setMediaPenalty] = useState(3);
  const [reqTwoSources, setReqTwoSources] = useState(true);
  const [c2paSignalOnly, setC2paSignalOnly] = useState(true);
  const [rank1ClearSolo, setRank1ClearSolo] = useState(false);

  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const totalWeight = weights.reduce((sum, w) => sum + w.w, 0);

  // Dynamic preview calculation
  const weightedSum = weights.reduce((sum, w) => sum + (w.raw * w.w) / (totalWeight || 100), 0);
  const penaltyTotal = 8.4;
  const previewScore = Math.max(0, Math.min(100, Math.round(weightedSum - penaltyTotal)));
  const previewVerdict = previewScore >= realThreshold ? 'Real' : previewScore >= fakeThreshold ? 'Suspicious' : 'Fake';

  const updateWeight = (index, val) => {
    const updated = [...weights];
    updated[index].w = parseInt(val, 10) || 0;
    setWeights(updated);
  };

  const resetWeights = () => {
    setWeights(DEFAULT_WEIGHTS);
    showToast('Scoring weights reset to system default');
  };

  const addSourceRow = () => {
    setSources(prev => [
      { n: '', r: 2, a: 50, p: '', st: 'Active', isNew: true },
      ...prev
    ]);
  };

  const removeSource = (index) => {
    setSources(prev => prev.filter((_, i) => i !== index));
    showToast('Source removed from ranking table');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 animate-fadeIn">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 bg-slate-800 border border-slate-700 text-white text-xs rounded-full shadow-2xl flex items-center gap-2 animate-slideUp">
          <Sparkles className="w-4 h-4 text-indigo-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Workspace Settings</h1>
        <p className="text-sm text-slate-400 mt-1">
          Manage your verification profile, source authority rankings, and custom scoring algorithm.
        </p>
      </div>

      {/* Sub-Tabs */}
      <div className="flex gap-2 border-b border-slate-800 pb-1">
        {[
          { key: 'profile', label: 'Profile & Alerts', icon: User },
          { key: 'sources', label: 'Source Rankings', icon: Shield },
          { key: 'algo', label: 'Scoring Algorithm', icon: Sliders }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                setSearchParams({ tab: tab.key });
              }}
              className={`px-4 py-2.5 text-xs font-semibold rounded-xl border transition flex items-center gap-2 ${
                isActive
                  ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                  : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: PROFILE */}
      {activeTab === 'profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-5 text-xs text-slate-300">
            {/* Avatar Row */}
            <div className="flex items-center gap-4 pb-4 border-b border-slate-800">
              <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-indigo-500 to-cyan-500 flex items-center justify-center text-white font-bold text-lg shadow-md">
                GS
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">{profile.name}</h3>
                <p className="text-xs text-slate-400">{profile.role} · {profile.company}</p>
                <button 
                  onClick={() => showToast('Photo uploaded')}
                  className="text-indigo-400 hover:text-indigo-300 text-xs font-medium mt-1 inline-block"
                >
                  Change Profile Photo
                </button>
              </div>
            </div>

            {/* Inputs Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Full Name</label>
                <input
                  type="text"
                  value={profile.name}
                  onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Work Email</label>
                <input
                  type="email"
                  value={profile.email}
                  onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Mobile Number</label>
                <input
                  type="text"
                  value={profile.phone}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Company</label>
                <input
                  type="text"
                  value={profile.company}
                  onChange={(e) => setProfile({ ...profile, company: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Website</label>
                <input
                  type="text"
                  value={profile.website}
                  onChange={(e) => setProfile({ ...profile, website: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Role</label>
                <input
                  type="text"
                  value={profile.role}
                  onChange={(e) => setProfile({ ...profile, role: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-400 mb-1 font-medium">Followed Beats</label>
              <input
                type="text"
                value={profile.beats}
                onChange={(e) => setProfile({ ...profile, beats: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Notification Alert Checks */}
            <div className="pt-3 border-t border-slate-800 space-y-2.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-2">
                Notification Alerts
              </span>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={profile.alertLowScore}
                  onChange={(e) => setProfile({ ...profile, alertLowScore: e.target.checked })}
                  className="rounded border-slate-700 text-indigo-600 focus:ring-0 bg-slate-800"
                />
                <span>Email me when anything on my followed beats scores below 40</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={profile.alertDailyDigest}
                  onChange={(e) => setProfile({ ...profile, alertDailyDigest: e.target.checked })}
                  className="rounded border-slate-700 text-indigo-600 focus:ring-0 bg-slate-800"
                />
                <span>Daily 8:00 AM digest of new emerging fake-news clusters</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={profile.alertRankChange}
                  onChange={(e) => setProfile({ ...profile, alertRankChange: e.target.checked })}
                  className="rounded border-slate-700 text-indigo-600 focus:ring-0 bg-slate-800"
                />
                <span>Notify me when a publisher source's authority rank changes</span>
              </label>
            </div>

            <button
              onClick={() => showToast('Profile settings saved successfully')}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl shadow-lg shadow-indigo-500/20 transition"
            >
              Save Profile Changes
            </button>
          </div>

          {/* Workspace Status Card */}
          <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-4 text-xs">
            <h3 className="text-sm font-semibold text-white">Active Workspace</h3>
            <div className="space-y-2 text-slate-300">
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Current Plan</span>
                <span className="font-semibold text-indigo-400">Team · 5 Seats</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Monthly Allowance</span>
                <span className="font-semibold text-white">310 / 500 Used</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Report Retention</span>
                <span className="font-semibold text-white">24 Months</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Data Region</span>
                <span className="font-semibold text-emerald-400">India (Mumbai / Neon Cloud)</span>
              </div>
            </div>
            <Link
              to="/workspace"
              className="block w-full text-center px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-medium transition"
            >
              Manage Workspace & Members
            </Link>
          </div>
        </div>
      )}

      {/* TAB 2: SOURCES */}
      {activeTab === 'sources' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-xs text-slate-400 max-w-2xl">
              Source authority rank determines how heavily a source weighs in corroboration. Rank 1 sources can settle claims independently; Rank 4 sources are tracked as spread signals.
            </p>
            <button
              onClick={addSourceRow}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition flex items-center gap-1.5 shadow-md shadow-indigo-500/20 flex-shrink-0"
            >
              <Plus className="w-3.5 h-3.5" /> Add New Source
            </button>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase font-mono text-[10px]">
                    <th className="px-4 py-3">Source Name</th>
                    <th className="px-4 py-3">Rank</th>
                    <th className="px-4 py-3">Authority Score</th>
                    <th className="px-4 py-3">Pipeline Purpose</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {sources.map((s, idx) => (
                    <tr key={idx} className="hover:bg-slate-850 transition">
                      <td className="px-4 py-2.5 font-medium text-slate-200">
                        <input
                          type="text"
                          value={s.n}
                          placeholder="Source name..."
                          onChange={(e) => {
                            const up = [...sources];
                            up[idx].n = e.target.value;
                            setSources(up);
                          }}
                          className="bg-transparent border-0 text-slate-200 focus:ring-0 w-full font-medium"
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <select
                          value={s.r}
                          onChange={(e) => {
                            const up = [...sources];
                            up[idx].r = parseInt(e.target.value, 10);
                            setSources(up);
                          }}
                          className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-slate-200"
                        >
                          <option value={1}>Rank 1 (Primary)</option>
                          <option value={2}>Rank 2 (Verified)</option>
                          <option value={3}>Rank 3 (Signal)</option>
                          <option value={4}>Rank 4 (Watchlist)</option>
                        </select>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              style={{ width: `${s.a}%` }}
                              className={`h-full ${s.a >= 75 ? 'bg-emerald-400' : s.a >= 40 ? 'bg-amber-400' : 'bg-rose-400'}`}
                            />
                          </div>
                          <span className="font-mono text-[10px] text-slate-400">{s.a} / 100</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-slate-400">
                        <input
                          type="text"
                          value={s.p}
                          placeholder="Purpose in pipeline..."
                          onChange={(e) => {
                            const up = [...sources];
                            up[idx].p = e.target.value;
                            setSources(up);
                          }}
                          className="bg-transparent border-0 text-slate-400 focus:ring-0 w-full"
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                          s.st === 'Flagged' ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'
                        }`}>
                          {s.st}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() => removeSource(idx)}
                          className="p-1 text-slate-500 hover:text-rose-400 transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SCORING ALGORITHM */}
      {activeTab === 'algo' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Factor Weights Customizer */}
            <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-5 text-xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <h3 className="text-sm font-semibold text-white">Factor Weights Calibration</h3>
                  <p className="text-[11px] text-slate-400">Adjust the weight each verification vector carries. Total must equal 100%.</p>
                </div>
                <div className={`font-mono text-xs font-bold px-2.5 py-1 rounded-lg border ${
                  totalWeight === 100 
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                }`}>
                  Total: {totalWeight}%
                </div>
              </div>

              {/* Sliders */}
              <div className="space-y-4">
                {weights.map((f, i) => (
                  <div key={f.k} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-slate-200">{f.n}</span>
                      <span className="font-mono text-indigo-400 font-bold">{f.w}%</span>
                    </div>
                    <p className="text-[11px] text-slate-500">{f.d}</p>
                    <input
                      type="range"
                      min="0"
                      max="45"
                      value={f.w}
                      onChange={(e) => updateWeight(i, e.target.value)}
                      className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                    />
                  </div>
                ))}
              </div>

              {totalWeight !== 100 && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  <span>Weights sum to <strong>{totalWeight}%</strong>. Please calibrate sliders to exactly 100% to save changes.</span>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => showToast('Scoring algorithm saved successfully')}
                  disabled={totalWeight !== 100}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl shadow-lg shadow-indigo-500/20 transition disabled:opacity-50"
                >
                  Save Algorithm Changes
                </button>
                <button
                  onClick={resetWeights}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-xl transition flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset to Defaults
                </button>
              </div>
            </div>

            {/* Thresholds & Penalties */}
            <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-4 text-xs text-slate-300">
              <h3 className="text-sm font-semibold text-white pb-2 border-b border-slate-800">
                Thresholds & Direct Penalties
              </h3>

              <div className="space-y-4">
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="font-medium text-slate-200">Flag as Fake Below</span>
                    <span className="font-mono text-rose-400 font-bold">{fakeThreshold}</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="60"
                    value={fakeThreshold}
                    onChange={(e) => setFakeThreshold(parseInt(e.target.value, 10))}
                    className="w-full accent-rose-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <span className="font-medium text-slate-200">Verify as Real Above</span>
                    <span className="font-mono text-emerald-400 font-bold">{realThreshold}</span>
                  </div>
                  <input
                    type="range"
                    min="60"
                    max="95"
                    value={realThreshold}
                    onChange={(e) => setRealThreshold(parseInt(e.target.value, 10))}
                    className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <span className="font-medium text-slate-200">Fabricated Primary Document Penalty</span>
                    <span className="font-mono text-rose-400 font-bold">-{docPenalty} pts</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="10"
                    value={docPenalty}
                    onChange={(e) => setDocPenalty(parseInt(e.target.value, 10))}
                    className="w-full accent-rose-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <span className="font-medium text-slate-200">Pixel Media Manipulation Penalty</span>
                    <span className="font-mono text-rose-400 font-bold">-{mediaPenalty} pts</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="6"
                    value={mediaPenalty}
                    onChange={(e) => setMediaPenalty(parseInt(e.target.value, 10))}
                    className="w-full accent-rose-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                </div>
              </div>

              {/* Policy Checkboxes */}
              <div className="pt-3 border-t border-slate-800 space-y-2">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={reqTwoSources}
                    onChange={(e) => setReqTwoSources(e.target.checked)}
                    className="rounded border-slate-700 text-indigo-600 focus:ring-0 bg-slate-800"
                  />
                  <span>Require two independent ranked sources before any score above 75</span>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={c2paSignalOnly}
                    onChange={(e) => setC2paSignalOnly(e.target.checked)}
                    className="rounded border-slate-700 text-indigo-600 focus:ring-0 bg-slate-800"
                  />
                  <span>Treat stripped C2PA metadata credential as an advisory signal, not fatal verdict</span>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rank1ClearSolo}
                    onChange={(e) => setRank1ClearSolo(e.target.checked)}
                    className="rounded border-slate-700 text-indigo-600 focus:ring-0 bg-slate-800"
                  />
                  <span>Allow a single Rank-1 national source to clear a claim independently</span>
                </label>
              </div>
            </div>
          </div>

          {/* Right Rail: Real-Time Preview Dial */}
          <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-4 text-xs flex flex-col justify-between h-fit sticky top-24">
            <div>
              <span className="text-[10px] uppercase font-mono text-slate-400 block mb-1">
                Live Preview (Run DT-041)
              </span>
              <h3 className="text-sm font-semibold text-white">Leaked currency circular</h3>
              <p className="text-[11px] text-slate-400 mt-1">
                Moving weights recalculates the report score and verdict in real time before you commit changes.
              </p>
            </div>

            {/* Circular Preview Dial */}
            <div className="py-4 flex flex-col items-center justify-center">
              <div className="relative w-28 h-28 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 112 112">
                  <circle cx="56" cy="56" r="47" fill="none" stroke="#1e293b" strokeWidth="8" />
                  <circle
                    cx="56"
                    cy="56"
                    r="47"
                    fill="none"
                    stroke={previewScore >= 75 ? '#10b981' : previewScore >= 40 ? '#f59e0b' : '#f43f5e'}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray="295.3"
                    strokeDashoffset={295.3 - (295.3 * previewScore) / 100}
                    className="transition-all duration-300"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`text-2xl font-bold font-mono ${
                    previewScore >= 75 ? 'text-emerald-400' : previewScore >= 40 ? 'text-amber-400' : 'text-rose-400'
                  }`}>
                    {previewScore}
                  </span>
                  <span className="text-[9px] uppercase font-mono text-slate-400">Trust / 100</span>
                </div>
              </div>
              <span className={`mt-2 font-bold font-mono text-xs ${
                previewScore >= 75 ? 'text-emerald-400' : previewScore >= 40 ? 'text-amber-400' : 'text-rose-400'
              }`}>
                Verdict: {previewVerdict}
              </span>
            </div>

            <Link
              to="/results/DT-041-018"
              className="block w-full text-center px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-medium transition"
            >
              Open Active Report
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
