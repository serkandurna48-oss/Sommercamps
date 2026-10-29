'use client'

import { useActionState } from 'react'
import type { OrganizationMember } from '../../../lib/saasAdminApi'
import { addOrganizationMemberAction, removeOrganizationMemberAction, type AddMemberState } from './memberActions'

const initialState: AddMemberState = { error: null, notice: null }

/** Vereinsadmins einladen/entfernen — owner-only. Neue Adressen bekommen
 * eine Einladung, bestehende Konten werden zugewiesen und informiert. */
export default function MembersSection({ orgSlug, members }: { orgSlug: string; members: OrganizationMember[] }) {
  const boundAction = addOrganizationMemberAction.bind(null, orgSlug)
  const [state, formAction, pending] = useActionState(boundAction, initialState)

  return (
    <section className="mb-8">
      <h2 className="cp-heading mb-3" style={{ color: 'var(--cp-ink)' }}>
        Vereinsadmins
      </h2>
      <p className="cp-chip mb-3" style={{ color: 'var(--cp-muted)' }}>
        Wer neben dir diesen Verein verwalten darf. Neue Adressen bekommen eine Einladung per E-Mail,
        bestehende Konten erhalten sofort Zugriff.
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
          aria-label="E-Mail-Adresse des Vereinsadmins"
          className="cp-body min-w-[240px] flex-1 rounded-[var(--cp-r-field)] border px-3 py-2"
          style={{ borderColor: 'var(--cp-field-line)' }}
        />
        <button
          type="submit"
          disabled={pending}
          className="cp-chip rounded-[var(--cp-r-chip)] border px-4 py-2 disabled:opacity-50"
          style={{ borderColor: 'var(--cp-field-line)', color: 'var(--cp-ink)' }}
        >
          {pending ? 'Wird eingeladen …' : 'Einladen'}
        </button>
      </form>
      {state.error && (
        <p className="cp-chip mt-2" style={{ color: 'var(--cp-error)' }} role="alert">
          {state.error}
        </p>
      )}
      {state.notice && (
        <p className="cp-chip mt-2" style={{ color: 'var(--cp-ink)' }} role="status">
          {state.notice}
        </p>
      )}
    </section>
  )
}
