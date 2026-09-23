'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { OrganizationAdmin } from '../../lib/saasAdminApi'
import { computeSetupSteps, setupProgressCount } from '../setupProgress'

const PLAN_STATUS_LABEL: Record<string, string> = {
  pilot: 'Pilot',
  active: 'Aktiv',
  suspended: 'Pausiert',
  cancelled: 'Gekündigt',
}

const PLAN_STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  pilot: { bg: 'var(--cp-warn-bg, #FDF3E0)', fg: 'var(--cp-warn, #92620A)' },
  active: { bg: 'var(--cp-success-bg, #E3F3E9)', fg: 'var(--cp-success, #1C6B45)' },
  suspended: { bg: 'var(--cp-error-bg)', fg: 'var(--cp-error)' },
  cancelled: { bg: 'var(--cp-line)', fg: 'var(--cp-muted)' },
}

type StatusFilter = 'all' | 'published' | 'draft' | OrganizationAdmin['plan_status']

function PlanStatusChip({ status }: { status: string }) {
  const tone = PLAN_STATUS_TONE[status] ?? PLAN_STATUS_TONE.cancelled
  return (
    <span className="cp-chip rounded-[var(--cp-r-chip)] px-2 py-1" style={{ background: tone.bg, color: tone.fg }}>
      {PLAN_STATUS_LABEL[status] ?? status}
    </span>
  )
}

function OrganizationRow({ org }: { org: OrganizationAdmin }) {
  const steps = computeSetupSteps(org, org.camp_count ?? 0)
  const progress = setupProgressCount(steps)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 md:px-6" style={{ borderColor: 'var(--cp-line)' }}>
      <Link href={`/platform/${org.slug}`} className="min-w-0 flex-1">
        <p className="cp-subheading truncate" style={{ color: 'var(--cp-ink)' }}>
          {org.name}
        </p>
        <p className="cp-chip truncate" style={{ color: 'var(--cp-muted)' }}>
          /pilot/{org.slug}
          {org.contact_person_name ? ` · ${org.contact_person_name}` : ''} · {org.camp_count ?? 0}{' '}
          {org.camp_count === 1 ? 'Camp' : 'Camps'} · Einrichtung {progress.done}/{progress.total}
        </p>
      </Link>
      <div className="flex items-center gap-2">
        {!org.site_published && (
          <span className="cp-chip rounded-[var(--cp-r-chip)] px-2 py-1" style={{ background: 'var(--cp-error-bg)', color: 'var(--cp-error)' }}>
            Entwurf
          </span>
        )}
        <PlanStatusChip status={org.plan_status} />
        <Link
          href={`/pilot/${org.slug}/konfiguration`}
          className="cp-chip rounded-[var(--cp-r-chip)] border px-3 py-2"
          style={{ borderColor: 'var(--cp-field-line)', color: 'var(--cp-ink)' }}
        >
          Bearbeiten
        </Link>
        <Link
          href={`/platform/${org.slug}/preview`}
          className="cp-chip rounded-[var(--cp-r-chip)] border px-3 py-2"
          style={{ borderColor: 'var(--cp-field-line)', color: 'var(--cp-ink)' }}
        >
          Vorschau
        </Link>
        <Link
          href={`/pilot/${org.slug}/dashboard`}
          className="cp-chip rounded-[var(--cp-r-chip)] border px-3 py-2"
          style={{ borderColor: 'var(--cp-field-line)', color: 'var(--cp-ink)' }}
        >
          Verwaltung öffnen
        </Link>
      </div>
    </div>
  )
}

/** Client-Komponente nur für Suche/Filter — die Liste ist bei der
 * realistischen Vereinszahl einer einzelnen Plattform-Instanz klein genug,
 * um komplett geladen und clientseitig gefiltert zu werden; kein
 * serverseitiger Suchendpunkt nötig. */
export default function OrganizationList({ organizations }: { organizations: OrganizationAdmin[] }) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return organizations.filter(org => {
      if (statusFilter === 'published' && !org.site_published) return false
      if (statusFilter === 'draft' && org.site_published) return false
      if (statusFilter !== 'all' && statusFilter !== 'published' && statusFilter !== 'draft' && org.plan_status !== statusFilter) {
        return false
      }
      if (!q) return true
      const haystack = `${org.name} ${org.slug} ${org.contact_person_name ?? ''} ${org.contact_email}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [organizations, query, statusFilter])

  const filters: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'Alle' },
    { value: 'published', label: 'Veröffentlicht' },
    { value: 'draft', label: 'Entwurf' },
    { value: 'suspended', label: 'Pausiert' },
  ]

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Name, Slug, Ansprechpartner oder E-Mail suchen …"
          className="cp-subheading min-h-[46px] flex-1 rounded-[var(--cp-r-field)] border px-4 py-2 outline-none"
          style={{ borderColor: 'var(--cp-field-line)', fontSize: '16px', minWidth: '240px' }}
        />
        <div className="flex flex-wrap gap-2">
          {filters.map(f => (
            <button
              key={f.value}
              type="button"
              onClick={() => setStatusFilter(f.value)}
              className="cp-chip rounded-[var(--cp-r-chip)] border px-3 py-2"
              style={
                statusFilter === f.value
                  ? { borderColor: 'var(--cp-ink)', background: 'var(--cp-ink)', color: '#FFFFFF' }
                  : { borderColor: 'var(--cp-field-line)', color: 'var(--cp-ink-2)' }
              }
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-[var(--cp-r-card)] border" style={{ borderColor: 'var(--cp-line)', background: 'var(--cp-surface)' }}>
        {filtered.length === 0 ? (
          <p className="cp-body px-4 py-8 text-center" style={{ color: 'var(--cp-muted)' }}>
            {organizations.length === 0
              ? 'Noch keine Vereine — leg den ersten über „Neuen Verein anlegen" an.'
              : 'Kein Verein passt zu dieser Suche/Filterung.'}
          </p>
        ) : (
          filtered.map(org => <OrganizationRow key={org.slug} org={org} />)
        )}
      </div>
    </>
  )
}
