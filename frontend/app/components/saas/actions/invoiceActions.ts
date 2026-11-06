'use server'

import { revalidatePath } from 'next/cache'
import { getValidAccessToken } from '../../../lib/supabaseServer'
import {
  AdminActionError,
  createRegistrationInvoiceAdmin,
  fetchRegistrationInvoicesAdmin,
  generatePendingInvoicesAdmin,
  refundRegistrationAdmin,
  resendInvoiceAdmin,
  type RegistrationInvoices,
} from '../../../lib/saasAdminApi'

export interface InvoiceActionState {
  error: string | null
  success: string | null
}

const SESSION_EXPIRED = 'Deine Sitzung ist abgelaufen – bitte melde dich neu an.'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function message(error: unknown, fallback: string): string {
  return error instanceof AdminActionError ? error.message : fallback
}

export async function loadRegistrationInvoicesAction(orgSlug: string, registrationToken: string): Promise<RegistrationInvoices | null> {
  const token = await getValidAccessToken()
  if (!token) return null
  try {
    return await fetchRegistrationInvoicesAdmin(orgSlug, registrationToken, token)
  } catch {
    return null
  }
}

export async function resendInvoiceAction(orgSlug: string, invoiceId: string, _previous: InvoiceActionState): Promise<InvoiceActionState> {
  const token = await getValidAccessToken()
  if (!token) return { error: SESSION_EXPIRED, success: null }
  try {
    const invoice = await resendInvoiceAdmin(orgSlug, invoiceId, token)
    return { error: null, success: `${invoice.number} wurde erneut gesendet.` }
  } catch (error) {
    return { error: message(error, 'Die E-Mail konnte nicht versendet werden.'), success: null }
  }
}

export async function createInvoiceAction(orgSlug: string, registrationToken: string, _previous: InvoiceActionState): Promise<InvoiceActionState> {
  const token = await getValidAccessToken()
  if (!token) return { error: SESSION_EXPIRED, success: null }
  try {
    const invoice = await createRegistrationInvoiceAdmin(orgSlug, registrationToken, token)
    revalidatePath(`/pilot/${orgSlug}/zahlungen`)
    return { error: null, success: `Rechnung ${invoice.number} erstellt und an die Familie gesendet.` }
  } catch (error) {
    return { error: message(error, 'Rechnung konnte nicht erstellt werden.'), success: null }
  }
}

export async function generatePendingInvoicesAction(orgSlug: string, _previous: InvoiceActionState): Promise<InvoiceActionState> {
  const token = await getValidAccessToken()
  if (!token) return { error: SESSION_EXPIRED, success: null }
  try {
    const result = await generatePendingInvoicesAdmin(orgSlug, token)
    revalidatePath(`/pilot/${orgSlug}/konfiguration`)
    revalidatePath(`/pilot/${orgSlug}/zahlungen`)
    const parts = [
      result.created === 1 ? '1 Rechnung erstellt' : result.created > 1 ? `${result.created} Rechnungen erstellt` : '',
      result.stornos === 1 ? '1 Stornorechnung erstellt' : result.stornos > 1 ? `${result.stornos} Stornorechnungen erstellt` : '',
    ].filter(Boolean)
    const rest = result.remaining > 0 ? ` Noch ${result.remaining} offen – klick bitte noch einmal auf „Rechnungen erzeugen“.` : ''
    if (result.failed > 0) {
      return { error: `${result.failed === 1 ? '1 Rechnung konnte' : `${result.failed} Rechnungen konnten`} nicht erzeugt werden. Versuch es später noch einmal.${rest}`, success: null }
    }
    if (parts.length === 0 && result.blocked > 0) return { error: 'Es fehlen noch Rechnungsdaten. Prüfe deine Angaben unter Einstellungen.', success: null }
    return { error: null, success: `${parts.length ? parts.join(', ') : 'Offene E-Mails gesendet'}.${rest}` }
  } catch (error) {
    return { error: message(error, 'Ausstehende Rechnungen konnten nicht erstellt werden.'), success: null }
  }
}

/** "12,50" -> 1250; undefined when invalid. */
function parseEuroCents(raw: string): number | undefined {
  const normalized = raw.trim().replace(/\s/g, '').replace(',', '.')
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(normalized)) return undefined
  return Math.round(Number(normalized) * 100)
}

export async function refundPaymentAction(
  orgSlug: string,
  registrationToken: string,
  remainingCents: number,
  _previous: InvoiceActionState,
  formData: FormData,
): Promise<InvoiceActionState> {
  const token = await getValidAccessToken()
  if (!token) return { error: SESSION_EXPIRED, success: null }
  const requestId = String(formData.get('request_id') ?? '')
  if (!UUID.test(requestId)) return { error: 'Bitte lade die Seite neu und versuch es noch einmal.', success: null }
  let amount: number | null = null
  if (formData.get('mode') === 'partial') {
    const cents = parseEuroCents(String(formData.get('amount') ?? ''))
    if (!cents || cents <= 0) return { error: 'Bitte gib einen Betrag ein, z. B. 25,00.', success: null }
    if (cents > remainingCents) return { error: 'Der Betrag ist höher als der noch erstattbare Rest.', success: null }
    amount = cents
  }
  try {
    const result = await refundRegistrationAdmin(orgSlug, registrationToken, token, requestId, amount)
    revalidatePath(`/pilot/${orgSlug}/zahlungen`)
    return { error: null, success: `Erstattung über ${(result.amount_cents / 100).toFixed(2).replace('.', ',')} € ist veranlasst. Der Status ändert sich, sobald Stripe sie bestätigt; die Familie bekommt eine Stornorechnung.` }
  } catch (error) {
    return { error: message(error, 'Erstattung fehlgeschlagen.'), success: null }
  }
}
