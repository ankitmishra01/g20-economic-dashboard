"use client";
import { useCallback, useEffect, useState } from "react";

type MarketPayload = { data: Array<{ key: string; label: string; value: number; suffix?: string; date: string; source: string }>; meta: { checkedAt: string; partial: boolean } };

export function LiveMarketRail() {
  const [payload, setPayload] = useState<MarketPayload | null>(null); const [status, setStatus] = useState("Connecting");
  const refresh = useCallback(async () => { try { const response = await fetch("/api/v1/market", { cache: "no-store" }); if (!response.ok) throw new Error(); const next = await response.json() as MarketPayload; setPayload(next); setStatus(next.meta.partial ? "Partial update" : "Live check complete"); } catch { setStatus("Source temporarily unavailable"); } }, []);
  useEffect(() => { const initial = window.setTimeout(() => void refresh(), 0); const timer = window.setInterval(() => void refresh(), 300_000); return () => { window.clearTimeout(initial); window.clearInterval(timer); }; }, [refresh]);
  return <section className="market-rail" aria-live="polite" aria-label="Live official market references"><header><div><p className="eyebrow"><i /> {status}</p><h2>Official market references</h2></div><p>Official daily reference data, not tick-by-tick prices. Checked every five minutes{payload?.meta.checkedAt ? ` · ${new Date(payload.meta.checkedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}.</p></header><div className="market-rail__values">{payload?.data.map((item) => <article key={item.key}><span>{item.label}</span><strong>{item.value.toLocaleString(undefined, { maximumFractionDigits: item.key === "DGS10" ? 2 : 4 })}{item.suffix}</strong><small>{item.date} · {item.source}</small></article>) ?? <article><span>Connecting to ECB and FRED</span><strong>—</strong><small>Waiting for official-source response</small></article>}</div></section>;
}
