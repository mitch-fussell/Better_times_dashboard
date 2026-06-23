import { createClient } from "@supabase/supabase-js";

// Single client used both on the server (initial data fetch) and in the
// browser (logging new check-ins). RLS currently allows the anon role full
// access — tighten this once auth is added.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } }
);
