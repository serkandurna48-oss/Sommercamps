'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getAdminToken } from '../../../lib/adminSession'
import { CAMP_STATUSES } from '../../../lib/i18n/de'
import { parseZonedDateTime } from '../../../lib/dateTimeInput'
import { createCampAdmin, SlugConflictError, updateCampAdmin, updateOrganizationAdmin } from '../../../lib/saasAdminApi'

export interface ConfigActionState {
  error: string | null
  saved: boolean
  /** Nur von updateCampConfigAction gesetzt: der Status, der bei Erfolg
   * tatsächlich persistiert wurde. Wird von CampConfigForm statt der
   * `camp`-Prop als Erfolgs-Quelle genutzt (Bug, gefunden im Review):
   * `camp` kommt aus einer separaten, späteren Revalidierung — im Render,
   * in dem `state.saved` erstmals true wird, ist `camp.status` noch der
   * ALTE Wert von vor dem Save. Nur der Server-Roundtrip selbst kennt in
   * diesem Moment zuverlässig den neuen Stand. */
  status?: 'draft' | 'published' | 'closed' | 'archived'
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
      legal_address: optionalStr(formData, 'legal_address'),
      contact_phone: optionalStr(formData, 'contact_phone'),
      contact_person_name: optionalStr(formData, 'contact_person_name'),
      logo_url: optionalStr(formData, 'logo_url'),
      primary_color: optionalStr(formData, 'primary_color'),
      iban: optionalStr(formData, 'iban'),
      intro_heading: optionalStr(formData, 'intro_heading'),
      intro_text: optionalStr(formData, 'intro_text'),
      hero_image_url: optionalStr(formData, 'hero_image_url'),
      billing_notes: optionalStr(formData, 'billing_notes'),
    })
  } catch {
    return { error: 'Konnte nicht gespeichert werden — Angaben prüfen und erneut versuchen.', saved: false }
  }

  revalidatePath(`/pilot/${orgSlug}`, 'layout')
  revalidatePath(`/platform/${orgSlug}`)
  return { error: null, saved: true }
}

export interface PublishActionState {
  error: string | null
}

/** Eigene, kleine Aktion statt Wiederverwendung von
 * updateOrganizationConfigAction — Veröffentlichen/Zurückziehen ist ein
 * bewusster Ein-Klick-Schalter (siehe Auftrag "bewusste Veröffentlichung"),
 * kein Nebeneffekt eines vollen Formular-Speicherns mit allen anderen
 * Stammdaten-Feldern im selben Request. */
export async function setOrganizationPublishedAction(
  orgSlug: string,
  published: boolean,
  _prev: PublishActionState,
  _formData: FormData,
): Promise<PublishActionState> {
  const token = await getAdminToken()
  if (!token) return { error: 'Sitzung abgelaufen — bitte neu anmelden.' }

  try {
    await updateOrganizationAdmin(orgSlug, token, { site_published: published })
  } catch {
    return { error: 'Konnte nicht gespeichert werden — erneut versuchen.' }
  }

  revalidatePath(`/pilot/${orgSlug}`, 'layout')
  revalidatePath(`/platform/${orgSlug}`)
  revalidatePath('/platform')
  return { error: null }
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
      registration_start: parseZonedDateTime(formData.get('registration_start')),
      registration_end: parseZonedDateTime(formData.get('registration_end')),
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
  return { error: null, saved: true, status: status as 'draft' | 'published' | 'closed' | 'archived' }
}

export interface CampCreateActionState {
  error: string | null
}

/** Anders als updateCampConfigAction: braucht `slug` (Pflichtfeld bei
 * POST, bei PATCH bewusst kein Feld — siehe CampConfigUpdate) und leitet
 * bei Erfolg direkt in die frische Camp-Konfiguration weiter, statt nur
 * ein saved:true zurückzugeben — es gibt noch keine Seite, auf der man
 * "geblieben" sein könnte. */
export async function createCampAction(
  orgSlug: string,
  _prev: CampCreateActionState,
  formData: FormData,
): Promise<CampCreateActionState> {
  const token = await getAdminToken()
  if (!token) return { error: 'Sitzung abgelaufen — bitte neu anmelden.' }

  const slug = str(formData, 'slug')
  const title = str(formData, 'title')
  const startDate = str(formData, 'start_date')
  const endDate = str(formData, 'end_date')
  const ageMinRaw = str(formData, 'age_min')
  const ageMaxRaw = str(formData, 'age_max')
  const capacityRaw = str(formData, 'capacity')
  const priceEurosRaw = str(formData, 'price_euros')

  if (!slug || !title || !startDate || !endDate || !ageMinRaw || !ageMaxRaw || !capacityRaw || !priceEurosRaw) {
    return { error: 'Bitte alle Pflichtfelder ausfüllen.' }
  }

  const ageMin = Number(ageMinRaw)
  const ageMax = Number(ageMaxRaw)
  const capacity = Number(capacityRaw)
  const priceEuros = Number(priceEurosRaw.replace(',', '.'))
  if (![ageMin, ageMax, capacity, priceEuros].every(Number.isFinite)) {
    return { error: 'Zahlenfelder bitte ohne Sonderzeichen eingeben.' }
  }

  const publishNow = formData.get('publish_now') === 'on'

  try {
    await createCampAdmin(orgSlug, token, {
      slug,
      title,
      start_date: startDate,
      end_date: endDate,
      age_min: ageMin,
      age_max: ageMax,
      capacity,
      price_cents: Math.round(priceEuros * 100),
      status: publishNow ? 'published' : 'draft',
    })
  } catch (err) {
    if (err instanceof SlugConflictError) {
      return { error: `Der Slug „${slug}" ist bereits vergeben — einen anderen wählen.` }
    }
    return { error: 'Camp konnte nicht angelegt werden — Angaben prüfen und erneut versuchen.' }
  }

  revalidatePath(`/pilot/${orgSlug}`, 'layout')
  redirect(`/pilot/${orgSlug}/camps/${slug}/konfiguration`)
}
