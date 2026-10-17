export interface Point { value: number; year: number }
export interface CountryFacts {
  iso3: string; iso2: string | null; name: string; region: string | null; income: string | null;
  gdp: Point | null; growth: Point | null; inflation: Point | null; unemployment: Point | null;
  debt: Point | null; fiscal: Point | null; currentAccount: Point | null; gdpPerCapitaPpp: Point | null;
  policyRate: { rate: number; date: string | null; lastChange: { from: number; to: number; after: string; change: number } | null; euroArea: boolean } | null;
  fx: { currency: string; perUsd: number; change30dPct: number | null; date: string | null } | null;
  ai: { score: number; projected2028: number | null; trajectory: string | null; live: boolean; slug: string | null } | null;
  asOfYear: number | null;
}
export interface ScopeFacts {
  id: string; label: string; members: string[]; economies: number; withData: number;
  aggregateGdp: number | null; medianGrowth: number | null; medianInflation: number | null; medianDebt: number | null; asOfYear: number | null;
}
export interface ShareMeta { title: string; description: string; url: string; image: string; imageAlt: string; target: string }
export const SITE_NAME: string;
export const SITE_TAGLINE: string;
export const SOURCES: string;
export function fmtUsd(v: number): string | null;
export function fmtPct(v: number, opts?: { signed?: boolean; digits?: number }): string | null;
export function fmtRate(v: number): string | null;
export function shortDate(iso: string | null): string | null;
export function countryFacts(input: { iso3: string; latest: unknown; realtime?: unknown; aiIndex?: unknown; registry: unknown }): CountryFacts | null;
export function keyNumbers(f: CountryFacts): string;
export function resolveScope(scopeId: string, registry: unknown): { id: string; label: string; members: string[] } | null;
export function scopeFacts(input: { scopeId: string; latest: unknown; registry: unknown }): ScopeFacts | null;
export function median(xs: number[]): number | null;
export function countryMeta(f: CountryFacts, origin: string): ShareMeta;
export function scopeMeta(f: ScopeFacts, origin: string): ShareMeta;
export function renderShareHtml(m: ShareMeta): string;
export interface CardStat { label: string; value: string; sub?: string; tone?: "pos" | "neg" | null }
export interface Card { eyebrow: string; title: string; subtitle?: string | null; flagIso2?: string | null; stats: CardStat[]; footerLeft: string; footerRight: string }
export function countryCard(f: CountryFacts): Card;
export function scopeCard(f: ScopeFacts): Card;
export function defaultCard(globalFacts?: ScopeFacts | null): Card;
