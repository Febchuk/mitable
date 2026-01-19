/**
 * Session Configuration
 *
 * Single source of truth for monitoring session defaults.
 * Used by both Electron main process and renderer.
 */

export const SESSION_DEFAULTS = {
  /** Capture interval in milliseconds (30 seconds) */
  CAPTURE_INTERVAL_MS: 30000,

  /** Placeholder session name (AI will rename at session end based on activity) */
  DEFAULT_NAME: "Work session",
} as const;
