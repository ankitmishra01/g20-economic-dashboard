import { NextRequest } from "next/server";
import { page } from "@/lib/api";
import { liveObservations, liveReleases } from "@/lib/live-repository";
export async function GET(request: NextRequest) {
  const persisted = await liveReleases(); if (persisted) return page(request, persisted, { source: "economic_releases" });
  const observations = await liveObservations();
  const seen = new Set<string>();
  const releases = observations.filter((row) => { const key = `${row.source}|${row.period}|${row.frequency}`; if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 200).map((row) => ({ source: row.source, period: row.period, frequency: row.frequency, status: "released", fetchedAt: row.fetchedAt }));
  return page(request, releases, { source: "observation-derived fallback" });
}
