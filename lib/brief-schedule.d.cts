export function isBriefDue(preference: { cadence: string; delivery_hour: number; delivery_weekday?: number | null }, now?: Date): boolean;
export function briefPeriodStart(cadence: string, now?: Date): string;
