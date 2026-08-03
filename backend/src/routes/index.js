const express = require('express');
const router = express.Router();

const healthRoutes = require('./health');
const authRoutes = require('./auth');
const verifyRoutes = require('./verify');
const reportsRoutes = require('./reports');

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/verify', verifyRoutes);
router.use('/reports', reportsRoutes);

module.exports = router;
