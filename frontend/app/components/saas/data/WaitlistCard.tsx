'use client'

import { de, formatEuro } from '../../../lib/i18n/de'
import type { RegistrationAdmin } from '../../../lib/saasAdminApi'
import { promoteWaitlistAction } from '../actions/waitlistActions'
import ActionForm from '../ui/ActionForm'
import { useRegistrationActionFeedback } from '../ui/RegistrationActionFeedback'
import WaitlistRow from './WaitlistRow'

/**
 * Eine Warteliste (ein Camp) — die eine "Nächste Familie aufrücken"-Aktion
 * sitzt am Kopf der Karte, nicht neben Platz 1, damit unmissverständlich
 * ist: es gibt nur eine sinnvolle Reihenfolge, kein wählbares Ziel
 * (backend_saas promotet immer FIFO, nie einen vom Aufrufer gewählten
 * Datensatz).
 */
export default function WaitlistCard({
  orgSlug,
  campSlug,
  campTitle,
  waitlisted,
  capacity,
  registeredCount,
  priceCents,
  currency,
  brandColor,
  brandStrong,
  brandOn,
  showCampTitle = false,
}: {
  orgSlug: string
  campSlug: string
  campTitle: string
  waitlisted: RegistrationAdmin[]
  capacity: number
  registeredCount: number
  priceCents: number
  currency: string
  brandColor: string
  brandStrong: string
  brandOn: string
  showCampTitle?: boolean
}) {
  const promote = promoteWaitlistAction.bind(null, orgSlug, campSlug)
  const reportResult = useRegistrationActionFeedback()
  const next = waitlisted[0]
  const childName = next ? `${next.child_first_name} ${next.child_last_name}` : ''

  return (
    <div>
      <div
        className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"
        style={{ background: 'var(--cp-surface-2)', borderLeft: `3px solid ${brandColor}` }}
      >
        <div>
          {showCampTitle && (
            <p className="cp-subheading" style={{ color: 'var(--cp-ink)' }}>
              {campTitle}
            </p>
          )}
          <p className="cp-chip mt-0.5" style={{ color: 'var(--cp-muted)' }}>
            {de.waitlistPage.familiesWaiting(waitlisted.length)}
          </p>
        </div>
        <div className="flex flex-col items-start gap-1">
          {next && (registeredCount >= capacity ? (
            <p className="cp-body" style={{ color: 'var(--cp-muted)' }}>{de.waitlistPage.promoteNoCapacity}</p>
          ) : <ActionForm
            action={promote}
            onResult={reportResult}
            label={de.waitlistPage.promote(childName)}
            pendingLabel={de.waitlistPage.promoting}
            variant="primary"
            brandStrong={brandStrong}
            brandOn={brandOn}
            requireConfirm={<>
              <p className="cp-subheading">Platz an {childName} für {campTitle} vergeben?</p>
              <p>Preis: {formatEuro(priceCents, currency)}</p>
              <p>Eltern werden nicht automatisch benachrichtigt. Bitte informiere die Eltern nach der Platzvergabe.</p>
            </>}
          />)}
          {next && registeredCount < capacity && <p className="cp-chip" style={{ color: 'var(--cp-muted)' }}>
            {de.waitlistPage.promoteHint}
          </p>}
        </div>
      </div>
      <div className="cp-roster" style={{ borderLeft: `3px solid ${brandColor}` }}>
        {waitlisted.map((r, i) => (
          <WaitlistRow key={r.id} registration={r} position={i + 1} />
        ))}
      </div>
    </div>
  )
}
