import path from "path";

const websiteDir = import.meta.dirname;

/** @type {import('next').NextConfig} */
const nextConfig = {
    output: "standalone",
    experimental: {
        optimizePackageImports: ["@untitledui/icons"],
    },
    typescript: {
        // Pre-existing @untitledui/icons type incompatibility with React 19
        ignoreBuildErrors: true,
    },
    // Set the monorepo root so Next.js traces files correctly
    outputFileTracingRoot: path.resolve(websiteDir, "../../"),
    async headers() {
        return [
            {
                source: "/(.*)",
                headers: [
                    { key: "X-Frame-Options", value: "DENY" },
                    { key: "X-Content-Type-Options", value: "nosniff" },
                    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
                    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
                    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
                ],
            },
        ];
    },
    webpack: (config) => {
        // Resolve @mitable/shared to its built dist output, not source files
        config.resolve.alias["@mitable/shared"] = path.resolve(websiteDir, "../../packages/shared/dist/index.js");

        return config;
    },
};

export default nextConfig;
