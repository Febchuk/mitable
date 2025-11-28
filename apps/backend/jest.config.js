/** @type {import('jest').Config} */
export default {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  setupFiles: ["<rootDir>/jest.setup.js"],
  extensionsToTreatAsEsm: [".ts"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
    "@octokit/app": "<rootDir>/__mocks__/@octokit/app.js",
    "@octokit/core": "<rootDir>/__mocks__/@octokit/core.js",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: true,
      },
    ],
  },
  transformIgnorePatterns: ["node_modules/(?!(@octokit)/)"],
  testMatch: ["**/?(*.)+(spec|test).[tj]s?(x)"],
  collectCoverageFrom: ["src/**/*.{ts,tsx}", "!src/**/*.d.ts"],
};
