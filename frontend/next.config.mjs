import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // `next build` and `next dev` share this directory, so building while a dev
  // server is running overwrites the manifests it is serving from and breaks it
  // with a confusing "Cannot read properties of undefined" or a missing chunk.
  // Build into a separate directory to check a production build safely:
  //   NEXT_DIST_DIR=.next-build npm run build
  distDir: process.env.NEXT_DIST_DIR || ".next",

  // Emits a self-contained server bundle for the Docker runtime stage.
  output: "standalone",
  // Without this, a stray lockfile in a parent directory can be picked as the
  // trace root and the standalone bundle ends up missing files.
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  reactStrictMode: true,
  poweredByHeader: false,

  webpack: (config, { dev }) => {
    if (dev) {
      // Verification scripts and screenshots live inside the project but are not
      // part of the bundle. Watching them means editing a test triggers a Fast
      // Refresh that remounts the page and wipes any form state mid-run.
      config.watchOptions = {
        ...config.watchOptions,
        ignored: ["**/node_modules/**", "**/.git/**", "**/scripts/**", "**/.screenshots/**"],
      };
    }
    return config;
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
