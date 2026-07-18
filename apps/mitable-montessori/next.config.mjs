import path from "path";

const appDir = import.meta.dirname;

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.resolve(appDir, "../../"),
  // @react-pdf/renderer ships ESM-only. Client preview needs transpiling.
  transpilePackages: ["@react-pdf/renderer"],
  webpack: (config, { isServer }) => {
    // App Router API routes bundle into Next's react-server layer. @react-pdf's
    // reconciler reads React client internals (`…CLIENT_INTERNALS….S`). In that
    // layer React 19 exposes server internals instead → renderToBuffer throws.
    // Externalize on the server so Node resolves the normal client React build.
    // (Turbopack dev ignores webpack() — use `npm run dev`, not `dev:turbo`.)
    if (isServer) {
      const existing = config.externals ?? [];
      config.externals = [
        ...(Array.isArray(existing) ? existing : [existing]),
        "@react-pdf/renderer",
        "@react-pdf/reconciler",
        "@react-pdf/layout",
        "@react-pdf/pdfkit",
        "@react-pdf/render",
        "@react-pdf/font",
        "@react-pdf/primitives",
      ];
    }
    return config;
  },
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
