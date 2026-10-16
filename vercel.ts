import { routes, type VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  buildCommand: "npm run build",
  crons: [{ path: "/api/cron/briefs", schedule: "15 23 * * *" }],
  headers: [
    routes.cacheControl("/api/v1/(.*)", { public: true, maxAge: "5 minutes", staleWhileRevalidate: "1 hour" }),
  ],
};
