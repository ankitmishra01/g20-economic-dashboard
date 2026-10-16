import { NextRequest } from "next/server";
import { page } from "@/lib/api";
import { collections } from "@/lib/repository";
export async function GET(request: NextRequest) { return page(request, collections); }
