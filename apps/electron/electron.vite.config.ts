import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

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

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['electron-store'] })],
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
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          console: resolve(__dirname, "src/preload/console.ts"),
          watchButton: resolve(__dirname, "src/preload/watchButton.ts"),
          watchingPill: resolve(__dirname, "src/preload/watchingPill.ts"),
          watchingPillDropdown: resolve(__dirname, "src/preload/watchingPillDropdown.ts"),
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
    },
    resolve: {
      alias: {
        "@": resolve(__dirname, "src/renderer"),
      },
    },
    plugins: [react()],
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
        },
      },
    },
  },
});
