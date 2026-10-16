"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
async function ownedClient() { const client = await createSupabaseServerClient(); if (!client) throw new Error("Accounts are not configured"); const { data: { user } } = await client.auth.getUser(); if (!user) throw new Error("Authentication required"); return { client, user }; }
export async function createWatchlist(formData: FormData) { const { client, user } = await ownedClient(); const name = String(formData.get("name") ?? "").trim().slice(0,80); if (!name) throw new Error("Watchlist name required"); const { error } = await client.from("watchlists").insert({ user_id: user.id, name }); if (error) throw error; revalidatePath("/account"); }
export async function deleteWatchlist(formData: FormData) { const { client, user } = await ownedClient(); const id = String(formData.get("id") ?? ""); const { error } = await client.from("watchlists").delete().eq("id", id).eq("user_id", user.id); if (error) throw error; revalidatePath("/account"); }
export async function signOut() { const { client } = await ownedClient(); await client.auth.signOut(); }
