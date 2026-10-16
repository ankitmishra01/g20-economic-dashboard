import { z } from "zod";

const optionalSecret = (minimum: number) => z.preprocess(
  (value) => value === "[SENSITIVE]" || value === "" ? undefined : value,
  z.string().min(minimum).optional(),
);

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20).optional(),
});

const serverSchema = publicSchema.extend({
  SUPABASE_URL: z.url().optional(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(20).optional(),
  SUPABASE_SERVICE_ROLE_KEY: optionalSecret(20),
  CRON_SECRET: optionalSecret(24),
  RESEND_API_KEY: optionalSecret(10),
  BRIEF_EMAIL_ENABLED: z.enum(["true", "false"]).default("false"),
});

export const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});

export const serverEnv = () => serverSchema.parse({
  ...publicEnv,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  CRON_SECRET: process.env.CRON_SECRET,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  BRIEF_EMAIL_ENABLED: process.env.BRIEF_EMAIL_ENABLED,
});
