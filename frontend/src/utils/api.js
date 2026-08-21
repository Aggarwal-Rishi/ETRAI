/**
 * Central API utility for ETRAI frontend.
 *
 * In development (localhost): VITE_API_URL is unset and hostname is localhost,
 *   so all calls use relative /api/v1/... paths which Vite proxies to http://localhost:5000.
 *
 * In production (Vercel): Automatically uses VITE_API_URL if configured,
 *   otherwise defaults directly to the live Railway backend:
 *   https://etrai-production.up.railway.app
 */
const DEFAULT_PROD_API = 'https://etrai-production.up.railway.app';

export const API_BASE = (function getApiBase() {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL.replace(/\/+$/, '');
  }

  // If in browser and not on localhost, use the production backend
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return DEFAULT_PROD_API;
  }

  return '';
})();

/**
 * Prepends the API base URL to a path.
 * @param {string} path - e.g. '/api/v1/auth/login'
 * @returns {string} Full URL in production, relative path in dev
 */
export function apiUrl(path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${normalizedPath}`;
}
