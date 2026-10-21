'use client'

import { useId, useMemo, useState } from 'react'
import { de, formatEuro, paymentStatusLabel, registrationStatusLabel } from '../../../lib/i18n/de'
import { xlsxHrefWithFilter, type ExportColumn } from '../../../lib/exportCsv'
import type { CampAdmin, RegistrationAdmin } from '../../../lib/saasAdminApi'
import { isActiveRegistration, isOpenPayment } from '../commandCenterLogic'
import { setPaymentStatusAction } from '../actions/paymentActions'
import ActionForm, { type ActionFormState } from '../ui/ActionForm'
import Button from '../ui/Button'
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
    { header: 'Verwendungszweck', value: e => e.registration.payment_reference },
    ...(showCampTitle ? [{ header: 'Camp', value: (e: PaymentEntry) => e.camp.title }] : []),
    { header: 'Kind', value: e => `${e.registration.child_first_name} ${e.registration.child_last_name}` },
    { header: 'Elternteil', value: e => `${e.registration.parent_first_name} ${e.registration.parent_last_name}` },
    { header: 'E-Mail', value: e => e.registration.parent_email },
    { header: 'Preis (EUR)', value: e => formatEuro(e.camp.price_cents, e.camp.currency) },
    { header: 'Anmeldestatus', value: e => registrationStatusLabel[e.registration.status] ?? e.registration.status },
    { header: 'Zahlungsstatus', value: e => paymentStatusLabel[e.registration.payment_status] ?? e.registration.payment_status },
  ]
}

export default function PaymentSection({
  entries,
  orgSlug,
  brandColor,
  emptyLabel,
  showCampTitle = false,
  csvFilename,
  xlsxHref,
  initialFilter = 'open',
}: {
  entries: PaymentEntry[]
  orgSlug: string
  brandColor: string
  emptyLabel: string
  showCampTitle?: boolean
  csvFilename: string
  xlsxHref: string
  initialFilter?: Filter
}) {
  const [filter, setFilter] = useState<Filter>(initialFilter)
  const [search, setSearch] = useState('')
  const [lastPaid, setLastPaid] = useState<PaymentEntry | null>(null)
  const [undoMessage, setUndoMessage] = useState<string | null>(null)
  const searchId = useId()

  const counts = useMemo(
    () => ({
      open: entries.filter(e => isOpenPayment(e.registration)).length,
      paid: entries.filter(e => e.registration.payment_status === 'paid').length,
      all: entries.length,
    }),
    [entries],
  )
  const columns = useMemo(() => buildColumns(showCampTitle), [showCampTitle])

  async function undoPayment(previous: ActionFormState) {
    if (!lastPaid) return previous
    const { registration, camp } = lastPaid
    const result = await setPaymentStatusAction(orgSlug, camp.slug, registration.registration_token, 'open', 'Wieder auf Offen gesetzt.', previous)
    if (result.success && !result.error) {
      setUndoMessage(`${registration.payment_reference} wieder auf Offen gesetzt.`)
      setLastPaid(null)
    }
    return result
  }

  const statusFiltered =
    filter === 'all'
      ? entries
      : filter === 'open'
        ? entries.filter(e => isOpenPayment(e.registration))
        : entries.filter(e => e.registration.payment_status === filter)
  const normalize = (value: string) => value.replace(/\s+/g, '').toLocaleLowerCase('de')
  const query = normalize(search)
  const filtered = statusFiltered.filter(({ registration: r }) => !query || [
    r.payment_reference,
    `${r.child_first_name} ${r.child_last_name}`,
    `${r.parent_first_name} ${r.parent_last_name}`,
    r.parent_email,
  ].some(value => normalize(value).includes(query)))
  const active = entries.filter(e => isActiveRegistration(e.registration))
  const allSettled = active.length > 0 && active.every(e => ['paid', 'waived'].includes(e.registration.payment_status))

  return (
    <div>
      {lastPaid && (
        <div className="mb-5 rounded-lg border p-4" style={{ borderColor: 'var(--cp-ok)', background: 'var(--cp-ok-bg)' }}>
          <p role="status" className="mb-3">
            {formatEuro(lastPaid.camp.price_cents, lastPaid.camp.currency)} für {lastPaid.registration.child_first_name} als bezahlt erfasst – {lastPaid.registration.payment_reference}
          </p>
          <ActionForm key={lastPaid.registration.registration_token} action={undoPayment} label="Rückgängig: wieder auf Offen" pendingLabel={de.paymentsPage.updating} />
        </div>
      )}
      {undoMessage && <p role="status" className="mb-5">{undoMessage}</p>}

      <div className="mb-4">
        <label htmlFor={searchId} className="mb-2 block font-medium">Verwendungszweck, Kind oder Eltern suchen</label>
        <input id={searchId} type="search" placeholder="CP-XXXXXXXX" value={search} onChange={event => setSearch(event.target.value)}
          className="min-h-[44px] w-full rounded-lg border px-3 py-2" style={{ borderColor: 'var(--cp-field-line)', background: 'var(--cp-surface)', color: 'var(--cp-ink)' }} />
      </div>
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

      <div className="mb-4 flex flex-wrap gap-2 pb-1">
        <FilterButton
          label={de.paymentsPage.filterOpen}
          count={counts.open}
          active={filter === 'open'}
          brandColor={brandColor}
          onClick={() => setFilter('open')}
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
        <div>
          <EmptyState title={filter === 'open' && query
            ? `Keine offene Zahlung zu „${search.trim()}“.`
            : entries.length === 0 ? emptyLabel
              : filter === 'open' && !query && allSettled ? 'Alle aktiven Anmeldungen sind bezahlt oder erlassen.'
                : de.paymentsPage.emptyFiltered} />
          {filter === 'open' && <Button type="button" onClick={() => setFilter('all')}>Auch bezahlte durchsuchen</Button>}
        </div>
      ) : (
        <div className="cp-roster">
          {filtered.map(e => (
            <PaymentRow
              key={e.registration.id}
              registration={e.registration}
              camp={e.camp}
              orgSlug={orgSlug}
              onPaid={() => { setLastPaid(e); setUndoMessage(null) }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
