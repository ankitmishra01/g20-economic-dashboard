import { NextRequest, NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fetchWorldBankObservations, worldBankSeries, type WorldBankSeriesKey } from "@/lib/ingestion/world-bank";
import { finishIngestionRun, persistWorldBankRows, startIngestionRun } from "@/lib/ingestion/persist";
import { runIngestionJob } from "../../../../../lib/ingestion-pipeline.cjs";

export async function GET(request: NextRequest) {
  const env = serverEnv(); if (!env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const client = createSupabaseAdminClient(); if (!client) return NextResponse.json({ error: "Supabase service role is not configured" }, { status: 503 });
  const requested = request.nextUrl.searchParams.get("indicator")?.toUpperCase() ?? "GDP_GROWTH"; if (!(requested in worldBankSeries)) return NextResponse.json({ error: "Unsupported indicator" }, { status: 400 });
  const indicator = requested as WorldBankSeriesKey; const year = new Date().getUTCFullYear();
  try {
    const result = await runIngestionJob({ provider: "World Bank", start: () => startIngestionRun(client, "World Bank", indicator), fetchRows: () => fetchWorldBankObservations(indicator, year - 5, year), persistRows: (rows) => persistWorldBankRows(client, indicator, rows), finish: (id, status, counts) => finishIngestionRun(client, id, status, counts) });
    return NextResponse.json({ data: result });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Ingestion failed" }, { status: 502 }); }
}
