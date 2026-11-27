import path from "node:path";
import { fileURLToPath } from "node:url";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const directory = path.dirname(fileURLToPath(import.meta.url));
if (process.env.NODE_ENV === "development") {
  initOpenNextCloudflareForDev({
    configPath: path.join(directory, "wrangler.jsonc"),
    remoteBindings: false,
  });
}

const origin = process.env.CLOUD_ORIGIN;
const devOrigin = process.env.NODE_ENV === "development" && origin
  ? URL.parse(origin)
  : null;
const allowedDevOrigins = ["127.0.0.1"];
if (
  devOrigin && devOrigin.origin === origin &&
  ["http:", "https:"].includes(devOrigin.protocol) &&
  !devOrigin.hostname.includes("*") && devOrigin.hostname !== "127.0.0.1"
) {
  allowedDevOrigins.push(devOrigin.hostname);
}

/** @type {import('next').NextConfig} */
const config = {
  output: "standalone",
  allowedDevOrigins,
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
