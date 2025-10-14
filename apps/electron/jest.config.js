/** @type {import('jest').Config} */
export default {
  testEnvironment: "jsdom",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/renderer/$1",
    "\\.(css|less|scss|sass)$": "identity-obj-proxy",
    "\\.(svg|png|jpg|jpeg|gif)$": "<rootDir>/__mocks__/fileMock.js",
  },
  transform: {
    "^.+\\.(ts|tsx)$": ["babel-jest", { configFile: "./babel.config.cjs" }],
  },
  setupFilesAfterEnv: ["<rootDir>/jest.setup.cjs"],
  testMatch: ["**/?(*.)+(spec|test).[tj]s?(x)"],
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/main.ts",
    "!src/preload/**/*",
  ],
  testPathIgnorePatterns: ["/node_modules/", "/out/", "/dist/"],
};
