import { NextRequest, NextResponse } from "next/server";

export type Envelope<T> = { data: T; meta: Record<string, unknown>; error?: never } | { data?: never; meta: Record<string, unknown>; error: { code: string; message: string } };

export function query(request: NextRequest) {
  const limitValue = Number(request.nextUrl.searchParams.get("limit") ?? 50);
  if (!Number.isInteger(limitValue) || limitValue < 1 || limitValue > 500) throw new Error("limit must be between 1 and 500");
  const cursor = request.nextUrl.searchParams.get("cursor");
  const offset = cursor ? Number.parseInt(cursor, 10) : 0;
  if (!Number.isInteger(offset) || offset < 0) throw new Error("invalid cursor");
  return { limit: limitValue, offset };
}

export function page<T>(request: NextRequest, rows: T[], extra: Record<string, unknown> = {}) {
  try {
    const { limit, offset } = query(request);
    const data = rows.slice(offset, offset + limit);
    const next = offset + data.length;
    return NextResponse.json<Envelope<T[]>>({ data, meta: { count: data.length, nextCursor: next < rows.length ? String(next) : null, ...extra } });
  } catch (error) {
    return NextResponse.json<Envelope<T[]>>({ error: { code: "INVALID_QUERY", message: error instanceof Error ? error.message : "Invalid query" }, meta: {} }, { status: 400 });
  }
}

export const noStore = { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" };
