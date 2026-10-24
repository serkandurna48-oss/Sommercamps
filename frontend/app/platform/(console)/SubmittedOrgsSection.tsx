'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { OrganizationAdmin } from '../../lib/saasAdminApi'
import { computeReviewChecklist, exactReviewDate, relativeReviewDate, submittedOrganizations, type ReviewCamp } from '../reviewChecklist'
import ReviewChecklist from './ReviewChecklist'

export default function SubmittedOrgsSection({ orgs, campsByOrg, loadedAt }: {
  orgs: OrganizationAdmin[]
  campsByOrg: Record<string, ReviewCamp[]>
  loadedAt: number
}) {
  const [now, setNow] = useState(loadedAt)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])
  const submitted = submittedOrganizations(orgs)
  if (submitted.length === 0) return null

  return (
    <section id="freigaben" className="mb-10" aria-label="Wartet auf Freigabe">
      <h2 className="cp-heading mb-3" style={{ color: 'var(--cp-ink)' }}>
        Wartet auf Freigabe ({submitted.length})
      </h2>
      <p className="cp-chip mb-3" style={{ color: 'var(--cp-muted)' }}>Älteste Einreichung zuerst</p>
      <div className="rounded-[var(--cp-r-card)] border"
        style={{ borderColor: 'var(--cp-line)', background: 'var(--cp-surface)' }}>
        {submitted.map((org, i) => {
          const camps = campsByOrg[org.slug] ?? []
          return (
            <article key={org.slug} className="flex flex-wrap items-start justify-between gap-4 px-4 py-4"
              style={i > 0 ? { borderTop: '1px solid var(--cp-line)' } : undefined}>
              <div className="min-w-0 flex-1 basis-64 break-words">
                <h3 className="cp-subheading" style={{ color: 'var(--cp-ink)' }}>{org.name}</h3>
                <p className="cp-body mt-1" style={{ color: 'var(--cp-ink-2)' }}>
                  {org.contact_person_name?.trim() || 'Kontaktperson fehlt'} · {org.contact_email?.trim() || 'Kontakt-E-Mail fehlt'}
                </p>
                <dl className="cp-chip my-3 grid gap-2 sm:grid-cols-2" style={{ color: 'var(--cp-muted)' }}>
                  <div><dt>Eingereicht</dt><dd>
                    <time dateTime={org.submitted_at ?? undefined} title={exactReviewDate(org.submitted_at)}>
                      {relativeReviewDate(org.submitted_at, now)}
                    </time>
                  </dd></div>
                  <div><dt>AVV {org.avv_version || '– Version fehlt'}</dt>
                    <dd>Angenommen: {exactReviewDate(org.avv_accepted_at)}</dd></div>
                  <div className="sm:col-span-2"><dt className="inline">Camps: </dt><dd className="inline">
                    {camps.length} gesamt · {camps.filter(camp => camp.status === 'draft').length} Entwurf · {camps.filter(camp => camp.status === 'published').length} veröffentlicht
                  </dd></div>
                </dl>
                <ReviewChecklist items={computeReviewChecklist(org, camps)} />
              </div>
              <Link href={`/platform/${org.slug}`} className="cp-focus cp-chip inline-flex min-h-11 items-center rounded-[var(--cp-r-field)] border px-4 py-2"
                aria-label={`${org.name} prüfen`} style={{ borderColor: 'var(--cp-field-line)', color: 'var(--cp-ink)' }}>
                Prüfen
              </Link>
            </article>
          )
        })}
      </div>
    </section>
  )
}
