import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(here, "./src"),
    },
  },
  test: {
    // Default to node — Web Crypto + ArrayBuffer realm matches Node's webcrypto,
    // which jsdom's strict cross-realm checks otherwise reject.
    // Component tests can opt in to jsdom via // @vitest-environment jsdom.
    environment: "node",
    setupFiles: ["./src/__tests__/setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
