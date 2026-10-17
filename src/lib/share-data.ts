// Published shards bundled into the share routes (same files the dashboard serves).
import latestJson from "../../public/legacy/data/latest.json";
import realtimeJson from "../../public/legacy/data/realtime.json";
import aiIndexJson from "../../public/legacy/data/ai-index.json";
import registryJson from "../../public/legacy/countries.json";

export const latest: unknown = latestJson;
export const realtime: unknown = realtimeJson;
export const aiIndex: unknown = aiIndexJson;
export const registry: unknown = registryJson;
export const iso3List: string[] = (registryJson as { countries: { iso3: string }[] }).countries.map((c) => c.iso3);

export const PRODUCTION_ORIGIN = "https://g20-gamma.vercel.app";

// Behind Vercel's proxy the request URL carries the public host.
export function originOf(request: Request): string {
  const u = new URL(request.url);
  return `${u.protocol}//${u.host}`;
}
