import { PageHeader } from "@/components/page-header";
import { observations } from "@/lib/repository";
export default function CalendarPage() {
  const groups = [...new Map(observations.map((row) => [`${row.source}|${row.period}`, row])).values()].sort((a,b) => String(b.period).localeCompare(String(a.period))).slice(0,30);
  return <div className="page"><PageHeader eyebrow="Observed release ledger" title="Release calendar" description="Current snapshot releases with source cadence. Scheduled future dates appear only after a verified source calendar is connected." /><div className="timeline">{groups.map((row,index) => <article key={`${row.source}-${row.period}`}><time>{row.period}</time><i /><div><strong>{row.source}</strong><p>{row.frequency} dataset · {row.status} · vintage {row.vintage}</p></div><span>{index === 0 ? "Latest" : "Released"}</span></article>)}</div></div>;
}
