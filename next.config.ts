import type { NextConfig } from "next";

// The Next.js surfaces added in PR #11 are retired from public view (Phase 0).
// Their code stays in the repo for reuse; every public route sends visitors to
// the original dashboard, which remains the production product.
const RETIRED_ROUTES = [
  "/pulse",
  "/countries",
  "/countries/:iso3",
  "/indicators",
  "/calendar",
  "/compare",
  "/account",
  "/sign-in",
  "/legacy",
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  typedRoutes: true,
  async redirects() {
    return RETIRED_ROUTES.map((source) => ({
      source,
      destination: "/legacy/index.html",
      permanent: false,
    }));
  },
};

export default nextConfig;
