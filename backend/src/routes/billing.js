const express = require('express');
const router = express.Router();
const {
  getBilling,
  handleChangePlan,
  handleCancelSubscription,
  handleReactivateSubscription,
  handleValidateCoupon
} = require('../controllers/subscriptionBillingController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.post('/validate-coupon', handleValidateCoupon);
router.get('/:workspaceId', getBilling);
router.post('/:workspaceId/change-plan', handleChangePlan);
router.post('/:workspaceId/cancel', handleCancelSubscription);
router.post('/:workspaceId/reactivate', handleReactivateSubscription);

module.exports = router;
