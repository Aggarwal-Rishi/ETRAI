/**
 * ETRAI Production Rate Limiter Middleware
 * 
 * Implements an in-memory sliding window rate limiter with standard HTTP headers
 * and clean rejection payloads.
 */

'use strict';

function createRateLimiter({
  windowMs = 60 * 1000,
  maxRequests = 100,
  message = 'Too many requests from this IP. Please try again later.'
} = {}) {
  const ipRequests = new Map(); // ip -> array of request timestamps in ms

  // Periodically clean stale records every 2 minutes
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [ip, timestamps] of ipRequests.entries()) {
      const valid = timestamps.filter(t => now - t < windowMs);
      if (valid.length === 0) {
        ipRequests.delete(ip);
      } else {
        ipRequests.set(ip, valid);
      }
    }
  }, 120000);

  if (cleanupInterval.unref) cleanupInterval.unref();

  return (req, res, next) => {
    // Skip rate limiting in unit test mode if disabled via env
    if (process.env.DISABLE_RATE_LIMIT === 'true') {
      return next();
    }

    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const now = Date.now();

    let timestamps = ipRequests.get(ip) || [];
    // Filter out timestamps outside current window
    timestamps = timestamps.filter(t => now - t < windowMs);

    const remaining = Math.max(0, maxRequests - timestamps.length);
    const resetTime = Math.ceil((windowMs - (now - (timestamps[0] || now))) / 1000);

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', resetTime > 0 ? resetTime : Math.ceil(windowMs / 1000));

    if (timestamps.length >= maxRequests) {
      res.setHeader('Retry-After', resetTime > 0 ? resetTime : Math.ceil(windowMs / 1000));
      return res.status(429).json({
        error: message,
        retryAfterSeconds: resetTime > 0 ? resetTime : Math.ceil(windowMs / 1000),
        status: 429
      });
    }

    timestamps.push(now);
    ipRequests.set(ip, timestamps);
    next();
  };
}

// Pre-configured rate limiters
const generalApiLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 150,
  message: 'API rate limit exceeded. Please wait a minute before making more requests.'
});

const authLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
  message: 'Too many authentication attempts. Please wait a minute before trying again.'
});

const analyzeLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 25,
  message: 'Verification job rate limit exceeded. Please wait a minute before submitting new jobs.'
});

module.exports = {
  createRateLimiter,
  generalApiLimiter,
  authLimiter,
  analyzeLimiter
};
