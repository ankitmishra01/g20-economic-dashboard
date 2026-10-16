import { z } from "zod";

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20).optional(),
});

const serverSchema = publicSchema.extend({
  SUPABASE_URL: z.url().optional(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(20).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  CRON_SECRET: z.string().min(24).optional(),
  RESEND_API_KEY: z.string().min(10).optional(),
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
