'use client'

import { useActionState, useState } from 'react'
import type { PlatformOwner } from '../../../lib/saasAdminApi'
import { addPlatformOwnerAction, removePlatformOwnerAction, type TeamActionState } from './teamActions'

const initialState: TeamActionState = { error: null, notice: null }

const BUTTON =
  'cp-focus cp-chip inline-flex min-h-11 items-center justify-center rounded-[var(--cp-r-chip)] border px-4 disabled:opacity-50'

function Feedback({ state }: { state: TeamActionState }) {
  if (state.error) {
    return (
      <p className="cp-chip mt-2" style={{ color: 'var(--cp-error)' }} role="alert">
        {state.error}
      </p>
    )
  }
  if (state.notice) {
    return (
      <p className="cp-chip mt-2" style={{ color: 'var(--cp-ink)' }} role="status">
        {state.notice}
      </p>
    )
  }
  return null
}

function OwnerRow({ owner, onlyOwner, first }: { owner: PlatformOwner; onlyOwner: boolean; first: boolean }) {
  const [confirming, setConfirming] = useState(false)
  const [state, formAction, pending] = useActionState(removePlatformOwnerAction, initialState)
  const label = owner.email ?? owner.user_id

  return (
    <li className="px-4 py-3" style={first ? undefined : { borderTop: '1px solid var(--cp-line)' }}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="cp-body break-all" style={{ color: 'var(--cp-ink)' }}>
            {label}
            {owner.is_self && (
              <span className="cp-chip ml-2" style={{ color: 'var(--cp-muted)' }}>
                (du)
              </span>
            )}
          </p>
          <p className="cp-chip mt-1" style={{ color: 'var(--cp-muted)' }}>
            Plattform-Owner · alle Vereine
            {owner.organizations.length > 0 &&
              ` · zusätzlich Vereinsadmin: ${owner.organizations.map(org => org.name).join(', ')}`}
          </p>
          <p className="cp-chip mt-1" style={{ color: 'var(--cp-muted)' }}>
            seit {new Date(owner.created_at).toLocaleDateString('de-DE')}
          </p>
        </div>

        {onlyOwner ? (
          <p className="cp-chip sm:max-w-[200px] sm:text-right" style={{ color: 'var(--cp-muted)' }}>
            Letzter Plattform-Owner, kann nicht entfernt werden.
          </p>
        ) : confirming ? (
          <form action={formAction} className="flex flex-wrap gap-2">
            <input type="hidden" name="user_id" value={owner.user_id} />
            <input type="hidden" name="label" value={label} />
            <button
              type="submit"
              disabled={pending}
              className={BUTTON}
              style={{ borderColor: 'var(--cp-error)', color: 'var(--cp-error)' }}
            >
              {pending ? 'Wird entzogen …' : owner.is_self ? 'Mir selbst entziehen' : 'Zugang entziehen'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className={BUTTON}
              style={{ borderColor: 'var(--cp-field-line)', color: 'var(--cp-ink)' }}
            >
              Abbrechen
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className={BUTTON}
            style={{ borderColor: 'var(--cp-field-line)', color: 'var(--cp-error)' }}
          >
            Entziehen
          </button>
        )}
      </div>
      <Feedback state={state} />
    </li>
  )
}

/** Plattform-Admins anzeigen, bestehende Konten hinzufügen, Zugang entziehen.
 * Reine Bedienung: jede Berechtigung prüft das Backend. */
export default function TeamSection({ owners }: { owners: PlatformOwner[] }) {
  const [state, formAction, pending] = useActionState(addPlatformOwnerAction, initialState)
  const onlyOwner = owners.length <= 1

  return (
    <>
      <section className="mb-8">
        <h2 className="cp-heading mb-3" style={{ color: 'var(--cp-ink)' }}>
          Plattform-Admins ({owners.length})
        </h2>
        <ul className="rounded-[var(--cp-r-card)] border" style={{ borderColor: 'var(--cp-line)', background: 'var(--cp-surface)' }}>
          {owners.map((owner, i) => (
            <OwnerRow key={owner.user_id} owner={owner} onlyOwner={onlyOwner} first={i === 0} />
          ))}
        </ul>
      </section>

      <section>
        <h2 className="cp-heading mb-1" style={{ color: 'var(--cp-ink)' }}>
          Plattform-Admin hinzufügen
        </h2>
        <p className="cp-chip mb-3 max-w-[640px]" style={{ color: 'var(--cp-muted)' }}>
          Nur für bestehende Konten, die sich schon einmal angemeldet haben. Es wird kein Konto angelegt und keine
          E-Mail verschickt. Bestehende Vereinszugänge bleiben erhalten.
        </p>
        <form action={formAction} className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="platform-owner-email" className="sr-only">
            E-Mail-Adresse des Kontos
          </label>
          <input
            id="platform-owner-email"
            type="email"
            name="email"
            required
            autoComplete="off"
            placeholder="name@campspilot.app"
            className="cp-body min-h-11 w-full flex-1 rounded-[var(--cp-r-field)] border px-3 py-2 sm:min-w-[240px]"
            style={{ borderColor: 'var(--cp-field-line)' }}
          />
          <button
            type="submit"
            disabled={pending}
            className={BUTTON}
            style={{ borderColor: 'var(--cp-field-line)', color: 'var(--cp-ink)' }}
          >
            {pending ? 'Wird vergeben …' : 'Zugang vergeben'}
          </button>
        </form>
        <Feedback state={state} />
      </section>
    </>
  )
}
