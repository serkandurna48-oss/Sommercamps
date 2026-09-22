'use client'

import { useMemo, useState } from 'react'
import { de } from '../../../lib/i18n/de'
import type { RegistrationAdmin } from '../../../lib/saasAdminApi'
import { countByFilter, filterRegistrations, type ParticipantFilter } from '../commandCenterLogic'
import EmptyState from '../state/EmptyState'
import FilterButton from '../ui/FilterButton'
import SelectionBar from '../ui/SelectionBar'
import Button from '../ui/Button'
import ParticipantRow from './ParticipantRow'

export default function ParticipantList({
  registrations,
  brandColor,
}: {
  registrations: RegistrationAdmin[]
  brandColor: string
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
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={de.command.searchPlaceholder}
          className="cp-subheading min-h-[44px] flex-1 rounded-[var(--cp-r-field)] border px-4"
          style={{ borderColor: 'var(--cp-field-line)', fontSize: '16px', minWidth: '220px' }}
        />
        <div className="flex gap-2 overflow-x-auto">
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
        <div className="rounded-[var(--cp-r-card)] border" style={{ borderColor: 'var(--cp-line)', background: 'var(--cp-surface)' }}>
          {filtered.map(r => (
            <ParticipantRow
              key={r.id}
              registration={r}
              selected={selected.has(r.id)}
              onToggleSelect={() => toggleSelect(r.id)}
              brandColor={brandColor}
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
