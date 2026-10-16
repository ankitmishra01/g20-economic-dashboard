"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

export function RealtimeRefresh({ url, publishableKey, userId }: { url: string; publishableKey: string; userId: string }) {
  const router = useRouter();
  useEffect(() => {
    const client = createBrowserClient(url, publishableKey); const channel = client.channel(`account:${userId}`); const filter = `user_id=eq.${userId}`;
    for (const table of ["watchlists", "watchlist_items", "alert_rules", "alert_events", "brief_preferences", "brief_deliveries"]) channel.on("postgres_changes", { event: "*", schema: "public", table, filter }, () => router.refresh());
    channel.subscribe(); return () => { void client.removeChannel(channel); };
  }, [publishableKey, router, url, userId]);
  return null;
}
