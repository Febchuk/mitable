/**
 * Renderer Process Logger
 *
 * Centralized logging utility for renderer processes.
 * Uses console-based logging since electron-log/renderer doesn't work well when bundled by Vite.
 * Logs are visible in DevTools console.
 *
 * Note: In production builds, electron-log/renderer may work, but for dev mode we use console.
 */

// Console-based logger (works reliably in all environments)
const log = {
  debug: (msg: string, ...args: unknown[]) => console.debug(`[DEBUG] ${msg}`, ...args),
  info: (msg: string, ...args: unknown[]) => console.info(`[INFO] ${msg}`, ...args),
  warn: (msg: string, ...args: unknown[]) => console.warn(`[WARN] ${msg}`, ...args),
  error: (msg: string, ...args: unknown[]) => console.error(`[ERROR] ${msg}`, ...args),
};

// Set up global error handlers for the renderer
if (typeof window !== "undefined") {
  window.onerror = (msg, url, line, col, error) => {
    log.error("[Window Error]", { msg, url, line, col, error });
    return false; // Don't prevent default error handling
  };

  window.onunhandledrejection = (event) => {
    log.error("[Unhandled Promise]", event.reason);
  };
}

/**
 * Create a scoped logger for a specific module
 *
 * @example
 * ```typescript
 * import { createLogger } from "../../lib/logger";
 * const logger = createLogger("ChatService");
 *
 * logger.info("Message sent:", messageId);
 * logger.error("Failed to send message:", error);
 * ```
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
