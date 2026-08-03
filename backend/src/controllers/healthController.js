/**
 * Health check controller for ETRAI Backend Server
 */
const getHealthStatus = (req, res) => {
  return res.status(200).json({
    status: 'ok',
    service: 'ETRAI API Backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development'
  });
};

module.exports = {
  getHealthStatus
};
