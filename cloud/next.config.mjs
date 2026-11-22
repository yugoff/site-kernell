import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
// Keep dev data inside this app even when Next is launched from the repo root.
process.env.CLOUD_DATABASE_PATH ??= path.join(
  directory,
  ".data",
  "cloud.sqlite",
);

/** @type {import('next').NextConfig} */
const config = {
  output: "standalone",
  outputFileTracingRoot: path.join(directory, ".."),
  poweredByHeader: false,
  turbopack: { root: path.join(directory, "..") },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default config;
