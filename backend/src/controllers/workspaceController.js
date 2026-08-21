const {
  listUserWorkspaces,
  getWorkspaceDetails,
  inviteWorkspaceMember,
  acceptInvitation,
  cancelInvitation,
  updateMemberRole,
  toggleMemberStatus,
  removeMember
} = require('../services/workspaceService');
const { dbService } = require('../utils/prisma');

/**
 * GET /api/v1/workspaces
 */
const getWorkspaces = async (req, res) => {
  try {
    const userId = req.user.id;
    const workspaces = await listUserWorkspaces(userId);
    return res.status(200).json({ success: true, count: workspaces.length, workspaces });
  } catch (err) {
    console.error('[Get Workspaces Error]:', err);
    return res.status(500).json({ error: 'Failed to retrieve workspaces.' });
  }
};

/**
 * GET /api/v1/workspaces/:id
 */
const getWorkspaceById = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const workspace = await getWorkspaceDetails(id, userId);
    return res.status(200).json({ success: true, workspace });
  } catch (err) {
    console.error('[Get Workspace Details Error]:', err);
    return res.status(403).json({ error: err.message || 'Failed to retrieve workspace details.' });
  }
};

/**
 * POST /api/v1/workspaces/:id/invitations
 */
const sendInvitation = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { email, role } = req.body;

    const invitation = await inviteWorkspaceMember(id, userId, { email, role });
    return res.status(201).json({ success: true, message: 'Invitation sent successfully.', invitation });
  } catch (err) {
    console.error('[Send Invitation Error]:', err);
    return res.status(400).json({ error: err.message || 'Failed to send invitation.' });
  }
};

/**
 * POST /api/v1/workspaces/invitations/accept
 */
const handleAcceptInvitation = async (req, res) => {
  try {
    const userId = req.user.id;
    const { token } = req.body;

    const result = await acceptInvitation(token, userId);
    return res.status(200).json({ success: true, message: 'Joined workspace successfully.', ...result });
  } catch (err) {
    console.error('[Accept Invitation Error]:', err);
    return res.status(400).json({ error: err.message || 'Failed to accept invitation.' });
  }
};

/**
 * DELETE /api/v1/workspaces/:id/invitations/:invitationId
 */
const revokeInvitation = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id, invitationId } = req.params;

    await cancelInvitation(id, invitationId, userId);
    return res.status(200).json({ success: true, message: 'Invitation revoked.' });
  } catch (err) {
    console.error('[Revoke Invitation Error]:', err);
    return res.status(403).json({ error: err.message || 'Failed to revoke invitation.' });
  }
};

/**
 * PATCH /api/v1/workspaces/:id/members/:memberId/role
 */
const updateRole = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id, memberId } = req.params;
    const { role } = req.body;

    const member = await updateMemberRole(id, memberId, role, userId);
    return res.status(200).json({ success: true, message: 'Member role updated.', member });
  } catch (err) {
    console.error('[Update Role Error]:', err);
    return res.status(403).json({ error: err.message || 'Failed to update member role.' });
  }
};

/**
 * PATCH /api/v1/workspaces/:id/members/:memberId/status
 */
const updateStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id, memberId } = req.params;
    const { status } = req.body;

    const member = await toggleMemberStatus(id, memberId, status, userId);
    return res.status(200).json({ success: true, message: `Member status set to ${status}.`, member });
  } catch (err) {
    console.error('[Update Status Error]:', err);
    return res.status(403).json({ error: err.message || 'Failed to update member status.' });
  }
};

/**
 * DELETE /api/v1/workspaces/:id/members/:memberId
 */
const deleteMember = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id, memberId } = req.params;

    await removeMember(id, memberId, userId);
    return res.status(200).json({ success: true, message: 'Member removed from workspace.' });
  } catch (err) {
    console.error('[Remove Member Error]:', err);
    return res.status(403).json({ error: err.message || 'Failed to remove member.' });
  }
};

/**
 * PATCH /api/v1/workspaces/profile
 */
const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const updated = await dbService.updateUserProfile(userId, req.body);
    return res.status(200).json({ success: true, message: 'Profile updated.', user: updated });
  } catch (err) {
    console.error('[Update Profile Error]:', err);
    return res.status(500).json({ error: 'Failed to update user profile.' });
  }
};

/**
 * GET /api/v1/workspaces/nav-stats
 */
const getNavTelemetry = async (req, res) => {
  try {
    const userId = req.user.id;
    const stats = await getNavStats(userId);
    return res.status(200).json({ success: true, ...stats });
  } catch (err) {
    console.error('[Get Nav Telemetry Error]:', err);
    return res.status(500).json({ error: 'Failed to retrieve navigation telemetry.' });
  }
};

module.exports = {
  getWorkspaces,
  getWorkspaceById,
  sendInvitation,
  handleAcceptInvitation,
  revokeInvitation,
  updateRole,
  updateStatus,
  deleteMember,
  updateProfile,
  getNavTelemetry
};
