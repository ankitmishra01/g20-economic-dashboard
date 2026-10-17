import type { MetadataRoute } from "next";
import { iso3List, PRODUCTION_ORIGIN } from "@/lib/share-data";

// Home, the main scope views and one shareable page per economy.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const scopes = ["g20", "region:EAS", "region:ECS", "region:LCN", "region:MEA", "region:NAC", "region:SAS", "region:SSF"];
  return [
    { url: `${PRODUCTION_ORIGIN}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    ...scopes.map((s) => ({ url: `${PRODUCTION_ORIGIN}/s/${encodeURIComponent(s)}`, lastModified: now, changeFrequency: "daily" as const, priority: 0.7 })),
    ...iso3List.map((iso3) => ({ url: `${PRODUCTION_ORIGIN}/c/${iso3}`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.6 })),
  ];
}
