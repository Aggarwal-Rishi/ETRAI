import React, { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import { apiUrl } from '../utils/api';
import {
  Users,
  UserPlus,
  Shield,
  Key,
  Mail,
  UserCheck,
  UserX,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Building2,
  CreditCard,
  Settings,
  ChevronRight,
  RefreshCw,
  Loader2
} from 'lucide-react';

export default function WorkspacePage() {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspace, setActiveWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Invite state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('REVIEWER');
  const [sendingInvite, setSendingInvite] = useState(false);

  // Profile update state
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const token = localStorage.getItem('etrai_token');

  const fetchWorkspaces = async () => {
    try {
      setLoading(true);
      const res = await fetch(apiUrl('/api/v1/workspaces'), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data && data.workspaces) {
        setWorkspaces(data.workspaces);
        if (data.workspaces.length > 0) {
          const wsId = activeWorkspace?.id || data.workspaces[0].id;
          fetchWorkspaceDetails(wsId);
        }
      }
    } catch (err) {
      console.error('Failed to fetch workspaces:', err);
      setError('Could not load workspaces.');
    } finally {
      setLoading(false);
    }
  };

  const fetchWorkspaceDetails = async (id) => {
    try {
      const res = await fetch(apiUrl(`/api/v1/workspaces/${id}`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data && data.workspace) {
        setActiveWorkspace(data.workspace);
      }
    } catch (err) {
      console.error('Failed to fetch workspace details:', err);
    }
  };

  useEffect(() => {
    fetchWorkspaces();
    if (user) {
      setFullName(user.fullName || '');
      setPhone(user.phone || '');
      setCompany(user.company || '');
    }
  }, [user]);

  const handleSendInvite = async (e) => {
    e.preventDefault();
    if (!inviteEmail || !activeWorkspace) return;

    setSendingInvite(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(apiUrl(`/api/v1/workspaces/${activeWorkspace.id}/invitations`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send invite.');

      setSuccessMsg(`Invitation successfully dispatched to ${inviteEmail}.`);
      setInviteEmail('');
      fetchWorkspaceDetails(activeWorkspace.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setSendingInvite(false);
    }
  };

  const handleUpdateRole = async (memberId, newRole) => {
    try {
      setError(null);
      const res = await fetch(apiUrl(`/api/v1/workspaces/${activeWorkspace.id}/members/${memberId}/role`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ role: newRole })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update role.');
      fetchWorkspaceDetails(activeWorkspace.id);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleToggleStatus = async (memberId, currentStatus) => {
    const nextStatus = currentStatus === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    try {
      setError(null);
      const res = await fetch(apiUrl(`/api/v1/workspaces/${activeWorkspace.id}/members/${memberId}/status`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: nextStatus })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update member status.');
      fetchWorkspaceDetails(activeWorkspace.id);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRemoveMember = async (memberId) => {
    if (!window.confirm('Are you sure you want to remove this member from the workspace?')) return;
    try {
      setError(null);
      const res = await fetch(apiUrl(`/api/v1/workspaces/${activeWorkspace.id}/members/${memberId}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove member.');
      fetchWorkspaceDetails(activeWorkspace.id);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRevokeInvite = async (inviteId) => {
    try {
      setError(null);
      const res = await fetch(apiUrl(`/api/v1/workspaces/${activeWorkspace.id}/invitations/${inviteId}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to revoke invite.');
      fetchWorkspaceDetails(activeWorkspace.id);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(apiUrl('/api/v1/workspaces/profile'), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ fullName, phone, company })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update profile.');
      setSuccessMsg('Profile updated successfully.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingProfile(false);
    }
  };

  const isOwner = activeWorkspace?.currentUserRole === 'OWNER';

  return (
    <div className="min-h-screen bg-slateDark-950 text-slate-100 flex flex-col font-sans selection:bg-brand-500 selection:text-white">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slateDark-800 pb-6 mb-8">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-brand-400 uppercase tracking-widest mb-1">
              <Building2 className="w-3.5 h-3.5" /> Workspace & Team System
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              {activeWorkspace?.name || 'Workspace Management'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Manage multi-tenant seats, cryptographic invitations, and role-based permissions.
            </p>
          </div>

          {/* Seat Capacity Card */}
          {activeWorkspace && (
            <div className="bg-slateDark-900 border border-slateDark-800 p-3.5 rounded-xl flex items-center gap-4">
              <div className="p-2.5 rounded-lg bg-brand-500/10 text-brand-400 border border-brand-500/20">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-slate-400 font-medium">Seat Utilization</div>
                <div className="text-sm font-bold text-white">
                  {activeWorkspace.totalOccupiedSeats || 1} / {activeWorkspace.maxSeats || 5} Seats Used
                </div>
                <div className="w-32 bg-slateDark-800 h-1.5 rounded-full mt-1.5 overflow-hidden">
                  <div
                    className="bg-brand-500 h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(
                        100,
                        ((activeWorkspace.totalOccupiedSeats || 1) / (activeWorkspace.maxSeats || 5)) * 100
                      )}%`
                    }}
                  />
                </div>
              </div>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-brand-500/20 text-brand-300 border border-brand-500/30">
                {activeWorkspace.plan || 'Team'}
              </span>
            </div>
          )}
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Column: Team Members & Invites */}
          <div className="lg:col-span-2 space-y-8">
            {/* Team Members List */}
            <div className="bg-slateDark-900 border border-slateDark-800 rounded-2xl p-6 shadow-xl">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Shield className="w-4 h-4 text-brand-400" /> Team Members ({activeWorkspace?.members?.length || 0})
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Server-enforced role permissions: Owner, Creator, Reviewer, Reader.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slateDark-800 text-slate-400 uppercase tracking-wider font-semibold">
                      <th className="pb-3 px-3">Member</th>
                      <th className="pb-3 px-3">Role</th>
                      <th className="pb-3 px-3">Status</th>
                      <th className="pb-3 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slateDark-800/60">
                    {activeWorkspace?.members?.map((m) => {
                      const isMemberOwner = m.role === 'OWNER';
                      const isCurrentActive = m.status === 'ACTIVE';

                      return (
                        <tr key={m.id} className="hover:bg-slateDark-800/30 transition-colors">
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2.5">
                              <div
                                className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-[10px]"
                                style={{ backgroundColor: m.color || '#0B5CD5' }}
                              >
                                {m.name ? m.name.charAt(0).toUpperCase() : m.email.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-semibold text-white">{m.name || 'Team Member'}</div>
                                <div className="text-[11px] text-slate-400">{m.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            {isOwner && !isMemberOwner ? (
                              <select
                                value={m.role}
                                onChange={(e) => handleUpdateRole(m.id, e.target.value)}
                                className="bg-slateDark-800 border border-slateDark-700 text-slate-200 text-xs rounded-lg px-2 py-1 outline-none focus:border-brand-500"
                              >
                                <option value="CREATOR">Creator</option>
                                <option value="REVIEWER">Reviewer</option>
                                <option value="READER">Reader</option>
                              </select>
                            ) : (
                              <span
                                className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                  m.role === 'OWNER'
                                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                    : m.role === 'CREATOR'
                                    ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                                    : m.role === 'REVIEWER'
                                    ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                                    : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                                }`}
                              >
                                {m.role}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                isCurrentActive
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              }`}
                            >
                              {m.status}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right">
                            {isOwner && !isMemberOwner ? (
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => handleToggleStatus(m.id, m.status)}
                                  title={isCurrentActive ? 'Disable Member' : 'Enable Member'}
                                  className={`p-1 rounded text-xs transition-colors ${
                                    isCurrentActive
                                      ? 'text-amber-400 hover:bg-amber-500/10'
                                      : 'text-emerald-400 hover:bg-emerald-500/10'
                                  }`}
                                >
                                  {isCurrentActive ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                                </button>
                                <button
                                  onClick={() => handleRemoveMember(m.id)}
                                  title="Remove Member"
                                  className="p-1 rounded text-rose-400 hover:bg-rose-500/10 transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-500">Primary Admin</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pending Invitations */}
            {activeWorkspace?.invitations && activeWorkspace.invitations.length > 0 && (
              <div className="bg-slateDark-900 border border-slateDark-800 rounded-2xl p-6 shadow-xl">
                <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                  <Mail className="w-4 h-4 text-brand-400" /> Pending Invitations ({activeWorkspace.invitations.length})
                </h3>
                <div className="divide-y divide-slateDark-800">
                  {activeWorkspace.invitations.map((inv) => (
                    <div key={inv.id} className="py-3 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-semibold text-white">{inv.email}</div>
                        <div className="text-[10px] text-slate-400">
                          Role: {inv.role} • Expires {new Date(inv.expiresAt).toLocaleDateString()}
                        </div>
                      </div>
                      {isOwner && (
                        <button
                          onClick={() => handleRevokeInvite(inv.id)}
                          className="text-[11px] font-medium text-rose-400 hover:text-rose-300 transition-colors"
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar Column: Invite Member & Profile */}
          <div className="space-y-8">
            {/* Invite Form */}
            {isOwner && (
              <div className="bg-slateDark-900 border border-slateDark-800 rounded-2xl p-6 shadow-xl">
                <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-brand-400" /> Invite Team Member
                </h3>
                <p className="text-xs text-slate-400 mb-4">
                  Occupies 1 seat on your workspace. Cryptographic link valid for 7 days.
                </p>

                <form onSubmit={handleSendInvite} className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="analyst@newsroom.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="w-full bg-slateDark-800 border border-slateDark-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 outline-none focus:border-brand-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                      Assign Role
                    </label>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      className="w-full bg-slateDark-800 border border-slateDark-700 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none focus:border-brand-500"
                    >
                      <option value="CREATOR">Creator (Run & Create Analyses)</option>
                      <option value="REVIEWER">Reviewer (Audit Claims & Evidence)</option>
                      <option value="READER">Reader (Read-Only Reports)</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={sendingInvite || (activeWorkspace?.seatsAvailable === 0)}
                    className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold py-2.5 rounded-xl transition-colors shadow-lg shadow-brand-500/20 flex items-center justify-center gap-2"
                  >
                    {sendingInvite ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                    Send Workspace Invitation
                  </button>
                </form>
              </div>
            )}

            {/* Profile Settings */}
            <div className="bg-slateDark-900 border border-slateDark-800 rounded-2xl p-6 shadow-xl">
              <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
                <Settings className="w-4 h-4 text-brand-400" /> Analyst Profile
              </h3>
              <p className="text-xs text-slate-400 mb-4">
                Update your personal signature and contact information.
              </p>

              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full bg-slateDark-800 border border-slateDark-700 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    placeholder="+91 98765 43210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-slateDark-800 border border-slateDark-700 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Organization / Company
                  </label>
                  <input
                    type="text"
                    placeholder="ETRAI Fact-Checking Bureau"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    className="w-full bg-slateDark-800 border border-slateDark-700 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:border-brand-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={savingProfile}
                  className="w-full bg-slateDark-800 hover:bg-slateDark-700 text-white text-xs font-semibold py-2.5 rounded-xl transition-colors border border-slateDark-700 flex items-center justify-center gap-2"
                >
                  {savingProfile ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save Profile Changes'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
