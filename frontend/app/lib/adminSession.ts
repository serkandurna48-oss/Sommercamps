/**
 * Platform-admin session — a single httpOnly cookie holding the JWT from
 * backend_saas's POST /admin/login. Minimal on purpose (Richtung-C Auftrag
 * Abschnitt 1 schließt Login/Rollen/Berechtigungen aus diesem Ticket aus,
 * siehe Frage 2 der Bestandsaufnahme): kein Refresh, keine Rollen, ein
 * Token pro Browser, gültig für jede Organisation (kein organization_members
 * im Backend). Betrifft ausschließlich die neuen Org-Admin-Screens unter
 * /pilot/[org]/(org-admin) — nie die öffentliche Eltern-Ansicht.
 */
import { cookies } from 'next/headers'

export const ADMIN_TOKEN_COOKIE = 'cp_admin_token'

export async function getAdminToken(): Promise<string | null> {
  const store = await cookies()
  return store.get(ADMIN_TOKEN_COOKIE)?.value ?? null
}
