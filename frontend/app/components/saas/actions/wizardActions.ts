'use server'

import { revalidatePath } from 'next/cache'
import { getValidAccessToken } from '../../../lib/supabaseServer'
import { updateOrganizationAdmin } from '../../../lib/saasAdminApi'
import { isAllowedImageUrl } from '../../../lib/imageUrl'

const URL_ERROR = 'Bitte eine https-Adresse oder einen Pfad wie /clubs/verein/logo.png eintragen.'

function str(d: FormData, k: string): string | null {
  const v = d.get(k)
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

export async function saveAuftrittAction(
  orgSlug: string,
  _prev: { ok: boolean; error?: string },
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const token = await getValidAccessToken()
  if (!token) return { ok: false, error: 'Sitzung abgelaufen – bitte neu anmelden.' }

  const name = str(formData, 'name')
  if (!name) return { ok: false, error: 'Vereinsname darf nicht leer sein.' }

  const logo_url = formData.get('logo_url')?.toString().trim() || null
  if (logo_url && !isAllowedImageUrl(logo_url)) return { ok: false, error: URL_ERROR }

  const primary_color = formData.get('primary_color')?.toString().trim() || null

  try {
    await updateOrganizationAdmin(orgSlug, token, { name, logo_url, primary_color })
  } catch {
    return { ok: false, error: 'Konnte nicht gespeichert werden – erneut versuchen.' }
  }

  revalidatePath(`/pilot/${orgSlug}`, 'layout')
  return { ok: true }
}

export async function saveRechtlichesAction(
  orgSlug: string,
  _prev: { ok: boolean; error?: string },
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const token = await getValidAccessToken()
  if (!token) return { ok: false, error: 'Sitzung abgelaufen – bitte neu anmelden.' }

  const contact_email = str(formData, 'contact_email')
  if (!contact_email) return { ok: false, error: 'Kontakt-E-Mail ist ein Pflichtfeld.' }

  const legal_address = formData.get('legal_address')?.toString().trim() || null
  const terms_text = formData.get('terms_text')?.toString().trim() || null

  try {
    await updateOrganizationAdmin(orgSlug, token, { contact_email, legal_address, terms_text })
  } catch {
    return { ok: false, error: 'Konnte nicht gespeichert werden – erneut versuchen.' }
  }

  revalidatePath(`/pilot/${orgSlug}`, 'layout')
  return { ok: true }
}
