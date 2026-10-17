import { routes, type VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  buildCommand: "npm run build",
  // Daily brief cron retired with the PR #11 surfaces (Phase 0); route code is kept.
  crons: [],
  // Ask AI reads the per-country shards from disk for global country questions.
  functions: {
    "api/agent.js": { includeFiles: "public/legacy/data/country/**" },
  },
  headers: [
    routes.cacheControl("/api/v1/(.*)", { public: true, maxAge: "5 minutes", staleWhileRevalidate: "1 hour" }),
  ],
};
