import OrganizationConfigForm from '../config/OrganizationConfigForm'
import BillingProfileForm from '../billing/BillingProfileForm'
import PaymentSetupCard from '../billing/PaymentSetupCard'
import PendingInvoicesNotice from '../billing/PendingInvoicesNotice'
import PageHeader from '../shell/PageHeader'
import { de } from '../../../lib/i18n/de'
import type { BillingProfile, StripePaymentStatus } from '../../../lib/saasAdminApi'
import type { OrganizationIdentityProps } from './types'
import { PAGE_FORM } from '../ui/pageLayout'

export interface OrgBillingProps {
  profile: BillingProfile | null
  /** null = could not be loaded */
  paymentStatus: StripePaymentStatus | null
  profileError?: boolean
  /** Paid bookings waiting for an invoice (billing master data was missing). */
  pendingInvoices?: number
}

const SECTION = 'rounded-[var(--cp-r-card)] border p-4 md:p-6'
const SECTION_STYLE = { borderColor: 'var(--cp-line)', background: 'var(--cp-surface)' }

export default function OrgConfigScreen({ orgSlug, org, billing }: OrganizationIdentityProps & { billing?: OrgBillingProps }) {

  return (
    <>
      <PageHeader
        title="Vereinseinstellungen"
        subtitle={de.configPage.orgHint}
      />

      <main className={PAGE_FORM}>
        <h2 className="sr-only">{de.configPage.orgHeading}</h2>

        <OrganizationConfigForm orgSlug={orgSlug} org={org} />

        {billing && (
          <>
            <section id="zahlungen" className="mt-10 scroll-mt-24" aria-labelledby="zahlungen-heading">
              <h2 id="zahlungen-heading" className="cp-heading mb-3" style={{ color: 'var(--cp-ink)' }}>Zahlungen</h2>
              <div className={SECTION} style={SECTION_STYLE}>
                <PaymentSetupCard orgSlug={orgSlug} status={billing.paymentStatus} />
              </div>
            </section>
            <section id="rechnungsdaten" className="mt-10 scroll-mt-24" aria-labelledby="rechnungsdaten-heading">
              <h2 id="rechnungsdaten-heading" className="cp-heading mb-3" style={{ color: 'var(--cp-ink)' }}>Rechnungsdaten</h2>
              <div className={SECTION} style={SECTION_STYLE}>
                {(billing.pendingInvoices ?? 0) > 0 && (
                  <PendingInvoicesNotice orgSlug={orgSlug} count={billing.pendingInvoices ?? 0} profileComplete={Boolean(billing.profile)} />
                )}
                {billing.profileError
                  ? <p role="alert" className="cp-body">Die Rechnungsdaten konnten gerade nicht geladen werden. Bitte lade die Seite neu.</p>
                  : <BillingProfileForm orgSlug={orgSlug} profile={billing.profile} />}
              </div>
            </section>
          </>
        )}
      </main>
    </>
  )
}
