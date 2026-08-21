const { URL } = require('url');
const net = require('net');

/**
 * Server-Side Request Forgery (SSRF) Security Guard
 * Protects against internal network scanning, loopback access, cloud metadata endpoints, and non-HTTP protocols.
 */
function isSsrfSafeUrl(urlString) {
  if (!urlString || typeof urlString !== 'string') {
    return { safe: false, reason: 'Invalid or empty URL string' };
  }

  const trimmed = urlString.trim();

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch (e) {
    return { safe: false, reason: 'URL failed parsing' };
  }

  // 1. Protocol Check: Strictly permit http: and https: only
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { safe: false, reason: `Unsupported protocol: ${parsed.protocol}` };
  }

  const hostname = parsed.hostname.toLowerCase();

  // 2. Hostname Check: Reject localhost and cloud metadata aliases ALWAYS
  if (
    hostname === 'localhost' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.localhost') ||
    hostname === 'metadata.google.internal' ||
    hostname.endsWith('.internal') ||
    hostname === '169.254.169.254'
  ) {
    return { safe: false, reason: `Restricted host: ${hostname}` };
  }

  // 3. IP Address Range Verification ALWAYS
  if (net.isIP(hostname)) {
    if (isPrivateOrRestrictedIp(hostname)) {
      return { safe: false, reason: `Private/internal IP address rejected: ${hostname}` };
    }
  }

  // 4. Mock test domain allowance (only if host is NOT restricted)
  if (
    trimmed.includes('.example.local') ||
    trimmed.includes('.local') ||
    trimmed.includes('test-fixture') ||
    process.env.ETRAI_TEST_MODE === 'mock'
  ) {
    return { safe: true, reason: 'Mock test URL allowed in test mode' };
  }

  return { safe: true, reason: 'Public HTTP/HTTPS URL allowed' };
}

/**
 * Validates if an IP address belongs to loopback, private, link-local, or cloud metadata ranges
 */
function isPrivateOrRestrictedIp(ip) {
  // IPv4 0.0.0.0
  if (ip === '0.0.0.0') return true;

  // IPv4 Loopback: 127.0.0.0/8
  if (/^127\./.test(ip)) return true;

  // IPv4 Private Range 10.0.0.0/8
  if (/^10\./.test(ip)) return true;

  // IPv4 Private Range 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) return true;

  // IPv4 Private Range 192.168.0.0/16
  if (/^192\.168\./.test(ip)) return true;

  // IPv4 Link-Local / Cloud Metadata: 169.254.0.0/16
  if (/^169\.254\./.test(ip)) return true;

  // IPv6 Loopback / Unspecified / Link-Local / Unique Local
  if (ip === '::1' || ip === '::') return true;
  if (/^fe80:/i.test(ip)) return true;
  if (/^fc00:/i.test(ip) || /^fd00:/i.test(ip)) return true;

  return false;
}

module.exports = {
  isSsrfSafeUrl,
  isPrivateOrRestrictedIp
};
