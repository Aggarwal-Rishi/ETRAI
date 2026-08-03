const jwt = require('jsonwebtoken');
const { dbService } = require('../utils/prisma');

const JWT_SECRET = process.env.JWT_SECRET || 'etrai_super_secret_jwt_key_2026';

const requireAuth = async (req, res, next) => {
  try {
    let token = null;

    // 1. Check HTTP-only cookie first
    if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    } 
    // 2. Check Authorization Bearer header
    else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        error: 'Authentication required. Please log in.'
      });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, JWT_SECRET);

    // Verify user still exists
    const user = await dbService.findUserById(decoded.id);
    if (!user) {
      return res.status(401).json({
        error: 'Invalid session. User no longer exists.'
      });
    }

    // Attach user object to request
    req.user = {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    return res.status(401).json({ error: 'Invalid authentication token.' });
  }
};

module.exports = {
  requireAuth,
  protect: requireAuth,
  JWT_SECRET
};
