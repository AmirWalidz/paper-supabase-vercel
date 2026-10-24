import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";
import { supabaseConfig } from "./config";

export function browserClient() {
  const config = supabaseConfig();
  if (!config)
    throw new Error(
      "Orbit needs its Supabase URL and publishable key. See the README setup steps.",
    );
  return createBrowserClient<Database>(config.url, config.key);
}
