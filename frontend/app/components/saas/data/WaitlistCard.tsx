import { de } from '../../../lib/i18n/de'
import type { RegistrationAdmin } from '../../../lib/saasAdminApi'
import { promoteWaitlistAction } from '../actions/waitlistActions'
import ActionForm from '../ui/ActionForm'
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
  brandColor,
  brandStrong,
  brandOn,
  showCampTitle = false,
}: {
  orgSlug: string
  campSlug: string
  campTitle: string
  waitlisted: RegistrationAdmin[]
  brandColor: string
  brandStrong: string
  brandOn: string
  showCampTitle?: boolean
}) {
  const promote = promoteWaitlistAction.bind(null, orgSlug, campSlug)

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
        <ActionForm
          action={promote}
          label={de.waitlistPage.promote}
          pendingLabel={de.waitlistPage.promoting}
          variant="primary"
          brandStrong={brandStrong}
          brandOn={brandOn}
        />
      </div>
      <div className="cp-roster" style={{ borderLeft: `3px solid ${brandColor}` }}>
        {waitlisted.map((r, i) => (
          <WaitlistRow key={r.id} registration={r} position={i + 1} />
        ))}
      </div>
    </div>
  )
}
