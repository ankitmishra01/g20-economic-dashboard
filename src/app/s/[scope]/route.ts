import { renderShareHtml, scopeFacts, scopeMeta } from "../../../../lib/share-meta.cjs";
import { latest, originOf, registry } from "@/lib/share-data";

// /s/{scope}: a shareable scope link (global, g20, region:SSF, income:LIC).
export async function GET(request: Request, { params }: { params: Promise<{ scope: string }> }) {
  const { scope } = await params;
  const facts = scopeFacts({ scopeId: decodeURIComponent(scope), latest, registry });
  const origin = originOf(request);
  if (!facts) return Response.redirect(`${origin}/`, 302);
  return new Response(renderShareHtml(scopeMeta(facts, origin)), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
