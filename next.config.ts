import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev server is reached through the Codespaces port-forwarding domain
  // (e.g. <name>-3000.app.github.dev), not localhost. Without allowing that
  // origin, Next blocks the /_next/* dev assets so the page never hydrates
  // and client interactivity (log buttons, cell dropdown) silently fails.
  allowedDevOrigins: ["*.app.github.dev", "localhost", "127.0.0.1"],
};

export default nextConfig;
