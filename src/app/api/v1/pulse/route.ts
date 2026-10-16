import { NextResponse } from "next/server";
import { annual, quarterly } from "@/lib/repository";
export async function GET() {
  const latest = (rows: typeof annual) => rows.reduce((period, row) => row.period > period ? row.period : period, "");
  return NextResponse.json({ data: { latestAnnualPeriod: latest(annual), latestQuarterlyPeriod: latest(quarterly), signals: [{ key: "coverage", label: "Supported G20 baseline", value: new Set(annual.map((r) => r.country)).size }] }, meta: { observedOnly: true, generatedAt: new Date().toISOString() } });
}
