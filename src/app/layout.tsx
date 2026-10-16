import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import "./globals.css";
import "./surfaces.css";

export const metadata: Metadata = {
  title: { default: "Global Economic Intelligence", template: "%s · Global Economic Intelligence" },
  description: "Release-aware economic signals, country intelligence, and evidence for decision makers.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><a className="skip-link" href="#main-content">Skip to content</a><AppShell>{children}</AppShell></body></html>;
}
