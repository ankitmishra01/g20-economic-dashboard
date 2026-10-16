import { NextResponse } from "next/server";
import { parseEcbDailyXml, parseFredCsv } from "../../../../../lib/market-data.cjs";

const ECB_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
const FRED_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10";

async function text(url: string) {
  const response = await fetch(url, { next: { revalidate: 300 }, signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`${response.status} from official source`);
  return response.text();
}

export async function GET() {
  const [ecbResult, fredResult] = await Promise.allSettled([text(ECB_URL), text(FRED_URL)]);
  const observations: Array<Record<string, string | number>> = [];
  if (ecbResult.status === "fulfilled") {
    const ecb = parseEcbDailyXml(ecbResult.value);
    for (const currency of ["USD", "GBP", "JPY"]) if (ecb.rates[currency]) observations.push({ key: `EUR${currency}`, label: `EUR / ${currency}`, value: ecb.rates[currency], date: ecb.date, source: "European Central Bank" });
  }
  if (fredResult.status === "fulfilled") { const fred = parseFredCsv(fredResult.value); observations.push({ key: "DGS10", label: "US 10Y Treasury", value: fred.value, suffix: "%", date: fred.date, source: "Federal Reserve Bank of St. Louis" }); }
  return NextResponse.json({ data: observations, meta: { checkedAt: new Date().toISOString(), cadence: "Official daily reference data; refreshed here every five minutes", autoRefreshSeconds: 300, partial: observations.length < 4 } }, { status: observations.length ? 200 : 503, headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" } });
}
