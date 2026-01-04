/**
 * Browser Title Parser Utility
 *
 * Parses OS window titles to extract browser tab titles for cleaner display.
 * Handles various browser naming patterns across platforms.
 */

/**
 * Browser title suffix patterns (what OS reports after the page title)
 * More specific patterns should come first
 */
const BROWSER_SUFFIXES: Array<{ pattern: RegExp; browsers: string[] }> = [
  { pattern: / - Google Chrome$/, browsers: ["chrome", "google chrome"] },
  { pattern: / - Microsoft Edge$/, browsers: ["msedge", "edge", "microsoft edge"] },
  { pattern: / — Mozilla Firefox$/, browsers: ["firefox", "mozilla firefox"] }, // em dash
  { pattern: / - Mozilla Firefox$/, browsers: ["firefox", "mozilla firefox"] }, // regular dash fallback
  { pattern: / - Brave$/, browsers: ["brave"] },
  { pattern: / - Opera$/, browsers: ["opera"] },
  { pattern: / - Vivaldi$/, browsers: ["vivaldi"] },
  // Safari and Arc don't have suffixes - they just show the page title
];

/**
 * Browser app name to display name mapping
 */
const BROWSER_DISPLAY_NAMES: Record<string, string> = {
  "google chrome": "Chrome",
  chrome: "Chrome",
  "microsoft edge": "Edge",
  msedge: "Edge",
  edge: "Edge",
  "mozilla firefox": "Firefox",
  firefox: "Firefox",
  safari: "Safari",
  brave: "Brave",
  "brave browser": "Brave",
  arc: "Arc",
  opera: "Opera",
  vivaldi: "Vivaldi",
};

/**
 * Browser detection patterns
 */
const BROWSER_PATTERNS = [
  "chrome",
  "google chrome",
  "msedge",
  "edge",
  "microsoft edge",
  "firefox",
  "mozilla firefox",
  "safari",
  "brave",
  "opera",
  "vivaldi",
  "arc",
];

export interface ParsedBrowserTitle {
  tabTitle: string; // The extracted page/tab title
  browserDisplayName: string; // Short browser name (e.g., "Chrome")
  formattedDisplay: string; // Full display string (e.g., "Chrome . Gmail - Inbox")
  isBrowser: boolean;
}

/**
 * Check if an app name is a known browser
 */
export function isBrowserApp(appName: string): boolean {
  const normalized = appName.toLowerCase();
  return BROWSER_PATTERNS.some((pattern) => normalized.includes(pattern));
}

/**
 * Get the display-friendly browser name from the app name
 */
function getBrowserDisplayName(appName: string): string {
  const normalized = appName.toLowerCase();

  // Try exact match first
  if (BROWSER_DISPLAY_NAMES[normalized]) {
    return BROWSER_DISPLAY_NAMES[normalized];
  }

  // Try partial match
  for (const [key, displayName] of Object.entries(BROWSER_DISPLAY_NAMES)) {
    if (normalized.includes(key)) {
      return displayName;
    }
  }

  // Fallback to original app name
  return appName;
}

/**
 * Parse a browser window title to extract the tab title
 *
 * @param windowTitle - Raw OS window title (e.g., "Gmail - Inbox - Google Chrome")
 * @param appName - Application name (e.g., "Google Chrome")
 * @returns Parsed title information
 */
export function parseBrowserTitle(windowTitle: string, appName: string): ParsedBrowserTitle {
  if (!isBrowserApp(appName)) {
    return {
      tabTitle: windowTitle,
      browserDisplayName: appName,
      formattedDisplay: appName,
      isBrowser: false,
    };
  }

  const normalizedAppName = appName.toLowerCase();
  let tabTitle = windowTitle;

  // Find matching suffix and strip it
  for (const { pattern, browsers } of BROWSER_SUFFIXES) {
    if (browsers.some((b) => normalizedAppName.includes(b))) {
      tabTitle = windowTitle.replace(pattern, "");
      break;
    }
  }

  // For Safari and Arc (no suffix), the window title IS the tab title
  // Just use it as-is

  // Get display-friendly browser name
  const browserDisplayName = getBrowserDisplayName(appName);

  // Truncate long tab titles
  const maxTabTitleLength = 40;
  const truncatedTabTitle =
    tabTitle.length > maxTabTitleLength ? tabTitle.substring(0, maxTabTitleLength - 3) + "..." : tabTitle;

  // Handle edge case where tab title is empty or same as browser name
  const finalTabTitle = truncatedTabTitle.trim() || "New Tab";

  return {
    tabTitle: tabTitle,
    browserDisplayName,
    formattedDisplay: `${browserDisplayName} \u2022 ${finalTabTitle}`,
    isBrowser: true,
  };
}

/**
 * Format a window for display in the watch list
 * Returns "AppName . TabTitle" for browsers, or just "AppName" for non-browsers
 */
export function formatWindowDisplayName(windowTitle: string, appName: string): string {
  const parsed = parseBrowserTitle(windowTitle, appName);
  return parsed.formattedDisplay;
}
