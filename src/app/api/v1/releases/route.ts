import { NextRequest } from "next/server";
import { page } from "@/lib/api";
import { observations } from "@/lib/repository";
export async function GET(request: NextRequest) {
  const seen = new Set<string>();
  const releases = observations.filter((row) => { const key = `${row.source}|${row.period}|${row.frequency}`; if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 200).map((row) => ({ source: row.source, period: row.period, frequency: row.frequency, status: "released", fetchedAt: row.fetchedAt }));
  return page(request, releases);
}
