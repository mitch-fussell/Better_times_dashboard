import { createClient } from "@supabase/supabase-js";

// Service-role Supabase client for trusted, server-only background jobs (the
// digest cron) that run with NO logged-in user. The service-role key bypasses
// RLS, so this must ONLY ever be imported from server code (route handlers,
// server actions) and NEVER shipped to the browser. The regular per-request
// client in supabase-server.ts stays user-scoped for the app itself.
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — the digest job needs the service-role key to read data without a user session."
    );
  }
  return createClient(url, key, {
    // A one-shot job: no session to persist or refresh.
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
