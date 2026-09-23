import { redirect } from 'next/navigation'
import { getAdminToken } from '../../../lib/adminSession'
import { fetchAuditLogAdmin } from '../../../lib/saasAdminApi'

const ACTION_LABEL: Record<string, string> = {
  'organization.publish_state_changed': 'Verein veröffentlicht/zurückgezogen',
  'camp.status_changed': 'Camp-Status geändert',
  'registration.cancelled': 'Anmeldung storniert',
  'registration.payment_status_changed': 'Zahlungsstatus geändert',
  'organization.member_assigned': 'Vereinsadmin zugewiesen',
  'organization.member_removed': 'Vereinsadmin entfernt',
}

/** CEO-Konsole: wer hat wann was geändert (Auftrag Paket B) — mindestens
 * Publish, Zahlungsstatus, Storno, Rollenänderungen, siehe die
 * write_audit_log-Aufrufe in app/routers/admin.py. Reine Anzeige, keine
 * Aktionen von hier aus. */
export default async function AuditLogPage() {
  const token = await getAdminToken()
  if (!token) redirect('/platform/login')

  const entries = await fetchAuditLogAdmin(token)

  return (
    <main className="mx-auto max-w-[1080px] px-4 py-10 pb-24 md:px-8 md:pb-10 xl:px-6">
      <h1 className="cp-title mb-1" style={{ color: 'var(--cp-ink)' }}>
        Änderungsverlauf
      </h1>
      <p className="cp-body mb-6" style={{ color: 'var(--cp-muted)' }}>
        {entries.length === 0 ? 'Noch keine protokollierten Änderungen.' : `${entries.length} Einträge, neueste zuerst.`}
      </p>

      {entries.length === 0 ? (
        <p
          className="cp-body rounded-[var(--cp-r-card)] border px-4 py-8 text-center"
          style={{ borderColor: 'var(--cp-line)', color: 'var(--cp-muted)' }}
        >
          Sobald jemand einen Verein veröffentlicht, eine Zahlung markiert, eine Anmeldung storniert oder einen
          Vereinsadmin zuweist, erscheint das hier.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map(entry => (
            <div
              key={entry.id}
              className="rounded-[var(--cp-r-card)] border px-4 py-3"
              style={{ borderColor: 'var(--cp-line)', background: 'var(--cp-surface)' }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="cp-subheading" style={{ color: 'var(--cp-ink)' }}>
                  {ACTION_LABEL[entry.action] ?? entry.action}
                </p>
                <p className="cp-chip" style={{ color: 'var(--cp-muted)' }}>
                  {new Date(entry.created_at).toLocaleString('de-DE')}
                </p>
              </div>
              <p className="cp-chip mt-1" style={{ color: 'var(--cp-muted)' }}>
                {entry.actor_email ?? 'Unbekannt'}
                {entry.target_id ? ` · ${entry.target_type ?? 'Ziel'}: ${entry.target_id}` : ''}
              </p>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
