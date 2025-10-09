import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

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
    resolve: {
      alias: {
        "@": resolve(__dirname, "src/renderer/src"),
      },
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          agent: resolve(__dirname, "src/renderer/agent/index.html"),
          console: resolve(__dirname, "src/renderer/console/index.html"),
          overlay: resolve(__dirname, "src/renderer/overlay/index.html"),
          guide: resolve(__dirname, "src/renderer/guide/index.html"),
          nudge: resolve(__dirname, "src/renderer/nudge/index.html"),
        },
      },
    },
  },
});
