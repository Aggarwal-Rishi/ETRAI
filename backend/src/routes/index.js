const express = require('express');
const router = express.Router();

const healthRoutes = require('./health');
const authRoutes = require('./auth');
const verifyRoutes = require('./verify');
const reportsRoutes = require('./reports');
const sourcesRoutes = require('./sources');
const newsRoutes = require('./news');
const fakeNewsRoutes = require('./fakeNews');
const searchRoutes = require('./search');
const dashboardRoutes = require('./dashboard');
const workspaceRoutes = require('./workspaces');
const accountRoutes = require('./accountSecurity');
const billingRoutes = require('./billing');
const observabilityRoutes = require('./observability');

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/verify', verifyRoutes);
router.use('/reports', reportsRoutes);
router.use('/sources', sourcesRoutes);
router.use('/news', newsRoutes);
router.use('/fake-news', fakeNewsRoutes);
router.use('/search', searchRoutes);
router.use('/workspaces', workspaceRoutes);
router.use('/account', accountRoutes);
router.use('/billing', billingRoutes);
router.use('/observability', observabilityRoutes);

module.exports = router;
