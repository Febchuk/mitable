import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");

const sharedConfig = {
  bundle: true,
  minify: !watch,
  sourcemap: watch ? "inline" : false,
  target: "chrome120",
};

async function build() {
  // Service worker (background script)
  const swCtx = await esbuild.context({
    ...sharedConfig,
    entryPoints: ["src/service-worker.ts"],
    outfile: "dist/service-worker.js",
    format: "esm",
  });

  // Content script
  const csCtx = await esbuild.context({
    ...sharedConfig,
    entryPoints: ["src/content-script.ts"],
    outfile: "dist/content-script.js",
    format: "iife",
  });

  // Popup script
  const popupCtx = await esbuild.context({
    ...sharedConfig,
    entryPoints: ["popup/popup.ts"],
    outfile: "popup/popup.js",
    format: "iife",
  });

  if (watch) {
    await Promise.all([swCtx.watch(), csCtx.watch(), popupCtx.watch()]);
    console.log("Watching for changes...");
  } else {
    await Promise.all([swCtx.rebuild(), csCtx.rebuild(), popupCtx.rebuild()]);
    await Promise.all([swCtx.dispose(), csCtx.dispose(), popupCtx.dispose()]);
    console.log("Build complete");
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
