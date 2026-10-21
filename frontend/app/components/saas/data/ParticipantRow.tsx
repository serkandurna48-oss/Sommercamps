'use client'

import Button from '../ui/Button'
import { useId, useState } from 'react'
import { paymentStatusLabel, registrationStatusLabel } from '../../../lib/i18n/de'
import type { RegistrationAdmin } from '../../../lib/saasAdminApi'
import { birthYear, hasNotes } from '../commandCenterLogic'
import ParticipantDetail from './ParticipantDetail'
import StatusChip, { PAYMENT_STATUS_TONE, REGISTRATION_STATUS_TONE } from './StatusChip'
import { IconChevronDown } from '../icons'
import { computeBrandTokens } from '../brandPipeline'
import { registrationDate } from '../registrationDates'

export default function ParticipantRow({
  registration,
  selected,
  onToggleSelect,
  brandColor,
  orgSlug,
  campSlug,
  campTitle,
}: {
  registration: RegistrationAdmin
  selected: boolean
  onToggleSelect: () => void
  brandColor: string
  orgSlug: string
  campSlug: string
  campTitle: string
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
    <div className="cp-roster-row border-t" style={{ borderColor: 'var(--cp-line-2)' }}>
      <div className="flex items-center gap-3 px-5 py-3.5">
        {/* Checkbox outside the expand trigger — click does not bubble to row */}
        <label className="inline-flex min-h-[44px] min-w-[44px] shrink-0 cursor-pointer items-center justify-center">
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
          className="min-w-0 flex-1 text-left"
        >
          {/*
           * Mobile: relative container, arrow absolute-right; pr-8 keeps text clear.
           * Desktop (md): 5-column grid — name, parent, reg-chip, pay-chip, arrow.
           * md:contents on the chips wrapper makes the two chips direct grid children.
           */}
          <div className="relative cp-admin-row [--cp-row-cols:1fr] md:[--cp-row-cols:minmax(0,2fr)_minmax(0,1fr)_auto_auto_auto] gap-y-1.5 md:gap-y-0 pr-8 md:pr-0">
            {/* Col 1: Kind-Name + Jg. + Hinweis-Badge */}
            <p className="cp-subheading min-w-0 truncate" style={{ color: 'var(--cp-ink)' }}>
              {effective.child_first_name} {effective.child_last_name}
              <span className="cp-num ml-1.5" style={{ color: 'var(--cp-muted)' }}>
                ({birthYear(effective.child_birth_date)})
              </span>
              {hasNotes(effective) && (
                <span className="cp-chip ml-2" style={{ color: 'var(--cp-info)' }}>
                  Hinweis
                </span>
              )}
            </p>

            {/* Col 2: Elternteil-Name */}
            <p className="cp-chip min-w-0 truncate" style={{ color: 'var(--cp-muted)' }}>
              {registration.parent_first_name} {registration.parent_last_name}
              <span className="cp-label mt-1 block whitespace-normal">Eingang: <time dateTime={registration.created_at}>{registrationDate(registration.created_at)}</time></span>
            </p>

            {/* Cols 3+4: Status-Chips; md:contents makes them direct grid children */}
            <div className="flex flex-wrap gap-2 md:contents">
              <StatusChip
                tone={REGISTRATION_STATUS_TONE[effective.status] ?? 'neutral'}
                label={registrationStatusLabel[effective.status] ?? effective.status}
                dot
              />
              <StatusChip
                tone={PAYMENT_STATUS_TONE[effective.payment_status] ?? 'neutral'}
                label={paymentStatusLabel[effective.payment_status] ?? effective.payment_status}
              />
            </div>

            {/* Col 5 on desktop; absolute top-right on mobile */}
            <IconChevronDown
              className={`absolute right-0 top-1/2 -translate-y-1/2 shrink-0 text-[var(--cp-ink-2)] transition-transform motion-reduce:transition-none md:static md:translate-y-0 ${open ? 'rotate-180' : ''}`}
            />
          </div>
        </Button>
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
