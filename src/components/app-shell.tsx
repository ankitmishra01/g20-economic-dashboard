"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { primaryNavigation } from "@/lib/navigation";
import { CommandPalette } from "@/components/command-palette";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="shell">
      <header className="masthead">
        <Link href="/" className="brand" aria-label="Global Economic Intelligence home">
          <span className="brand__mark">GE</span>
          <span><strong>Global Economic Intelligence</strong><small>Signals for consequential decisions</small></span>
        </Link>
        <div className="masthead__meta"><span className="source-state"><i /> Official-source monitor</span><CommandPalette /></div>
      </header>
      <div className="shell__body">
        <aside className="rail">
          <nav aria-label="Primary navigation">
            {primaryNavigation.map((item, index) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}><span>{String(index + 1).padStart(2, "0")}</span>{item.label}</Link>;
            })}
          </nav>
          <div className="rail__foot"><Link href="/legacy">Legacy G20 dashboard ↗</Link><p>World Bank · IMF · OECD<br />Release-aware, not falsely real-time.</p></div>
        </aside>
        <main id="main-content" tabIndex={-1}>{children}</main>
      </div>
    </div>
  );
}
