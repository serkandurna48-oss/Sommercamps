/**
 * Platform-admin session — a single httpOnly cookie holding the JWT from
 * backend_saas's POST /admin/login. Minimal on purpose (Richtung-C Auftrag
 * Abschnitt 1 schließt Login/Rollen/Berechtigungen aus diesem Ticket aus,
 * siehe Frage 2 der Bestandsaufnahme): kein Refresh, keine Rollen, ein
 * Token pro Browser, gültig für jede Organisation (kein organization_members
 * im Backend) UND für die Plattform-Konsole (/platform) — dieselbe
 * Admin-Identität, ein Login reicht für beides. Cookie-Pfad ist deshalb
 * "/" (nicht auf /pilot beschränkt), siehe pilot/[org]/login/actions.ts
 * und platform/login/actions.ts, die beide denselben Cookie setzen. Betrifft
 * nie die öffentliche Eltern-Ansicht unter /pilot/[org] selbst.
 */
import { cookies } from 'next/headers'

export const ADMIN_TOKEN_COOKIE = 'cp_admin_token'

export async function getAdminToken(): Promise<string | null> {
  const store = await cookies()
  return store.get(ADMIN_TOKEN_COOKIE)?.value ?? null
}
