import { NextResponse, type NextRequest } from "next/server";

// The PR #11 surfaces are retired (Phase 0). Their pages redirect to the dashboard
// (next.config.ts) and their /api/v1 endpoints are gone: answer 410 instead of running
// slow full-table queries. The middleware runs only on /api/v1, so dashboard pages,
// static assets and the legacy /api functions no longer pay for a Supabase auth call.
export function proxy(request: NextRequest) {
  return NextResponse.json(
    { error: "gone", message: "This API was retired. Use https://g20-gamma.vercel.app for the dashboard." },
    { status: 410, headers: { "cache-control": "public, max-age=3600" } },
  );
}

export const config = { matcher: ["/api/v1/:path*"] };
