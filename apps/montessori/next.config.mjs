import path from "path";

const appDir = import.meta.dirname;

/** @type {import('next').NextConfig} */
const nextConfig = {
    output: "standalone",
    typescript: {
        ignoreBuildErrors: false,
    },
    outputFileTracingRoot: path.resolve(appDir, "../../"),
    experimental: {
        optimizePackageImports: ["lucide-react"],
    },
};

export default nextConfig;
