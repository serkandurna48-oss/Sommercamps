import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { computeBrandSafe } from '../../../../lib/brandPipeline'
import { getAdminToken } from '../../../../lib/adminSession'
import { fetchCampsAdmin, fetchOrganizationAdmin, fetchRegistrationsAdmin } from '../../../../lib/saasAdminApi'
import type { CampPublic, OrganizationPublic } from '../../../../lib/saasApi'
import { computeCampStats } from '../../../../components/saas/dashboardLogic'
import GrainOverlay from '../../../../pilot/[org]/GrainOverlay'
import ParentFlow from '../../../../pilot/[org]/ParentFlow'
import { publicFontClassName } from '../../../../pilot/[org]/publicFonts'
import '../../../../pilot/[org]/publicTheme.css'

const THEME_SURFACE: Record<string, string> = {
  tradition: '#FFFFFF',
  akademie: '#161C1A',
  kompakt: '#FFFFFF',
}

/**
 * Betreiber-Vorschau der öffentlichen Vereinsseite — funktioniert
 * unabhängig von site_published (admin-authentifiziert, umgeht die
 * öffentliche 404-Sperre, siehe tenancy.py::resolve_tenant). Rendert
 * dieselbe ParentFlow-Komponente wie die echte öffentliche Seite
 * (frontend/app/pilot/[org]/page.tsx), gespeist aus admin-authentifiziert
 * geladenen Daten statt der öffentlichen API — kein zweiter, abweichender
 * Nachbau der Eltern-Ansicht.
 *
 * Nur veröffentlichte Camps werden gezeigt (Entwürfe wären für Eltern nach
 * dem Veröffentlichen des Vereins ohnehin unsichtbar), Belegung/Warteliste
 * aus echten Registrierungen berechnet — damit die Vorschau eine
 * ausgebuchte/wartende Situation genauso zeigt wie später live.
 */
export default async function PlatformOrgPreviewPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgSlug } = await params
  const token = await getAdminToken()
  if (!token) redirect('/platform/login')

  const org = await fetchOrganizationAdmin(orgSlug, token)
  if (!org) notFound()

  const allCamps = await fetchCampsAdmin(orgSlug, token)
  const publishedCamps = allCamps.filter(c => c.status === 'published')
  const registrationsByCamp = await Promise.all(publishedCamps.map(c => fetchRegistrationsAdmin(orgSlug, c.slug, token)))

  const orgPublic: OrganizationPublic = {
    slug: org.slug,
    name: org.name,
    legal_name: org.legal_name,
    contact_email: org.contact_email,
    contact_phone: org.contact_phone,
    logo_url: org.logo_url,
    primary_color: org.primary_color,
    theme: (org.theme as OrganizationPublic['theme']) ?? 'tradition',
    iban: org.iban,
  }

  const now = new Date()
  const campsPublic: CampPublic[] = publishedCamps.map((camp, i) => {
    const stats = computeCampStats(camp, registrationsByCamp[i])
    const openAfterStart = !camp.registration_start || now >= new Date(camp.registration_start)
    const openBeforeEnd = !camp.registration_end || now <= new Date(camp.registration_end)
    const spotsRemaining = Math.max(0, camp.capacity - stats.registeredCount)
    return {
      slug: camp.slug,
      title: camp.title,
      start_date: camp.start_date,
      end_date: camp.end_date,
      registration_start: camp.registration_start,
      registration_end: camp.registration_end,
      age_min: camp.age_min,
      age_max: camp.age_max,
      capacity: camp.capacity,
      price_cents: camp.price_cents,
      currency: camp.currency,
      registration_open: openAfterStart && openBeforeEnd,
      location: camp.location,
      care_info: camp.care_info,
      meals_info: camp.meals_info,
      includes: camp.includes,
      registered_count: stats.registeredCount,
      waitlist_count: stats.waitlistCount,
      spots_remaining: spotsRemaining,
      is_full: spotsRemaining <= 0,
    }
  })

  const ground = THEME_SURFACE[orgPublic.theme] ?? THEME_SURFACE.tradition
  const brand = computeBrandSafe(orgPublic.primary_color, ground)

  return (
    <div
      className={`cp-public ${publicFontClassName(orgPublic.theme)}`}
      data-theme={orgPublic.theme}
      style={
        {
          '--brand': brand.brand,
          '--brand-strong': brand.strong,
          '--brand-on': brand.on,
        } as React.CSSProperties
      }
    >
      <div
        className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"
        style={{ background: '#111', borderColor: 'rgba(255,255,255,0.15)' }}
      >
        <p className="cp-chip" style={{ color: '#FFFFFF' }}>
          Vorschau — so sieht die Seite aus, wenn sie veröffentlicht ist
          {!org.site_published && ' (dieser Verein ist noch ein Entwurf, Eltern können ihn nicht finden)'}.
          {org.site_published && ' Achtung: eine hier abgeschickte Anmeldung wird echt gespeichert, der Verein ist bereits veröffentlicht.'}
        </p>
        <Link href={`/platform/${orgSlug}`} className="cp-chip shrink-0" style={{ color: '#FFFFFF', textDecoration: 'underline' }}>
          Zurück zur Vereinsdetailseite
        </Link>
      </div>
      <GrainOverlay />
      <div className="app">
        <ParentFlow org={orgPublic} camps={campsPublic} />
      </div>
    </div>
  )
}
