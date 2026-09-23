'use client'

import { useMemo, useState } from 'react'
import { de } from '../../../lib/i18n/de'
import type { Task } from '../dashboardLogic'
import EmptyState from '../state/EmptyState'
import FilterButton from '../ui/FilterButton'
import TaskRow from './TaskRow'

type Kind = Task['kind'] | 'all'

/**
 * Volle, filterbare Aufgabenliste (Aufgaben-Seite) — anders als das
 * Dashboard, das eine Karte + Zeilen zeigt, ist hier jede Aufgabe eine
 * gleichrangige Zeile (TaskRow, wiederverwendet). Jeder Zeilentext nennt
 * den Camp-Namen schon selbst (de.tasks.*.title) — eine zusätzliche
 * Gruppierung nach Camp wäre redundant.
 */
export default function TaskFilterList({
  tasks,
  orgSlug,
  brandColor,
  emptyLabel,
}: {
  tasks: Task[]
  orgSlug: string
  brandColor: string
  emptyLabel: string
}) {
  const [filter, setFilter] = useState<Kind>('all')

  const counts = useMemo(
    () => ({
      all: tasks.length,
      payment: tasks.filter(t => t.kind === 'payment').length,
      'missing-contact': tasks.filter(t => t.kind === 'missing-contact').length,
      waitlist: tasks.filter(t => t.kind === 'waitlist').length,
    }),
    [tasks],
  )

  if (tasks.length === 0) {
    return <EmptyState title={emptyLabel} />
  }

  const filtered = filter === 'all' ? tasks : tasks.filter(t => t.kind === filter)

  return (
    <div>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        <FilterButton
          label={de.tasksPage.filterAll}
          count={counts.all}
          active={filter === 'all'}
          brandColor={brandColor}
          onClick={() => setFilter('all')}
        />
        <FilterButton
          label={de.tasksPage.filterPayment}
          count={counts.payment}
          active={filter === 'payment'}
          brandColor={brandColor}
          onClick={() => setFilter(f => (f === 'payment' ? 'all' : 'payment'))}
        />
        <FilterButton
          label={de.tasksPage.filterMissingContact}
          count={counts['missing-contact']}
          active={filter === 'missing-contact'}
          brandColor={brandColor}
          onClick={() => setFilter(f => (f === 'missing-contact' ? 'all' : 'missing-contact'))}
        />
        <FilterButton
          label={de.tasksPage.filterWaitlist}
          count={counts.waitlist}
          active={filter === 'waitlist'}
          brandColor={brandColor}
          onClick={() => setFilter(f => (f === 'waitlist' ? 'all' : 'waitlist'))}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState title={de.tasksPage.emptyFiltered} />
      ) : (
        <div className="rounded-[var(--cp-r-card)] border px-1" style={{ borderColor: 'var(--cp-line)', background: 'var(--cp-surface)' }}>
          {filtered.map(t => (
            <TaskRow key={t.id} task={t} orgSlug={orgSlug} />
          ))}
        </div>
      )}
    </div>
  )
}
