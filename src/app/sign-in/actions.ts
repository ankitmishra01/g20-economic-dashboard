"use server";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export async function requestMagicLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) redirect("/sign-in?error=invalid_email" as Route);
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/sign-in?error=not_configured" as Route);
  const origin = (await headers()).get("origin") ?? "http://localhost:3000";
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${origin}/auth/callback?next=/account` } });
  if (error) redirect("/sign-in?error=delivery_failed" as Route);
  redirect("/sign-in?sent=1" as Route);
}
