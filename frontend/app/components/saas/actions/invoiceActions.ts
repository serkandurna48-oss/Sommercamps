'use server'

import { revalidatePath } from 'next/cache'
import { getAdminToken } from '../../../lib/adminSession'
import { de } from '../../../lib/i18n/de'
import {
  AdminActionError,
  createRegistrationInvoiceAdmin,
  fetchRegistrationInvoicesAdmin,
  type RegistrationInvoices,
} from '../../../lib/saasAdminApi'

export interface InvoiceActionState {
  error: string | null
  success: string | null
}

const SESSION_EXPIRED = 'Deine Sitzung ist abgelaufen – bitte melde dich neu an.'

function message(error: unknown, fallback: string): string {
  return error instanceof AdminActionError ? error.message : fallback
}

export async function loadRegistrationInvoicesAction(
  orgSlug: string,
  registrationToken: string,
): Promise<RegistrationInvoices | null> {
  const token = await getAdminToken()
  if (!token) return null
  try {
    return await fetchRegistrationInvoicesAdmin(orgSlug, registrationToken, token)
  } catch {
    return null
  }
}

export async function createInvoiceAction(orgSlug: string, registrationToken: string): Promise<InvoiceActionState> {
  const token = await getAdminToken()
  if (!token) return { error: SESSION_EXPIRED, success: null }
  try {
    const invoice = await createRegistrationInvoiceAdmin(orgSlug, registrationToken, token)
    revalidatePath(`/pilot/${orgSlug}/zahlungen`)
    return { error: null, success: `Rechnung ${invoice.number} erstellt.` }
  } catch (error) {
    return { error: message(error, de.invoices.createError), success: null }
  }
}
