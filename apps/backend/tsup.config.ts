import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: false,
  splitting: false,
  sourcemap: true,
  clean: true,
  shims: true,
  // pino-pretty pulls CJS (tty/colorette); bundling it breaks `node dist/index.js` in ESM.
  // Loaded only in dev via createRequire in logger.ts.
  external: ["pino-pretty"],
});
