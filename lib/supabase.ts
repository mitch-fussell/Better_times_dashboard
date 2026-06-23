import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client used by client components (logging check-ins,
// managing categories, signing in/out). createBrowserClient stores the auth
// session in cookies so the server (data fetch + proxy gate) can read it too.
// Only import this from "use client" components.
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
