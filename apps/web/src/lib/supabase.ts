import { createClient } from "@supabase/supabase-js";

export function createBrowserSupabaseClient() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required for web auth.",
    );
  }

  const parsedUrl = new URL(supabaseUrl);
  const hostname = parsedUrl.hostname.toLowerCase();

  if (
    hostname === "127.0.0.1" ||
    hostname === "localhost" ||
    !hostname.endsWith(".supabase.co")
  ) {
    throw new Error(
      "VITE_SUPABASE_URL must point to your Supabase project host, for example https://<project-ref>.supabase.co.",
    );
  }

  return createClient(supabaseUrl, supabaseAnonKey);
}
