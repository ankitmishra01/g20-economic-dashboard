import Link from "next/link";
import { FreshnessBadge } from "@/components/freshness-badge";
import { PageHeader } from "@/components/page-header";
import { g20Countries, indicators, observations } from "@/lib/repository";

const releaseTargets = [{ country: "USA", indicator: "INFLATION" }, { country: "EUU", indicator: "GDP_GROWTH" }, { country: "CHN", indicator: "GDP_GROWTH" }];

export default function Home() {
  const releases = releaseTargets.map((target) => {
    const row = observations.filter((item) => item.country === target.country && item.indicator === target.indicator).sort((a,b) => String(b.period).localeCompare(String(a.period)))[0];
    const meta = indicators.find((item) => item.key === target.indicator);
    return { iso3: target.country, country: g20Countries.find((item) => item.iso3 === target.country)?.name ?? target.country, indicator: meta?.label ?? target.indicator, period: String(row?.period ?? "Unavailable"), value: row ? `${Number(row.value).toFixed(1)} ${meta?.unit ?? ""}` : "—", source: row?.source ?? "No supported observation" };
  });
  const countryCoverage = new Set(observations.map((row) => row.country)).size; const seriesCoverage = new Set(observations.map((row) => row.indicator)).size; const quarterlyCoverage = new Set(observations.filter((row) => row.frequency === "quarterly").map((row) => row.country)).size; const snapshotDate = observations[0]?.fetchedAt ? new Date(String(observations[0].fetchedAt)).toLocaleDateString("en", { dateStyle: "medium", timeZone: "UTC" }) : "Unavailable";
  return <div className="page">
    <PageHeader eyebrow={`${snapshotDate} · Decision brief`} title="What changed in the global economy?" description="Latest supported observations, separated from estimates and forecasts, with visible source and coverage context." aside={<FreshnessBadge status="actual" period="Observed snapshot" releasedAt={String(observations[0]?.fetchedAt ?? "")} />} />
    <section className="signal-strip" aria-label="Global data coverage summary"><div><span>Country coverage</span><strong>{countryCoverage}</strong><small>Economies with observations</small></div><div><span>Series coverage</span><strong>{seriesCoverage}</strong><small>Supported indicators</small></div><div><span>Quarterly coverage</span><strong>{quarterlyCoverage}</strong><small>Economies with higher frequency data</small></div><div><span>Observation status</span><strong>Actual</strong><small>Forecasts excluded here</small></div></section>
    <div className="section-title"><div><p className="eyebrow">Priority queue</p><h2>Material changes</h2></div><Link href="/calendar">Full release calendar →</Link></div>
    <section className="release-list">{releases.map((release, index) => <article key={release.country}><span className="release-list__rank">0{index + 1}</span><div><p>{release.country}</p><h3>{release.indicator}</h3></div><span className="tone tone--steady">{release.period}</span><strong>{release.value}</strong><Link href={`/countries/${release.iso3}`} aria-label={`Open ${release.country} evidence`}>Open evidence <span>↗</span></Link></article>)}</section>
    <section className="editorial-grid"><article className="feature"><p className="eyebrow">Decision method</p><h2>Read the latest release in context, not as a leaderboard.</h2><p>Frequency, vintage and coverage determine what a number can support. Compare like with like, inspect the source, and keep unavailable values visible.</p><Link href="/compare?indicator=INFLATION&period=1y">Compare inflation paths →</Link></article><aside className="method-note"><span>Reading the monitor</span><ol><li>Observed values never include forecasts.</li><li>Every value carries source and release context.</li><li>Coverage gaps remain visible.</li></ol></aside></section>
  </div>;
}
