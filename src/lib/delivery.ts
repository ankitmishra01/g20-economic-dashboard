import { serverEnv } from "@/lib/env";
export async function deliverBrief(input: { to: string; subject: string; html: string }) {
  const env = serverEnv();
  if (env.BRIEF_EMAIL_ENABLED !== "true" || !env.RESEND_API_KEY) return { status: "not_configured" as const };
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: "Global Economic Intelligence <briefs@updates.ankitmishra.ca>", ...input }) });
  if (!response.ok) throw new Error(`Brief provider rejected delivery (${response.status})`);
  return { status: "sent" as const, provider: "resend", result: await response.json() };
}
