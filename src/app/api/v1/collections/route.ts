import { NextRequest } from "next/server";
import { page } from "@/lib/api";
import { liveCollections } from "@/lib/live-repository";
export async function GET(request: NextRequest) { return page(request, await liveCollections()); }
