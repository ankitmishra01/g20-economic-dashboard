import { countryCard, countryFacts, defaultCard } from "../../../../../lib/share-meta.cjs";
import { renderCard } from "@/lib/og-card";
import { aiIndex, latest, realtime, registry } from "@/lib/share-data";

// Preview image for /c/{ISO3}.
export async function GET(_request: Request, { params }: { params: Promise<{ iso3: string }> }) {
  const { iso3 } = await params;
  const facts = countryFacts({ iso3, latest, realtime, aiIndex, registry });
  return renderCard(facts ? countryCard(facts) : defaultCard());
}
