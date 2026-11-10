import type { Metadata } from 'next'
import Link from 'next/link'
import Button, { ButtonLink } from '../../../components/saas/ui/Button'
import { notFound, redirect } from 'next/navigation'
import { getValidAccessToken } from '../../../lib/supabaseServer'
import { fetchCampsAdmin, fetchFeeMonthAdmin, fetchFeeRulesAdmin, fetchOrganizationAdmin, fetchOrganizationMembersAdmin, fetchPayoutsAdmin, fetchStripePaymentStatusAdmin } from '../../../lib/saasAdminApi'
import PublishToggle from '../../../components/saas/config/PublishToggle'
import MembersSection from './MembersSection'
import BillingNotesForm from './BillingNotesForm'
import StripeConnectForm from './StripeConnectForm'
import FeeRuleForm from './FeeRuleForm'
import OnlinePaymentToggle from './OnlinePaymentToggle'
import PayoutSection from './PayoutSection'
import { feeMonthSummary, formatFeeRule, formatStripeStatus, resolveFeeMonth } from './feeFormat'
import ModulesForm from './ModulesForm'
import { orgModules } from '../../../lib/orgModules'
import ReviewBox from './ReviewBox'
import { computeSetupSteps, setupProgressCount } from '../../setupProgress'

/** Ohne das erbt diese Seite den Layout-Titel "CampsPilot Plattform" —
 * gleicher Tab-Titel egal welchen Verein man sich gerade ansieht
 * (MVP-Oberflächenauftrag: "jederzeit erkennbar, ob ich gerade die
 * Plattform [oder] einen bestimmten Verein ... sehe"). */
export async function generateMetadata({ params }: { params: Promise<{ org: string }> }): Promise<Metadata> {
  const { org: orgSlug } = await params
  const token = await getValidAccessToken()
  if (!token) return { title: 'CampsPilot Plattform' }
  try {
    const org = await fetchOrganizationAdmin(orgSlug, token)
    return { title: org ? `${org.name} – Plattform` : 'CampsPilot Plattform' }
  } catch {
    return { title: 'CampsPilot Plattform' }
  }
}

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
export default async function PlatformOrgDetailPage({ params, searchParams }: {
  params: Promise<{ org: string }>
  searchParams: Promise<{ month?: string | string[]; payout_month?: string | string[] }>
}) {
  const { org: orgSlug } = await params
  const { month: requestedMonth, payout_month: requestedPayoutMonth } = await searchParams
  const token = await getValidAccessToken()
  if (!token) redirect('/platform/login')

  const org = await fetchOrganizationAdmin(orgSlug, token)
  if (!org) notFound()

  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date())
  const feeMonthKey = resolveFeeMonth(requestedMonth, today.slice(0, 7))
  const payoutMonthKey = resolveFeeMonth(requestedPayoutMonth, today.slice(0, 7))
  const [camps, members, feeRules, stripeStatus, feeMonth, payouts] = await Promise.all([
    fetchCampsAdmin(orgSlug, token),
    fetchOrganizationMembersAdmin(orgSlug, token),
    // Billing data must not break the rest of the console page.
    fetchFeeRulesAdmin(orgSlug, token).catch(() => null),
    fetchStripePaymentStatusAdmin(orgSlug, token).catch(() => null),
    fetchFeeMonthAdmin(orgSlug, token, feeMonthKey).catch(() => null),
    fetchPayoutsAdmin(orgSlug, token, payoutMonthKey).catch(() => null),
  ])
  const steps = computeSetupSteps(org, camps.length)
  const progress = setupProgressCount(steps)

  return (
    <main className={`mx-auto w-full max-w-[1128px] px-4 py-10 md:px-6 [&>*]:max-w-[880px] ${org.review_status === 'submitted' ? 'cp-review-page' : 'pb-24 md:pb-10'}`}>
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
          <ButtonLink href={`/pilot/${org.slug}/dashboard`} variant="primary">Vereinsverwaltung öffnen</ButtonLink>
          <ButtonLink href={`/pilot/${org.slug}/konfiguration`}>Bearbeiten</ButtonLink>
          <ButtonLink href={`/platform/${org.slug}/preview`}>Vorschau</ButtonLink>
          {org.site_published && <ButtonLink href={`/pilot/${org.slug}`}>Öffentliche Seite</ButtonLink>}
        </div>
      </div>

      <div className="mb-8">
        <PublishToggle orgSlug={org.slug} published={org.site_published} />
      </div>

      <ReviewBox org={org} camps={camps} />

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
                    background: step.done ? 'var(--cp-ok-bg)' : 'var(--cp-surface-sunken)',
                    color: step.done ? 'var(--cp-ok)' : 'var(--cp-muted)',
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

      <MembersSection orgSlug={org.slug} members={members} />

      <section id="module" className="mb-8 scroll-mt-24">
        <h2 className="cp-heading mb-3" style={{ color: 'var(--cp-ink)' }}>
          Module
        </h2>
        <div className="rounded-[var(--cp-r-card)] border p-4" style={{ borderColor: 'var(--cp-line)', background: 'var(--cp-surface)' }}>
          <p className="cp-body mb-3" style={{ color: 'var(--cp-ink-2)' }}>
            Trainings, Mitgliederliste und Spielerakte sind Zusatzmodule. Abschalten blendet sie für den Verein aus; Daten bleiben erhalten.
          </p>
          <ModulesForm orgSlug={org.slug} modules={orgModules(org)} />
        </div>
      </section>

      <section>
        <h2 className="cp-heading mb-3" style={{ color: 'var(--cp-ink)' }}>
          Abrechnung
        </h2>
        <div className="rounded-[var(--cp-r-card)] border p-4" style={{ borderColor: 'var(--cp-line)', background: 'var(--cp-surface)' }}>
          <p className="cp-body" style={{ color: 'var(--cp-ink)' }}>
            Vertragsstatus: {PLAN_STATUS_LABEL[org.plan_status] ?? org.plan_status}
          </p>
          <BillingNotesForm orgSlug={org.slug} billingNotes={org.billing_notes ?? null} />
        </div>
      </section>

      <section className="mt-8" aria-labelledby="fee-heading">
        <h2 id="fee-heading" className="cp-heading mb-3" style={{ color: 'var(--cp-ink)' }}>
          Plattformgebühr
        </h2>
        <div className="rounded-[var(--cp-r-card)] border p-4" style={{ borderColor: 'var(--cp-line)', background: 'var(--cp-surface)' }}>
          <p className="cp-body" style={{ color: 'var(--cp-ink)' }} data-testid="fee-current">
            Aktuell: {feeRules ? formatFeeRule(feeRules.current) : 'nicht abrufbar'}
            {feeRules && !feeRules.current.id ? ' (Standard, keine Regel hinterlegt)' : ''}
          </p>
          <p className="cp-body mt-1" style={{ color: 'var(--cp-ink-2)' }} data-testid="stripe-status">
            Stripe: {formatStripeStatus(stripeStatus)}
          </p>
          {stripeStatus && <OnlinePaymentToggle orgSlug={org.slug} enabled={stripeStatus.platform_enabled} />}
          {feeRules && feeRules.history.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="cp-body w-full text-left">
                <caption className="sr-only">Gebührenverlauf</caption>
                <thead>
                  <tr style={{ color: 'var(--cp-muted)' }}>
                    <th className="py-1 pr-3 font-normal">Gültig ab</th>
                    <th className="py-1 pr-3 font-normal">Gebühr</th>
                    <th className="py-1 pr-3 font-normal">Angelegt</th>
                    <th className="py-1 font-normal">Notiz</th>
                  </tr>
                </thead>
                <tbody>
                  {feeRules.history.map(rule => (
                    <tr key={rule.id ?? rule.valid_from ?? ''} style={{ borderTop: '1px solid var(--cp-line)' }}>
                      <td className="py-1 pr-3">{rule.valid_from}</td>
                      <td className="py-1 pr-3">{formatFeeRule(rule)}</td>
                      <td className="py-1 pr-3">{rule.created_by_email ?? 'Migration'}{rule.created_at ? ` · ${rule.created_at.slice(0, 10)}` : ''}</td>
                      <td className="py-1">{rule.note ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <FeeRuleForm orgSlug={org.slug} today={today} />
          <div className="mt-6" data-testid="fee-month">
            <h3 className="cp-body font-semibold" style={{ color: 'var(--cp-ink)' }}>Monatsübersicht {feeMonthKey}</h3>
            <form method="get" className="mt-2 flex flex-wrap items-center gap-2">
              <label htmlFor="fee_month" className="cp-body">Monat</label>
              <input id="fee_month" name="month" type="month" defaultValue={feeMonthKey} min="2000-01" required className="cp-body rounded border px-2 py-1" style={{ borderColor: 'var(--cp-line)' }} />
              <Button type="submit">Anzeigen</Button>
            </form>
            {feeMonth ? (
              <dl className="cp-body mt-3 grid max-w-[480px] grid-cols-[1fr_auto] gap-x-6 gap-y-1">
                {feeMonthSummary(feeMonth).map(row => (
                  <div key={row.label} className="contents">
                    <dt style={{ color: row.label === 'Summe' ? 'var(--cp-ink)' : 'var(--cp-ink-2)' }}>{row.label}</dt>
                    <dd className={row.label === 'Summe' ? 'text-right font-semibold' : 'text-right'}>{row.value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="cp-body mt-3" style={{ color: 'var(--cp-ink-2)' }}>Monatsübersicht nicht abrufbar.</p>
            )}
            <p className="cp-body mt-2" style={{ color: 'var(--cp-ink-2)' }}>Beträge zzgl. USt. Die Grundgebühr gilt nach der Regel vom letzten Tag des Monats (im laufenden Monat: heute).</p>
          </div>
        </div>
      </section>

      <PayoutSection orgSlug={org.slug} monthKey={payoutMonthKey} payouts={payouts} today={today} />

      <section className="mt-8">
        <h2 className="cp-heading mb-3" style={{ color: 'var(--cp-ink)' }}>
          Online-Zahlung (Stripe)
        </h2>
        <div className="rounded-[var(--cp-r-card)] border p-4" style={{ borderColor: 'var(--cp-line)', background: 'var(--cp-surface)' }}>
          <p className="cp-body" style={{ color: 'var(--cp-ink)' }}>
            Kein Verein richtet Online-Zahlung selbst ein: Mit „Freigeben“ oben zieht CampsPilot die Zahlungen auf dem Plattformkonto ein, ein Stripe-Konto des Vereins ist nicht nötig. Hier nur für Altkonten: ein bestehendes Standard-Konto verbinden (Direct Charges, ohne Plattformgebühr).
          </p>
          <StripeConnectForm orgSlug={org.slug} />
        </div>
      </section>
    </main>
  )
}
