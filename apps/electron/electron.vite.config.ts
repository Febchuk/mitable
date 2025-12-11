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
          agent: resolve(__dirname, "src/preload/agent.ts"),
          agentpanel: resolve(__dirname, "src/preload/agentpanel.ts"),
          console: resolve(__dirname, "src/preload/console.ts"),
          conversation: resolve(__dirname, "src/preload/conversation.ts"),
          watchButton: resolve(__dirname, "src/preload/watchButton.ts"),
          observation: resolve(__dirname, "src/preload/observation.ts"),
          eyeIndicator: resolve(__dirname, "src/preload/eyeIndicator.ts"),
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
          agentpanel: resolve(__dirname, "src/renderer/agentpanel/index.html"),
          console: resolve(__dirname, "src/renderer/console/index.html"),
          conversation: resolve(__dirname, "src/renderer/conversation/index.html"),
          watchButton: resolve(__dirname, "src/renderer/watchButton/index.html"),
          observation: resolve(__dirname, "src/renderer/observation/index.html"),
          eyeIndicator: resolve(__dirname, "src/renderer/eyeIndicator/index.html"),
        },
      },
    },
  },
});
