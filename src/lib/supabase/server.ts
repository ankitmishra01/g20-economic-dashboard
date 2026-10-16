import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { serverEnv } from "@/lib/env";

export async function createSupabaseServerClient() {
  const env = serverEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  const store = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (values) => values.forEach(({ name, value, options }) => store.set(name, value, options)),
    },
  });
}
