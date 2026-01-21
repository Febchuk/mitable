import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import type { Plugin } from "vite";

// Get frontend port from environment variable or CLI arg, fallback to 5173
// Priority: VITE_PORT env var > 5173 (default)
const getVitePort = (): number => {
  if (process.env.VITE_PORT) {
    const parsed = parseInt(process.env.VITE_PORT, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 65535) {
      return parsed;
    }
  }
  return 5173;
};

const VITE_PORT = getVitePort();

// Plugin to prevent Vite from processing main process files
const excludeMainProcessPlugin = (): Plugin => {
  const rendererLoggerPath = resolve(__dirname, "src/renderer/lib/logger.ts");
  const mainLoggerPath = resolve(__dirname, "src/lib/logger.ts");

  return {
    name: "exclude-main-process",
    resolveId(id) {
      // If trying to resolve the main process logger, redirect to renderer logger
      if (
        id === mainLoggerPath ||
        (id.includes("/src/lib/logger") && !id.includes("/src/renderer/"))
      ) {
        return rendererLoggerPath;
      }
      return null;
    },
    load(id) {
      // If Vite tries to load the main process logger, return the renderer logger instead
      if (
        id === mainLoggerPath ||
        (id.includes("/src/lib/logger.ts") && !id.includes("/src/renderer/"))
      ) {
        // Re-export from renderer logger (use forward slashes for cross-platform compatibility)
        const normalizedPath = rendererLoggerPath.replace(/\\/g, "/");
        return `export * from "${normalizedPath}";`;
      }
      return null;
    },
  };
};

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ["electron-store"] })],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/main.ts"),
        },
        output: {
          format: "cjs", // CommonJS has native __dirname (ESM import.meta.dirname needs Node 20.11+)
          entryFileNames: "[name].cjs", // .cjs extension ensures CommonJS despite "type": "module" in package.json
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ["electron-log"] })],
    build: {
      rollupOptions: {
        input: {
          console: resolve(__dirname, "src/preload/console.ts"),
          watchButton: resolve(__dirname, "src/preload/watchButton.ts"),
          watchingPill: resolve(__dirname, "src/preload/watchingPill.ts"),
          watchingPillDropdown: resolve(__dirname, "src/preload/watchingPillDropdown.ts"),
          notification: resolve(__dirname, "src/preload/notification.ts"),
        },
        output: {
          format: "cjs",
          entryFileNames: "[name].cjs",
        },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    server: {
      port: VITE_PORT,
      strictPort: true, // Fail if port is already in use (no auto-increment)
      fs: {
        // Deny access to main process and preload files
        deny: [
          resolve(__dirname, "src/main.ts"),
          resolve(__dirname, "src/lib"),
          resolve(__dirname, "src/preload"),
          resolve(__dirname, "src/main"),
          resolve(__dirname, "src/services"),
        ],
      },
    },
    resolve: {
      alias: {
        "@": resolve(__dirname, "src/renderer"),
        // Redirect main process logger imports to renderer logger
        // This prevents Vite from trying to process src/lib/logger.ts (main process file)
        [resolve(__dirname, "src/lib/logger.ts")]: resolve(__dirname, "src/renderer/lib/logger.ts"),
        // Stub out electron-log modules to prevent Vite from trying to bundle them
        "electron-log": resolve(__dirname, "src/renderer/lib/electron-log-stub.ts"),
        "electron-log/renderer": resolve(__dirname, "src/renderer/lib/electron-log-stub.ts"),
        "electron-log/main": resolve(__dirname, "src/renderer/lib/electron-log-stub.ts"),
      },
    },
    optimizeDeps: {
      // Exclude electron-log from pre-bundling - it uses Node.js globals and doesn't work in renderer
      exclude: ["electron-log", "electron-log/renderer", "electron-log/main"],
    },
    plugins: [react(), excludeMainProcessPlugin()],
    // Exclude main process files from being processed by Vite
    publicDir: false,
    build: {
      rollupOptions: {
        input: {
          console: resolve(__dirname, "src/renderer/console/index.html"),
          watchButton: resolve(__dirname, "src/renderer/watchButton/index.html"),
          watchingPill: resolve(__dirname, "src/renderer/watchingPill/index.html"),
          watchingPillDropdownEye: resolve(__dirname, "src/renderer/watchingPillDropdown/eye.html"),
          watchingPillDropdownMenu: resolve(
            __dirname,
            "src/renderer/watchingPillDropdown/menu.html"
          ),
          notifications: resolve(__dirname, "src/renderer/notifications/index.html"),
        },
      },
    },
  },
});
