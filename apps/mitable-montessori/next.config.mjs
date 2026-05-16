import path from "path";

const appDir = import.meta.dirname;

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.resolve(appDir, "../../"),
  // @react-pdf/renderer ships ESM-only. Without transpiling, Next's webpack
  // build fails with "ESM packages need to be imported. Use 'import' to
  // reference the package instead." when it's reached through the client
  // graph via a static import (the <PDFViewer> itself is dynamic({ ssr: false })
  // but ReportDocument is imported statically).
  transpilePackages: ["@react-pdf/renderer"],
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
