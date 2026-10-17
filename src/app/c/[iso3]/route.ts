import { countryFacts, countryMeta, renderShareHtml } from "../../../../lib/share-meta.cjs";
import { aiIndex, latest, originOf, realtime, registry } from "@/lib/share-data";

// /c/{ISO3}: a shareable country link. Link-preview crawlers read the meta tags;
// people are forwarded to the dashboard's country profile.
export async function GET(request: Request, { params }: { params: Promise<{ iso3: string }> }) {
  const { iso3 } = await params;
  const facts = countryFacts({ iso3, latest, realtime, aiIndex, registry });
  const origin = originOf(request);
  if (!facts) return Response.redirect(`${origin}/`, 302);
  if (facts.iso3 !== iso3) return Response.redirect(`${origin}/c/${facts.iso3}`, 301);
  return new Response(renderShareHtml(countryMeta(facts, origin)), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
