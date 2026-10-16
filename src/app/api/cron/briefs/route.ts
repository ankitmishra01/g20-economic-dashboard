import { NextRequest, NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
export async function GET(request: NextRequest) {
  const env = serverEnv(); const supplied = request.headers.get("authorization");
  if (!env.CRON_SECRET || supplied !== `Bearer ${env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (env.BRIEF_EMAIL_ENABLED !== "true" || !env.RESEND_API_KEY) return NextResponse.json({ data: { status: "skipped", reason: "not_configured", deliveries: 0 } });
  return NextResponse.json({ data: { status: "ready", reason: "delivery_worker_requires_preferences", deliveries: 0 } });
}
