import { NextResponse } from "next/server";
import { liveObservations } from "@/lib/live-repository";
export async function GET() {
  const latest = (rows: Array<{ period: string }>) => rows.reduce((period, row) => row.period > period ? row.period : period, "");
  const observedObservations = (await liveObservations()).filter((row) => row.status === "actual" || row.status === "preliminary"); const annual = observedObservations.filter((row) => row.frequency === "annual"); const quarterly = observedObservations.filter((row) => row.frequency === "quarterly");
  return NextResponse.json({ data: { latestAnnualPeriod: latest(annual), latestQuarterlyPeriod: latest(quarterly), signals: [{ key: "coverage", label: "Supported G20 baseline", value: new Set(annual.map((r) => r.country)).size }] }, meta: { observedOnly: true, generatedAt: new Date().toISOString() } });
}
