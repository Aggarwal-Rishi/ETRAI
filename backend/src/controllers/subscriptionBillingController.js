const {
  getBillingSummary,
  changeSubscriptionPlan,
  cancelSubscription,
  reactivateSubscription,
  validatePromoCode
} = require('../services/subscriptionBillingService');

/**
 * GET /api/v1/billing/:workspaceId
 */
const getBilling = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const summary = await getBillingSummary(workspaceId, req.user.id);
    return res.status(200).json({ success: true, ...summary });
  } catch (err) {
    console.error('[Get Billing Error]:', err);
    return res.status(403).json({ error: err.message || 'Failed to retrieve billing summary.' });
  }
};

/**
 * POST /api/v1/billing/:workspaceId/change-plan
 */
const handleChangePlan = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const result = await changeSubscriptionPlan(workspaceId, req.user.id, req.body);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[Change Plan Error]:', err);
    return res.status(400).json({ error: err.message || 'Failed to change subscription plan.' });
  }
};

/**
 * POST /api/v1/billing/:workspaceId/cancel
 */
const handleCancelSubscription = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const result = await cancelSubscription(workspaceId, req.user.id);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[Cancel Subscription Error]:', err);
    return res.status(403).json({ error: err.message || 'Failed to cancel subscription.' });
  }
};

/**
 * POST /api/v1/billing/:workspaceId/reactivate
 */
const handleReactivateSubscription = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const result = await reactivateSubscription(workspaceId, req.user.id);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[Reactivate Subscription Error]:', err);
    return res.status(403).json({ error: err.message || 'Failed to reactivate subscription.' });
  }
};

/**
 * POST /api/v1/billing/validate-coupon
 */
const handleValidateCoupon = async (req, res) => {
  try {
    const { code, plan } = req.body;
    const promo = validatePromoCode(code, plan);
    return res.status(200).json({ success: true, promo });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Invalid coupon.' });
  }
};

module.exports = {
  getBilling,
  handleChangePlan,
  handleCancelSubscription,
  handleReactivateSubscription,
  handleValidateCoupon
};
