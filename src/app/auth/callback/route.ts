import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "../../../../lib/auth-safety.cjs";
export async function GET(request: NextRequest) { const code = request.nextUrl.searchParams.get("code"); const next = safeRedirectPath(request.nextUrl.searchParams.get("next")); const supabase = await createSupabaseServerClient(); if (code && supabase) { const { error } = await supabase.auth.exchangeCodeForSession(code); if (!error) return NextResponse.redirect(new URL(next, request.url)); } return NextResponse.redirect(new URL("/sign-in?error=callback_failed", request.url)); }
