import { FreshnessBadge } from "@/components/freshness-badge";
import { PageHeader } from "@/components/page-header";

const descriptions: Record<string, [string, string]> = {
  Pulse: ["Market + macro pulse", "A release-aware view of growth, inflation, labour, policy and market conditions."],
  Countries: ["Global directory", "Compare official coverage and economic conditions across every available country."],
  Indicators: ["Data dictionary", "Inspect definitions, cadence, provenance, coverage and revisions before using a number."],
  Calendar: ["Release calendar", "See what changed, what is due next and which releases are delayed."],
  Compare: ["Cross-country workbench", "Build a shareable comparison without hiding sparse or uneven coverage."],
};

export function RoutePlaceholder({ title }: { title: keyof typeof descriptions }) {
  const [eyebrow, description] = descriptions[title];
  return <div className="page"><PageHeader eyebrow={eyebrow} title={title} description={description} aside={<FreshnessBadge status="actual" period="Latest observed" />} /><section className="empty-state"><span>Route foundation ready</span><h2>Evidence first. Interpretation second.</h2><p>This workspace is wired into the global navigation and will populate only when a source-specific coverage contract is available.</p></section></div>;
}
