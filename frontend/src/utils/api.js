/**
 * Central API utility for ETRAI frontend.
 *
 * In development: VITE_API_URL is unset, so all calls use relative /api/v1/...
 *   paths which Vite proxies to http://localhost:5000.
 *
 * In production (Vercel): VITE_API_URL is set to the Railway backend URL
 *   e.g. https://etrai-production.up.railway.app
 *   so all calls go directly to the live backend.
 */
export const API_BASE = import.meta.env.VITE_API_URL || '';

/**
 * Prepends the API base URL to a path.
 * @param {string} path - e.g. '/api/v1/auth/login'
 * @returns {string} Full URL in production, relative path in dev
 */
export function apiUrl(path) {
  return `${API_BASE}${path}`;
}
