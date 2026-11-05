/**
 * Reine Logik für die Trainings-Verwaltung (Angebote, Termine, Teilen-Links,
 * Formularprüfung). Keine React-/Server-Abhängigkeit, damit sie einzeln
 * getestet werden kann. Zeiten kommen als Berliner Ortszeit vom Backend
 * (local_date/local_time) und werden hier nur umformatiert, nie aus UTC
 * zurückgerechnet.
 */

export const OFFER_KINDS = ['einzel', 'gruppe'] as const
export const OFFER_STATUSES = ['draft', 'published', 'archived'] as const
export type OfferKind = (typeof OFFER_KINDS)[number]
export type OfferStatus = (typeof OFFER_STATUSES)[number]

export const offerKindLabel: Record<OfferKind, string> = { einzel: 'Einzeltraining', gruppe: 'Gruppentraining' }
export const offerStatusLabel: Record<OfferStatus, string> = { draft: 'Entwurf', published: 'Veröffentlicht', archived: 'Archiviert' }

const PAYMENT_METHOD_LABEL: Record<string, string> = { bar: 'Bar', ueberweisung: 'Überweisung' }

export function paymentMethodLabel(method: string | null | undefined): string {
  if (!method) return '–'
  return PAYMENT_METHOD_LABEL[method] ?? method
}

// --- Teilen ---------------------------------------------------------------

export function buildOfferUrl(origin: string, orgSlug: string, offerSlug: string): string {
  return `${origin.replace(/\/+$/, '')}/pilot/${orgSlug}/training/${offerSlug}`
}

export function buildWhatsAppUrl(title: string, url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${title} – ${url}`)}`
}

// --- Anzeige --------------------------------------------------------------

/** "2026-03-29" + "18:00" -> "29.03.2026, 18:00 Uhr" (reine Umformatierung). */
export function formatSessionWhen(localDate: string, localTime: string): string {
  const [y, m, d] = localDate.split('-')
  return `${d}.${m}.${y}, ${localTime} Uhr`
}

export function formatImportError(error: { row: number; field: string; code: string }): string {
  return `Zeile ${error.row}: Feld ${error.field} (${error.code})`
}

// --- Eingaben -------------------------------------------------------------

/** "12", "12,5", "12.50" -> Cent; alles andere (negativ, >2 Nachkommastellen, Text) -> null. */
export function parseEuroToCents(input: string): number | null {
  const text = input.trim()
  const match = /^(\d+)(?:[,.](\d{1,2}))?$/.exec(text)
  if (!match) return null
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0') || '0')
  return Number.isSafeInteger(cents) ? cents : null
}

function parseInteger(input: string): number | null {
  const text = input.trim()
  return /^\d+$/.test(text) ? Number(text) : null
}

export type FieldErrors = Record<string, string>
export type ParseResult<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors }

export interface OfferValues {
  slug?: string
  kind?: OfferKind
  title: string
  description: string | null
  duration_minutes: number
  location: string | null
  price_member_cents: number
  price_nonmember_cents: number
  status: OfferStatus
}

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function parseOfferInput(input: Record<string, string>, mode: 'create' | 'update'): ParseResult<OfferValues> {
  const errors: FieldErrors = {}
  const title = (input.title ?? '').trim()
  if (!title) errors.title = 'Bitte einen Titel eintragen.'

  const slug = (input.slug ?? '').trim()
  if (mode === 'create' && !SLUG_PATTERN.test(slug)) {
    errors.slug = 'Nur Kleinbuchstaben, Zahlen und einzelne Bindestriche.'
  }
  const kind = (input.kind ?? '').trim()
  if (mode === 'create' && !(OFFER_KINDS as readonly string[]).includes(kind)) errors.kind = 'Bitte die Art wählen.'

  const duration = parseInteger(input.duration_minutes ?? '')
  if (duration === null || duration < 1 || duration > 600) errors.duration_minutes = 'Dauer in vollen Minuten, 1 bis 600.'

  const priceMember = parseEuroToCents(input.price_member_euros ?? '')
  if (priceMember === null) errors.price_member_euros = 'Bitte einen Preis in Euro eintragen, z. B. 30,00.'
  const priceNonmember = parseEuroToCents(input.price_nonmember_euros ?? '')
  if (priceNonmember === null) errors.price_nonmember_euros = 'Bitte einen Preis in Euro eintragen, z. B. 40,00.'

  const status = (input.status ?? '').trim()
  if (!(OFFER_STATUSES as readonly string[]).includes(status)) errors.status = 'Bitte einen Status wählen.'

  if (Object.keys(errors).length > 0) return { ok: false, errors }

  const description = (input.description ?? '').trim()
  const location = (input.location ?? '').trim()
  return {
    ok: true,
    value: {
      ...(mode === 'create' ? { slug, kind: kind as OfferKind } : {}),
      title,
      description: description || null,
      duration_minutes: duration!,
      location: location || null,
      price_member_cents: priceMember!,
      price_nonmember_cents: priceNonmember!,
      status: status as OfferStatus,
    },
  }
}

export interface SessionValues {
  date: string
  start_time: string
  capacity?: number
  age_min?: number
  age_max?: number
  status: 'published' | 'draft'
}

export function parseSessionInput(input: Record<string, string>, kind: OfferKind): ParseResult<SessionValues> {
  const errors: FieldErrors = {}
  const date = (input.date ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) errors.date = 'Bitte ein Datum wählen.'
  const startTime = (input.start_time ?? '').trim()
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) errors.start_time = 'Bitte eine Uhrzeit wählen (Berliner Zeit).'

  let capacity: number | undefined
  if (kind === 'gruppe') {
    const parsed = parseInteger(input.capacity ?? '')
    if (parsed === null || parsed < 1 || parsed > 8) errors.capacity = 'Plätze von 1 bis 8.'
    else capacity = parsed
  }

  const ageMinText = (input.age_min ?? '').trim()
  const ageMaxText = (input.age_max ?? '').trim()
  let ageMin: number | undefined
  let ageMax: number | undefined
  if (ageMinText) {
    const parsed = parseInteger(ageMinText)
    if (parsed === null || parsed > 99) errors.age_min = 'Alter als ganze Zahl von 0 bis 99.'
    else ageMin = parsed
  }
  if (ageMaxText) {
    const parsed = parseInteger(ageMaxText)
    if (parsed === null || parsed > 99) errors.age_max = 'Alter als ganze Zahl von 0 bis 99.'
    else ageMax = parsed
  }
  if (!errors.age_min && !errors.age_max && ageMin !== undefined && ageMax !== undefined && ageMin > ageMax) {
    errors.age_max = 'Höchstalter darf nicht unter dem Mindestalter liegen.'
  }

  const status = (input.status ?? 'published').trim() === 'draft' ? 'draft' : 'published'
  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return {
    ok: true,
    value: {
      date,
      start_time: startTime,
      ...(capacity !== undefined ? { capacity } : {}),
      ...(ageMin !== undefined ? { age_min: ageMin } : {}),
      ...(ageMax !== undefined ? { age_max: ageMax } : {}),
      status,
    },
  }
}

/** Cent -> Formularwert "30,00" (Komma, keine Währung), Gegenstück zu parseEuroToCents. */
export function formatEuroInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',')
}

export type MemberStatusFilter = 'alle' | 'aktiv' | 'inaktiv'

function foldName(text: string): string {
  return text.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '')
}

/** Suche und Statusfilter laufen nur im Browser: der Suchbegriff kann ein
 * Kindername sein und gehört nicht in URL, Verlauf oder Server-Logs. */
export function filterMembers<T extends { first_name: string; last_name: string; member_number: string | null; active: boolean }>(
  members: T[],
  query: string,
  status: MemberStatusFilter,
): T[] {
  const needle = foldName(query)
  return members.filter(member => {
    if (status === 'aktiv' && !member.active) return false
    if (status === 'inaktiv' && member.active) return false
    if (!needle) return true
    return foldName(`${member.first_name}${member.last_name}`).includes(needle)
      || foldName(`${member.last_name}${member.first_name}`).includes(needle)
      || foldName(member.member_number ?? '').includes(needle)
  })
}
