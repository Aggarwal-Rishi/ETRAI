const express = require('express');
const router = express.Router();
const {
  getWorkspaces,
  getWorkspaceById,
  sendInvitation,
  handleAcceptInvitation,
  revokeInvitation,
  updateRole,
  updateStatus,
  deleteMember,
  updateProfile
} = require('../controllers/workspaceController');
const { protect } = require('../middleware/authMiddleware');

router.get('/', protect, getWorkspaces);
router.patch('/profile', protect, updateProfile);
router.post('/invitations/accept', protect, handleAcceptInvitation);
router.get('/:id', protect, getWorkspaceById);
router.post('/:id/invitations', protect, sendInvitation);
router.delete('/:id/invitations/:invitationId', protect, revokeInvitation);
router.patch('/:id/members/:memberId/role', protect, updateRole);
router.patch('/:id/members/:memberId/status', protect, updateStatus);
router.delete('/:id/members/:memberId', protect, deleteMember);

module.exports = router;
