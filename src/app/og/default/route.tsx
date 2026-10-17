import { defaultCard, scopeFacts } from "../../../../lib/share-meta.cjs";
import { renderCard } from "@/lib/og-card";
import { latest, registry } from "@/lib/share-data";

// Site-wide preview image (the dashboard home page and any page without its own card).
export async function GET() {
  return renderCard(defaultCard(scopeFacts({ scopeId: "global", latest, registry })));
}
