'use client'

import { useActionState } from 'react'
import type { OrganizationMember } from '../../../lib/saasAdminApi'
import { addOrganizationMemberAction, removeOrganizationMemberAction, type AddMemberState } from './memberActions'

const initialState: AddMemberState = { error: null }

/** Vereinsadmins zuweisen/entfernen (Auftrag Paket B) — owner-only Aktion,
 * kein Einladungs-Flow. Das Konto muss vorher per
 * scripts/create_platform_user.py angelegt worden sein; eine unbekannte
 * E-Mail liefert eine konkrete Fehlermeldung statt eines stillen
 * Fehlschlags. */
export default function MembersSection({ orgSlug, members }: { orgSlug: string; members: OrganizationMember[] }) {
  const boundAction = addOrganizationMemberAction.bind(null, orgSlug)
  const [state, formAction, pending] = useActionState(boundAction, initialState)

  return (
    <section className="mb-8">
      <h2 className="cp-heading mb-3" style={{ color: 'var(--cp-ink)' }}>
        Vereinsadmins
      </h2>
      <p className="cp-chip mb-3" style={{ color: 'var(--cp-muted)' }}>
        Wer neben dir diesen Verein verwalten darf. Das Konto muss bereits existieren (siehe
        scripts/create_platform_user.py) — es wird keine Einladungs-E-Mail verschickt.
      </p>

      {members.length === 0 ? (
        <p
          className="cp-body mb-3 rounded-[var(--cp-r-card)] border px-4 py-4"
          style={{ borderColor: 'var(--cp-line)', color: 'var(--cp-muted)' }}
        >
          Noch kein eigener Vereinsadmin zugewiesen — nur du (Plattform-Betreiber) siehst diesen Verein.
        </p>
      ) : (
        <div className="mb-3 rounded-[var(--cp-r-card)] border" style={{ borderColor: 'var(--cp-line)', background: 'var(--cp-surface)' }}>
          {members.map((member, i) => (
            <div
              key={member.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
              style={i > 0 ? { borderTop: '1px solid var(--cp-line)' } : undefined}
            >
              <span className="cp-body" style={{ color: 'var(--cp-ink)' }}>
                {member.email ?? member.user_id}
              </span>
              <form action={removeOrganizationMemberAction.bind(null, orgSlug, member.id)}>
                <button type="submit" className="cp-chip" style={{ color: 'var(--cp-error)' }}>
                  Entfernen
                </button>
              </form>
            </div>
          ))}
        </div>
      )}

      <form action={formAction} className="flex flex-wrap gap-2">
        <input
          type="email"
          name="email"
          required
          placeholder="admin@verein.example"
          className="cp-body min-w-[240px] flex-1 rounded-[var(--cp-r-field)] border px-3 py-2"
          style={{ borderColor: 'var(--cp-field-line)' }}
        />
        <button
          type="submit"
          disabled={pending}
          className="cp-chip rounded-[var(--cp-r-chip)] border px-4 py-2 disabled:opacity-50"
          style={{ borderColor: 'var(--cp-field-line)', color: 'var(--cp-ink)' }}
        >
          {pending ? 'Wird zugewiesen …' : 'Als Vereinsadmin zuweisen'}
        </button>
      </form>
      {state.error && (
        <p className="cp-chip mt-2" style={{ color: 'var(--cp-error)' }} role="alert">
          {state.error}
        </p>
      )}
    </section>
  )
}
