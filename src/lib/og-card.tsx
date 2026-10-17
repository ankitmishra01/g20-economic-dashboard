import { ImageResponse } from "next/og";

// 1200x630 link-preview cards in the dashboard's hero style: ink background,
// Inter Tight headings, JetBrains Mono labels, the on-ink palette from styles/main.css.
export const OG_SIZE = { width: 1200, height: 630 };
const C = {
  ink: "#0A0A0A", ink2: "#171717", rule: "rgba(255,255,255,0.10)",
  text: "#F5F5F2", text2: "rgba(245,245,242,0.62)", text3: "rgba(245,245,242,0.40)",
  pos: "#6FCBA8", neg: "#F08F8F",
};

type FontDef = { name: string; data: ArrayBuffer; weight: 400 | 500 | 600 | 700; style: "normal" };
let fontCache: Promise<FontDef[]> | null = null;

async function loadGoogleFont(family: string, weight: number): Promise<ArrayBuffer | null> {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family}:wght@${weight}`)).text();
    const url = css.match(/url\((https:[^)]+\.ttf)\)/)?.[1];
    if (!url) return null;
    return await (await fetch(url)).arrayBuffer();
  } catch {
    return null;
  }
}

// Brand fonts when Google Fonts is reachable; the built-in font otherwise.
function fonts(): Promise<FontDef[]> {
  fontCache ??= (async () => {
    const [h, m] = await Promise.all([loadGoogleFont("Inter+Tight", 600), loadGoogleFont("JetBrains+Mono", 500)]);
    const out: FontDef[] = [];
    if (h) out.push({ name: "Inter Tight", data: h, weight: 600, style: "normal" });
    if (m) out.push({ name: "JetBrains Mono", data: m, weight: 500, style: "normal" });
    return out;
  })();
  return fontCache;
}

export interface Stat { label: string; value: string; sub?: string; tone?: "pos" | "neg" | null }

export interface CardInput {
  eyebrow: string;
  title: string;
  subtitle?: string | null;
  flagIso2?: string | null;
  stats: Stat[];
  footerLeft: string;
  footerRight: string;
}

function StatBox({ s }: { s: Stat }) {
  const color = s.tone === "pos" ? C.pos : s.tone === "neg" ? C.neg : C.text;
  return (
    <div style={{ display: "flex", flexDirection: "column", width: 260, padding: "18px 20px", borderLeft: `1px solid ${C.rule}` }}>
      <div style={{ display: "flex", fontFamily: "JetBrains Mono", fontSize: 17, letterSpacing: 1.5, color: C.text3, textTransform: "uppercase" }}>{s.label}</div>
      <div style={{ display: "flex", fontFamily: "Inter Tight", fontSize: 46, color, marginTop: 6 }}>{s.value}</div>
      {s.sub ? <div style={{ display: "flex", fontFamily: "JetBrains Mono", fontSize: 16, color: C.text2, marginTop: 4 }}>{s.sub}</div> : null}
    </div>
  );
}

export async function renderCard(input: CardInput): Promise<ImageResponse> {
  const rows = [input.stats.slice(0, 4), input.stats.slice(4, 8)].filter((r) => r.length);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: C.ink, color: C.text, padding: "44px 56px", fontFamily: "Inter Tight" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 54, height: 54, borderRadius: 10, background: C.text, color: C.ink, fontSize: 21, fontFamily: "Inter Tight" }}>G20</div>
            <div style={{ display: "flex", flexDirection: "column", marginLeft: 16 }}>
              <div style={{ display: "flex", fontSize: 26 }}>Monitor</div>
              <div style={{ display: "flex", fontFamily: "JetBrains Mono", fontSize: 15, color: C.text3, letterSpacing: 1.2 }}>GLOBAL ECONOMIC INTELLIGENCE</div>
            </div>
          </div>
          <div style={{ display: "flex", fontFamily: "JetBrains Mono", fontSize: 17, color: C.text2, border: `1px solid ${C.rule}`, borderRadius: 999, padding: "6px 16px" }}>{input.eyebrow}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", marginTop: 38 }}>
          {input.flagIso2 ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`https://flagcdn.com/w160/${input.flagIso2.toLowerCase()}.png`} width={96} height={64} style={{ borderRadius: 6, marginRight: 24, objectFit: "cover" }} alt="" />
          ) : null}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: input.title.length > 26 ? 56 : 68, lineHeight: 1.05 }}>{input.title}</div>
            {input.subtitle ? <div style={{ display: "flex", fontFamily: "JetBrains Mono", fontSize: 20, color: C.text2, marginTop: 10 }}>{input.subtitle}</div> : null}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 34 }}>
          {rows.map((r, i) => (
            <div key={i} style={{ display: "flex", borderTop: `1px solid ${C.rule}` }}>
              {r.map((s) => <StatBox key={s.label} s={s} />)}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flex: 1 }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "JetBrains Mono", fontSize: 16, color: C.text3, borderTop: `1px solid ${C.rule}`, paddingTop: 14 }}>
          <div style={{ display: "flex" }}>{input.footerLeft}</div>
          <div style={{ display: "flex", color: C.text2 }}>{input.footerRight}</div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: await fonts(),
      headers: { "cache-control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" },
    },
  );
}
