import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { deliverBrief } from "@/lib/delivery";
import { buildBrief } from "../../lib/briefs.cjs";
import { briefPeriodStart, isBriefDue } from "../../lib/brief-schedule.cjs";

type Preference = { user_id: string; watchlist_id: string | null; cadence: string; delivery_hour: number; delivery_weekday: number | null; email_enabled: boolean };
type Item = { country_iso3: string | null; series_id: string | null };
type Observation = { country_iso3: string; series_id: string; period: string; value: number | string; indicator_series: { key: string; source_name: string; source_url: string | null } | Array<{ key: string; source_name: string; source_url: string | null }> };

const escapeHtml = (value: unknown) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

export async function processDueBriefs(now = new Date()) {
  const client = createSupabaseAdminClient(); if (!client) return { status: "skipped" as const, reason: "service_role_not_configured", deliveries: 0, failures: 0 };
  const { data, error } = await client.from("brief_preferences").select("user_id,watchlist_id,cadence,delivery_hour,delivery_weekday,email_enabled").eq("email_enabled", true); if (error) throw error;
  const due = (data as Preference[]).filter((preference) => isBriefDue(preference, now)); let deliveries = 0; let failures = 0;
  for (const preference of due) {
    const periodStart = briefPeriodStart(preference.cadence, now);
    const { data: delivery, error: reserveError } = await client.from("brief_deliveries").upsert({ user_id: preference.user_id, watchlist_id: preference.watchlist_id, period_start: periodStart, cadence: preference.cadence, status: "pending" }, { onConflict: "user_id,watchlist_id,period_start,cadence", ignoreDuplicates: true }).select("id").maybeSingle();
    if (reserveError) { failures += 1; continue; } if (!delivery) continue;
    try {
      const { data: itemData, error: itemError } = await client.from("watchlist_items").select("country_iso3,series_id").eq("user_id", preference.user_id).eq("watchlist_id", preference.watchlist_id); if (itemError) throw itemError;
      const items = itemData as Item[]; const countries = new Set(items.flatMap((item) => item.country_iso3 ? [item.country_iso3] : [])); const seriesIds = new Set(items.flatMap((item) => item.series_id ? [item.series_id] : []));
      const { data: observationData, error: observationError } = await client.from("economic_observations").select("country_iso3,series_id,period,value,indicator_series!inner(key,source_name,source_url)").in("observation_status", ["actual", "preliminary"]).order("period", { ascending: false }).limit(1000); if (observationError) throw observationError;
      const seen = new Set<string>(); const evidence = (observationData as unknown as Observation[]).flatMap((row) => { const series = Array.isArray(row.indicator_series) ? row.indicator_series[0] : row.indicator_series; const matches = (!countries.size || countries.has(row.country_iso3)) && (!seriesIds.size || seriesIds.has(row.series_id)); const key = `${row.country_iso3}|${row.series_id}`; if (!matches || !series || seen.has(key)) return []; seen.add(key); return [{ country: row.country_iso3, indicator: series.key, period: row.period, value: row.value, source: series.source_name, sourceUrl: series.source_url }]; });
      const brief = buildBrief(evidence, { cadence: preference.cadence, periodStart }); const { data: authData, error: authError } = await client.auth.admin.getUserById(preference.user_id); if (authError || !authData.user?.email) throw authError ?? new Error("Brief recipient has no email");
      const html = `<h1>${escapeHtml(brief.subject)}</h1><p>${escapeHtml(brief.summary)}</p><ul>${brief.evidence.map((item) => `<li><a href="${escapeHtml(item.url ?? "#")}">${escapeHtml(item.label)}</a>: ${escapeHtml(item.value)} · ${escapeHtml(item.source)}</li>`).join("")}</ul>`;
      const sent = await deliverBrief({ to: authData.user.email, subject: brief.subject, html }); if (sent.status !== "sent") throw new Error("Email delivery is not configured");
      const providerMessageId = typeof sent.result === "object" && sent.result && "id" in sent.result ? String(sent.result.id) : null;
      await client.from("brief_deliveries").update({ status: "sent", subject: brief.subject, evidence: brief.evidence, provider_message_id: providerMessageId, delivered_at: new Date().toISOString() }).eq("id", delivery.id); deliveries += 1;
    } catch (deliveryError) { failures += 1; await client.from("brief_deliveries").update({ status: "failed", error_message: deliveryError instanceof Error ? deliveryError.message : "Brief failed" }).eq("id", delivery.id); }
  }
  return { status: "processed" as const, deliveries, failures, due: due.length };
}
