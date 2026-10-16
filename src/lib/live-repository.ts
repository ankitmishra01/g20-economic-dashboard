import "server-only";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";
import { collections as fallbackCollections, globalCountries, indicators as fallbackIndicators, observations as fallbackObservations } from "@/lib/repository";
import { collectPages } from "../../lib/paginated-source.cjs";
import { latestSourceVintages } from "../../lib/live-data.cjs";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type LiveStatus = "actual" | "preliminary" | "estimate" | "forecast";
export type EconomicObservation = { seriesId?: string; country: string | number; indicator: string | number; period: string; value: string | number; frequency: string; status: LiveStatus; vintage: string; source: string; sourceUrl?: string | null; releasedAt?: string | null; fetchedAt: string };
export type EconomicIndicator = { key: string; label: string; unit: string; description: string; source_name: string; source_code?: string; source_url: string | null; frequency: string; coverageTier: number };
type SeriesJoin = { key: string; label: string; unit: string; source_name: string; source_url: string | null; frequency: string; coverage_tier: number };
type ObservationRow = { series_id: string; country_iso3: string; period: string; value: number | string; vintage_date: string; observation_status: LiveStatus; released_at: string | null; fetched_at: string; indicator_series: SeriesJoin | SeriesJoin[] };

function publicClient() {
  const env = serverEnv(); const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL; const key = env.SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

export async function liveObservations(): Promise<EconomicObservation[]> {
  const client = publicClient();
  if (!client) return fallbackObservations;
  let data: unknown[];
  try { data = await collectPages(async (from, to) => { const result = await client.from("economic_observations").select("series_id,country_iso3,period,value,vintage_date,observation_status,released_at,fetched_at,indicator_series!inner(key,label,unit,source_name,source_url,frequency,coverage_tier)").order("period", { ascending: false }).order("vintage_date", { ascending: false }).range(from, to); if (result.error) throw result.error; return result.data ?? []; }); } catch { return fallbackObservations; }
  if (!data.length) return fallbackObservations;
  return latestSourceVintages(data as unknown as ObservationRow[]).flatMap((row) => { const series = Array.isArray(row.indicator_series) ? row.indicator_series[0] : row.indicator_series; if (!series) return []; return [{ seriesId: row.series_id, country: row.country_iso3, indicator: series.key, period: row.period, value: row.value, frequency: series.frequency, status: row.observation_status, vintage: row.vintage_date, source: series.source_name, sourceUrl: series.source_url, releasedAt: row.released_at, fetchedAt: row.fetched_at }]; });
}

export async function liveIndicators(): Promise<EconomicIndicator[]> {
  const client = publicClient(); if (!client) return fallbackIndicators;
  const { data, error } = await client.from("indicator_series").select("key,label,unit,description,source_name,source_code,source_url,frequency,coverage_tier").eq("is_active", true).order("label");
  return error || !data?.length ? fallbackIndicators.map((row) => ({ ...row })) : data.map((row) => ({ key: row.key, label: row.label, unit: row.unit, description: row.description ?? "", source_name: row.source_name, source_code: row.source_code, source_url: row.source_url, frequency: row.frequency, coverageTier: row.coverage_tier }));
}

export async function liveCountries() {
  const client = publicClient(); if (!client) return globalCountries();
  const { data, error } = await client.from("countries").select("iso3,iso2,name,region,income_group,collection_members(collection_slug)").eq("is_active", true).order("name");
  return error || !data?.length ? globalCountries() : data.map((row) => { const memberships = (row.collection_members ?? []) as Array<{ collection_slug: string }>; const isG20 = memberships.some((item) => item.collection_slug === "g20"); return { iso3: row.iso3, iso2: row.iso2, name: row.name, region: row.region, incomeGroup: row.income_group, coverageTier: isG20 ? 1 : 3, collection: isG20 ? "g20" : "global" }; });
}

export async function liveCollections() {
  const client = publicClient(); if (!client) return fallbackCollections;
  const { data, error } = await client.from("country_collections").select("slug,name,description").order("name");
  return error || !data?.length ? fallbackCollections : data.map((row) => ({ key: row.slug, label: row.name, description: row.description, count: null }));
}

export async function liveReleases() {
  const client = publicClient(); if (!client) return null;
  const { data, error } = await client.from("economic_releases").select("id,period,scheduled_at,released_at,status,source_url,country_iso3,indicator_series!inner(key,label,source_name,frequency)").order("scheduled_at", { ascending: false }).limit(500);
  return error || !data?.length ? null : data;
}

export async function liveHealth() {
  const client = createSupabaseAdminClient(); if (!client) return null;
  const [{ count, error: observationError }, { data: jobs, error: jobError }] = await Promise.all([
    client.from("economic_observations").select("id", { count: "exact", head: true }),
    client.from("ingestion_job_runs").select("job_key,source_name,status,finished_at,rows_written,error_message").order("started_at", { ascending: false }).limit(10),
  ]);
  return observationError || jobError ? null : { observations: count ?? 0, jobs: jobs ?? [] };
}
