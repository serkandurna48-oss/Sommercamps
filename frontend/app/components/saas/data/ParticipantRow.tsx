'use client'

import Button from '../ui/Button'
import ListRow from '../ui/ListRow'
import { useId, useState } from 'react'
import { paymentStatusLabel, registrationStatusLabel } from '../../../lib/i18n/de'
import type { RegistrationAdmin } from '../../../lib/saasAdminApi'
import { birthYear, hasNotes } from '../commandCenterLogic'
import ParticipantDetail from './ParticipantDetail'
import StatusChip, { PAYMENT_STATUS_TONE, REGISTRATION_STATUS_TONE } from './StatusChip'
import { IconChevronDown } from '../icons'
import { computeBrandTokens } from '../brandPipeline'
import { registrationDate } from '../registrationDates'
import RowOverflow from '../ui/RowOverflow'

export default function ParticipantRow({
  registration,
  selected,
  onToggleSelect,
  brandColor,
  orgSlug,
  campSlug,
  campTitle,
  campDate,
}: {
  registration: RegistrationAdmin
  selected: boolean
  onToggleSelect: () => void
  brandColor: string
  orgSlug: string
  campSlug: string
  campTitle: string
  campDate?: string
}) {
  const [open, setOpen] = useState(false)
  const [override, setOverride] = useState<RegistrationAdmin | null>(null)
  const [previousRegistration, setPreviousRegistration] = useState(registration)
  if (registration !== previousRegistration) {
    setPreviousRegistration(registration)
    setOverride(null)
  }
  const detailId = useId()
  const effective = override ?? registration
  const brand = computeBrandTokens(brandColor)

  return (
    <div className="cp-roster-row cp-mobile-card cp-participant-card border-t" style={{ borderColor: 'var(--cp-line-2)' }}>
      <div className="cp-participant-card-top flex items-center gap-3 px-5 py-3.5">
        {/* Checkbox outside the expand trigger — click does not bubble to row */}
        <label className="cp-desktop-only inline-flex min-h-[44px] min-w-[44px] shrink-0 cursor-pointer items-center justify-center">
          <span className="sr-only">{effective.child_first_name} {effective.child_last_name} auswählen</span>
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            className="cp-focus h-5 w-5 shrink-0"
            style={{ accentColor: brand.brandStrong }}
          />
        </label>

        {/* Entire summary is one expand button: name, parent, chips, arrow */}
        <Button
          type="button"
          onClick={() => setOpen(v => !v)}
          aria-expanded={open}
          aria-controls={detailId}
          className="cp-participant-trigger min-w-0 flex-1 text-left"
          style={{ border: '1px solid transparent' }}
        >
          <ListRow className="cp-participant-summary" main={<p className="cp-subheading min-w-0 truncate" style={{ color: 'var(--cp-ink)' }}>
              {effective.child_first_name} {effective.child_last_name}
              <span className="cp-num ml-1.5" style={{ color: 'var(--cp-muted)' }}>
                ({birthYear(effective.child_birth_date)})
              </span>
              {hasNotes(effective) && (
                <span className="cp-chip ml-2" style={{ color: 'var(--cp-info)' }}>
                  Hinweis
                </span>
              )}
            </p>} secondary={<p className="cp-chip min-w-0 truncate" style={{ color: 'var(--cp-muted)' }}>
              <span className="cp-mobile-only cp-camp-date">{campTitle}{campDate && ` · ${campDate}`}</span>
              {registration.parent_first_name} {registration.parent_last_name}
              <span className="cp-label mt-1 block whitespace-normal">Eingang: <time dateTime={registration.created_at}>{registrationDate(registration.created_at)}</time></span>
            </p>} status={<div className="cp-participant-status">
              <StatusChip
                tone={REGISTRATION_STATUS_TONE[effective.status] ?? 'neutral'}
                label={registrationStatusLabel[effective.status] ?? effective.status}
                dot
              />
              <StatusChip
                tone={PAYMENT_STATUS_TONE[effective.payment_status] ?? 'neutral'}
                label={paymentStatusLabel[effective.payment_status] ?? effective.payment_status}
              />
            </div>} action={<IconChevronDown
              className={`shrink-0 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
            />} />
          <span className="cp-mobile-only cp-mobile-primary">{open ? 'Details schließen' : 'Details anzeigen'}</span>
        </Button>
        <div className="cp-mobile-only cp-participant-more">
          <RowOverflow label={`Weitere Aktionen für ${effective.child_first_name} ${effective.child_last_name}`}>
            <Button type="button" aria-pressed={selected} onClick={onToggleSelect}>{selected ? 'Auswahl aufheben' : 'Für Sammelaktion auswählen'}</Button>
            <a href={`mailto:${effective.parent_email}`}>Eltern kontaktieren</a>
          </RowOverflow>
        </div>
      </div>

      <div id={detailId} inert={!open} aria-hidden={!open} className={`cp-collapse cp-collapse-m3 motion-reduce:transition-none ${open ? 'cp-collapse-expanded' : ''}`}>
        <div>
          <div
            className="transition-opacity delay-[60ms] duration-150 motion-reduce:transition-none motion-reduce:delay-0"
            style={{ opacity: open ? 1 : 0 }}
          >
            <ParticipantDetail
              registration={effective}
              orgSlug={orgSlug}
              campSlug={campSlug}
              campTitle={campTitle}
              brandStrong={brand.brandStrong}
              brandOn={brand.brandOn}
              onDetailsSaved={setOverride}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
