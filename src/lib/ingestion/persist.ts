import type { SupabaseClient } from "@supabase/supabase-js";
import { worldBankSeries, type WorldBankObservation, type WorldBankSeriesKey } from "./world-bank";

export async function startIngestionRun(client: SupabaseClient, provider: string, indicator: string) {
  const { data, error } = await client.from("ingestion_job_runs").insert({ job_key: `world-bank:${indicator}`, source_name: provider }).select("id").single();
  if (error) throw error; return String(data.id);
}

export async function persistWorldBankRows(client: SupabaseClient, indicator: WorldBankSeriesKey, rows: WorldBankObservation[]) {
  const series = worldBankSeries[indicator];
  const countries = [...new Map(rows.map((row) => [row.countryIso3, { iso3: row.countryIso3, name: row.countryName }])).values()];
  if (countries.length) { const { error } = await client.from("countries").upsert(countries, { onConflict: "iso3" }); if (error) throw error; }
  const { data: seriesRow, error: seriesError } = await client.from("indicator_series").upsert({ key: indicator, label: series.label, description: series.description, unit: series.unit, source_name: "World Bank", source_code: series.code, source_url: `https://data.worldbank.org/indicator/${series.code}`, frequency: "annual", coverage_tier: 2 }, { onConflict: "source_name,source_code,frequency" }).select("id").single();
  if (seriesError) throw seriesError;
  const vintage = new Date().toISOString().slice(0, 10); const fetchedAt = new Date().toISOString();
  const observations = rows.map((row) => ({ series_id: seriesRow.id, country_iso3: row.countryIso3, period: row.period, value: row.value, vintage_date: vintage, observation_status: "actual", fetched_at: fetchedAt, source_payload: row.sourcePayload }));
  for (let offset = 0; offset < observations.length; offset += 500) { const { error } = await client.from("economic_observations").upsert(observations.slice(offset, offset + 500), { onConflict: "series_id,country_iso3,period,vintage_date", ignoreDuplicates: true }); if (error) throw error; }
  return observations.length;
}

export async function finishIngestionRun(client: SupabaseClient, id: string, status: "succeeded" | "failed", counts: { seen: number; written: number; error?: string }) {
  const { error } = await client.from("ingestion_job_runs").update({ status, finished_at: new Date().toISOString(), rows_seen: counts.seen, rows_written: counts.written, error_message: counts.error ?? null }).eq("id", id);
  if (error) throw error;
}
