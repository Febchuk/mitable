/** @type {import('eslint').Linter.Config} */
module.exports = {
  extends: "next/core-web-vitals",
  // Register rules so `eslint-disable` / `eslint-disable-next-line` for
  // @typescript-eslint/* (used in source) resolve during `next build`.
  plugins: ["@typescript-eslint"],
};
