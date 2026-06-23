import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server-side Supabase client for Server Components / data fetching. It reads
// the auth session from the request cookies so queries run as the logged-in
// user (RLS now requires an authenticated user). Setting cookies during a
// Server Component render isn't allowed, so setAll is a no-op there — the proxy
// gate is what refreshes the session cookie on each request.
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — safe to ignore; the proxy
            // refreshes the session.
          }
        },
      },
    }
  );
}
