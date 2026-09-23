'use client'

import { useMemo, useState } from 'react'
import { de, formatEuro, paymentStatusLabel } from '../../../lib/i18n/de'
import { xlsxHrefWithFilter, type ExportColumn } from '../../../lib/exportCsv'
import type { CampAdmin, RegistrationAdmin } from '../../../lib/saasAdminApi'
import EmptyState from '../state/EmptyState'
import ExportBar from '../ui/ExportBar'
import FilterButton from '../ui/FilterButton'
import PaymentRow from './PaymentRow'

export interface PaymentEntry {
  registration: RegistrationAdmin
  camp: CampAdmin
}

type Filter = 'open' | 'paid' | 'all'

function buildColumns(showCampTitle: boolean): ExportColumn<PaymentEntry>[] {
  return [
    ...(showCampTitle ? [{ header: 'Camp', value: (e: PaymentEntry) => e.camp.title }] : []),
    { header: 'Kind', value: e => `${e.registration.child_first_name} ${e.registration.child_last_name}` },
    { header: 'Elternteil', value: e => `${e.registration.parent_first_name} ${e.registration.parent_last_name}` },
    { header: 'E-Mail', value: e => e.registration.parent_email },
    { header: 'Preis (EUR)', value: e => formatEuro(e.camp.price_cents, e.camp.currency) },
    { header: 'Zahlungsstatus', value: e => paymentStatusLabel[e.registration.payment_status] ?? e.registration.payment_status },
  ]
}

export default function PaymentSection({
  entries,
  orgSlug,
  brandColor,
  brandStrong,
  brandOn,
  emptyLabel,
  showCampTitle = false,
  csvFilename,
  xlsxHref,
}: {
  entries: PaymentEntry[]
  orgSlug: string
  brandColor: string
  brandStrong: string
  brandOn: string
  emptyLabel: string
  showCampTitle?: boolean
  csvFilename: string
  xlsxHref: string
}) {
  const [filter, setFilter] = useState<Filter>('all')

  const counts = useMemo(
    () => ({
      open: entries.filter(e => e.registration.payment_status === 'open').length,
      paid: entries.filter(e => e.registration.payment_status === 'paid').length,
      all: entries.length,
    }),
    [entries],
  )
  const columns = useMemo(() => buildColumns(showCampTitle), [showCampTitle])

  if (entries.length === 0) {
    return <EmptyState title={emptyLabel} />
  }

  const filtered = filter === 'all' ? entries : entries.filter(e => e.registration.payment_status === filter)

  return (
    <div>
      <ExportBar
        rows={filtered}
        columns={columns}
        csvFilename={csvFilename}
        xlsxHref={xlsxHrefWithFilter(
          xlsxHref,
          filtered.map(e => e.registration.registration_token),
          entries.length,
        )}
      />

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        <FilterButton
          label={de.paymentsPage.filterOpen}
          count={counts.open}
          active={filter === 'open'}
          brandColor={brandColor}
          onClick={() => setFilter(f => (f === 'open' ? 'all' : 'open'))}
        />
        <FilterButton
          label={de.paymentsPage.filterPaid}
          count={counts.paid}
          active={filter === 'paid'}
          brandColor={brandColor}
          onClick={() => setFilter(f => (f === 'paid' ? 'all' : 'paid'))}
        />
        <FilterButton label={de.paymentsPage.filterAll} count={counts.all} active={filter === 'all'} brandColor={brandColor} onClick={() => setFilter('all')} />
      </div>

      {filtered.length === 0 ? (
        <EmptyState title={de.paymentsPage.emptyFiltered} />
      ) : (
        <div className="cp-roster">
          {filtered.map(e => (
            <PaymentRow
              key={e.registration.id}
              registration={e.registration}
              camp={e.camp}
              orgSlug={orgSlug}
              brandStrong={brandStrong}
              brandOn={brandOn}
              showCampTitle={showCampTitle}
            />
          ))}
        </div>
      )}
    </div>
  )
}
