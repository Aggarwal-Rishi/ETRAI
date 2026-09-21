/**
 * ETRAI UI Feature Flags
 * 
 * Configurable toggles to show or hide modules without removing any underlying code.
 * 
 * - SHOW_FAKE_NEWS_SECTION: Set to `false` to hide the Fake News section from Navbar, Dashboard, Quick Search, and Route.
 * - DEBUG: Set to `false` to hide debug consoles, Agent 3 live inspector panels, and raw debug telemetry.
 *   Can also be enabled dynamically by adding `?debug=true` to any URL or setting `localStorage.setItem('etrai_debug', 'true')`.
 */
export const FEATURE_FLAGS = {
  SHOW_FAKE_NEWS_SECTION: false,
  DEBUG: false,
};

export function isDebugEnabled() {
  if (typeof window === 'undefined') return Boolean(FEATURE_FLAGS.DEBUG);
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('debug') === 'true' || params.get('debug') === '1') return true;
    if (params.get('debug') === 'false' || params.get('debug') === '0') return false;
    const stored = localStorage.getItem('etrai_debug');
    if (stored === 'true' || stored === '1') return true;
    if (stored === 'false' || stored === '0') return false;
  } catch (_) {}
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEBUG !== undefined) {
    return import.meta.env.VITE_DEBUG === 'true' || import.meta.env.VITE_DEBUG === '1';
  }
  return Boolean(FEATURE_FLAGS.DEBUG);
}

export function setDebugEnabled(value) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('etrai_debug', value ? 'true' : 'false');
    window.dispatchEvent(new Event('etrai_debug_change'));
  } catch (_) {}
}
