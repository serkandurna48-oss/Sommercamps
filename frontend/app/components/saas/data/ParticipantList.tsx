'use client'

import { useMemo, useState } from 'react'
import Button, { ButtonLink } from '../ui/Button'
import { de, formatDate, formatDateTime, formatDateRange, registrationStatusLabel, paymentStatusLabel } from '../../../lib/i18n/de'
import { type ExportColumn } from '../../../lib/exportCsv'
import type { CampAdmin, RegistrationAdmin, RegistrationQuestion } from '../../../lib/saasAdminApi'
import { countByFilter, filterRegistrations, isActiveRegistration, type ParticipantFilter } from '../commandCenterLogic'
import EmptyState from '../state/EmptyState'
import ParticipantExport from './ParticipantExport'
import ParentEmailCopy from './ParentEmailCopy'
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
  { header: 'Geburtsdatum', value: r => formatDate(r.child_birth_date) },
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
  { header: 'Angemeldet am', value: r => formatDateTime(r.created_at) },
]

export default function ParticipantList({
  registrations,
  brandColor,
  orgSlug,
  orgName,
  orgLogoUrl,
  campSlug,
  camp,
  questions,
  initialFilter = 'all',
  initialSort = 'newest',
}: {
  registrations: RegistrationAdmin[]
  brandColor: string
  orgSlug: string
  orgName?: string
  orgLogoUrl?: string | null
  campSlug: string
  camp: CampAdmin
  questions?: RegistrationQuestion[]
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
      <div className="cp-toolbar">
      <ParticipantExport
        registrations={registrations}
        camp={camp}
        orgSlug={orgSlug}
        orgName={orgName}
        orgLogoUrl={orgLogoUrl}
        brandColor={brand.brandStrong}
        filter={filter}
        search={search}
        allColumns={PARTICIPANT_COLUMNS}
        questions={questions}
        onReset={() => { setFilter('all'); setSearch('') }}
      />
      <ParentEmailCopy registrations={registrations} />
      </div>

      <div className="cp-mobile-filters mb-4 flex flex-col gap-2 xl:flex-row xl:items-center">
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
        <div className="cp-mobile-filter-buttons flex gap-2 overflow-x-auto p-1">
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

      <div className="mb-4 cp-body" aria-live="polite">
        <p className="cp-hint">{filtered.length} Anmeldungen · {filtered.filter(isActiveRegistration).length} Teilnehmende, {filtered.filter(r => r.status === 'waitlist').length} Warteliste, {filtered.filter(r => r.status === 'cancelled').length} storniert</p>
        {(filter !== 'all' || search.trim()) && <div className="flex flex-wrap items-center gap-2">
          <p>Gefiltert: {[search.trim() && 'Suche „' + search.trim() + '“', filter !== 'all' && (filter === 'payment-open' ? 'Zahlung offen' : 'Fehlende Notfallkontakte')].filter(Boolean).join(' · ')}</p>
          <Button type="button" onClick={() => { setFilter('all'); setSearch('') }}>Filter zurücksetzen</Button>
        </div>}
      </div>
      {filtered.length === 0 ? (
        <EmptyState title={de.command.noParticipantsFiltered} />
      ) : (
        <div className="cp-roster">
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
              campDate={formatDateRange(camp.start_date, camp.end_date)}
              questions={questions}
            />
          ))}
        </div>
      )}

      <SelectionBar count={selected.size}>
        <ButtonLink href={`mailto:?bcc=${selectedEmails.join(',')}`} variant="primary" brandStrong={brand.brandStrong} brandOn={brand.brandOn}>
          E-Mail an Ausgewählte
        </ButtonLink>
      </SelectionBar>
      </div>}
    </RegistrationActionFeedback>
  )
}
