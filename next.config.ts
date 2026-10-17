import type { NextConfig } from "next";

// The Next.js surfaces added in PR #11 are retired from public view (Phase 0).
// Their code stays in the repo for reuse; every public route sends visitors to
// the dashboard, which is the production product.
//
// The dashboard's files live in public/legacy/ (vanilla JS, relative asset paths).
// It is served at the site root: "/" rewrites to public/legacy/index.html, and any
// path that no Next route or public file claims falls back to public/legacy/, so
// /styles/main.css, /data/latest.json etc. resolve without a "/legacy" URL.
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
  "/legacy/index.html",
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  typedRoutes: true,
  async redirects() {
    return RETIRED_ROUTES.map((source) => ({
      source,
      destination: "/",
      permanent: false,
    }));
  },
  async rewrites() {
    return {
      beforeFiles: [{ source: "/", destination: "/legacy/index.html" }],
      afterFiles: [],
      fallback: [{ source: "/:path*", destination: "/legacy/:path*" }],
    };
  },
};

export default nextConfig;
