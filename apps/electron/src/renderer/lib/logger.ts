/**
 * Renderer Process Logger
 *
 * Centralized logging utility for renderer processes.
 * Uses console-based logging since electron-log/renderer doesn't work well when bundled by Vite.
 * Logs are visible in DevTools console.
 *
 * Console-window feedback capture is installed from `console/src/App.tsx` (needs `consoleAPI`).
 */

// Console-based logger (works reliably in all environments)
const log = {
  debug: (msg: string, ...args: unknown[]) => console.debug(`[DEBUG] ${msg}`, ...args),
  info: (msg: string, ...args: unknown[]) => console.info(`[INFO] ${msg}`, ...args),
  warn: (msg: string, ...args: unknown[]) => console.warn(`[WARN] ${msg}`, ...args),
  error: (msg: string, ...args: unknown[]) => console.error(`[ERROR] ${msg}`, ...args),
};

if (typeof window !== "undefined") {
  window.onerror = (msg, url, line, col, error) => {
    log.error("[Window Error]", { msg, url, line, col, error });
    return false;
  };

  window.onunhandledrejection = (event) => {
    log.error("[Unhandled Promise]", event.reason);
  };
}

/**
 * Create a scoped logger for a specific module
 */
export function createLogger(scope: string) {
  return {
    debug: (msg: string, ...args: unknown[]) => log.debug(`[${scope}]`, msg, ...args),
    info: (msg: string, ...args: unknown[]) => log.info(`[${scope}]`, msg, ...args),
    warn: (msg: string, ...args: unknown[]) => log.warn(`[${scope}]`, msg, ...args),
    error: (msg: string, ...args: unknown[]) => log.error(`[${scope}]`, msg, ...args),
  };
}

export default log;
