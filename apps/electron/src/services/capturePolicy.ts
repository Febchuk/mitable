/**
 * Capture Policy - ENV-based deny-first window capture control
 *
 * Prevents Mitable from capturing screenshots of sensitive applications
 * as specified in environment variables and user preferences.
 */

import { preferencesService } from "./preferencesService";

export type CapturePolicy = {
  appsDeny: (string | RegExp)[];
};

/**
 * Load capture policy from environment variables
 *
 * ENV format:
 * CAPTURE_DENY_APPS=outlook,gmail,1password
 *
 * Note: Each pattern is checked against BOTH window titles AND app names
 * for maximum blocking coverage with minimal configuration.
 */
function loadPolicyFromEnv(): CapturePolicy {
  const appsDenyStr = process.env.CAPTURE_DENY_APPS || "";

  const appsDeny = appsDenyStr
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => new RegExp(s, "i")); // Case-insensitive

  return { appsDeny };
}

/**
 * Default deny list for common PII-heavy applications
 * Only used if ENV variables are not set
 *
 * These patterns are checked against BOTH:
 * 1. Window titles (e.g., "Gmail - Inbox", "Slack - #general")
 * 2. App names (e.g., "Slack.app", "Outlook.exe")
 *
 * This dual-check provides defense-in-depth with a single configuration.
 */
const defaultDenyList: CapturePolicy = {
  appsDeny: [
    /outlook/i,
    /gmail/i,
    /mail/i,
    /messages/i,
    /1password|lastpass|bitwarden|okta/i,
    /bank|financial|payroll|paystub|tax/i,
    /epic|cerner|ehr|hipaa|mychart/i,
  ],
};

/**
 * Get the active capture policy (ENV overrides defaults)
 * Note: User preferences are checked separately in isBlockedByPolicy
 */
export function getCapturePolicy(): CapturePolicy {
  const envPolicy = loadPolicyFromEnv();

  // If ENV is set, use only ENV (no merge with defaults)
  if (envPolicy.appsDeny.length > 0) {
    return envPolicy;
  }

  // Fallback to defaults
  return defaultDenyList;
}

/**
 * Normalize app name by removing OS-specific extensions
 * This ensures cross-platform matching works correctly
 *
 * Examples:
 * - Windows: "Slack.exe" → "Slack"
 * - macOS: "Slack.app" → "Slack"
 * - Linux: "slack" → "slack"
 */
function normalizeAppName(appName: string): string {
  if (!appName) return "";

  // Remove common OS-specific extensions
  return appName
    .replace(/\.exe$/i, "") // Windows
    .replace(/\.app$/i, "") // macOS
    .replace(/\.AppImage$/i, ""); // Linux AppImage
}

/**
 * Check if a string matches any pattern in the list
 * For app names, normalizes to remove OS-specific extensions first
 */
function matchesAny(
  str: string,
  patterns: (string | RegExp)[] = [],
  isAppName: boolean = false
): boolean {
  let haystack = str || "";

  // Normalize app names to be OS-agnostic
  if (isAppName) {
    haystack = normalizeAppName(haystack);
  }

  return patterns.some((pattern) =>
    pattern instanceof RegExp
      ? pattern.test(haystack)
      : haystack.toLowerCase().includes(String(pattern).toLowerCase())
  );
}

/**
 * Check if a window/app should be blocked by capture policy
 *
 * Uses defense-in-depth approach:
 * 1. First checks window title against deny patterns
 * 2. Then checks app name (normalized) against deny patterns
 * 3. Also checks user's custom block list if userId is provided
 *
 * This dual-check ensures maximum blocking coverage:
 * - Window title catches browser-based apps ("Gmail - Inbox")
 * - App name catches desktop apps ("Slack.app")
 * - Same patterns work for both (single configuration)
 *
 * @returns { blocked: true, reason: string } if denied, { blocked: false } if allowed
 */
export function isBlockedByPolicy(
  windowTitle: string,
  appName?: string,
  policy?: CapturePolicy,
  url?: string,
  userId?: string
): { blocked: boolean; reason?: string } {
  const activePolicy = policy || getCapturePolicy();

  const title = windowTitle || "";
  const app = appName || "";

  // Check 0: URL against deny patterns (if provided)
  // Catches: "https://mail.google.com/...", "https://slack.com/app/..."
  if (url && matchesAny(url, activePolicy.appsDeny, false)) {
    return { blocked: true, reason: "URL denied by capture policy" };
  }

  // Check 1: Window title against deny patterns (not normalized - check as-is)
  // Catches: "Gmail - Inbox", "Slack - #general", "Bank of America - Login"
  if (matchesAny(title, activePolicy.appsDeny, false)) {
    return { blocked: true, reason: "Window title denied by capture policy" };
  }

  // Check 2: App name against deny patterns (normalized to strip .exe/.app/etc)
  // Catches: "Slack.app", "1Password.exe", "Outlook"
  if (matchesAny(app, activePolicy.appsDeny, true)) {
    return { blocked: true, reason: "App name denied by capture policy" };
  }

  // Check 3: User's custom block list (if userId provided)
  // Uses bidirectional substring matching so "www.plaync100.net version 2.0.0.0"
  // blocks a window whose app name is just "plaync100.net" and vice-versa.
  if (userId) {
    const normalizedAppName = normalizeAppName(app).toLowerCase();
    const normalizedTitle = title.toLowerCase();
    const userBlockedApps = preferencesService.getUserBlockedApps(userId);
    const isUserBlocked = userBlockedApps.some(
      (blocked) =>
        normalizedAppName.includes(blocked) ||
        blocked.includes(normalizedAppName) ||
        normalizedTitle.includes(blocked) ||
        blocked.includes(normalizedTitle)
    );
    if (isUserBlocked) {
      return { blocked: true, reason: "App blocked by user preference" };
    }
  }

  return { blocked: false };
}
