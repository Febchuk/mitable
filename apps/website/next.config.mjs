import path from "path";

const websiteDir = import.meta.dirname;

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    optimizePackageImports: ["@untitledui/icons"],
  },
  typescript: {
    // Pre-existing @untitledui/icons type incompatibility with React 19
    ignoreBuildErrors: true,
  },
  // Set the monorepo root so Next.js traces files correctly
  outputFileTracingRoot: path.resolve(websiteDir, "../../"),
  webpack: (config) => {
    // Resolve @mitable/shared to its built dist output, not source files
    config.resolve.alias["@mitable/shared"] = path.resolve(
      websiteDir,
      "../../packages/shared/dist/index.js"
    );

    return config;
  },
};

export default nextConfig;
