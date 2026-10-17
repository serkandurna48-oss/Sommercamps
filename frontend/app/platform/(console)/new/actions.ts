'use server'

import { redirect } from 'next/navigation'
import { getAdminToken } from '../../../lib/adminSession'
import {
  createCampAdmin,
  createOrganizationAdmin,
  SlugConflictError,
  type CampCreateInput,
  type OrganizationCreateInput,
} from '../../../lib/saasAdminApi'

export interface NewOrgState {
  error: string | null
  /** Gesetzt, wenn der Verein zwar angelegt wurde, das erste Camp aber
   * nicht — Formular soll dann nicht erneut "Verein anlegen" versuchen
   * (würde auf denselben Slug treffen), sondern zur Verwaltung verweisen. */
  orgCreatedSlug: string | null
}

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim()
}

function optionalStr(formData: FormData, key: string): string | null {
  const value = str(formData, key)
  return value ? value : null
}

export async function createOrganizationWithCampAction(
  _prev: NewOrgState,
  formData: FormData,
): Promise<NewOrgState> {
  const token = await getAdminToken()
  if (!token) return { error: 'Sitzung abgelaufen — bitte neu anmelden.', orgCreatedSlug: null }

  const orgSlug = str(formData, 'org_slug')
  const orgName = str(formData, 'org_name')
  const contactEmail = str(formData, 'contact_email')
  if (!orgSlug || !orgName || !contactEmail) {
    return { error: 'Vereins-Slug, Name und Kontakt-E-Mail sind Pflichtfelder.', orgCreatedSlug: null }
  }

  const orgData: OrganizationCreateInput = {
    slug: orgSlug,
    name: orgName,
    contact_email: contactEmail,
    contact_phone: optionalStr(formData, 'contact_phone'),
    contact_person_name: optionalStr(formData, 'contact_person_name'),
    primary_color: optionalStr(formData, 'primary_color'),
    // site_published bewusst NICHT gesetzt — Backend-Default ist false
    // (admin_schemas.OrganizationCreate.site_published), der Verein bleibt
    // Entwurf, bis über den Veröffentlichen-Schalter (Vereinsdetailseite)
    // bewusst veröffentlicht wird.
  }

  try {
    await createOrganizationAdmin(token, orgData)
  } catch (err) {
    if (err instanceof SlugConflictError) {
      return { error: `Der Slug „${orgSlug}" ist bereits vergeben — einen anderen wählen.`, orgCreatedSlug: null }
    }
    return { error: 'Verein konnte nicht gespeichert werden — Angaben prüfen und erneut versuchen.', orgCreatedSlug: null }
  }

  // Verein steht ab hier — ein Fehler ab jetzt darf kein erneutes
  // "Verein anlegen" mehr auslösen (Slug wäre dann belegt), siehe
  // orgCreatedSlug oben.
  const campSlug = str(formData, 'camp_slug')
  const campTitle = str(formData, 'camp_title')
  const startDate = str(formData, 'start_date')
  const endDate = str(formData, 'end_date')
  const ageMinRaw = str(formData, 'age_min')
  const ageMaxRaw = str(formData, 'age_max')
  const capacityRaw = str(formData, 'capacity')
  const priceRaw = str(formData, 'price_euros')
  const publishNow = formData.get('publish_now') === 'on'

  if (!campSlug || !campTitle || !startDate || !endDate || !ageMinRaw || !ageMaxRaw || !capacityRaw || !priceRaw) {
    return {
      error: `Verein „${orgName}" wurde angelegt, aber die Camp-Angaben sind unvollständig. Camp-Pflichtfelder ausfüllen und erneut absenden, oder direkt zur Verwaltung wechseln.`,
      orgCreatedSlug: orgSlug,
    }
  }

  const ageMin = Number(ageMinRaw)
  const ageMax = Number(ageMaxRaw)
  const capacity = Number(capacityRaw)
  const priceEuros = Number(priceRaw.replace(',', '.'))
  if (![ageMin, ageMax, capacity, priceEuros].every(Number.isFinite)) {
    return {
      error: `Verein „${orgName}" wurde angelegt, aber ein Zahlenfeld beim Camp ist ungültig. Bitte prüfen und erneut absenden, oder direkt zur Verwaltung wechseln.`,
      orgCreatedSlug: orgSlug,
    }
  }

  const campData: CampCreateInput = {
    slug: campSlug,
    title: campTitle,
    start_date: startDate,
    end_date: endDate,
    age_min: ageMin,
    age_max: ageMax,
    capacity,
    price_cents: Math.round(priceEuros * 100),
    status: publishNow ? 'published' : 'draft',
  }

  try {
    await createCampAdmin(orgSlug, token, campData)
  } catch {
    return {
      error: `Verein „${orgName}" wurde angelegt, aber das erste Camp konnte nicht gespeichert werden. In der Verwaltung erneut versuchen.`,
      orgCreatedSlug: orgSlug,
    }
  }

  // Nicht direkt in die Vereinsverwaltung — der Verein ist noch ein
  // Entwurf (site_published=false), die Betreiber-Vereinsdetailseite
  // zeigt den Einrichtungsfortschritt (Marke/Website-Inhalte fehlen meist
  // noch) und den Veröffentlichen-Schalter als nächsten Schritt.
  redirect(`/platform/${orgSlug}`)
}
