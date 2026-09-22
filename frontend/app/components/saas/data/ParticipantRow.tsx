'use client'

import { useId, useState } from 'react'
import { paymentStatusLabel } from '../../../lib/i18n/de'
import type { RegistrationAdmin } from '../../../lib/saasAdminApi'
import { birthYear, hasNotes } from '../commandCenterLogic'
import ParticipantDetail from './ParticipantDetail'
import StatusChip from './StatusChip'
import type { StatusTone } from './StatusChip'

const PAYMENT_TONE: Record<string, StatusTone> = {
  open: 'pending',
  paid: 'ok',
  refunded: 'info',
  waived: 'info',
  cancelled: 'neutral',
}

/** Steuert ihren eigenen offen/zu-Zustand (Abschnitt 5). M3: Inline-Detail
 * wächst per .cp-collapse (dieselbe Technik wie M1, siehe tokens.css),
 * Inhalt blendet mit 60ms Versatz ein (Abschnitt 7). */
export default function ParticipantRow({
  registration,
  selected,
  onToggleSelect,
  brandColor,
}: {
  registration: RegistrationAdmin
  selected: boolean
  onToggleSelect: () => void
  brandColor: string
}) {
  const [open, setOpen] = useState(false)
  const detailId = useId()

  return (
    <div className="border-t" style={{ borderColor: 'var(--cp-line-2)' }}>
      <div className="flex flex-wrap items-center gap-4 px-5 py-4">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          aria-label={`${registration.child_first_name} ${registration.child_last_name} auswählen`}
          className="h-5 w-5 shrink-0"
          style={{ accentColor: brandColor }}
        />

        <div className="min-w-0 flex-1">
          <p className="cp-subheading" style={{ color: 'var(--cp-ink)' }}>
            {registration.child_first_name} {registration.child_last_name}
            <span className="cp-num ml-1.5" style={{ color: 'var(--cp-muted)' }}>
              ({birthYear(registration.child_birth_date)})
            </span>
          </p>
          <p className="cp-chip mt-0.5" style={{ color: 'var(--cp-muted)' }}>
            {registration.parent_first_name} {registration.parent_last_name} · {registration.parent_email}
          </p>
        </div>

        {hasNotes(registration) && (
          <span className="cp-chip" style={{ color: 'var(--cp-info)' }} title="Allergien oder Hinweise hinterlegt">
            Hinweis
          </span>
        )}

        <StatusChip tone={PAYMENT_TONE[registration.payment_status] ?? 'neutral'} label={paymentStatusLabel[registration.payment_status] ?? registration.payment_status} />

        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          aria-expanded={open}
          aria-controls={detailId}
          aria-label={open ? 'Details schließen' : 'Details öffnen'}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--cp-r-chip)] transition-transform motion-reduce:transition-none focus-visible:outline focus-visible:outline-2"
          style={{ transform: open ? 'rotate(180deg)' : 'none', outlineColor: brandColor }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 6l4 4 4-4" stroke="var(--cp-ink-2)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <div id={detailId} className={`cp-collapse cp-collapse-m3 motion-reduce:transition-none ${open ? 'cp-collapse-expanded' : ''}`}>
        <div>
          <div
            className="transition-opacity delay-[60ms] duration-150 motion-reduce:transition-none motion-reduce:delay-0"
            style={{ opacity: open ? 1 : 0 }}
          >
            <ParticipantDetail registration={registration} />
          </div>
        </div>
      </div>
    </div>
  )
}
