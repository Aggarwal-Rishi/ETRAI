const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { dbService } = require('../utils/prisma');

const JWT_SECRET = process.env.JWT_SECRET || 'etrai_super_secret_jwt_key_2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Helper to generate JWT token and set httpOnly cookie
 */
const sendAuthTokenResponse = (user, statusCode, res, keepSignedIn = false) => {
  const expiresIn = keepSignedIn ? '30d' : JWT_EXPIRES_IN;
  const token = jwt.sign(
    { id: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn }
  );

  const isProd = process.env.NODE_ENV === 'production';
  const maxAge = keepSignedIn ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  const cookieOptions = {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge
  };

  res.cookie('token', token, cookieOptions);

  return res.status(statusCode).json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      company: user.company,
      role: user.role,
      createdAt: user.createdAt
    },
    token // Included for convenience in non-browser API clients/testing
  });
};

/**
 * POST /api/v1/auth/signup
 */
const signup = async (req, res) => {
  try {
    const { email, password, fullName, phone, company } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    
    // Check if user exists
    const existingUser = await dbService.findUserByEmail(normalizedEmail);
    if (existingUser) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    // Hash password with bcrypt
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Save user with profile metadata
    const newUser = await dbService.createUser({
      email: normalizedEmail,
      passwordHash,
      fullName: fullName ? fullName.trim() : null,
      phone: phone ? phone.trim() : null,
      company: company ? company.trim() : null
    });

    return sendAuthTokenResponse(newUser, 201, res);
  } catch (err) {
    console.error('[Signup Error]:', err);
    return res.status(500).json({ error: 'Failed to create user account.' });
  }
};

/**
 * POST /api/v1/auth/login
 */
const login = async (req, res) => {
  try {
    const { email, password, keepSignedIn } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await dbService.findUserByEmail(normalizedEmail);

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Check password hash
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    return sendAuthTokenResponse(user, 200, res, keepSignedIn);
  } catch (err) {
    console.error('[Login Error]:', err);
    return res.status(500).json({ error: 'An unexpected error occurred during authentication.' });
  }
};

/**
 * POST /api/v1/auth/logout
 */
const logout = (req, res) => {
  const isProd = process.env.NODE_ENV === 'production';
  res.clearCookie('token', {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax'
  });
  return res.status(200).json({ success: true, message: 'Logged out successfully.' });
};

/**
 * GET /api/v1/auth/me
 */
const getMe = (req, res) => {
  return res.status(200).json({
    success: true,
    user: req.user
  });
};

module.exports = {
  signup,
  login,
  logout,
  getMe
};
