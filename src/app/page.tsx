import Link from "next/link";
import { FreshnessBadge } from "@/components/freshness-badge";
import { PageHeader } from "@/components/page-header";

const releases = [
  { country: "United States", indicator: "Consumer prices", move: "Next release", value: "Oct 24", tone: "neutral" },
  { country: "Euro area", indicator: "Policy rate", move: "Held", value: "2.00%", tone: "steady" },
  { country: "China", indicator: "Real GDP", move: "Observed", value: "Q3", tone: "watch" },
];

export default function Home() {
  return <div className="page">
    <PageHeader eyebrow="16 October 2026 · Decision brief" title="What changed in the global economy?" description="New releases, revisions and material market moves—separated from forecasts and ranked by decision relevance." aside={<FreshnessBadge status="actual" period="Release-aware" releasedAt="2026-10-16T12:00:00Z" />} />
    <section className="signal-strip" aria-label="Global pulse summary"><div><span>Growth pulse</span><strong>Mixed</strong><small>12 improving · 8 slowing</small></div><div><span>Inflation pulse</span><strong>Cooling</strong><small>Median direction, latest releases</small></div><div><span>Policy stance</span><strong>Restrictive</strong><small>Major central banks</small></div><div><span>Data confidence</span><strong>87%</strong><small>Tier 1 coverage current</small></div></section>
    <div className="section-title"><div><p className="eyebrow">Priority queue</p><h2>Material changes</h2></div><Link href="/calendar">Full release calendar →</Link></div>
    <section className="release-list">{releases.map((release, index) => <article key={release.country}><span className="release-list__rank">0{index + 1}</span><div><p>{release.country}</p><h3>{release.indicator}</h3></div><span className={`tone tone--${release.tone}`}>{release.move}</span><strong>{release.value}</strong><Link href={`/countries?country=${release.country === "United States" ? "USA" : release.country === "China" ? "CHN" : "EUU"}`} aria-label={`Open ${release.country} evidence`}>Open evidence <span>↗</span></Link></article>)}</section>
    <section className="editorial-grid"><article className="feature"><p className="eyebrow">Interpretation</p><h2>Disinflation is broadening, but the final mile is becoming country-specific.</h2><p>Headline direction now masks large differences in services inflation, wage pressure and policy transmission. Country evidence matters more than a single global ranking.</p><Link href="/compare?indicator=INFLATION&period=1y">Compare inflation paths →</Link></article><aside className="method-note"><span>Reading the monitor</span><ol><li>Observed values never include forecasts.</li><li>Every value carries source and release context.</li><li>Coverage gaps remain visible.</li></ol></aside></section>
  </div>;
}
