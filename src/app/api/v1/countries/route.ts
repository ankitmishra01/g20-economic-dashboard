import { NextRequest } from "next/server";
import { page } from "@/lib/api";
import { globalCountries } from "@/lib/repository";
export async function GET(request: NextRequest) { const countries = await globalCountries(); return page(request, countries, { coverage: "Global registry with tiered observation coverage", source: "World Bank + project metadata" }); }
