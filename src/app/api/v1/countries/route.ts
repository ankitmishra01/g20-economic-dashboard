import { NextRequest } from "next/server";
import { page } from "@/lib/api";
import { g20Countries } from "@/lib/repository";
export async function GET(request: NextRequest) { return page(request, g20Countries, { coverage: "G20 baseline; global registry adapter available", source: "World Bank + project metadata" }); }
