import { NextRequest } from "next/server";
import { page } from "@/lib/api";
import { liveCountries } from "@/lib/live-repository";
export async function GET(request: NextRequest) { const countries = await liveCountries(); return page(request, countries, { coverage: "Global registry with tiered observation coverage", source: "Supabase facts with official-source snapshot fallback" }); }
