'use client'

import { useMemo, useState } from 'react'
import { de, registrationStatusLabel, paymentStatusLabel } from '../../../lib/i18n/de'
import { type ExportColumn } from '../../../lib/exportCsv'
import type { CampAdmin, RegistrationAdmin } from '../../../lib/saasAdminApi'
import { countByFilter, filterRegistrations, type ParticipantFilter } from '../commandCenterLogic'
import EmptyState from '../state/EmptyState'
import ParticipantExport from './ParticipantExport'
import FilterButton from '../ui/FilterButton'
import SelectionBar from '../ui/SelectionBar'
import { sortRegistrations, type ParticipantSort } from '../registrationDates'
import { computeBrandTokens } from '../brandPipeline'
import ParticipantRow from './ParticipantRow'
import RegistrationActionFeedback from '../ui/RegistrationActionFeedback'

const PARTICIPANT_COLUMNS: ExportColumn<RegistrationAdmin>[] = [
  { header: 'Status', value: r => registrationStatusLabel[r.status] ?? r.status },
  { header: 'Zahlung', value: r => paymentStatusLabel[r.payment_status] ?? r.payment_status },
  { header: 'Kind Vorname', value: r => r.child_first_name },
  { header: 'Kind Nachname', value: r => r.child_last_name },
  { header: 'Geburtsdatum', value: r => r.child_birth_date },
  { header: 'Elternteil Vorname', value: r => r.parent_first_name },
  { header: 'Elternteil Nachname', value: r => r.parent_last_name },
  { header: 'E-Mail', value: r => r.parent_email },
  { header: 'Telefon', value: r => r.parent_phone },
  { header: 'Notfallkontakt', value: r => r.emergency_contact_name },
  { header: 'Notfallkontakt-Telefon', value: r => r.emergency_contact_phone },
  { header: 'Allergien', value: r => r.allergies },
  { header: 'Hinweise', value: r => r.medical_notes },
  { header: 'Trikotgröße', value: r => r.jersey_size },
  { header: 'Abholberechtigt', value: r => r.pickup_authorized },
  { header: 'Fotoerlaubnis', value: r => (r.photo_permission ? 'Ja' : 'Nein') },
  { header: 'Angemeldet am', value: r => r.created_at },
]

export default function ParticipantList({
  registrations,
  brandColor,
  orgSlug,
  campSlug,
  camp,
  initialFilter = 'all',
  initialSort = 'newest',
}: {
  registrations: RegistrationAdmin[]
  brandColor: string
  orgSlug: string
  campSlug: string
  camp: CampAdmin
  initialFilter?: ParticipantFilter
  initialSort?: ParticipantSort
}) {
  const [filter, setFilter] = useState<ParticipantFilter>(initialFilter)
  const [sort, setSort] = useState<ParticipantSort>(initialSort)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const brand = computeBrandTokens(brandColor)

  const counts = useMemo(() => countByFilter(registrations), [registrations])
  const filtered = useMemo(() => sortRegistrations(filterRegistrations(registrations, filter, search), sort), [registrations, filter, search, sort])

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectedEmails = registrations.filter(r => selected.has(r.id)).map(r => r.parent_email)

  return (
    <RegistrationActionFeedback registrations={registrations} waitlistHref={`/pilot/${orgSlug}/camps/${campSlug}/warteliste`}>
      {registrations.length === 0 ? <EmptyState title={de.command.noParticipants} /> : <div>
      <ParticipantExport
        registrations={registrations}
        camp={camp}
        orgSlug={orgSlug}
        filter={filter}
        search={search}
        allColumns={PARTICIPANT_COLUMNS}
        onReset={() => { setFilter('all'); setSearch('') }}
      />

      <div className="mb-4 flex flex-col gap-2 xl:flex-row xl:items-center">
        <label className="cp-label flex flex-col gap-1">
          Sortierung
          <select aria-label="Sortierung" value={sort} onChange={e => setSort(e.target.value as ParticipantSort)} className="min-h-[44px] rounded-[var(--cp-r-field)] border px-3 text-base" style={{ borderColor: 'var(--cp-field-line)' }}>
            <option value="newest">Neueste zuerst</option>
            <option value="name">Name A–Z</option>
          </select>
        </label>
        <input
          type="search"
          aria-label="Teilnehmende suchen"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={de.command.searchPlaceholder}
          className="cp-subheading min-h-[44px] w-full rounded-[var(--cp-r-field)] border px-4 xl:flex-1"
          style={{ borderColor: 'var(--cp-field-line)', fontSize: '16px', minWidth: '220px' }}
        />
        <div className="flex gap-2 overflow-x-auto pb-1">
          <FilterButton
            label={de.command.filterPaymentOpen}
            count={counts['payment-open']}
            active={filter === 'payment-open'}
            brandColor={brandColor}
            onClick={() => setFilter(f => (f === 'payment-open' ? 'all' : 'payment-open'))}
          />
          <FilterButton
            label={de.command.filterMissingInfo}
            count={counts['missing-info']}
            active={filter === 'missing-info'}
            brandColor={brandColor}
            onClick={() => setFilter(f => (f === 'missing-info' ? 'all' : 'missing-info'))}
          />
          <FilterButton
            label={de.command.filterAll}
            count={counts.all}
            active={filter === 'all'}
            brandColor={brandColor}
            onClick={() => setFilter('all')}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title={de.command.noParticipantsFiltered} />
      ) : (
        <div className="cp-roster" style={{ borderLeft: `3px solid ${brandColor}` }}>
          {filtered.map(r => (
            <ParticipantRow
              key={r.id}
              registration={r}
              selected={selected.has(r.id)}
              onToggleSelect={() => toggleSelect(r.id)}
              brandColor={brandColor}
              orgSlug={orgSlug}
              campSlug={campSlug}
              campTitle={camp.title}
            />
          ))}
        </div>
      )}

      <SelectionBar count={selected.size}>
        <a href={`mailto:?bcc=${selectedEmails.join(',')}`} className="cp-subheading inline-flex min-h-[50px] items-center justify-center rounded-[var(--cp-r-field)] px-5 py-2 text-center" style={{ background: brand.brandStrong, color: brand.brandOn }}>
          E-Mail an Ausgewählte
        </a>
      </SelectionBar>
      </div>}
    </RegistrationActionFeedback>
  )
}
