import { defaultCard, scopeCard, scopeFacts } from "../../../../../lib/share-meta.cjs";
import { renderCard } from "@/lib/og-card";
import { latest, registry } from "@/lib/share-data";

// Preview image for /s/{scope}.
export async function GET(_request: Request, { params }: { params: Promise<{ scope: string }> }) {
  const { scope } = await params;
  const facts = scopeFacts({ scopeId: decodeURIComponent(scope), latest, registry });
  return renderCard(facts ? scopeCard(facts) : defaultCard());
}
