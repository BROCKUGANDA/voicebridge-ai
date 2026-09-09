import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  // Pin the workspace root: an unrelated package-lock.json in a parent
  // directory makes Turbopack guess (and warn) otherwise.
  turbopack: {
    root: path.join(__dirname),
  },
  // Production hardening: type errors must fail the build. If a known
  // error blocks CI temporarily, fix it — don't re-enable this flag.
  typescript: {
    ignoreBuildErrors: false,
  },
  // Strict mode catches unsafe side effects (ref mutation during render,
  // double-invoke bugs) in dev before they reach production.
  reactStrictMode: true,
};

export default nextConfig;
