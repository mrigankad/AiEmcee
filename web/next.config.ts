import path from "node:path";

import type { NextConfig } from "next";

/**
 * The studio server (node bin/aiemcee.mjs studio) owns the engine: jobs,
 * renders, files, versions, chat. This app is its front end, so every
 * engine path is proxied to it. Set AIEMCEE_STUDIO_URL to point elsewhere.
 */
const STUDIO = process.env.AIEMCEE_STUDIO_URL ?? "http://127.0.0.1:4810";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Every corner of the studio holds a control (the user card, Rasa's send
  // button, the render actions); compile and runtime errors still surface.
  devIndicators: false,
  turbopack: {
    // The repo root has its own lockfile; this app is its own workspace.
    root: path.resolve("."),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/api/:path*", destination: `${STUDIO}/api/:path*` },
        { source: "/files/:path*", destination: `${STUDIO}/files/:path*` },
        { source: "/s/:path*", destination: `${STUDIO}/s/:path*` },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
