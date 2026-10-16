"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

export function PublicRealtimeRefresh({ url, publishableKey }: { url: string; publishableKey: string }) {
  const router = useRouter();
  useEffect(() => {
    const client = createBrowserClient(url, publishableKey); const channel = client.channel("public-economic-releases"); let timer: ReturnType<typeof setTimeout> | undefined;
    const coalescedRefresh = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => router.refresh(), 2_000); };
    channel.on("postgres_changes", { event: "*", schema: "public", table: "economic_releases" }, coalescedRefresh);
    channel.subscribe(); return () => { if (timer) clearTimeout(timer); void client.removeChannel(channel); };
  }, [publishableKey, router, url]);
  return null;
}
