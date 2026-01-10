// electron.vite.config.ts
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
var __electron_vite_injected_dirname = "C:\\Users\\aurel\\OneDrive\\Desktop\\mitable\\apps\\electron";
var getVitePort = () => {
  if (process.env.VITE_PORT) {
    const parsed = parseInt(process.env.VITE_PORT, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 65535) {
      return parsed;
    }
  }
  return 5173;
};
var VITE_PORT = getVitePort();
var electron_vite_config_default = defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ["electron-store"] })],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__electron_vite_injected_dirname, "src/main.ts")
        },
        output: {
          format: "cjs",
          // CommonJS has native __dirname (ESM import.meta.dirname needs Node 20.11+)
          entryFileNames: "[name].cjs"
          // .cjs extension ensures CommonJS despite "type": "module" in package.json
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ["electron-log"] })],
    build: {
      rollupOptions: {
        input: {
          console: resolve(__electron_vite_injected_dirname, "src/preload/console.ts"),
          watchButton: resolve(__electron_vite_injected_dirname, "src/preload/watchButton.ts"),
          watchingPill: resolve(__electron_vite_injected_dirname, "src/preload/watchingPill.ts"),
          watchingPillDropdown: resolve(__electron_vite_injected_dirname, "src/preload/watchingPillDropdown.ts"),
          notification: resolve(__electron_vite_injected_dirname, "src/preload/notification.ts")
        },
        output: {
          format: "cjs",
          entryFileNames: "[name].cjs"
        }
      }
    }
  },
  renderer: {
    root: resolve(__electron_vite_injected_dirname, "src/renderer"),
    server: {
      port: VITE_PORT,
      strictPort: true
      // Fail if port is already in use (no auto-increment)
    },
    resolve: {
      alias: {
        "@": resolve(__electron_vite_injected_dirname, "src/renderer")
      }
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          console: resolve(__electron_vite_injected_dirname, "src/renderer/console/index.html"),
          watchButton: resolve(__electron_vite_injected_dirname, "src/renderer/watchButton/index.html"),
          watchingPill: resolve(__electron_vite_injected_dirname, "src/renderer/watchingPill/index.html"),
          watchingPillDropdownEye: resolve(__electron_vite_injected_dirname, "src/renderer/watchingPillDropdown/eye.html"),
          watchingPillDropdownMenu: resolve(
            __electron_vite_injected_dirname,
            "src/renderer/watchingPillDropdown/menu.html"
          ),
          notifications: resolve(__electron_vite_injected_dirname, "src/renderer/notifications/index.html")
        }
      }
    }
  }
});
export {
  electron_vite_config_default as default
};
