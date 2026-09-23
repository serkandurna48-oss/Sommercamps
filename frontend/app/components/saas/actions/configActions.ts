'use server'

import { revalidatePath } from 'next/cache'
import { getAdminToken } from '../../../lib/adminSession'
import { CAMP_STATUSES } from '../../../lib/i18n/de'
import { updateCampAdmin, updateOrganizationAdmin } from '../../../lib/saasAdminApi'

export interface ConfigActionState {
  error: string | null
  saved: boolean
}

function str(formData: FormData, key: string): string | undefined {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : undefined
}

/** Leerer String -> null (Feld bewusst gelöscht), nicht "nicht mitgeschickt"
 * — ein Konfigurationsformular schickt immer alle seine Felder mit, auch
 * leere (anders als ein PATCH-Client, der nur geänderte Felder sendet). */
function optionalStr(formData: FormData, key: string): string | null {
  const value = str(formData, key)
  return value ? value : null
}

/** Gegenstück zu CampConfigForm's toLocalInputValue — der Browser liefert
 * ein naives "YYYY-MM-DDTHH:mm" aus einem datetime-local-Feld, `new
 * Date(...)` interpretiert das laut ECMA-262 als lokale (Browser-)Zeit,
 * `.toISOString()` hängt den korrekten Offset wieder an. Ohne das (siehe
 * Review-Fund): dieselben Ziffern werden vom Server naiv in dessen eigener
 * Zeitzone interpretiert und verschieben registration_start/_end lautlos
 * bei jedem Speichern, auch wenn das Feld nie angefasst wurde. */
function toIsoDateTime(formData: FormData, key: string): string | null {
  const value = str(formData, key)
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export async function updateOrganizationConfigAction(
  orgSlug: string,
  _prev: ConfigActionState,
  formData: FormData,
): Promise<ConfigActionState> {
  const token = await getAdminToken()
  if (!token) return { error: 'Sitzung abgelaufen — bitte neu anmelden.', saved: false }

  const name = str(formData, 'name')
  const contactEmail = str(formData, 'contact_email')
  if (!name || !contactEmail) {
    return { error: 'Vereinsname und Kontakt-E-Mail dürfen nicht leer sein.', saved: false }
  }

  try {
    await updateOrganizationAdmin(orgSlug, token, {
      name,
      contact_email: contactEmail,
      legal_name: optionalStr(formData, 'legal_name'),
      contact_phone: optionalStr(formData, 'contact_phone'),
      logo_url: optionalStr(formData, 'logo_url'),
      primary_color: optionalStr(formData, 'primary_color'),
      iban: optionalStr(formData, 'iban'),
    })
  } catch {
    return { error: 'Konnte nicht gespeichert werden — Angaben prüfen und erneut versuchen.', saved: false }
  }

  revalidatePath(`/pilot/${orgSlug}`, 'layout')
  return { error: null, saved: true }
}

const CAMP_STATUS_SET: ReadonlySet<string> = new Set(CAMP_STATUSES)

export async function updateCampConfigAction(
  orgSlug: string,
  campSlug: string,
  _prev: ConfigActionState,
  formData: FormData,
): Promise<ConfigActionState> {
  const token = await getAdminToken()
  if (!token) return { error: 'Sitzung abgelaufen — bitte neu anmelden.', saved: false }

  const title = str(formData, 'title')
  const startDate = str(formData, 'start_date')
  const endDate = str(formData, 'end_date')
  const ageMinRaw = str(formData, 'age_min')
  const ageMaxRaw = str(formData, 'age_max')
  const capacityRaw = str(formData, 'capacity')
  const priceEurosRaw = str(formData, 'price_euros')
  const status = str(formData, 'status')

  if (!title || !startDate || !endDate || !ageMinRaw || !ageMaxRaw || !capacityRaw || !priceEurosRaw || !status) {
    return { error: 'Bitte alle Pflichtfelder ausfüllen.', saved: false }
  }
  if (!CAMP_STATUS_SET.has(status)) {
    return { error: 'Ungültiger Status.', saved: false }
  }

  const ageMin = Number(ageMinRaw)
  const ageMax = Number(ageMaxRaw)
  const capacity = Number(capacityRaw)
  const priceEuros = Number(priceEurosRaw.replace(',', '.'))
  if (![ageMin, ageMax, capacity, priceEuros].every(Number.isFinite)) {
    return { error: 'Zahlenfelder bitte ohne Sonderzeichen eingeben.', saved: false }
  }

  const includesRaw = str(formData, 'includes')
  const includes = includesRaw
    ? includesRaw
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
    : null

  try {
    await updateCampAdmin(orgSlug, campSlug, token, {
      title,
      start_date: startDate,
      end_date: endDate,
      registration_start: toIsoDateTime(formData, 'registration_start'),
      registration_end: toIsoDateTime(formData, 'registration_end'),
      age_min: ageMin,
      age_max: ageMax,
      capacity,
      price_cents: Math.round(priceEuros * 100),
      location: optionalStr(formData, 'location'),
      care_info: optionalStr(formData, 'care_info'),
      meals_info: optionalStr(formData, 'meals_info'),
      includes,
      status: status as 'draft' | 'published' | 'closed' | 'archived',
    })
  } catch {
    return { error: 'Konnte nicht gespeichert werden — Angaben prüfen und erneut versuchen.', saved: false }
  }

  revalidatePath(`/pilot/${orgSlug}`, 'layout')
  return { error: null, saved: true }
}
