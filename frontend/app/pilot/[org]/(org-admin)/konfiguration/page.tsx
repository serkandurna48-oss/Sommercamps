import { notFound, redirect } from 'next/navigation'
import { getValidAccessToken } from '../../../../lib/supabaseServer'
import { getOrganizationAdmin } from '../../../../components/saas/orgAdminData'
import OrgConfigScreen, { type OrgBillingProps } from '../../../../components/saas/screens/OrgConfigScreen'
import {
  fetchBillingProfileAdmin,
  fetchInvoicesAdmin,
  fetchStripePaymentStatusAdmin,
  syncStripePaymentStatusAdmin,
  AdminAuthError,
} from '../../../../lib/saasAdminApi'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Einstellungen' }

export default async function OrgConfigPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>
  searchParams?: Promise<{ stripe?: string | string[] }>
}) {
  const { org: orgSlug } = await params
  const { stripe } = (await searchParams) ?? {}
  const token = await getValidAccessToken()
  if (!token) redirect(`/pilot/${orgSlug}/login`)

  const org = await getOrganizationAdmin(orgSlug, token)
  if (!org) notFound()

  // Back from Stripe onboarding: ask Stripe for the current state right away
  // (the account.updated webhook may arrive a few seconds later).
  const loadStatus = stripe === 'return'
    ? syncStripePaymentStatusAdmin(orgSlug, token).catch(() => fetchStripePaymentStatusAdmin(orgSlug, token))
    : fetchStripePaymentStatusAdmin(orgSlug, token)
  const [profile, paymentStatus, invoiceList] = await Promise.allSettled([
    fetchBillingProfileAdmin(orgSlug, token), loadStatus, fetchInvoicesAdmin(orgSlug, token),
  ])
  for (const result of [profile, paymentStatus]) {
    if (result.status === 'rejected' && result.reason instanceof AdminAuthError) redirect(`/pilot/${orgSlug}/login`)
  }
  const billing: OrgBillingProps = {
    profile: profile.status === 'fulfilled' ? profile.value : null,
    profileError: profile.status === 'rejected',
    paymentStatus: paymentStatus.status === 'fulfilled' ? paymentStatus.value : null,
    openInvoices: invoiceList.status === 'fulfilled' ? invoiceList.value.open : null,
  }

  return <OrgConfigScreen orgSlug={orgSlug} org={org} billing={billing} />
}
