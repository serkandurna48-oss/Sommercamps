import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getAdminToken } from '../../../lib/adminSession'
import { fetchCampsAdmin, fetchOrganizationAdmin } from '../../../lib/saasAdminApi'
import PublishToggle from '../../../components/saas/config/PublishToggle'
import { computeSetupSteps, setupProgressCount } from '../../setupProgress'

const PLAN_STATUS_LABEL: Record<string, string> = {
  pilot: 'Pilot',
  active: 'Aktiv',
  suspended: 'Pausiert',
  cancelled: 'Gekündigt',
}

const CAMP_STATUS_LABEL: Record<string, string> = {
  draft: 'Entwurf',
  published: 'Veröffentlicht',
  closed: 'Geschlossen',
  archived: 'Archiviert',
}

/**
 * Vereinsdetailseite für den Betreiber (Auftrag Abschnitt 3.A) —
 * Stammdaten-Überblick, Einrichtungsfortschritt mit direkten Links zu
 * jedem offenen Schritt, und die vier Direktaktionen (Bearbeiten, Vorschau,
 * Verwaltung öffnen, Öffentliche Seite). Baut die eigentlichen Bearbeitungs-
 * Formulare NICHT nach — die leben weiterhin unter /pilot/[org]/(org-admin),
 * diese Seite verlinkt dorthin (siehe root CLAUDE.md-Prinzip "vorhandene
 * Module weiterverwenden").
 */
export default async function PlatformOrgDetailPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgSlug } = await params
  const token = await getAdminToken()
  if (!token) redirect('/platform/login')

  const org = await fetchOrganizationAdmin(orgSlug, token)
  if (!org) notFound()

  const camps = await fetchCampsAdmin(orgSlug, token)
  const steps = computeSetupSteps(org, camps.length)
  const progress = setupProgressCount(steps)

  return (
    <main className="mx-auto max-w-[880px] px-4 py-10 pb-24 md:px-8 md:pb-10 xl:px-6">
      <Link href="/platform" className="cp-chip mb-4 inline-block" style={{ color: 'var(--cp-muted)' }}>
        ← Alle Vereine
      </Link>

      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="cp-title" style={{ color: 'var(--cp-ink)' }}>
            {org.name}
          </h1>
          <p className="cp-body mt-1" style={{ color: 'var(--cp-muted)' }}>
            /pilot/{org.slug} · {PLAN_STATUS_LABEL[org.plan_status] ?? org.plan_status}
            {org.contact_person_name ? ` · Ansprechpartner: ${org.contact_person_name}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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
            className="cp-subheading inline-flex items-center justify-center rounded-[var(--cp-r-field)] px-4"
            style={{ background: 'var(--cp-ink)', color: '#FFFFFF' }}
          >
            Vereinsverwaltung öffnen
          </Link>
          {org.site_published && (
            <Link
              href={`/pilot/${org.slug}`}
              className="cp-chip rounded-[var(--cp-r-chip)] border px-3 py-2"
              style={{ borderColor: 'var(--cp-field-line)', color: 'var(--cp-muted)' }}
            >
              Öffentliche Seite
            </Link>
          )}
        </div>
      </div>

      <div className="mb-8">
        <PublishToggle orgSlug={org.slug} published={org.site_published} />
      </div>

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="cp-heading" style={{ color: 'var(--cp-ink)' }}>
            Einrichtung
          </h2>
          <span className="cp-chip" style={{ color: 'var(--cp-muted)' }}>
            {progress.done}/{progress.total} erledigt
          </span>
        </div>
        <div className="rounded-[var(--cp-r-card)] border" style={{ borderColor: 'var(--cp-line)', background: 'var(--cp-surface)' }}>
          {steps.map((step, i) => (
            <div
              key={step.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
              style={i > 0 ? { borderTop: '1px solid var(--cp-line)' } : undefined}
            >
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs"
                  style={{
                    background: step.done ? 'var(--cp-success-bg, #E3F3E9)' : 'var(--cp-line)',
                    color: step.done ? 'var(--cp-success, #1C6B45)' : 'var(--cp-muted)',
                  }}
                >
                  {step.done ? '✓' : ''}
                </span>
                <span className="cp-body" style={{ color: step.done ? 'var(--cp-ink)' : 'var(--cp-ink-2)' }}>
                  {step.label}
                </span>
              </div>
              {!step.done && (
                <Link href={step.editPath} className="cp-chip" style={{ color: 'var(--cp-ink)', textDecoration: 'underline' }}>
                  Jetzt einrichten
                </Link>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="cp-heading" style={{ color: 'var(--cp-ink)' }}>
            Camps
          </h2>
          <Link href={`/pilot/${org.slug}/camps/new`} className="cp-chip" style={{ color: 'var(--cp-ink)', textDecoration: 'underline' }}>
            + Camp anlegen
          </Link>
        </div>
        {camps.length === 0 ? (
          <p className="cp-body rounded-[var(--cp-r-card)] border px-4 py-6 text-center" style={{ borderColor: 'var(--cp-line)', color: 'var(--cp-muted)' }}>
            Noch kein Camp angelegt.
          </p>
        ) : (
          <div className="rounded-[var(--cp-r-card)] border" style={{ borderColor: 'var(--cp-line)', background: 'var(--cp-surface)' }}>
            {camps.map((camp, i) => (
              <Link
                key={camp.slug}
                href={`/pilot/${org.slug}/camps/${camp.slug}/konfiguration`}
                className="flex items-center justify-between gap-3 px-4 py-3"
                style={i > 0 ? { borderTop: '1px solid var(--cp-line)' } : undefined}
              >
                <span className="cp-body" style={{ color: 'var(--cp-ink)' }}>
                  {camp.title}
                </span>
                <span className="cp-chip" style={{ color: 'var(--cp-muted)' }}>
                  {CAMP_STATUS_LABEL[camp.status] ?? camp.status}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="cp-heading mb-3" style={{ color: 'var(--cp-ink)' }}>
          Abrechnung
        </h2>
        <div className="rounded-[var(--cp-r-card)] border p-4" style={{ borderColor: 'var(--cp-line)', background: 'var(--cp-surface)' }}>
          <p className="cp-body" style={{ color: 'var(--cp-ink)' }}>
            Vertragsstatus: {PLAN_STATUS_LABEL[org.plan_status] ?? org.plan_status}
          </p>
          <p className="cp-chip mt-2" style={{ color: org.billing_notes ? 'var(--cp-ink-2)' : 'var(--cp-muted)' }}>
            {org.billing_notes ?? 'Keine Konditionen hinterlegt.'}
          </p>
        </div>
      </section>
    </main>
  )
}
