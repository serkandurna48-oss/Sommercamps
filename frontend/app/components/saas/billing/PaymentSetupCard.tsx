'use client'

import { useActionState, useEffect } from 'react'
import type { StripePaymentStatus } from '../../../lib/saasAdminApi'
import { startStripeOnboardingAction, syncStripeStatusAction, type StripeSetupActionState } from '../actions/billingActions'
import { previewNoopAction, useAdminPreview } from '../preview/AdminPreviewContext'
import Button from '../ui/Button'
import Field from '../ui/Field'
import { INPUT_CLASS, INPUT_STYLE } from '../ui/formFieldStyles'

const STATE_LABEL: Record<StripePaymentStatus['state'], string> = {
  not_set_up: 'Nicht eingerichtet',
  incomplete: 'Angaben fehlen',
  awaiting_approval: 'Wartet auf Freigabe',
  active: 'Aktiv',
}

const STATE_TONE: Record<StripePaymentStatus['state'], { color: string; background: string }> = {
  not_set_up: { color: 'var(--cp-muted)', background: 'var(--cp-surface-sunken)' },
  incomplete: { color: 'var(--cp-pending)', background: 'var(--cp-pending-bg)' },
  awaiting_approval: { color: 'var(--cp-info)', background: 'var(--cp-info-bg)' },
  active: { color: 'var(--cp-ok)', background: 'var(--cp-ok-bg)' },
}

/** Einstellungen → Zahlungen. Club admins are addressed with "du". */
export default function PaymentSetupCard({ orgSlug, status }: { orgSlug: string; status: StripePaymentStatus | null }) {
  const preview = useAdminPreview()
  const [onboarding, startAction, starting] = useActionState<StripeSetupActionState, FormData>(
    preview ? previewNoopAction : (previous, data) => startStripeOnboardingAction(orgSlug, previous, data),
    { error: null },
  )
  const [check, checkAction, checking] = useActionState<StripeSetupActionState, FormData>(
    preview ? previewNoopAction : previous => syncStripeStatusAction(orgSlug, previous),
    { error: null },
  )
  useEffect(() => {
    // Stripe onboarding is a hosted page; the link is single-use.
    if (onboarding.url) window.location.assign(onboarding.url)
  }, [onboarding.url])

  if (!status) {
    return <p role="alert" className="cp-body">Der Zahlungsstatus konnte gerade nicht geladen werden. Bitte lade die Seite neu.</p>
  }
  const state = status.state
  const busy = starting || checking || Boolean(onboarding.url)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="cp-chip rounded-[var(--cp-r-chip)] px-3 py-1" style={STATE_TONE[state]} data-testid="payment-state">
          {STATE_LABEL[state]}
        </span>
        {state === 'active' && !status.payouts_enabled && (
          <span className="cp-body" style={{ color: 'var(--cp-muted)' }}>Auszahlungen sind bei Stripe noch nicht freigegeben.</span>
        )}
      </div>

      {state === 'not_set_up' && (
        <p className="cp-body" style={{ color: 'var(--cp-ink-2)' }}>
          Damit Eltern direkt nach der Anmeldung online bezahlen können, richtest du einmalig ein Konto bei unserem
          Zahlungspartner Stripe ein. Halte dafür die Vereinsdaten, die IBAN und die Angaben zur vertretungsberechtigten
          Person bereit. Die Zahlungen gehen direkt auf das Stripe-Konto deines Vereins, abzüglich der Stripe-Gebühren und der vereinbarten Plattformgebühr. Dein Verein ist Verkäufer, Stripe übernimmt die Risikoprüfung. Die Überweisung bleibt für Eltern immer möglich.
        </p>
      )}
      {state === 'incomplete' && (
        <p className="cp-body" style={{ color: 'var(--cp-ink-2)' }}>
          Stripe braucht noch Angaben von dir{status.requirements_due > 0 ? ` (${status.requirements_due} offen)` : ''}.
          Setz die Einrichtung fort; danach kannst du hier den Status prüfen.
        </p>
      )}
      {state === 'awaiting_approval' && (
        <p className="cp-body" style={{ color: 'var(--cp-ink-2)' }}>
          Bei Stripe ist alles erledigt. CampsPilot schaltet die Online-Zahlung für deinen Verein jetzt noch frei – du musst nichts weiter tun.
        </p>
      )}
      {state === 'active' && (
        <p className="cp-body" style={{ color: 'var(--cp-ink-2)' }}>
          Online-Zahlung ist aktiv. Eltern sehen nach der Anmeldung „Online bezahlen“.
        </p>
      )}

      {status.legacy_account_linked && (
        <p className="cp-body rounded-[var(--cp-r-chip)] border px-3 py-2" style={{ borderColor: 'var(--cp-line)', color: 'var(--cp-ink-2)' }} data-testid="legacy-notice">
          {state === 'active' || state === 'awaiting_approval'
            ? 'Dein bisher verbundenes Stripe-Konto wird für neue Zahlungen nicht mehr genutzt.'
            : status.legacy_active
              ? 'Zahlungen laufen derzeit noch über dein bisher verbundenes Stripe-Konto. Sobald die neue Einrichtung aktiv ist, wechseln neue Zahlungen automatisch.'
              : 'Ein älteres Stripe-Konto ist verbunden, aber nicht für Zahlungen freigegeben.'}
        </p>
      )}

      {!status.service_ready && (
        <p className="cp-body" style={{ color: 'var(--cp-muted)' }}>In dieser Umgebung ist die Online-Zahlung noch nicht freigeschaltet.</p>
      )}

      {status.service_ready && (state === 'not_set_up' || state === 'incomplete') && (
        <form action={startAction} className="flex flex-col gap-3">
          {state === 'not_set_up' && (
            <Field label="Rechtsform" htmlFor="business_type" hint="Nur für die Einrichtung bei Stripe.">
              <select id="business_type" name="business_type" defaultValue="non_profit" className={INPUT_CLASS} style={INPUT_STYLE}>
                <option value="non_profit">Verein (e. V.) oder gemeinnützige Organisation</option>
                <option value="company">Unternehmen (z. B. GmbH, UG)</option>
              </select>
            </Field>
          )}
          <div>
            <Button type="submit" variant="primary" disabled={busy}>
              {starting || onboarding.url ? 'Weiter zu Stripe …' : state === 'not_set_up' ? 'Online-Zahlung einrichten' : 'Einrichtung fortsetzen'}
            </Button>
          </div>
        </form>
      )}
      {onboarding.error && <p role="alert">{onboarding.error}</p>}

      {status.service_ready && state !== 'not_set_up' && (
        <form action={checkAction}>
          <Button type="submit" disabled={busy}>{checking ? 'Wird geprüft …' : 'Status prüfen'}</Button>
        </form>
      )}
      {!checking && check.error && <p role="alert">{check.error}</p>}
      {!checking && check.checked && <p role="status">Status aktualisiert.</p>}
    </div>
  )
}
