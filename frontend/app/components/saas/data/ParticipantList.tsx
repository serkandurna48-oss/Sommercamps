'use client'

import { useMemo, useState } from 'react'
import { de, registrationStatusLabel, paymentStatusLabel } from '../../../lib/i18n/de'
import { xlsxHrefWithFilter, type ExportColumn } from '../../../lib/exportCsv'
import type { RegistrationAdmin } from '../../../lib/saasAdminApi'
import { countByFilter, filterRegistrations, type ParticipantFilter } from '../commandCenterLogic'
import EmptyState from '../state/EmptyState'
import ExportBar from '../ui/ExportBar'
import FilterButton from '../ui/FilterButton'
import SelectionBar from '../ui/SelectionBar'
import Button from '../ui/Button'
import ParticipantRow from './ParticipantRow'

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
}: {
  registrations: RegistrationAdmin[]
  brandColor: string
  orgSlug: string
  campSlug: string
}) {
  const [filter, setFilter] = useState<ParticipantFilter>('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const counts = useMemo(() => countByFilter(registrations), [registrations])
  const filtered = useMemo(() => filterRegistrations(registrations, filter, search), [registrations, filter, search])

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectedEmails = registrations.filter(r => selected.has(r.id)).map(r => r.parent_email)

  if (registrations.length === 0) {
    return <EmptyState title={de.command.noParticipants} />
  }

  return (
    <div>
      <ExportBar
        rows={filtered}
        columns={PARTICIPANT_COLUMNS}
        csvFilename={`${campSlug}-teilnehmer.csv`}
        xlsxHref={xlsxHrefWithFilter(
          `/pilot/${orgSlug}/camps/${campSlug}/export?view=participants`,
          filtered.map(r => r.registration_token),
          registrations.length,
        )}
      />

      <div className="mb-4 flex flex-col gap-2 xl:flex-row xl:items-center">
        <input
          type="search"
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
            />
          ))}
        </div>
      )}

      <SelectionBar count={selected.size}>
        <a href={`mailto:?bcc=${selectedEmails.join(',')}`}>
          <Button variant="primary" brandStrong={brandColor} brandOn="#FFFFFF">
            E-Mail an Ausgewählte
          </Button>
        </a>
      </SelectionBar>
    </div>
  )
}
