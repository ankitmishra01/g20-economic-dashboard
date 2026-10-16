import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { FreshnessBadge } from "@/components/freshness-badge";
import { g20Countries } from "@/lib/repository";
import { liveCountries, liveIndicators, liveObservations } from "@/lib/live-repository";
export function generateStaticParams() { return g20Countries.map((country) => ({ iso3: country.iso3 })); }
export const dynamic = "force-dynamic";
export default async function CountryDetail({ params }: { params: Promise<{ iso3: string }> }) {
  const { iso3 } = await params; const country = (await liveCountries()).find((item) => item.iso3 === iso3.toUpperCase()); if (!country) notFound(); const observations = await liveObservations(); const indicators = await liveIndicators();
  const rows = observations.filter((row) => row.country === country.iso3).sort((a,b) => String(b.period).localeCompare(String(a.period)));
  const latestByIndicator = new Map<string, (typeof rows)[number]>(); for (const row of rows) if (!latestByIndicator.has(String(row.indicator))) latestByIndicator.set(String(row.indicator), row);
  const latest = [...latestByIndicator.values()].slice(0, 12);
  return <div className="page"><PageHeader eyebrow={`${country.region} · Coverage tier ${country.coverageTier}`} title={country.name} description={`${rows.length.toLocaleString()} preserved observations. Coverage varies by indicator and frequency; unavailable values are never interpolated into rankings.`} aside={<FreshnessBadge status={latest[0]?.status ?? "actual"} period="Latest available data" />} /><div className="evidence-table" role="table" aria-label={`${country.name} latest indicators`}><div className="evidence-table__head" role="row"><span>Indicator</span><span>Period</span><span>Value</span><span>Source / status</span></div>{latest.map((row) => { const meta = indicators.find((item) => item.key === row.indicator); return <div role="row" key={`${row.indicator}-${row.period}`}><strong>{meta?.label ?? row.indicator}</strong><span>{row.period}</span><span>{Number(row.value).toLocaleString(undefined,{maximumFractionDigits:2})} {meta?.unit}</span><span>{row.source} · {row.status}</span></div>; })}</div></div>;
}
