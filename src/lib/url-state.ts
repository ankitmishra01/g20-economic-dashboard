const ALLOWED_PERIODS = new Set(["1m", "3m", "1y", "5y", "max"]);
const SAFE_TOKEN = /^[A-Za-z0-9_.-]{1,64}$/;

export type ExplorerState = {
  country?: string;
  indicator?: string;
  collection?: string;
  period: string;
};

export function parseExplorerState(searchParams: URLSearchParams): ExplorerState {
  const safe = (key: string) => {
    const value = searchParams.get(key)?.trim();
    return value && SAFE_TOKEN.test(value) ? value : undefined;
  };
  const period = safe("period");
  return {
    country: safe("country")?.toUpperCase(),
    indicator: safe("indicator"),
    collection: safe("collection"),
    period: period && ALLOWED_PERIODS.has(period) ? period : "1y",
  };
}
