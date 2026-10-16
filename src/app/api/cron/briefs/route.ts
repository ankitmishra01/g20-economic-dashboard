import { NextRequest, NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
import { processDueBriefs } from "@/lib/brief-worker";
import { evaluateAlertRules } from "@/lib/alert-worker";
export async function GET(request: NextRequest) {
  const env = serverEnv(); const supplied = request.headers.get("authorization");
  if (!env.CRON_SECRET || supplied !== `Bearer ${env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { const alerts = await evaluateAlertRules(); if (env.BRIEF_EMAIL_ENABLED !== "true" || !env.RESEND_API_KEY) return NextResponse.json({ data: { status: "skipped", reason: "email_not_configured", deliveries: 0, alerts } }); return NextResponse.json({ data: { ...(await processDueBriefs()), alerts } }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Workflow processing failed" }, { status: 500 }); }
}
