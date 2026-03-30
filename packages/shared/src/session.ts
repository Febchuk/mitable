/**
 * Session Configuration
 *
 * Single source of truth for monitoring session defaults.
 * Used by both Electron main process and renderer.
 */

export const SESSION_DEFAULTS = {
  /** Capture interval in milliseconds (10 seconds) */
  CAPTURE_INTERVAL_MS: 10000,

  /** Maximum session duration before auto-end (6 hours) */
  MAX_DURATION_MS: 6 * 60 * 60 * 1000,

  /** Placeholder session name (AI will rename at session end based on activity) */
  DEFAULT_NAME: "Work session",
} as const;
