const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/accountSecurityController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/profile', getProfile);
router.patch('/profile', updateProfile);
router.post('/password', handlePasswordChange);
router.post('/2fa/setup', handleSetup2fa);
router.post('/2fa/verify', handleVerify2fa);
router.post('/2fa/disable', handleDisable2fa);
router.get('/sessions', getSessions);
router.delete('/sessions/:id', handleRevokeSession);
router.post('/sessions/revoke-others', handleRevokeAllOtherSessions);
router.get('/login-history', getHistory);
router.get('/export', handleDataExport);
router.patch('/governance/:workspaceId', handleUpdateGovernance);
router.post('/delete', handleDeleteAccount);

module.exports = router;
