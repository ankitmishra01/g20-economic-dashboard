export type IngestionResult = { provider: string; rowsSeen: number; rowsAccepted: number; preserveLastValid: true; jobRun: { status: "succeeded" | "failed"; durationMs: number; error?: string } };
export const officialAdapters = [
  { provider: "World Bank", cadence: "annual", endpoint: "https://api.worldbank.org/v2" },
  { provider: "OECD", cadence: "quarterly", endpoint: "https://sdmx.oecd.org/public/rest/v1" },
  { provider: "IMF", cadence: "semiannual", endpoint: "https://www.imf.org/external/datamapper/api/v1" },
  { provider: "ECB", cadence: "daily", endpoint: "https://data-api.ecb.europa.eu/service/data" },
  { provider: "FRED", cadence: "daily", endpoint: "https://api.stlouisfed.org/fred" },
] as const;

export async function runAdapter(provider: string, fetchRows: () => Promise<unknown[]>): Promise<IngestionResult> {
  const started = Date.now();
  try {
    const rows = await fetchRows();
    return { provider, rowsSeen: rows.length, rowsAccepted: rows.length, preserveLastValid: true, jobRun: { status: "succeeded", durationMs: Date.now() - started } };
  } catch (error) {
    return { provider, rowsSeen: 0, rowsAccepted: 0, preserveLastValid: true, jobRun: { status: "failed", durationMs: Date.now() - started, error: error instanceof Error ? error.message : "Unknown source failure" } };
  }
}
