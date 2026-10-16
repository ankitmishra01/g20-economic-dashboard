import { NextResponse } from "next/server";
import snapshot from "../../../../../public/legacy/data-snapshot.json";
export async function GET() {
  const ageHours = Math.max(0, (Date.now() - new Date(snapshot.generatedAt).getTime()) / 3_600_000);
  return NextResponse.json({ data: { status: ageHours > 24 * 45 ? "degraded" : "ok", sources: { snapshot: { fetchedAt: snapshot.generatedAt, ageHours: Math.round(ageHours), rows: snapshot.annual.length + snapshot.quarterly.length } } }, meta: { checkedAt: new Date().toISOString() } }, { status: ageHours > 24 * 90 ? 503 : 200 });
}
