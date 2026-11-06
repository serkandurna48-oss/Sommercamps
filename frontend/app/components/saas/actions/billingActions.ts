'use server'

import { revalidatePath } from 'next/cache'
import { getValidAccessToken } from '../../../lib/supabaseServer'
import {
  AdminActionError,
  BillingValidationError,
  saveBillingProfileAdmin,
  startStripeOnboardingAdmin,
  syncStripePaymentStatusAdmin,
  type BillingProfileInput,
  type TaxStatus,
} from '../../../lib/saasAdminApi'

export interface BillingProfileActionState {
  error: string | null
  field?: string
  saved: boolean
}

export interface StripeSetupActionState {
  error: string | null
  url?: string
  checked?: boolean
}

const SESSION_EXPIRED = 'Deine Sitzung ist abgelaufen – bitte melde dich neu an.'
const TAX_STATUSES: TaxStatus[] = ['ust_pflichtig', 'kleinunternehmer', 'steuerbefreit']

function text(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

/** Reads the form into the API shape. Server-side rules stay authoritative;
 * this only catches the obvious cases with a field-specific hint. */
export async function readBillingProfile(formData: FormData): Promise<{ data?: BillingProfileInput; error?: string; field?: string }> {
  const taxStatus = text(formData, 'tax_status') as TaxStatus
  if (!TAX_STATUSES.includes(taxStatus)) return { error: 'Bitte wähle den Steuerstatus.', field: 'tax_status' }
  const rate = text(formData, 'default_vat_rate')
  const data: BillingProfileInput = {
    legal_name: text(formData, 'legal_name'),
    street: text(formData, 'street'),
    postal_code: text(formData, 'postal_code'),
    city: text(formData, 'city'),
    tax_number: text(formData, 'tax_number') || null,
    vat_id: text(formData, 'vat_id').replace(/\s+/g, '').toUpperCase() || null,
    tax_status: taxStatus,
    default_vat_rate: taxStatus === 'ust_pflichtig' ? (rate === '7' ? 7 : rate === '19' ? 19 : null) : null,
    tax_exemption_text: taxStatus === 'steuerbefreit' ? text(formData, 'tax_exemption_text') || null : null,
    invoice_number_prefix: text(formData, 'invoice_number_prefix').toUpperCase(),
    invoice_email: text(formData, 'invoice_email'),
  }
  if (!/^[0-9]{5}$/.test(data.postal_code)) return { error: 'Die Postleitzahl hat fünf Ziffern.', field: 'postal_code' }
  if (taxStatus === 'ust_pflichtig' && data.default_vat_rate === null) {
    return { error: 'Bitte wähle den Umsatzsteuersatz (19 % oder 7 %).', field: 'default_vat_rate' }
  }
  if (taxStatus !== 'steuerbefreit' && !data.tax_number && !data.vat_id) {
    return { error: 'Bitte trag deine Steuernummer oder USt-IdNr. ein.', field: 'tax_number' }
  }
  if (taxStatus === 'steuerbefreit' && (data.tax_exemption_text ?? '').length < 5) {
    return { error: 'Bitte nenne den Grund der Steuerbefreiung, so wie er auf der Rechnung stehen soll.', field: 'tax_exemption_text' }
  }
  if (!/^[A-Z0-9][A-Z0-9-]{0,11}$/.test(data.invoice_number_prefix)) {
    return { error: 'Das Präfix darf nur Buchstaben, Ziffern und Bindestriche enthalten (max. 12 Zeichen).', field: 'invoice_number_prefix' }
  }
  return { data }
}

export async function saveBillingProfileAction(
  orgSlug: string,
  _previous: BillingProfileActionState,
  formData: FormData,
): Promise<BillingProfileActionState> {
  const token = await getValidAccessToken()
  if (!token) return { error: SESSION_EXPIRED, saved: false }
  const parsed = await readBillingProfile(formData)
  if (!parsed.data) return { error: parsed.error ?? 'Bitte prüfe deine Angaben.', field: parsed.field, saved: false }
  try {
    await saveBillingProfileAdmin(orgSlug, token, parsed.data)
  } catch (error) {
    if (error instanceof BillingValidationError) return { error: error.message, field: error.field, saved: false }
    return { error: error instanceof AdminActionError ? error.message : 'Rechnungsdaten konnten nicht gespeichert werden.', saved: false }
  }
  revalidatePath(`/pilot/${orgSlug}/konfiguration`)
  return { error: null, saved: true }
}

export async function startStripeOnboardingAction(
  orgSlug: string,
  _previous: StripeSetupActionState,
  formData: FormData,
): Promise<StripeSetupActionState> {
  const token = await getValidAccessToken()
  if (!token) return { error: SESSION_EXPIRED }
  const businessType = text(formData, 'business_type') === 'company' ? 'company' : 'non_profit'
  try {
    return { error: null, url: await startStripeOnboardingAdmin(orgSlug, token, businessType) }
  } catch (error) {
    return { error: error instanceof AdminActionError ? error.message : 'Stripe-Einrichtung konnte nicht gestartet werden.' }
  }
}

export async function syncStripeStatusAction(
  orgSlug: string,
  _previous: StripeSetupActionState,
): Promise<StripeSetupActionState> {
  const token = await getValidAccessToken()
  if (!token) return { error: SESSION_EXPIRED }
  try {
    await syncStripePaymentStatusAdmin(orgSlug, token)
  } catch (error) {
    return { error: error instanceof AdminActionError ? error.message : 'Status konnte nicht geprüft werden.' }
  }
  revalidatePath(`/pilot/${orgSlug}/konfiguration`)
  return { error: null, checked: true }
}
