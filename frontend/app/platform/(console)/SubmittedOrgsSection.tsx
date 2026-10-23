import Link from 'next/link'
import type { OrganizationAdmin } from '../../lib/saasAdminApi'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function SubmittedOrgsSection({ orgs }: { orgs: OrganizationAdmin[] }) {
  if (orgs.length === 0) return null

  return (
    <section className="mb-10" aria-label="Wartet auf Freigabe">
      <h2 className="cp-heading mb-3" style={{ color: 'var(--cp-ink)' }}>
        Wartet auf Freigabe ({orgs.length})
      </h2>
      <div
        className="rounded-[var(--cp-r-card)] border"
        style={{ borderColor: 'var(--cp-warn-line, #EFC97A)', background: 'var(--cp-warn-bg, #FDF3E0)' }}
      >
        {orgs.map((org, i) => (
          <div
            key={org.slug}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-4"
            style={i > 0 ? { borderTop: '1px solid var(--cp-warn-line, #EFC97A)' } : undefined}
          >
            <div className="min-w-0 flex-1">
              <p className="cp-subheading truncate" style={{ color: 'var(--cp-ink)' }}>
                {org.name}
              </p>
              <p className="cp-chip mt-0.5 truncate" style={{ color: 'var(--cp-muted)' }}>
                /{org.slug}
                {org.contact_person_name ? ` · ${org.contact_person_name}` : ''}
                {' · '}
                {org.contact_email}
                {org.submitted_at ? ` · Eingereicht: ${formatDate(org.submitted_at)}` : ''}
                {org.avv_version ? ` · AVV ${org.avv_version}` : ''}
              </p>
            </div>
            <Link
              href={`/platform/${org.slug}`}
              className="cp-chip rounded-[var(--cp-r-chip)] border px-3 py-2"
              style={{ borderColor: 'var(--cp-warn, #92620A)', color: 'var(--cp-warn, #92620A)' }}
            >
              Prüfen
            </Link>
          </div>
        ))}
      </div>
    </section>
  )
}
