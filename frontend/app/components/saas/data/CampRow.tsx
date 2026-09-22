import Link from 'next/link'
import { campStatusLabel, formatDateRange } from '../../../lib/i18n/de'
import type { CampAdmin } from '../../../lib/saasAdminApi'
import CapacityBar from './CapacityBar'
import StatusChip from './StatusChip'
import type { StatusTone } from './StatusChip'

const CAMP_STATUS_TONE: Record<string, StatusTone> = {
  draft: 'neutral',
  published: 'ok',
  closed: 'neutral',
  archived: 'neutral',
}

export default function CampRow({
  orgSlug,
  camp,
  registeredCount,
  brandColor,
}: {
  orgSlug: string
  camp: CampAdmin
  registeredCount: number
  brandColor: string
}) {
  return (
    <Link
      href={`/pilot/${orgSlug}/camps/${camp.slug}`}
      className="flex flex-wrap items-center justify-between gap-4 border-t px-1 py-5 transition-colors motion-reduce:transition-none hover:bg-[var(--cp-surface-2)] focus-visible:outline focus-visible:outline-2"
      style={{ borderColor: 'var(--cp-line-2)', outlineColor: brandColor }}
    >
      <div className="min-w-0">
        <p className="cp-subheading" style={{ color: 'var(--cp-ink)' }}>
          {camp.title}
        </p>
        <p className="cp-chip mt-0.5" style={{ color: 'var(--cp-muted)' }}>
          {formatDateRange(camp.start_date, camp.end_date)}
        </p>
      </div>
      <div className="w-32 shrink-0">
        <CapacityBar filled={registeredCount} total={camp.capacity} brandColor={brandColor} />
      </div>
      <StatusChip tone={CAMP_STATUS_TONE[camp.status] ?? 'neutral'} label={campStatusLabel[camp.status] ?? camp.status} />
    </Link>
  )
}
