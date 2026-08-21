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

const optionalAuth = async (req, res, next) => {
  try {
    let token = null;
    if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await dbService.findUserById(decoded.id);
      if (user) {
        req.user = { id: user.id, email: user.email, createdAt: user.createdAt };
      }
    }
  } catch (e) {
    // Ignore invalid token in optionalAuth
  }
  next();
};

const requireRole = (allowedRoles = []) => {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({ error: 'Authentication required.' });
      }
      const { prisma } = require('../utils/prisma');
      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      if (!user) return res.status(401).json({ error: 'User record not found.' });

      const member = await prisma.teamMember.findFirst({
        where: { userId: req.user.id, status: 'ACTIVE' }
      });

      const effectiveRole = member?.role || user.role || 'OWNER';

      if (allowedRoles.length > 0 && !allowedRoles.includes(effectiveRole) && effectiveRole !== 'OWNER') {
        return res.status(403).json({
          error: `Permission denied. Role '${effectiveRole}' is not authorized to perform this operation.`
        });
      }

      req.user.effectiveRole = effectiveRole;
      next();
    } catch (err) {
      return res.status(500).json({ error: 'RBAC role validation error.' });
    }
  };
};

module.exports = {
  requireAuth,
  protect: requireAuth,
  authenticateToken: requireAuth,
  optionalAuth,
  requireRole,
  JWT_SECRET
};

