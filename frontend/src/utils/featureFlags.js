/**
 * ETRAI UI Feature Flags
 * 
 * Configurable toggles to show or hide modules without removing any underlying code.
 * 
 * - SHOW_FAKE_NEWS_SECTION: Set to `false` to hide the Fake News section from Navbar, Dashboard, Quick Search, and Route.
 *   Set to `true` to bring the Fake News section back into the UI.
 * 
 * To restore/enable this in the future, simply ask:
 * "unhide the fake news section" or "enable the fake news section"
 */
export const FEATURE_FLAGS = {
  SHOW_FAKE_NEWS_SECTION: false,
};
