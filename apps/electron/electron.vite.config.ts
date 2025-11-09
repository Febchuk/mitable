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
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/main.ts"),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          agent: resolve(__dirname, "src/preload/agent.ts"),
          console: resolve(__dirname, "src/preload/console.ts"),
          conversation: resolve(__dirname, "src/preload/conversation.ts"),
          overlay: resolve(__dirname, "src/preload/overlay.ts"),
          guide: resolve(__dirname, "src/preload/guide.ts"),
          nudge: resolve(__dirname, "src/preload/nudge.ts"),
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
          agent: resolve(__dirname, "src/renderer/agent/index.html"),
          console: resolve(__dirname, "src/renderer/console/index.html"),
          conversation: resolve(__dirname, "src/renderer/conversation/index.html"),
          overlay: resolve(__dirname, "src/renderer/overlay/index.html"),
          guide: resolve(__dirname, "src/renderer/guide/index.html"),
          nudge: resolve(__dirname, "src/renderer/nudge/index.html"),
        },
      },
    },
  },
});
