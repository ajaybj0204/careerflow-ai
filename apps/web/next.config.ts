import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
];

const nextConfig: NextConfig = {
  transpilePackages: [
    "@careerflow/shared",
    "@careerflow/database",
    "@careerflow/ai",
    "@careerflow/document-engine",
    "@careerflow/gmail",
    "@careerflow/core",
  ],
  // These run on the server only and load native/wasm assets at runtime.
  serverExternalPackages: ["@electric-sql/pglite", "postgres", "unpdf", "mammoth", "exceljs"],
  experimental: {
    serverActions: { bodySizeLimit: "12mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
