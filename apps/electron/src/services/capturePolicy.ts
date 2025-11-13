/**
 * Capture Policy - ENV-based deny-first window capture control
 * 
 * Prevents Mitable from capturing screenshots of sensitive applications
 * as specified in environment variables.
 */

export type CapturePolicy = {
  appsDeny: (string | RegExp)[];
  urlsDeny: (string | RegExp)[];
};

/**
 * Load capture policy from environment variables
 * 
 * ENV format:
 * CAPTURE_DENY_APPS=outlook,gmail,1password,slack
 * CAPTURE_DENY_URLS=mail.google.com,drive.google.com,bankofamerica.com
 */
function loadPolicyFromEnv(): CapturePolicy {
  const appsDenyStr = process.env.CAPTURE_DENY_APPS || "";
  const urlsDenyStr = process.env.CAPTURE_DENY_URLS || "";

  const appsDeny = appsDenyStr
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => new RegExp(s, "i")); // Case-insensitive

  const urlsDeny = urlsDenyStr
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => new RegExp(s, "i"));

  return { appsDeny, urlsDeny };
}

/**
 * Default deny list for common PII-heavy applications
 * Only used if ENV variables are not set
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
    /slack/i, // Add more as needed
  ],
  urlsDeny: [
    /mail\.google\.com/i,
    /drive\.google\.com/i,
    /bankofamerica|chase|wellsfargo|intuit|plaid/i,
    /mychart|ehr|hipaa|medical|health/i,
  ],
};

/**
 * Get the active capture policy (ENV overrides defaults)
 */
export function getCapturePolicy(): CapturePolicy {
  const envPolicy = loadPolicyFromEnv();

  // If ENV is set, use only ENV (no merge with defaults)
  if (envPolicy.appsDeny.length > 0 || envPolicy.urlsDeny.length > 0) {
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
    .replace(/\.exe$/i, "")    // Windows
    .replace(/\.app$/i, "")    // macOS
    .replace(/\.AppImage$/i, ""); // Linux AppImage
}

/**
 * Check if a string matches any pattern in the list
 * For app names, normalizes to remove OS-specific extensions first
 */
function matchesAny(str: string, patterns: (string | RegExp)[] = [], isAppName: boolean = false): boolean {
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
 * @returns { blocked: true, reason: string } if denied, { blocked: false } if allowed
 */
export function isBlockedByPolicy(
  windowTitle: string,
  appName?: string,
  currentTabUrl?: string,
  policy?: CapturePolicy
): { blocked: boolean; reason?: string } {
  const activePolicy = policy || getCapturePolicy();

  const title = windowTitle || "";
  const app = appName || "";
  const url = currentTabUrl || "";

  // Check window title deny list (not normalized - check as-is)
  if (matchesAny(title, activePolicy.appsDeny, false)) {
    return { blocked: true, reason: "Window/app denied by capture policy" };
  }

  // Check app name deny list (normalized to strip .exe/.app/etc)
  if (matchesAny(app, activePolicy.appsDeny, true)) {
    return { blocked: true, reason: "Window/app denied by capture policy" };
  }

  // Check URL deny list (if URL provided)
  if (url && matchesAny(url, activePolicy.urlsDeny, false)) {
    return { blocked: true, reason: "URL denied by capture policy" };
  }

  return { blocked: false };
}
