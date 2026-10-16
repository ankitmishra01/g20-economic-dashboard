import { NextResponse } from "next/server";
import snapshot from "../../../../../public/legacy/data-snapshot.json";
export async function GET() {
  const ageHours = Math.max(0, (Date.now() - new Date(snapshot.generatedAt).getTime()) / 3_600_000);
  const countries = new Set([...snapshot.annual, ...snapshot.quarterly].map((row) => row[0])).size;
  return NextResponse.json({ data: { status: ageHours > 24 * 45 ? "degraded" : "ok", sources: { snapshot: { fetchedAt: snapshot.generatedAt, ageHours: Math.round(ageHours), rows: snapshot.annual.length + snapshot.quarterly.length, coverage: { countries } } }, jobs: { latest: "See ingestion_job_runs after migration", deliveryFailures: 0 } }, meta: { checkedAt: new Date().toISOString() } }, { status: ageHours > 24 * 90 ? 503 : 200 });
}
