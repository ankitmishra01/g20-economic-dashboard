import snapshot from "../../public/legacy/data-snapshot.json";

export const g20Countries = [
  ["ARG","Argentina","Americas"],["AUS","Australia","Asia Pacific"],["BRA","Brazil","Americas"],["CAN","Canada","Americas"],["CHN","China","Asia Pacific"],["FRA","France","Europe"],["DEU","Germany","Europe"],["IND","India","Asia Pacific"],["IDN","Indonesia","Asia Pacific"],["ITA","Italy","Europe"],["JPN","Japan","Asia Pacific"],["MEX","Mexico","Americas"],["RUS","Russia","Europe"],["SAU","Saudi Arabia","Middle East"],["ZAF","South Africa","Africa"],["KOR","South Korea","Asia Pacific"],["TUR","Türkiye","Europe"],["GBR","United Kingdom","Europe"],["USA","United States","Americas"],["EUU","European Union","Europe"],
].map(([iso3,name,region]) => ({ iso3, name, region, coverageTier: 1, collection: "g20" }));

export const indicators = snapshot.meta.map((item) => ({ ...item, frequency: "annual", coverageTier: 1 }));
export const annual = snapshot.annual.map(([country, indicator, period, value]) => ({ country, indicator, period: String(period), value, frequency: "annual", status: "actual", vintage: snapshot.generatedAt.slice(0,10), source: indicators.find((item) => item.key === indicator)?.source_name ?? "Official source", fetchedAt: snapshot.generatedAt }));
export const quarterly = snapshot.quarterly.map(([country, indicator, period, value]) => ({ country, indicator, period: String(period), value, frequency: "quarterly", status: "actual", vintage: snapshot.generatedAt.slice(0,10), source: "OECD / national source", fetchedAt: snapshot.generatedAt }));
export const observations = [...quarterly, ...annual];

export const collections = [
  { key: "g20", label: "G20", description: "Major advanced and emerging economies", count: 20 },
  { key: "global", label: "Global", description: "All economies returned by the World Bank registry", count: null },
  { key: "americas", label: "Americas", description: "Regional comparison", count: g20Countries.filter((c) => c.region === "Americas").length },
  { key: "europe", label: "Europe", description: "Regional comparison", count: g20Countries.filter((c) => c.region === "Europe").length },
];

type WorldBankCountry = { id: string; iso2Code: string; name: string; region: { id: string; value: string }; incomeLevel: { value: string } };
export async function globalCountries() {
  try {
    const response = await fetch("https://api.worldbank.org/v2/country?format=json&per_page=400", { next: { revalidate: 86_400 } });
    if (!response.ok) throw new Error(`World Bank registry ${response.status}`);
    const payload = await response.json() as [unknown, WorldBankCountry[]];
    const rows = payload[1].filter((country) => country.region.id && country.region.id !== "NA" && /^[A-Z]{3}$/.test(country.id)).map((country) => ({ iso3: country.id, iso2: country.iso2Code, name: country.name, region: country.region.value, incomeGroup: country.incomeLevel.value, coverageTier: g20Countries.some((item) => item.iso3 === country.id) ? 1 : 3, collection: g20Countries.some((item) => item.iso3 === country.id) ? "g20" : "global" }));
    return rows.length > 150 ? rows : g20Countries;
  } catch { return g20Countries; }
}
