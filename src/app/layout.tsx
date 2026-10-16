import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { PublicRealtimeRefresh } from "@/components/public-realtime-refresh";
import { serverEnv } from "@/lib/env";
import "./globals.css";
import "./surfaces.css";

export const metadata: Metadata = {
  title: { default: "Global Economic Intelligence", template: "%s · Global Economic Intelligence" },
  description: "Release-aware economic signals, country intelligence, and evidence for decision makers.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const env = serverEnv(); const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL; const key = env.SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return <html lang="en"><body>{url && key ? <PublicRealtimeRefresh url={url} publishableKey={key} /> : null}<a className="skip-link" href="#main-content">Skip to content</a><AppShell>{children}</AppShell></body></html>;
}
