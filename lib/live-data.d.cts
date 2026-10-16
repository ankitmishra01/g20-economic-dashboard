export function latestSourceVintages<T extends { series_id: string; country_iso3: string; period: string; vintage_date: string }>(rows: T[]): T[];
