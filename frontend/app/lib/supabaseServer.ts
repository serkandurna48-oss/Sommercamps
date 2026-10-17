/**
 * Server-side Supabase Auth client (feat/platform-foundation) — used only
 * by the two login server actions (platform/login/actions.ts,
 * pilot/[org]/login/actions.ts) to exchange email+password for a session,
 * then we store just the access_token ourselves (see lib/adminSession.ts's
 * existing httpOnly cookie) rather than keeping a live Supabase client
 * session server-side. `persistSession`/`autoRefreshToken` are both off:
 * a Next.js server action is a one-shot request handler, not a long-lived
 * process that could use Supabase's own session-refresh machinery — our
 * own cookie's maxAge (session.expires_in) is the only expiry that matters
 * here, and app/auth_deps.py on the backend re-verifies the token against
 * Supabase on every request anyway (see backend_saas/app/supabase_auth.py).
 *
 * NEXT_PUBLIC_* naming (not a private-only var) is intentional even though
 * this file only runs server-side today: the anon key is safe to expose to
 * a browser by design (Supabase's own model — it's paired with RLS, not a
 * secret), and using the same public var name here as a future
 * client-side Supabase usage would need avoids a second, differently-named
 * env var for the identical value.
 */
import { createClient } from '@supabase/supabase-js'

export function getSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY not configured — see frontend/.env.local.example',
    )
  }
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
