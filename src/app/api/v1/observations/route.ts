import { NextRequest } from "next/server";
import { page } from "@/lib/api";
import { liveObservations } from "@/lib/live-repository";
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const countries = params.get("country")?.split(",").map((v) => v.toUpperCase());
  const indicator = params.get("indicator")?.toUpperCase();
  const status = params.get("status")?.toLowerCase();
  const observations = await liveObservations(); const rows = observations.filter((row) => (!countries || countries.includes(String(row.country))) && (!indicator || row.indicator === indicator) && (!status || row.status === status));
  const available = new Set(rows.map((row) => row.country));
  return page(request, rows, { coverage: { availableCountries: available.size, explicitlySparse: available.size < 20 }, forecastsIncluded: status === "forecast" });
}
