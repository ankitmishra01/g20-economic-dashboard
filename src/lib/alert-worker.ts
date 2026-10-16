import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { collectPages } from "../../lib/paginated-source.cjs";
import { latestSourceVintages } from "../../lib/live-data.cjs";

type Rule = { id: string; user_id: string; watchlist_id: string | null; country_iso3: string | null; series_id: string | null; comparator: string; threshold: number | null };
type Item = { watchlist_id: string; country_iso3: string | null; series_id: string | null };
type Fact = { series_id: string; country_iso3: string; period: string; value: number | string; fetched_at: string; vintage_date: string };

function triggered(rule: Rule, current: Fact, previous?: Fact) {
  const value = Number(current.value); const threshold = Number(rule.threshold);
  if (rule.comparator === "new_release") return true;
  if (rule.comparator === "stale") return Date.now() - new Date(current.fetched_at).getTime() > (Number.isFinite(threshold) ? threshold : 45) * 86_400_000;
  if (!Number.isFinite(threshold)) return false;
  if (rule.comparator === "above") return value > threshold;
  if (rule.comparator === "below") return value < threshold;
  if (!previous) return false; const change = value - Number(previous.value);
  return rule.comparator === "change_up" ? change > threshold : rule.comparator === "change_down" ? change < -threshold : false;
}

export async function evaluateAlertRules() {
  const client = createSupabaseAdminClient(); if (!client) return { evaluated: 0, triggered: 0, status: "not_configured" as const };
  const [{ data: ruleData, error: ruleError }, { data: itemData, error: itemError }, factData] = await Promise.all([
    client.from("alert_rules").select("id,user_id,watchlist_id,country_iso3,series_id,comparator,threshold").eq("is_active", true),
    client.from("watchlist_items").select("watchlist_id,country_iso3,series_id"),
    collectPages(async (from, to) => { const result = await client.from("economic_observations").select("series_id,country_iso3,period,value,fetched_at,vintage_date").in("observation_status", ["actual", "preliminary"]).order("period", { ascending: false }).order("vintage_date", { ascending: false }).range(from, to); if (result.error) throw result.error; return result.data ?? []; }),
  ]);
  if (ruleError || itemError) throw ruleError ?? itemError;
  const rules = ruleData as Rule[]; const items = itemData as Item[]; const facts = latestSourceVintages(factData as unknown as Fact[]) as Fact[]; const events = [];
  for (const rule of rules) {
    const scopes = rule.country_iso3 || rule.series_id ? [{ country_iso3: rule.country_iso3, series_id: rule.series_id }] : items.filter((item) => item.watchlist_id === rule.watchlist_id);
    for (const scope of scopes) {
      const matches = facts.filter((fact) => (!scope.country_iso3 || fact.country_iso3 === scope.country_iso3) && (!scope.series_id || fact.series_id === scope.series_id));
      const current = matches[0]; if (!current || !triggered(rule, current, matches[1])) continue;
      events.push({ alert_rule_id: rule.id, user_id: rule.user_id, country_iso3: current.country_iso3, series_id: current.series_id, period: current.period, triggered_value: current.value, comparator: rule.comparator, threshold: rule.threshold, evidence: { fetched_at: current.fetched_at } });
    }
  }
  if (events.length) { const { error } = await client.from("alert_events").upsert(events, { onConflict: "alert_rule_id,country_iso3,series_id,period", ignoreDuplicates: true }); if (error) throw error; }
  return { evaluated: rules.length, triggered: events.length, status: "processed" as const };
}
