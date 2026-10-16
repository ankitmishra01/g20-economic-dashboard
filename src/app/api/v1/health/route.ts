import { NextResponse } from "next/server";
import snapshot from "../../../../../public/legacy/data-snapshot.json";
import { liveHealth } from "@/lib/live-repository";
export async function GET() {
  const ageHours = Math.max(0, (Date.now() - new Date(snapshot.generatedAt).getTime()) / 3_600_000);
  const countries = new Set([...snapshot.annual, ...snapshot.quarterly].map((row) => row[0])).size;
  const live = await liveHealth();
  return NextResponse.json({ data: { status: ageHours > 24 * 45 ? "degraded" : "ok", sources: { supabase: live ? { observations: live.observations } : { status: "fallback" }, snapshot: { fetchedAt: snapshot.generatedAt, ageHours: Math.round(ageHours), rows: snapshot.annual.length + snapshot.quarterly.length, coverage: { countries } } }, jobs: { latest: live?.jobs ?? [], deliveryFailures: 0 } }, meta: { checkedAt: new Date().toISOString() } }, { status: ageHours > 24 * 90 ? 503 : 200 });
}
