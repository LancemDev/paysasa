import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

// A placeholder URL keeps createClient from throwing when env is missing; the app shows a config screen instead.
export const supabase = createClient(
  env.supabaseUrl || "http://localhost:54321",
  env.supabaseAnonKey || "missing-anon-key",
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
);
