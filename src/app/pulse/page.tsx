import { PageHeader } from "@/components/page-header";
import { FreshnessBadge } from "@/components/freshness-badge";
import { annual, quarterly } from "@/lib/repository";

const signalKeys = ["GDP_GROWTH", "INFLATION", "UNEMPLOYMENT", "DEBT_GDP"];
export default function PulsePage() {
  const signals = signalKeys.map((key) => {
    const rows = [...quarterly, ...annual].filter((row) => row.indicator === key).sort((a,b) => String(b.period).localeCompare(String(a.period)));
    const latestPeriod = rows[0]?.period;
    const current = rows.filter((row) => row.period === latestPeriod);
    const values = current.map((row) => Number(row.value)).filter(Number.isFinite).sort((a,b) => a-b);
    return { key, period: String(latestPeriod ?? "Unavailable"), value: values.length ? values[Math.floor(values.length / 2)] : null, countries: new Set(current.map((row) => row.country)).size };
  });
  return <div className="page"><PageHeader eyebrow="Market + macro pulse" title="A global signal board" description="Observed medians from the latest supported period. Coverage is stated beside every signal; forecasts are excluded." aside={<FreshnessBadge status="actual" period="Observed only" />} /><section className="data-grid">{signals.map((signal) => <article className="data-card" key={signal.key}><span>{signal.key.replaceAll("_", " ")}</span><strong>{signal.value === null ? "—" : signal.value.toFixed(1)}</strong><p>{signal.period} · {signal.countries} economies</p></article>)}</section></div>;
}
