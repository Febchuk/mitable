import path from "path";

const appDir = import.meta.dirname;

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.resolve(appDir, "../../"),
  typescript: {
    ignoreBuildErrors: false,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            // Allow mic + camera on same-origin (the new-report flow records
            // voice memos and lets teachers snap photos of handwritten notes).
            // Geolocation stays denied — we have no use for it.
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(self), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
