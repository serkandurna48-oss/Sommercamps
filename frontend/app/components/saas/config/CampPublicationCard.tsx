'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { CampAdmin, OrganizationAdmin } from '../../../lib/saasAdminApi'
import { formatDateTime } from '../../../lib/i18n/de'
import Button from '../ui/Button'
import SuccessNote from '../state/SuccessNote'
import { useAdminPreview } from '../preview/AdminPreviewContext'

export type PublicationOrganization = Pick<OrganizationAdmin, 'site_published' | 'contact_email' | 'iban' | 'terms_text'>

const statusLabels: Record<CampAdmin['status'], string> = {
  draft: 'Entwurf', published: 'Öffentlich', closed: 'Geschlossen', archived: 'Archiviert',
}

function registrationTime(value: string | null, fallback: string) {
  return value ? formatDateTime(value) : fallback
}

/** Uses persisted values only. Publication submits the surrounding camp form. */
export default function CampPublicationCard({ orgSlug, org, camp, pending, brandStrong, brandOn }: {
  orgSlug: string
  org: PublicationOrganization
  camp: CampAdmin
  pending: boolean
  brandStrong: string
  brandOn: string
}) {
  const [copyResult, setCopyResult] = useState<'copied' | 'error' | null>(null)
  const preview = useAdminPreview()
  const orgSettings = preview ? '/dev/admin-vorschau/konfiguration' : `/pilot/${orgSlug}/konfiguration`
  const registrationLink = preview ? '/dev/admin-vorschau' : `/pilot/${encodeURIComponent(orgSlug)}?camp=${encodeURIComponent(camp.slug)}`
  const reachable = org.site_published && camp.status === 'published'
  const checks = [
    { label: 'Kontakt-E-Mail', ready: !!org.contact_email?.trim(), href: `${orgSettings}#contact_email` },
    { label: 'Bankverbindung', ready: !!org.iban?.trim(), href: `${orgSettings}#iban` },
    { label: 'Ort', ready: !!camp.location?.trim(), href: '#location' },
    { label: 'Teilnahmebedingungen', ready: !!org.terms_text?.trim(), href: `${orgSettings}#terms_text` },
  ].sort((a, b) => Number(a.ready) - Number(b.ready))

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(new URL(registrationLink, window.location.origin).href)
      setCopyResult('copied')
    } catch {
      setCopyResult('error')
    }
  }

  return (
    <section aria-labelledby="publication-heading" className="cp-card flex min-w-0 flex-col gap-4" style={{ background: 'var(--cp-surface)', borderColor: 'var(--cp-line)' }}>
      <h3 id="publication-heading" className="cp-heading">Veröffentlichung</h3>
      <dl className="cp-body grid grid-cols-1 gap-2">
        <div><dt className="inline">Vereinsseite: </dt><dd className="inline font-semibold">{org.site_published ? 'Öffentlich' : 'Entwurf'}</dd></div>
        <div><dt className="inline">Camp: </dt><dd className="inline font-semibold">{statusLabels[camp.status]}</dd></div>
        <div>
          <dt>Anmeldezeitraum <span className="font-normal">(deutsche Zeit)</span></dt>
          <dd>{registrationTime(camp.registration_start, 'Ab sofort')} – {registrationTime(camp.registration_end, 'Kein Enddatum festgelegt')}</dd>
          <a href="#registration_start" className="inline-flex min-h-[44px] items-center underline">Anmeldezeitraum bearbeiten</a>
        </div>
      </dl>
      <p className="cp-body">Prüfen Sie Ihre gespeicherten Angaben vor der Veröffentlichung. Mit „Camp veröffentlichen“ speichern Sie auch Ihre Änderungen.</p>
      <ul className="cp-body">
        {checks.map(check => (
          <li key={check.label} className="flex min-h-[44px] flex-wrap items-center gap-x-2 py-2">
            <span aria-hidden="true" style={{ color: check.ready ? 'var(--cp-ok)' : 'var(--cp-pending)' }}>{check.ready ? '✓' : '!'}</span>
            <span>{check.label}</span><span>– {check.ready ? 'Vorhanden' : 'Fehlt'}</span>
            {!check.ready && <Link href={check.href} aria-label={check.label + ' ergänzen'} className="cp-focus inline-flex min-h-[44px] items-center underline">ergänzen</Link>}
          </li>
        ))}
      </ul>
      {!org.site_published && (
        <p className="cp-body">
          Eltern sehen das Camp erst, wenn auch die Vereinsseite veröffentlicht ist.{' '}
          <Link href={`${orgSettings}#publication`} className="inline-flex min-h-[44px] items-center underline">Vereinsseite veröffentlichen</Link>
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {camp.status !== 'published' ? (
          <Button type="submit" name="publication_status" value="published" variant="primary" disabled={pending} brandStrong={brandStrong} brandOn={brandOn}>Camp veröffentlichen</Button>
        ) : (
          <Button type="submit" name="publication_status" value="draft" variant="danger" onClick={event => { if (!window.confirm('Camp zurückziehen? Eltern können dieses Camp dann nicht mehr buchen.')) event.preventDefault() }} disabled={pending}>Camp zurückziehen</Button>
        )}
        {camp.status === 'published' && <Button type="submit" name="publication_status" value="closed" variant="danger" onClick={event => { if (!window.confirm('Camp schließen? Neue Anmeldungen sind danach nicht mehr möglich.')) event.preventDefault() }} disabled={pending}>Camp schließen</Button>}
        {camp.status === 'closed' && <Button type="submit" name="publication_status" value="archived" variant="secondary" disabled={pending}>Camp archivieren</Button>}
      </div>
      {reachable && !pending && (
        <div className="flex flex-col items-start gap-3">
          <SuccessNote>Camp ist für Eltern erreichbar</SuccessNote>
          <a href={registrationLink} className="inline-flex min-h-[44px] items-center break-all underline">Elternseite öffnen</a>
          <Button type="button" onClick={copyLink}>Anmeldelink kopieren</Button>
          {copyResult === 'copied' && <p role="status">Anmeldelink kopiert.</p>}
          {copyResult === 'error' && <p role="alert">Kopieren nicht möglich. Bitte öffnen Sie die Elternseite und kopieren Sie dort die Adresse aus Ihrem Browser.</p>}
        </div>
      )}
    </section>
  )
}
