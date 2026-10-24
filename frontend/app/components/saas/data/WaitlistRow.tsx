import { de, formatDate, waitingSince } from '../../../lib/i18n/de'
import type { RegistrationAdmin } from '../../../lib/saasAdminApi'
import { birthYear } from '../commandCenterLogic'
import ListRow from '../ui/ListRow'
import StatusChip from './StatusChip'
import RowOverflow from '../ui/RowOverflow'
import { ButtonLink } from '../ui/Button'

export default function WaitlistRow({ registration, position, campTitle, campDate, campHref }: {
  registration: RegistrationAdmin; position: number; campTitle?: string; campDate?: string; campHref?: string
}) {
  return <div className="cp-roster-row cp-mobile-card border-t" style={{ borderColor: 'var(--cp-line-2)' }}>
    <ListRow className="cp-list-row-padded" main={<div>
      <p className="cp-label" style={{ color: 'var(--cp-pending)' }}>{de.waitlistPage.position(position)}</p>
      <p className="cp-subheading">{registration.child_first_name} {registration.child_last_name} <span className="cp-num">({birthYear(registration.child_birth_date)})</span></p>
      <p className="cp-mobile-only cp-camp-date">{campTitle}{campDate && ` · ${campDate}`}</p>
    </div>} secondary={<div className="cp-chip" style={{ color: 'var(--cp-muted)' }}>
      <p>{registration.parent_first_name} {registration.parent_last_name}</p>
      <p className="break-all">{registration.parent_email}</p>
      <p>Angemeldet am {formatDate(registration.created_at)}</p>
    </div>} status={<div className="flex flex-col items-start gap-2">
      <StatusChip tone="pending" label="Warteliste" />
      <p className="cp-chip">{waitingSince(registration.created_at)}</p>
    </div>} action={<div className="cp-mobile-only cp-mobile-actions">
      <ButtonLink href={`mailto:${registration.parent_email}`}>Eltern kontaktieren</ButtonLink>
      <RowOverflow label={`Weitere Aktionen für ${registration.child_first_name} ${registration.child_last_name}`}>
        {registration.parent_phone && <ButtonLink href={`tel:${registration.parent_phone}`}>Eltern anrufen</ButtonLink>}
        {campHref && <ButtonLink href={campHref}>Anmeldungen ansehen</ButtonLink>}
      </RowOverflow>
    </div>} />
  </div>
}
