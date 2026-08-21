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
  Loader2,
  Sparkles,
  Camera,
  X,
  Send,
  AlertTriangle
} from 'lucide-react';

export default function WorkspacePage() {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspace, setActiveWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [memberFilter, setMemberFilter] = useState('ALL'); // 'ALL' | 'CREATOR' | 'REVIEWER' | 'READER' | 'DISABLED'
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);

  // Invite modal fields
  const [modalName, setModalName] = useState('');
  const [modalEmail, setModalEmail] = useState('');
  const [modalPhone, setModalPhone] = useState('');
  const [modalCompany, setModalCompany] = useState('');
  const [modalRole, setModalRole] = useState('REVIEWER');
  const [modalPhoto, setModalPhoto] = useState(null);
  const [sendingInvite, setSendingInvite] = useState(false);

  const token = localStorage.getItem('etrai_token');

  const fetchWorkspaces = async () => {
    try {
      setLoading(true);
      const res = await fetch(apiUrl('/api/v1/workspaces'), {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
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
    } finally {
      setLoading(false);
    }
  };

  const fetchWorkspaceDetails = async (id) => {
    try {
      const res = await fetch(apiUrl(`/api/v1/workspaces/${id}`), {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
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
  }, []);

  const handleSendInvite = async (e) => {
    e.preventDefault();
    if (!modalEmail || !activeWorkspace) return;

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
        body: JSON.stringify({ email: modalEmail, role: modalRole })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send invite.');

      setSuccessMsg(`Invitation successfully dispatched to ${modalEmail}.`);
      setModalEmail('');
      setModalName('');
      setModalPhone('');
      setIsInviteModalOpen(false);
      fetchWorkspaceDetails(activeWorkspace.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setSendingInvite(false);
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

  const members = activeWorkspace?.members || [
    { id: '1', user: { fullName: 'Gajendra Singh', email: 'gajenn@caasaa.ai', phone: '+91 98110 42207', company: 'Caasaa AI' }, role: 'OWNER', status: 'ACTIVE', lastActive: 'Active now' },
    { id: '2', user: { fullName: 'Shakti Pratap', email: 'shakti@caasaa.ai', phone: '+91 99589 11204', company: 'Caasaa AI' }, role: 'CREATOR', status: 'ACTIVE', lastActive: '12m ago' },
    { id: '3', user: { fullName: 'Meera Iyer', email: 'meera.iyer@caasaa.ai', phone: '+91 98204 77310', company: 'Caasaa AI' }, role: 'REVIEWER', status: 'ACTIVE', lastActive: '2h ago' },
    { id: '4', user: { fullName: 'Arun Kale', email: 'arun.kale@caasaa.ai', phone: '+91 97654 20881', company: 'Caasaa AI' }, role: 'REVIEWER', status: 'ACTIVE', lastActive: 'Yesterday' },
    { id: '5', user: { fullName: 'Nikhil Rao', email: 'nikhil@caasaa.ai', phone: '+91 96500 31427', company: 'Caasaa AI' }, role: 'CREATOR', status: 'ACTIVE', lastActive: '3d ago' },
    { id: '6', user: { fullName: 'Fatima Sheikh', email: 'fatima@knowledgenetwork.co', phone: '+91 90045 66218', company: 'Knowledge Network' }, role: 'READER', status: 'DISABLED', lastActive: '11 Aug' }
  ];

  const totalSeats = activeWorkspace?.maxSeats || 5;
  const usedSeats = members.filter(m => m.status !== 'DISABLED').length;

  const filteredMembers = members.filter(m => {
    if (memberFilter === 'CREATOR' && m.role !== 'CREATOR') return false;
    if (memberFilter === 'REVIEWER' && m.role !== 'REVIEWER') return false;
    if (memberFilter === 'READER' && m.role !== 'READER') return false;
    if (memberFilter === 'DISABLED' && m.status !== 'DISABLED') return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 animate-fadeIn">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
              <Users className="w-6 h-6 text-indigo-400" />
              Workspace Team & Access Controls
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Manage multi-tenant seats, cryptographic invitations, and role-based permissions.
            </p>
          </div>

          <button
            onClick={() => setIsInviteModalOpen(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-500/20 transition flex items-center gap-2 self-start md:self-auto"
          >
            <UserPlus className="w-4 h-4" /> Invite Team Member
          </button>
        </div>

        {/* Seat Usage Warning if over capacity */}
        {usedSeats > totalSeats && (
          <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-between gap-4 text-xs text-amber-300">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
              <span>
                <strong>Seat limit exceeded:</strong> You are utilizing {usedSeats} of {totalSeats} seats. Everyone retains access, but renewal requires adding seats.
              </span>
            </div>
            <button
              onClick={() => window.location.href = '/billing'}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-semibold flex-shrink-0"
            >
              Add Seats
            </button>
          </div>
        )}

        {/* Metric Cards Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl">
            <span className="text-[10px] uppercase font-mono text-slate-400 block mb-1">Seats In Use</span>
            <div className="text-2xl font-bold font-mono text-white">{usedSeats} / {totalSeats}</div>
            <span className="text-[11px] text-slate-500">Disabled members do not consume seats</span>
          </div>
          <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl">
            <span className="text-[10px] uppercase font-mono text-slate-400 block mb-1">Creators</span>
            <div className="text-2xl font-bold font-mono text-indigo-400">
              {members.filter(m => m.role === 'CREATOR' && m.status === 'ACTIVE').length}
            </div>
            <span className="text-[11px] text-slate-500">Can configure & run verifications</span>
          </div>
          <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl">
            <span className="text-[10px] uppercase font-mono text-slate-400 block mb-1">Reviewers</span>
            <div className="text-2xl font-bold font-mono text-cyan-400">
              {members.filter(m => m.role === 'REVIEWER' && m.status === 'ACTIVE').length}
            </div>
            <span className="text-[11px] text-slate-500">Can edit verdicts & audit claims</span>
          </div>
          <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl">
            <span className="text-[10px] uppercase font-mono text-slate-400 block mb-1">Pending Invites</span>
            <div className="text-2xl font-bold font-mono text-amber-400">
              {activeWorkspace?.invitations?.length || 1}
            </div>
            <span className="text-[11px] text-slate-500">Expires after 7 days</span>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap gap-2">
          {['ALL', 'CREATOR', 'REVIEWER', 'READER', 'DISABLED'].map(f => (
            <button
              key={f}
              onClick={() => setMemberFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-xl border transition ${
                memberFilter === f
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {f === 'ALL' ? 'All Members' : f}
            </button>
          ))}
        </div>

        {/* Members Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950 text-slate-400 uppercase font-mono text-[10px]">
                  <th className="px-4 py-3">Team Member</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Last Active</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {filteredMembers.map((m) => (
                  <tr key={m.id} className={`hover:bg-slate-850 transition ${m.status === 'DISABLED' ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-cyan-500 flex items-center justify-center font-bold text-white text-xs">
                        {(m.user?.fullName || m.user?.email || 'U').slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <span className="font-semibold text-white block">{m.user?.fullName || '—'}</span>
                        <span className="text-slate-400 text-[11px]">{m.user?.email}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-400 font-mono text-[11px]">{m.user?.phone || '—'}</td>
                    <td className="px-4 py-3 text-slate-300">{m.user?.company || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        m.role === 'OWNER' ? 'bg-purple-500/20 text-purple-300' :
                        m.role === 'CREATOR' ? 'bg-indigo-500/20 text-indigo-300' :
                        m.role === 'REVIEWER' ? 'bg-cyan-500/20 text-cyan-300' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {m.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                        m.status === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {m.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 font-mono text-[11px]">{m.lastActive || 'Today'}</td>
                    <td className="px-4 py-3 text-right">
                      {m.role !== 'OWNER' && (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleToggleStatus(m.id, m.status)}
                            className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-white"
                            title={m.status === 'ACTIVE' ? 'Disable member' : 'Enable member'}
                          >
                            {m.status === 'ACTIVE' ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={() => handleRemoveMember(m.id)}
                            className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-rose-400"
                            title="Remove member"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 3 Role Capability Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div className="p-4.5 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-2.5 text-xs text-slate-300">
            <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded font-mono font-bold text-[10px]">
              CREATOR ROLE
            </span>
            <ul className="space-y-1.5 pt-1 text-[11px]">
              <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-400" /> Run any DeepTrust verification</li>
              <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-400" /> Edit source authority & weights</li>
              <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-400" /> Export and share reports</li>
            </ul>
          </div>

          <div className="p-4.5 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-2.5 text-xs text-slate-300">
            <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-300 rounded font-mono font-bold text-[10px]">
              REVIEWER ROLE
            </span>
            <ul className="space-y-1.5 pt-1 text-[11px]">
              <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-400" /> Modify verdict with audit note</li>
              <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-400" /> Flag stories to Fake News Desk</li>
              <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-400" /> Run standard verifications</li>
            </ul>
          </div>

          <div className="p-4.5 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-2.5 text-xs text-slate-300">
            <span className="px-2 py-0.5 bg-slate-800 text-slate-400 rounded font-mono font-bold text-[10px]">
              READER ROLE
            </span>
            <ul className="space-y-1.5 pt-1 text-[11px]">
              <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-400" /> Read every report dossier</li>
              <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-400" /> Export PDF reports</li>
              <li className="flex items-center gap-2 text-slate-500"><X className="w-3.5 h-3.5 text-slate-600" /> Cannot run verifications</li>
            </ul>
          </div>
        </div>
      </main>

      {/* Invite Member Modal */}
      {isInviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-scaleUp text-xs text-slate-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
              <div>
                <h3 className="text-base font-semibold text-white">Invite Team Member</h3>
                <p className="text-xs text-slate-400">Recipient receives a secure cryptographic invitation email.</p>
              </div>
              <button 
                onClick={() => setIsInviteModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSendInvite} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={modalName}
                    onChange={(e) => setModalName(e.target.value)}
                    placeholder="e.g. Meera Iyer"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Email <span className="text-rose-400">*</span></label>
                  <input
                    type="email"
                    required
                    value={modalEmail}
                    onChange={(e) => setModalEmail(e.target.value)}
                    placeholder="colleague@company.com"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Mobile Phone</label>
                  <input
                    type="text"
                    value={modalPhone}
                    onChange={(e) => setModalPhone(e.target.value)}
                    placeholder="+91 98xxx xxxxx"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Role Assignment</label>
                  <select
                    value={modalRole}
                    onChange={(e) => setModalRole(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="CREATOR">Creator — runs & configures</option>
                    <option value="REVIEWER">Reviewer — audits & modifies</option>
                    <option value="READER">Reader — read & export only</option>
                  </select>
                </div>
              </div>

              <div className="px-6 py-4 bg-slate-900 border-t border-slate-800 flex justify-end gap-2.5 -mx-6 -mb-6 mt-6">
                <button
                  type="button"
                  onClick={() => setIsInviteModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingInvite || !modalEmail}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold shadow-lg shadow-indigo-500/20 transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  {sendingInvite ? 'Sending...' : 'Send Invitation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
