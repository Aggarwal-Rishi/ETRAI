import React, { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import { apiUrl } from '../utils/api';
import {
  Users,
  UserPlus,
  Shield,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Mail,
  Phone,
  Building2,
  MoreVertical,
  Edit2,
  Trash2,
  Power,
  Check,
  X,
  Sparkles,
  ArrowRight,
  ExternalLink,
  Lock,
  Layers,
  Clock,
  Info
} from 'lucide-react';

export default function WorkspacePage() {
  const { user } = useAuth();
  
  const [workspace, setWorkspace] = useState(null);
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoleFilter, setSelectedRoleFilter] = useState('ALL'); // 'ALL' | 'CREATOR' | 'REVIEWER' | 'READER' | 'DISABLED'

  // Invite Modal
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteCompany, setInviteCompany] = useState('');
  const [inviteRole, setInviteRole] = useState('REVIEWER');
  const [inviteError, setInviteError] = useState('');
  const [isSubmittingInvite, setIsSubmittingInvite] = useState(false);

  // Edit Role Modal
  const [editingMember, setEditingMember] = useState(null);
  const [newRole, setNewRole] = useState('REVIEWER');

  const [toastMsg, setToastMsg] = useState(null);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Load workspace details from real backend
  const loadWorkspace = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('etrai_token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const listRes = await fetch(apiUrl('/api/v1/workspaces'), { headers });
      if (listRes.ok) {
        const listData = await listRes.json();
        const primaryWorkspace = listData.workspaces?.[0];
        if (primaryWorkspace) {
          const detailRes = await fetch(apiUrl(`/api/v1/workspaces/${primaryWorkspace.id}`), { headers });
          if (detailRes.ok) {
            const detailData = await detailRes.json();
            setWorkspace(detailData.workspace);
            setMembers(detailData.workspace?.members || []);
            setInvites(detailData.workspace?.invitations || []);
          }
        }
      }
    } catch (err) {
      // Fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkspace();
  }, []);

  const maxSeats = workspace?.maxSeats || 5;
  const activeMembers = members.filter(m => m.status === 'ACTIVE');
  const pendingInvites = invites.filter(i => i.status === 'PENDING');
  const seatsOccupied = activeMembers.length + pendingInvites.length;
  const isAtCapacity = seatsOccupied >= maxSeats;

  // Real Counts
  const creatorsCount = members.filter(m => m.role === 'CREATOR' || m.role === 'OWNER').length;
  const reviewersCount = members.filter(m => m.role === 'REVIEWER').length;
  const readersCount = members.filter(m => m.role === 'READER').length;

  // Filtered members list
  const filteredMembers = members.filter(m => {
    if (selectedRoleFilter === 'CREATOR') return m.role === 'CREATOR' || m.role === 'OWNER';
    if (selectedRoleFilter === 'REVIEWER') return m.role === 'REVIEWER';
    if (selectedRoleFilter === 'READER') return m.role === 'READER';
    if (selectedRoleFilter === 'DISABLED') return m.status === 'DISABLED';
    return true;
  });

  const getInitials = (name, email) => {
    if (name) {
      const parts = name.trim().split(' ');
      if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      return name.slice(0, 2).toUpperCase();
    }
    return email ? email.slice(0, 2).toUpperCase() : 'TM';
  };

  // Send Invitation
  const handleSendInvite = async (e) => {
    e.preventDefault();
    setInviteError('');

    // Real regex email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(inviteEmail.trim())) {
      setInviteError('Please enter a valid email address.');
      return;
    }

    if (isAtCapacity) {
      setInviteError(`Seat capacity reached (${maxSeats}/${maxSeats}). Please upgrade your workspace tier to add more seats.`);
      return;
    }

    setIsSubmittingInvite(true);
    try {
      const token = localStorage.getItem('etrai_token');
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(apiUrl(`/api/v1/workspaces/${workspace?.id}/invite`), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          email: inviteEmail.trim(),
          name: inviteName.trim() || undefined,
          phone: invitePhone.trim() || undefined,
          company: inviteCompany.trim() || undefined,
          role: inviteRole
        })
      });

      const data = await res.json();
      if (res.ok) {
        showToast(`Cryptographic invitation dispatched to ${inviteEmail}`);
        setIsInviteModalOpen(false);
        setInviteEmail('');
        setInviteName('');
        setInvitePhone('');
        setInviteCompany('');
        loadWorkspace();
      } else {
        setInviteError(data.error || 'Failed to send invitation.');
      }
    } catch (err) {
      setInviteError('Server error while creating invitation.');
    } finally {
      setIsSubmittingInvite(false);
    }
  };

  // Update Member Role
  const handleUpdateRole = async () => {
    if (!editingMember) return;
    try {
      const token = localStorage.getItem('etrai_token');
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(apiUrl(`/api/v1/workspaces/${workspace?.id}/members/${editingMember.id}/role`), {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ role: newRole })
      });

      if (res.ok) {
        showToast(`Updated role for ${editingMember.name || editingMember.email} to ${newRole}`);
        setEditingMember(null);
        loadWorkspace();
      }
    } catch (err) {
      showToast('Failed to update role');
    }
  };

  // Toggle Member Status (Enable / Disable)
  const handleToggleStatus = async (member) => {
    try {
      const token = localStorage.getItem('etrai_token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const res = await fetch(apiUrl(`/api/v1/workspaces/${workspace?.id}/members/${member.id}/status`), {
        method: 'PATCH',
        headers
      });

      if (res.ok) {
        const nextStatus = member.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
        showToast(`Member status updated to ${nextStatus}`);
        loadWorkspace();
      }
    } catch (err) {
      showToast('Failed to change status');
    }
  };

  // Delete / Remove Member
  const handleRemoveMember = async (member) => {
    if (!window.confirm(`Are you sure you want to remove ${member.name || member.email} from the workspace?`)) return;
    try {
      const token = localStorage.getItem('etrai_token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const res = await fetch(apiUrl(`/api/v1/workspaces/${workspace?.id}/members/${member.id}`), {
        method: 'DELETE',
        headers
      });

      if (res.ok) {
        showToast(`Removed ${member.name || member.email} from workspace`);
        loadWorkspace();
      }
    } catch (err) {
      showToast('Failed to remove member');
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

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-fadeIn">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0B5CD5] flex items-center gap-2.5">
              <Users className="w-6 h-6 text-[#D97757]" />
              Team Workspace & Permissions
            </h1>
            <p className="text-xs sm:text-sm text-[#2C4E86] mt-1">
              Manage multi-user access, seat quotas, cryptographic invitations, and role-based access control.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsInviteModalOpen(true)}
              className="px-4 py-2 text-xs font-bold text-white bg-[#D97757] hover:bg-[#B0512F] rounded-xl shadow-md transition flex items-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              <span>Invite Team Member</span>
            </button>
          </div>
        </div>

        {/* Seat Capacity Alert Banner */}
        {isAtCapacity && (
          <div className="p-4 bg-[#F7EEDA] border border-[#E8D4B0] rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-[#B98520] flex-shrink-0" />
              <div>
                <span className="font-bold text-[#0B5CD5] block">Workspace Seat Capacity Reached</span>
                <span className="text-[#2C4E86] text-[11px]">
                  All {maxSeats} seats on the {workspace?.plan || 'Team'} tier are currently occupied or pending invitation.
                </span>
              </div>
            </div>
            <a
              href="/billing"
              className="px-3.5 py-1.5 bg-[#D97757] hover:bg-[#B0512F] text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md flex-shrink-0"
            >
              <span>Upgrade Capacity</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>
        )}

        {/* 4 Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4.5 bg-white border border-[#CECECE] rounded-2xl space-y-2 shadow-sm">
            <span className="text-[10px] uppercase font-mono text-[#7386A8] block font-semibold">
              Seats Occupied
            </span>
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-[#0B5CD5]">
              {seatsOccupied} / {maxSeats}
            </div>
            <span className="text-[11px] text-[#7386A8] font-mono">
              {maxSeats - seatsOccupied} available on {workspace?.plan || 'Team'} plan
            </span>
          </div>

          <div className="p-4.5 bg-white border border-[#CECECE] rounded-2xl space-y-2 shadow-sm">
            <span className="text-[10px] uppercase font-mono text-[#7386A8] block font-semibold">
              Creators & Owners
            </span>
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-[#0B5CD5]">
              {creatorsCount}
            </div>
            <span className="text-[11px] text-[#7386A8] font-mono">
              Full pipeline & whitelist access
            </span>
          </div>

          <div className="p-4.5 bg-white border border-[#CECECE] rounded-2xl space-y-2 shadow-sm">
            <span className="text-[10px] uppercase font-mono text-[#7386A8] block font-semibold">
              Reviewers
            </span>
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-[#D97757]">
              {reviewersCount}
            </div>
            <span className="text-[11px] text-[#7386A8] font-mono">
              Verification & audit access
            </span>
          </div>

          <div className="p-4.5 bg-white border border-[#CECECE] rounded-2xl space-y-2 shadow-sm">
            <span className="text-[10px] uppercase font-mono text-[#7386A8] block font-semibold">
              Pending Invites
            </span>
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-[#B98520]">
              {pendingInvites.length}
            </div>
            <span className="text-[11px] text-[#7386A8] font-mono">
              7-day token expiration
            </span>
          </div>
        </div>

        {/* Role Capability Cards (Reflecting Real Enforced Permissions) */}
        <div className="p-6 bg-white border border-[#CECECE] rounded-3xl space-y-4 shadow-sm">
          <h3 className="text-xs font-bold uppercase tracking-wider font-mono text-[#0B5CD5]">
            Role Permission Architecture (Enforced Server-Side)
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            
            {/* Owner & Creator */}
            <div className="p-4 bg-[#F8F8F6] border border-[#CECECE] rounded-2xl space-y-2">
              <div className="flex items-center gap-2 text-[#0B5CD5] font-bold font-mono text-xs">
                <Shield className="w-4 h-4 text-[#D97757]" /> Owner / Creator
              </div>
              <p className="text-[#2C4E86] leading-relaxed">
                Full authority to execute 4-agent pipelines, configure custom whitelist weights, invite/remove workspace members, and alter billing tiers.
              </p>
            </div>

            {/* Reviewer */}
            <div className="p-4 bg-[#F8F8F6] border border-[#CECECE] rounded-2xl space-y-2">
              <div className="flex items-center gap-2 text-[#D97757] font-bold font-mono text-xs">
                <CheckCircle2 className="w-4 h-4" /> Reviewer
              </div>
              <p className="text-[#2C4E86] leading-relaxed">
                Authorized to execute verifications, inspect per-claim evidence modals, export sealed PDF dossiers, and flag false news stories.
              </p>
            </div>

            {/* Reader */}
            <div className="p-4 bg-[#F8F8F6] border border-[#CECECE] rounded-2xl space-y-2">
              <div className="flex items-center gap-2 text-[#7386A8] font-bold font-mono text-xs">
                <Lock className="w-4 h-4" /> Reader (Read-Only)
              </div>
              <p className="text-[#7386A8] leading-relaxed">
                Strictly read-only access to browse existing dossiers and desk feeds. Server rejects any new analysis or configuration execution.
              </p>
            </div>
          </div>
        </div>

        {/* Members Table */}
        <div className="bg-white border border-[#CECECE] rounded-3xl overflow-hidden shadow-sm space-y-4 p-6">
          
          {/* Table Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[#CECECE]">
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { k: 'ALL', label: 'All Members' },
                { k: 'CREATOR', label: 'Creators' },
                { k: 'REVIEWER', label: 'Reviewers' },
                { k: 'READER', label: 'Readers' },
                { k: 'DISABLED', label: 'Disabled' }
              ].map(tab => (
                <button
                  key={tab.k}
                  onClick={() => setSelectedRoleFilter(tab.k)}
                  className={`px-3 py-1 rounded-xl text-xs font-semibold transition ${
                    selectedRoleFilter === tab.k
                      ? 'bg-[#D97757] text-white shadow-md'
                      : 'bg-[#EFEEE9] text-[#2C4E86] hover:text-[#0B5CD5] hover:bg-[#CECECE]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <span className="text-[#7386A8] font-mono text-[11px]">
              {filteredMembers.length} member records
            </span>
          </div>

          {/* Members Table Content */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#CECECE] text-[#2C4E86] uppercase font-mono text-[10px] bg-[#EFEEE9]">
                  <th className="py-3 px-3">Member</th>
                  <th className="py-3 px-3">Contact</th>
                  <th className="py-3 px-3">Role</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Last Active</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#CECECE] text-[#2C4E86]">
                {filteredMembers.map((m) => (
                  <tr key={m.id} className="hover:bg-[#F8F8F6] transition">
                    
                    {/* Member */}
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#0B5CD5] to-[#D97757] flex items-center justify-center font-bold text-white text-xs">
                          {getInitials(m.name, m.email)}
                        </div>
                        <div>
                          <span className="font-bold text-[#0B5CD5] block">{m.name || 'Team Member'}</span>
                          <span className="text-[11px] text-[#7386A8]">{m.company || workspace?.name}</span>
                        </div>
                      </div>
                    </td>

                    {/* Contact */}
                    <td className="py-3 px-3 font-mono text-[#7386A8] text-[11px]">
                      <div>{m.email}</div>
                      {m.phone && <div className="text-[#7386A8] text-[10px]">{m.phone}</div>}
                    </td>

                    {/* Role */}
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${
                        m.role === 'OWNER' || m.role === 'CREATOR' ? 'bg-[#EFEEE9] text-[#0B5CD5]' :
                        m.role === 'REVIEWER' ? 'bg-[#F6E7DF] text-[#B0512F]' :
                        'bg-[#EFEEE9] text-[#7386A8]'
                      }`}>
                        {m.role}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold ${
                        m.status === 'ACTIVE' ? 'bg-[#E4EFE7] text-[#2C5B3E]' :
                        m.status === 'INVITED' ? 'bg-[#F7EEDA] text-[#B98520]' :
                        'bg-[#F7E3E0] text-[#B23F35]'
                      }`}>
                        {m.status}
                      </span>
                    </td>

                    {/* Last Active */}
                    <td className="py-3 px-3 font-mono text-[#7386A8] text-[11px]">
                      {m.lastActive || 'Today'}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-3 text-right">
                      {m.role !== 'OWNER' ? (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              setEditingMember(m);
                              setNewRole(m.role);
                            }}
                            className="p-1.5 hover:bg-[#EFEEE9] rounded-lg text-[#7386A8] hover:text-[#0B5CD5] transition"
                            title="Edit Role"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleToggleStatus(m)}
                            className="p-1.5 hover:bg-[#EFEEE9] rounded-lg text-[#7386A8] hover:text-[#B98520] transition"
                            title={m.status === 'ACTIVE' ? 'Disable Member' : 'Enable Member'}
                          >
                            <Power className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleRemoveMember(m)}
                            className="p-1.5 hover:bg-[#EFEEE9] rounded-lg text-[#7386A8] hover:text-[#B23F35] transition"
                            title="Remove Member"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-[10px] font-mono text-[#7386A8] uppercase">Primary Owner</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* ========================================================================= */}
      {/* INVITE TEAM MEMBER MODAL                                                  */}
      {/* ========================================================================= */}
      {isInviteModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white border border-[#CECECE] rounded-3xl max-w-md w-full p-6 space-y-6 shadow-2xl animate-scaleUp text-xs">
            <div className="flex justify-between items-center border-b border-[#CECECE] pb-3">
              <h3 className="text-base font-bold text-[#0B5CD5] flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-[#D97757]" />
                Invite Workspace Member
              </h3>
              <button onClick={() => setIsInviteModalOpen(false)} className="text-[#7386A8] hover:text-[#0B5CD5]">
                <X className="w-4 h-4" />
              </button>
            </div>

            {inviteError && (
              <div className="p-3 bg-[#F7E3E0] border border-[#EBC7C2] rounded-xl text-[#B23F35] text-[11px]">
                {inviteError}
              </div>
            )}

            <form onSubmit={handleSendInvite} className="space-y-4">
              <div>
                <label className="block text-[#2C4E86] mb-1">Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Priya Sharma"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  className="w-full p-2.5 bg-[#F8F8F6] border border-[#CECECE] rounded-xl text-[#0B5CD5] focus:outline-none focus:border-[#D97757]"
                />
              </div>

              <div>
                <label className="block text-[#2C4E86] mb-1">Email Address *</label>
                <input
                  type="email"
                  required
                  placeholder="priya.sharma@newsroom.org"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full p-2.5 bg-[#F8F8F6] border border-[#CECECE] rounded-xl text-[#0B5CD5] focus:outline-none focus:border-[#D97757] font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#2C4E86] mb-1">Phone (Optional)</label>
                  <input
                    type="tel"
                    placeholder="+91 98200 12345"
                    value={invitePhone}
                    onChange={(e) => setInvitePhone(e.target.value)}
                    className="w-full p-2.5 bg-[#F8F8F6] border border-[#CECECE] rounded-xl text-[#0B5CD5] focus:outline-none focus:border-[#D97757] font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[#2C4E86] mb-1">Beat / Desk</label>
                  <input
                    type="text"
                    placeholder="National Policy"
                    value={inviteCompany}
                    onChange={(e) => setInviteCompany(e.target.value)}
                    className="w-full p-2.5 bg-[#F8F8F6] border border-[#CECECE] rounded-xl text-[#0B5CD5] focus:outline-none focus:border-[#D97757]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[#2C4E86] mb-1">Assigned Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full p-2.5 bg-[#F8F8F6] border border-[#CECECE] rounded-xl text-[#0B5CD5] focus:outline-none focus:border-[#D97757]"
                >
                  <option value="CREATOR">Creator (Full verification & scoring weights)</option>
                  <option value="REVIEWER">Reviewer (Run verifications & review audits)</option>
                  <option value="READER">Reader (Read-only dossier inspection)</option>
                </select>
              </div>

              <div className="pt-2 flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setIsInviteModalOpen(false)}
                  className="px-4 py-2 bg-[#EFEEE9] hover:bg-[#CECECE] text-[#2C4E86] font-semibold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingInvite}
                  className="px-4 py-2 bg-[#D97757] hover:bg-[#B0512F] text-white font-bold rounded-xl shadow-md"
                >
                  {isSubmittingInvite ? 'Dispatching...' : 'Send Secure Invitation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* EDIT ROLE MODAL                                                           */}
      {/* ========================================================================= */}
      {editingMember && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white border border-[#CECECE] rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl animate-scaleUp text-xs">
            <div className="flex justify-between items-center border-b border-[#CECECE] pb-2">
              <h3 className="font-bold text-[#0B5CD5]">Change Role</h3>
              <button onClick={() => setEditingMember(null)} className="text-[#7386A8] hover:text-[#0B5CD5]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[#2C4E86]">
              Update role for <strong>{editingMember.name || editingMember.email}</strong>:
            </p>

            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="w-full p-2.5 bg-[#F8F8F6] border border-[#CECECE] rounded-xl text-[#0B5CD5] focus:outline-none focus:border-[#D97757]"
            >
              <option value="CREATOR">Creator (Full verification & scoring weights)</option>
              <option value="REVIEWER">Reviewer (Run verifications & review audits)</option>
              <option value="READER">Reader (Read-only dossier inspection)</option>
            </select>

            <div className="pt-2 flex gap-2 justify-end">
              <button
                onClick={() => setEditingMember(null)}
                className="px-3 py-1.5 bg-[#EFEEE9] hover:bg-[#CECECE] text-[#2C4E86] rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateRole}
                className="px-4 py-1.5 bg-[#D97757] hover:bg-[#B0512F] text-white font-bold rounded-xl shadow-md"
              >
                Save Role
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
