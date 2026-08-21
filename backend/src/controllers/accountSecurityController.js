const {
  getUserProfile,
  updateUserProfile,
  changePassword,
  setup2fa,
  verifyAndEnable2fa,
  disable2fa,
  listActiveSessions,
  revokeSession,
  revokeAllOtherSessions,
  getLoginHistory,
  exportUserData,
  updateDataGovernance,
  deleteAccount
} = require('../services/accountSecurityService');

/**
 * GET /api/v1/account/profile
 */
const getProfile = async (req, res) => {
  try {
    const profile = await getUserProfile(req.user.id);
    return res.status(200).json({ success: true, profile });
  } catch (err) {
    console.error('[Get Profile Error]:', err);
    return res.status(500).json({ error: err.message || 'Failed to retrieve profile.' });
  }
};

/**
 * PATCH /api/v1/account/profile
 */
const updateProfile = async (req, res) => {
  try {
    const profile = await updateUserProfile(req.user.id, req.body);
    return res.status(200).json({ success: true, message: 'Profile updated successfully.', profile });
  } catch (err) {
    console.error('[Update Profile Error]:', err);
    return res.status(400).json({ error: err.message || 'Failed to update profile.' });
  }
};

/**
 * POST /api/v1/account/password
 */
const handlePasswordChange = async (req, res) => {
  try {
    const result = await changePassword(req.user.id, req.body);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[Change Password Error]:', err);
    return res.status(400).json({ error: err.message || 'Failed to change password.' });
  }
};

/**
 * POST /api/v1/account/2fa/setup
 */
const handleSetup2fa = async (req, res) => {
  try {
    const result = setup2fa(req.user.id, req.user.email);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('[2FA Setup Error]:', err);
    return res.status(500).json({ error: err.message || 'Failed to setup 2FA.' });
  }
};

/**
 * POST /api/v1/account/2fa/verify
 */
const handleVerify2fa = async (req, res) => {
  try {
    const result = verifyAndEnable2fa(req.user.id, req.body.code);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[2FA Verify Error]:', err);
    return res.status(400).json({ error: err.message || 'Invalid 2FA code.' });
  }
};

/**
 * POST /api/v1/account/2fa/disable
 */
const handleDisable2fa = async (req, res) => {
  try {
    const result = await disable2fa(req.user.id, req.body);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[2FA Disable Error]:', err);
    return res.status(400).json({ error: err.message || 'Failed to disable 2FA.' });
  }
};

/**
 * GET /api/v1/account/sessions
 */
const getSessions = async (req, res) => {
  try {
    const token = req.token || req.headers.authorization?.replace('Bearer ', '');
    const sessions = await listActiveSessions(req.user.id, token);
    return res.status(200).json({ success: true, count: sessions.length, sessions });
  } catch (err) {
    console.error('[Get Sessions Error]:', err);
    return res.status(500).json({ error: err.message || 'Failed to retrieve active sessions.' });
  }
};

/**
 * DELETE /api/v1/account/sessions/:id
 */
const handleRevokeSession = async (req, res) => {
  try {
    const result = await revokeSession(req.user.id, req.params.id);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[Revoke Session Error]:', err);
    return res.status(400).json({ error: err.message || 'Failed to revoke session.' });
  }
};

/**
 * POST /api/v1/account/sessions/revoke-others
 */
const handleRevokeAllOtherSessions = async (req, res) => {
  try {
    const token = req.token || req.headers.authorization?.replace('Bearer ', '');
    const result = await revokeAllOtherSessions(req.user.id, token);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[Revoke Other Sessions Error]:', err);
    return res.status(500).json({ error: err.message || 'Failed to revoke sessions.' });
  }
};

/**
 * GET /api/v1/account/login-history
 */
const getHistory = async (req, res) => {
  try {
    const history = getLoginHistory(req.user.id);
    return res.status(200).json({ success: true, count: history.length, history });
  } catch (err) {
    console.error('[Get Login History Error]:', err);
    return res.status(500).json({ error: err.message || 'Failed to retrieve login history.' });
  }
};

/**
 * GET /api/v1/account/export
 */
const handleDataExport = async (req, res) => {
  try {
    const data = await exportUserData(req.user.id);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=etrai-export-${Date.now()}.json`);
    return res.status(200).send(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('[Data Export Error]:', err);
    return res.status(500).json({ error: err.message || 'Failed to export account data.' });
  }
};

/**
 * PATCH /api/v1/account/governance/:workspaceId
 */
const handleUpdateGovernance = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const result = await updateDataGovernance(workspaceId, req.user.id, req.body);
    return res.status(200).json({ success: true, message: 'Data governance settings updated.', ...result });
  } catch (err) {
    console.error('[Update Governance Error]:', err);
    return res.status(403).json({ error: err.message || 'Failed to update governance settings.' });
  }
};

/**
 * POST /api/v1/account/delete
 */
const handleDeleteAccount = async (req, res) => {
  try {
    const result = await deleteAccount(req.user.id, req.body);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[Delete Account Error]:', err);
    return res.status(400).json({ error: err.message || 'Failed to delete account.' });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  handlePasswordChange,
  handleSetup2fa,
  handleVerify2fa,
  handleDisable2fa,
  getSessions,
  handleRevokeSession,
  handleRevokeAllOtherSessions,
  getHistory,
  handleDataExport,
  handleUpdateGovernance,
  handleDeleteAccount
};
