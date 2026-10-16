export function parseEcbDailyXml(xml: string): { date: string; rates: Record<string, number> };
export function parseFredCsv(csv: string): { date: string; value: number };
