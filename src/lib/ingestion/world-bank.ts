export const worldBankSeries = {
  GDP_GROWTH: { code: "NY.GDP.MKTP.KD.ZG", label: "GDP growth", unit: "%", description: "Annual real GDP growth" },
  INFLATION: { code: "FP.CPI.TOTL.ZG", label: "Inflation", unit: "%", description: "Annual consumer price inflation" },
  UNEMPLOYMENT: { code: "SL.UEM.TOTL.ZS", label: "Unemployment", unit: "%", description: "Share of labour force unemployed" },
} as const;

export type WorldBankSeriesKey = keyof typeof worldBankSeries;
export type WorldBankObservation = { countryIso3: string; countryName: string; indicator: WorldBankSeriesKey; period: string; value: number; sourcePayload: unknown };

export async function fetchWorldBankObservations(indicator: WorldBankSeriesKey, fromYear: number, toYear: number): Promise<WorldBankObservation[]> {
  const series = worldBankSeries[indicator];
  const url = `https://api.worldbank.org/v2/country/all/indicator/${series.code}?format=json&per_page=20000&date=${fromYear}:${toYear}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(25_000) });
  if (!response.ok) throw new Error(`World Bank request failed (${response.status})`);
  const payload = await response.json() as [unknown, Array<{ countryiso3code: string; country: { value: string }; date: string; value: number | null }>];
  return (payload[1] ?? []).filter((row) => /^[A-Z]{3}$/.test(row.countryiso3code) && Number.isFinite(row.value)).map((row) => ({ countryIso3: row.countryiso3code, countryName: row.country.value, indicator, period: row.date, value: Number(row.value), sourcePayload: row }));
}
