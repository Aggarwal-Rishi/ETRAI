import React, { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import { apiUrl } from '../utils/api';
import {
  Shield,
  Key,
  Smartphone,
  Laptop,
  History,
  Download,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Globe,
  Database,
  RefreshCw,
  LogOut,
  Loader2
} from 'lucide-react';

export default function AccountSecurityPage() {
  const { user, logout } = useAuth();

  // Profile & Password State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [updatingPassword, setUpdatingPassword] = useState(false);

  // 2FA State
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [setup2faData, setSetup2faData] = useState(null);
  const [totpCode, setTotpCode] = useState('');
  const [disable2faPassword, setDisable2faPassword] = useState('');
  const [settingUp2fa, setSettingUp2fa] = useState(false);

  // Sessions & History
  const [sessions, setSessions] = useState([]);
  const [loginHistory, setLoginHistory] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  // Governance State
  const [retentionPeriod, setRetentionPeriod] = useState('365_DAYS');
  const [dataRegion, setDataRegion] = useState('IN-MUMBAI-1');
  const [savingGovernance, setSavingGovernance] = useState(false);

  // Deletion State
  const [deletePassword, setDeletePassword] = useState('');
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  // Feedback Messages
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const token = localStorage.getItem('etrai_token');

  const fetchProfileAndSecurity = async () => {
    try {
      const res = await fetch(apiUrl('/api/v1/account/profile'), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data && data.profile) {
        setTwoFactorEnabled(data.profile.twoFactorEnabled || false);
      }
    } catch (err) {
      console.error('Failed to fetch profile:', err);
    }
  };

  const fetchSessionsAndHistory = async () => {
    try {
      setLoadingSessions(true);
      const [resSessions, resHistory] = await Promise.all([
        fetch(apiUrl('/api/v1/account/sessions'), { headers: { Authorization: `Bearer ${token}` } }),
        fetch(apiUrl('/api/v1/account/login-history'), { headers: { Authorization: `Bearer ${token}` } })
      ]);
      const dataSessions = await resSessions.json();
      const dataHistory = await resHistory.json();

      if (dataSessions && dataSessions.sessions) setSessions(dataSessions.sessions);
      if (dataHistory && dataHistory.history) setLoginHistory(dataHistory.history);
    } catch (err) {
      console.error('Failed to fetch sessions/history:', err);
    } finally {
      setLoadingSessions(false);
    }
  };

  useEffect(() => {
    fetchProfileAndSecurity();
    fetchSessionsAndHistory();
  }, []);

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setErrorMsg('New password and confirmation do not match.');
      return;
    }

    setUpdatingPassword(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(apiUrl('/api/v1/account/password'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ currentPassword, newPassword })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update password.');

      setSuccessMsg('Password updated successfully. Other sessions have been revoked.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      fetchSessionsAndHistory();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setUpdatingPassword(false);
    }
  };

  const handleStart2faSetup = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setSettingUp2fa(true);
    try {
      const res = await fetch(apiUrl('/api/v1/account/2fa/setup'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to initialize 2FA.');
      setSetup2faData(data);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSettingUp2fa(false);
    }
  };

  const handleVerify2fa = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(apiUrl('/api/v1/account/2fa/verify'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ code: totpCode })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invalid 2FA verification code.');

      setSuccessMsg('Two-factor authentication successfully enabled.');
      setTwoFactorEnabled(true);
      setSetup2faData(null);
      setTotpCode('');
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const handleDisable2fa = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(apiUrl('/api/v1/account/2fa/disable'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ currentPassword: disable2faPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to disable 2FA.');

      setSuccessMsg('Two-factor authentication has been disabled.');
      setTwoFactorEnabled(false);
      setDisable2faPassword('');
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const handleRevokeSession = async (sessionId) => {
    try {
      const res = await fetch(apiUrl(`/api/v1/account/sessions/${sessionId}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to revoke session.');
      fetchSessionsAndHistory();
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const handleRevokeAllOtherSessions = async () => {
    try {
      const res = await fetch(apiUrl('/api/v1/account/sessions/revoke-others'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to revoke sessions.');
      setSuccessMsg('All other sessions have been revoked.');
      fetchSessionsAndHistory();
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const handleDownloadExport = () => {
    window.open(apiUrl(`/api/v1/account/export?token=${token}`), '_blank');
  };

  const handleDeleteAccount = async (e) => {
    e.preventDefault();
    if (!window.confirm('CRITICAL WARNING: This will permanently delete your account, reports, and team data. Proceed?')) {
      return;
    }

    setDeletingAccount(true);
    setErrorMsg(null);

    try {
      const res = await fetch(apiUrl('/api/v1/account/delete'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          currentPassword: deletePassword,
          confirmationPhrase: confirmPhrase
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete account.');

      await logout();
      window.location.href = '/login';
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setDeletingAccount(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFF6E3] text-[#0B5CD5] flex flex-col font-sans selection:bg-[#D97757] selection:text-white">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="border-b border-[#CECECE] pb-6 mb-8">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#D97757] uppercase tracking-widest mb-1">
            <Shield className="w-3.5 h-3.5" /> Security & Account Center
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0B5CD5] tracking-tight">
            Account & Security Management
          </h1>
          <p className="text-xs sm:text-sm text-[#2C4E86] mt-1">
            Manage your credentials, two-factor authentication, active sessions, GDPR export, and data governance.
          </p>
        </div>

        {/* Global Alerts */}
        {errorMsg && (
          <div className="mb-6 p-4 rounded-xl bg-[#F7E3E0] border border-[#EBC7C2] text-[#B23F35] text-sm flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0 text-[#B23F35]" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="mb-6 p-4 rounded-xl bg-[#E4EFE7] border border-[#C6DFCF] text-[#2C5B3E] text-sm flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 shrink-0 text-[#3E7A55]" />
            <span>{successMsg}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Column 1: Password & 2FA */}
          <div className="space-y-8">
            {/* Password Change Card */}
            <div className="bg-white border border-[#CECECE] rounded-2xl p-6 shadow-sm">
              <h2 className="text-base font-bold text-[#0B5CD5] mb-1 flex items-center gap-2">
                <Key className="w-4 h-4 text-[#D97757]" /> Change Password
              </h2>
              <p className="text-xs text-[#2C4E86] mb-5">
                Requires re-authentication. Automatically revokes all other active sessions.
              </p>

              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#2C4E86] mb-1">
                    Current Password
                  </label>
                  <input
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full bg-[#F8F8F6] border border-[#CECECE] rounded-xl px-3.5 py-2 text-xs text-[#0B5CD5] outline-none focus:border-[#D97757]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#2C4E86] mb-1">
                    New Password (min 8 chars)
                  </label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-[#F8F8F6] border border-[#CECECE] rounded-xl px-3.5 py-2 text-xs text-[#0B5CD5] outline-none focus:border-[#D97757]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#2C4E86] mb-1">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full bg-[#F8F8F6] border border-[#CECECE] rounded-xl px-3.5 py-2 text-xs text-[#0B5CD5] outline-none focus:border-[#D97757]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={updatingPassword}
                  className="w-full bg-[#D97757] hover:bg-[#B0512F] text-white text-xs font-bold py-2.5 rounded-xl transition-colors shadow-md shadow-[#D97757]/20 flex items-center justify-center gap-2"
                >
                  {updatingPassword ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                  Update Account Password
                </button>
              </form>
            </div>

            {/* 2FA Card */}
            <div className="bg-white border border-[#CECECE] rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-base font-bold text-[#0B5CD5] flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-[#D97757]" /> Two-Factor Authentication (2FA)
                </h2>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                    twoFactorEnabled
                      ? 'bg-[#E4EFE7] text-[#2C5B3E] border border-[#C6DFCF]'
                      : 'bg-[#EFEEE9] text-[#7386A8] border border-[#CECECE]'
                  }`}
                >
                  {twoFactorEnabled ? 'ENABLED' : 'DISABLED'}
                </span>
              </div>
              <p className="text-xs text-[#2C4E86] mb-5">
                Add an extra layer of protection using TOTP authenticator apps (Google Authenticator, Authy).
              </p>

              {!twoFactorEnabled && !setup2faData && (
                <button
                  onClick={handleStart2faSetup}
                  disabled={settingUp2fa}
                  className="bg-[#EFEEE9] hover:bg-[#CECECE] text-[#0B5CD5] text-xs font-semibold px-4 py-2.5 rounded-xl border border-[#CECECE] flex items-center gap-2 transition"
                >
                  {settingUp2fa ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Set Up Two-Factor Authentication'}
                </button>
              )}

              {setup2faData && (
                <div className="space-y-4 p-4 rounded-xl bg-[#F8F8F6] border border-[#CECECE]">
                  <div className="text-xs text-[#0B5CD5] font-medium">
                    1. Scan QR code or copy manual key into your authenticator app:
                  </div>
                  <div className="bg-white p-2.5 rounded-lg font-mono text-[11px] text-[#D97757] select-all break-all border border-[#CECECE]">
                    {setup2faData.secret}
                  </div>

                  <div className="text-xs text-[#0B5CD5] font-medium">
                    2. Save your 8 one-time backup recovery codes:
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 bg-white p-2.5 rounded-lg font-mono text-[10px] text-[#2C4E86] border border-[#CECECE]">
                    {setup2faData.recoveryCodes?.map((code, idx) => (
                      <div key={idx}>{code}</div>
                    ))}
                  </div>

                  <form onSubmit={handleVerify2fa} className="space-y-3 pt-2">
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#2C4E86]">
                      3. Enter 6-Digit Authenticator Code
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      placeholder="123456"
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                      className="w-full bg-white border border-[#CECECE] rounded-xl px-3.5 py-2 text-center text-sm font-mono tracking-widest text-[#0B5CD5] outline-none focus:border-[#D97757]"
                    />
                    <button
                      type="submit"
                      disabled={totpCode.length !== 6}
                      className="w-full bg-[#3E7A55] hover:bg-[#2C5B3E] disabled:opacity-50 text-white text-xs font-bold py-2 rounded-xl transition-colors shadow-xs"
                    >
                      Confirm and Enable 2FA
                    </button>
                  </form>
                </div>
              )}

              {twoFactorEnabled && (
                <form onSubmit={handleDisable2fa} className="space-y-3 pt-2">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#2C4E86]">
                    Confirm Password to Disable 2FA
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Current account password"
                    value={disable2faPassword}
                    onChange={(e) => setDisable2faPassword(e.target.value)}
                    className="w-full bg-[#F8F8F6] border border-[#CECECE] rounded-xl px-3.5 py-2 text-xs text-[#0B5CD5] outline-none focus:border-[#D97757]"
                  />
                  <button
                    type="submit"
                    className="bg-[#F7E3E0] hover:bg-[#F2CCC7] text-[#B23F35] text-xs font-semibold px-4 py-2 rounded-xl border border-[#EBC7C2]"
                  >
                    Disable Two-Factor Authentication
                  </button>
                </form>
              )}
            </div>

            {/* Data Governance & Sovereignty */}
            <div className="bg-white border border-[#CECECE] rounded-2xl p-6 shadow-sm">
              <h2 className="text-base font-bold text-[#0B5CD5] mb-1 flex items-center gap-2">
                <Globe className="w-4 h-4 text-[#D97757]" /> Data Sovereignty & Retention
              </h2>
              <p className="text-xs text-[#2C4E86] mb-5">
                Configure data residency boundaries and lifecycle retention periods.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#2C4E86] mb-1">
                    Primary Data Region
                  </label>
                  <select
                    value={dataRegion}
                    onChange={(e) => setDataRegion(e.target.value)}
                    className="w-full bg-[#F8F8F6] border border-[#CECECE] rounded-xl px-3.5 py-2 text-xs text-[#0B5CD5] outline-none focus:border-[#D97757]"
                  >
                    <option value="IN-MUMBAI-1">IN-MUMBAI-1 (Asia Pacific / India Sovereign)</option>
                    <option value="EU-FRANKFURT-1">EU-FRANKFURT-1 (European Union GDPR)</option>
                    <option value="US-EAST-1">US-EAST-1 (North America)</option>
                    <option value="APAC-SINGAPORE-1">APAC-SINGAPORE-1 (Southeast Asia)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#2C4E86] mb-1">
                    Data Retention Policy
                  </label>
                  <select
                    value={retentionPeriod}
                    onChange={(e) => setRetentionPeriod(e.target.value)}
                    className="w-full bg-[#F8F8F6] border border-[#CECECE] rounded-xl px-3.5 py-2 text-xs text-[#0B5CD5] outline-none focus:border-[#D97757]"
                  >
                    <option value="30_DAYS">30 Days Auto-Purge</option>
                    <option value="90_DAYS">90 Days Auto-Purge</option>
                    <option value="180_DAYS">180 Days Auto-Purge</option>
                    <option value="365_DAYS">365 Days Auto-Purge (Standard)</option>
                    <option value="INDEFINITE">Indefinite Retention</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Column 2: Sessions, GDPR Export, Danger Zone */}
          <div className="space-y-8">
            {/* Active Sessions */}
            <div className="bg-white border border-[#CECECE] rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold text-[#0B5CD5] flex items-center gap-2">
                    <Laptop className="w-4 h-4 text-[#D97757]" /> Active Sessions ({sessions.length})
                  </h2>
                  <p className="text-xs text-[#2C4E86] mt-0.5">Devices currently authenticated to your account.</p>
                </div>
                {sessions.length > 1 && (
                  <button
                    onClick={handleRevokeAllOtherSessions}
                    className="text-[11px] text-[#B0512F] hover:underline font-semibold transition-colors"
                  >
                    Revoke Other Sessions
                  </button>
                )}
              </div>

              <div className="divide-y divide-[#CECECE]">
                {sessions.map((s) => (
                  <div key={s.id} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[#0B5CD5]">{s.ipAddress}</span>
                        {s.isCurrent && (
                          <span className="text-[9px] bg-[#E4EFE7] text-[#2C5B3E] border border-[#C6DFCF] px-1.5 py-0.2 rounded font-bold">
                            Current Device
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-[#7386A8] truncate max-w-xs">{s.userAgent}</div>
                    </div>
                    {!s.isCurrent && (
                      <button
                        onClick={() => handleRevokeSession(s.id)}
                        className="text-[11px] text-[#B23F35] hover:underline font-medium"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* GDPR Data Export */}
            <div className="bg-white border border-[#CECECE] rounded-2xl p-6 shadow-sm">
              <h2 className="text-base font-bold text-[#0B5CD5] mb-1 flex items-center gap-2">
                <Download className="w-4 h-4 text-[#D97757]" /> Data Portability & Export
              </h2>
              <p className="text-xs text-[#2C4E86] mb-4">
                Export all verification reports, claim audits, evidence items, and login telemetry as sanitized JSON.
              </p>

              <button
                onClick={handleDownloadExport}
                className="bg-[#EFEEE9] hover:bg-[#CECECE] text-[#0B5CD5] text-xs font-semibold px-4 py-2.5 rounded-xl border border-[#CECECE] flex items-center gap-2 transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Download Full Account Export (.JSON)
              </button>
            </div>

            {/* Danger Zone: Account Deletion */}
            <div className="bg-[#FFF6E3] border border-[#B23F35]/30 rounded-2xl p-6 shadow-sm">
              <h2 className="text-base font-bold text-[#B23F35] mb-1 flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-[#B23F35]" /> Danger Zone: Delete Account
              </h2>
              <p className="text-xs text-[#2C4E86] mb-4">
                Permanently delete your user profile, owned workspaces, verification history, and team seats. This action cannot be undone.
              </p>

              <form onSubmit={handleDeleteAccount} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#2C4E86] mb-1">
                    Enter Password to Confirm
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Account password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    className="w-full bg-white border border-[#B23F35]/40 rounded-xl px-3.5 py-2 text-xs text-[#0B5CD5] outline-none focus:border-[#B23F35]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#2C4E86] mb-1">
                    Type <span className="font-mono text-[#B23F35] font-bold">DELETE MY ACCOUNT</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="DELETE MY ACCOUNT"
                    value={confirmPhrase}
                    onChange={(e) => setConfirmPhrase(e.target.value)}
                    className="w-full bg-white border border-[#B23F35]/40 rounded-xl px-3.5 py-2 text-xs text-[#0B5CD5] outline-none focus:border-[#B23F35]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={deletingAccount || confirmPhrase !== 'DELETE MY ACCOUNT'}
                  className="w-full bg-[#B23F35] hover:bg-[#8E2F27] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm shadow-[#B23F35]/20"
                >
                  {deletingAccount ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  Permanently Delete My Account
                </button>
              </form>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
