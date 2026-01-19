/**
 * Stub for electron-log modules
 *
 * Prevents Vite from trying to bundle electron-log in the renderer process.
 * The renderer uses console-based logging instead (see logger.ts).
 */

const stubLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  verbose: () => {},
  silly: () => {},
};

export default stubLogger;
