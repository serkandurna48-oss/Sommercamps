/**
 * Reine Logik der Spielerakte (Admin): Alter, Fokus-Bezeichnungen, Eingabeprüfung,
 * Vorbelegung der Schnellerfassung, Verlauf je Messwert, Suche. Keine React- oder
 * Server-Abhängigkeit. Daten sind Kinderdaten: nichts davon wird geloggt oder in
 * URLs übernommen.
 */
import type {
  PlayerBooking, PlayerFocus, PlayerGoalInput, PlayerMeasurement, PlayerMeasurementInput, PlayerNoteInput, PlayerSummary,
} from '../../../lib/saasAdminApi'

export const FOCUS_OPTIONS: { value: PlayerFocus; label: string }[] = [
  { value: 'technik', label: 'Technik' },
  { value: 'athletik', label: 'Athletik' },
  { value: 'taktik', label: 'Taktik' },
  { value: 'mental', label: 'Mental' },
  { value: 'video', label: 'Video' },
  { value: 'sonstiges', label: 'Sonstiges' },
]

export function focusLabel(value: PlayerFocus): string {
  return FOCUS_OPTIONS.find(option => option.value === value)?.label ?? value
}

export type FieldErrors = Record<string, string>
export type Parsed<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors }

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function parseDay(value: string): { y: number; m: number; d: number } | null {
  const match = DAY_RE.exec(value)
  if (!match) return null
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const check = new Date(Date.UTC(y, m - 1, d))
  return check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d ? { y, m, d } : null
}

/** Volle Jahre zum Stichtag (YYYY-MM-DD); null bei ungültigem Datum. */
export function ageFromBirthDate(birthDate: string, today: string): number | null {
  const birth = parseDay(birthDate)
  const now = parseDay(today)
  if (!birth || !now) return null
  let age = now.y - birth.y
  if (now.m < birth.m || (now.m === birth.m && now.d < birth.d)) age -= 1
  return age
}

/** "2027-03-29" -> "29.03.2027" (reine Umformatierung). */
export function formatDay(iso: string): string {
  const day = parseDay(iso)
  return day ? `${String(day.d).padStart(2, '0')}.${String(day.m).padStart(2, '0')}.${day.y}` : iso
}

export function ratingDots(rating: number | null): boolean[] {
  return Array.from({ length: 5 }, (_, index) => rating !== null && index < rating)
}

// --- Video-Link -----------------------------------------------------------

/** Nur https, ohne Leerzeichen, mit Host. Spiegel der Server-Prüfung (dort maßgeblich). */
export function isHttpsUrl(value: string): boolean {
  if (!value.startsWith('https://') || /\s/.test(value)) return false
  try {
    return new URL(value).protocol === 'https:' && new URL(value).hostname !== ''
  } catch {
    return false
  }
}

export function validateVideoUrl(input: string): string | null {
  const url = input.trim()
  if (url === '') return null
  return isHttpsUrl(url) ? null : 'Bitte einen Link, der mit https:// beginnt.'
}

// --- Schnellerfassung vorbelegen ------------------------------------------

export interface QuickPrefill {
  open: boolean
  date: string
  campId: string | null
}

function single(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

/** `?neu=1&termin=<campId>`: Datum und camp_id aus der Buchung des Spielers, sonst heute.
 * Es wird nie Text aus der URL übernommen, nur die Termin-Id gegen die Buchungen geprüft. */
export function parseQuickPrefill(query: Record<string, unknown> | undefined, bookings: PlayerBooking[], today: string): QuickPrefill {
  const open = single(query?.neu) === '1'
  const termin = single(query?.termin)
  const match = open && termin ? bookings.find(booking => booking.camp_id === termin) : undefined
  return { open, date: match?.local_date ?? today, campId: match?.camp_id ?? null }
}

// --- Einwilligung ---------------------------------------------------------

/** Maßgeblich ist die jüngste nicht stornierte Buchung (sonst die jüngste überhaupt). */
export function hasDocumentationConsent(bookings: PlayerBooking[]): boolean {
  const newestFirst = [...bookings].sort((a, b) => `${b.local_date} ${b.local_time ?? ''}`.localeCompare(`${a.local_date} ${a.local_time ?? ''}`))
  const latest = newestFirst.find(booking => booking.status !== 'cancelled') ?? newestFirst[0]
  return latest?.documentation_consent === true
}

// --- Messwerte ------------------------------------------------------------

const METRIC_LABEL: Record<string, string> = {
  sprint_10m: 'Sprint 10 m',
  sprint_30m: 'Sprint 30 m',
  standweitsprung: 'Standweitsprung',
  jonglieren: 'Jonglieren',
}

export const CUSTOM_METRIC = '__custom'

export function metricLabel(metric: string): string {
  return METRIC_LABEL[metric] ?? metric
}

/** Bei Sprintzeiten ist ein niedrigerer Wert besser. */
export function isLowerBetter(metric: string): boolean {
  return metric.startsWith('sprint_')
}

const NUMBER = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 })

export function formatMeasurement(value: number, unit: string): string {
  return `${NUMBER.format(value)} ${unit}`
}

export interface SeriesPoint {
  id?: string
  date: string
  value: number
}

/** Messwerte einer Metrik, älteste zuerst. */
export function buildMetricSeries(measurements: PlayerMeasurement[], metric: string): (SeriesPoint & { id: string })[] {
  return measurements
    .filter(m => m.metric === metric)
    .map(m => ({ id: m.id, date: m.measured_on, value: m.value, created: m.created_at }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.created.localeCompare(b.created))
    .map(({ id, date, value }) => ({ id, date, value }))
}

export type TrendDirection = 'better' | 'worse' | 'same'

export interface MetricTrend {
  latest: SeriesPoint
  previous: SeriesPoint | null
  /** Letzter minus vorletzter Wert, auf zwei Stellen gerundet; null bei nur einer Messung. */
  delta: number | null
  /** Bewertet die Richtung: bei Sprintzeiten ist ein sinkender Wert besser. */
  direction: TrendDirection | null
}

/** Letzter Wert einer (älteste zuerst sortierten) Reihe und Veränderung zum vorherigen. */
export function metricTrend(metric: string, series: SeriesPoint[]): MetricTrend | null {
  if (series.length === 0) return null
  const latest = series[series.length - 1]
  const previous = series.length > 1 ? series[series.length - 2] : null
  if (!previous) return { latest, previous: null, delta: null, direction: null }
  const delta = Number((latest.value - previous.value).toFixed(2))
  if (delta === 0) return { latest, previous, delta: 0, direction: 'same' }
  const improved = isLowerBetter(metric) ? delta < 0 : delta > 0
  return { latest, previous, delta, direction: improved ? 'better' : 'worse' }
}

/** "+0,12 s" / "−0,26 s" (echtes Minuszeichen). */
export function formatDelta(delta: number, unit: string): string {
  const sign = delta > 0 ? '+' : delta < 0 ? '\u2212' : ''
  return `${sign}${NUMBER.format(Math.abs(delta))} ${unit}`
}

export interface ScaledPoint extends SeriesPoint {
  x: number
  y: number
}

/** Punkte in eine Zeichenfläche (SVG, y nach unten) legen: Zeit proportional, größerer Wert = weiter oben.
 * Einzelpunkt, gleiche Tage oder flache Reihe werden mittig gesetzt. */
export function scaleSeries(points: SeriesPoint[], area: { width: number; height: number; pad: number }): ScaledPoint[] {
  if (points.length === 0) return []
  const time = (date: string) => Date.parse(`${date}T00:00:00Z`)
  const times = points.map(point => time(point.date))
  const values = points.map(point => point.value)
  const [t0, t1] = [Math.min(...times), Math.max(...times)]
  const [v0, v1] = [Math.min(...values), Math.max(...values)]
  const innerW = area.width - 2 * area.pad
  const innerH = area.height - 2 * area.pad
  return points.map((point, index) => ({
    ...point,
    x: t1 === t0 ? area.width / 2 : area.pad + ((times[index] - t0) / (t1 - t0)) * innerW,
    y: v1 === v0 ? area.height / 2 : area.pad + (1 - (point.value - v0) / (v1 - v0)) * innerH,
  }))
}

// --- Kopfzahlen und Ziele ------------------------------------------------

/** Jüngster Trainings- oder Camptermin bis einschließlich heute (ohne stornierte und Wartelisten-Buchungen). */
export function lastTrainingDate(bookings: PlayerBooking[], today: string): string | null {
  const days = bookings
    .filter(booking => (booking.status === 'confirmed' || booking.status === 'registered') && booking.local_date <= today)
    .map(booking => booking.local_date)
    .sort()
  return days.length > 0 ? days[days.length - 1] : null
}

/** Offene Ziele zuerst, dann erreichte, dann verworfene; innerhalb eines Status bleibt die Serverreihenfolge. */
export function goalsOpenFirst<T extends { status: string }>(goals: T[]): T[] {
  const rank = (status: string) => (status === 'offen' ? 0 : status === 'erreicht' ? 1 : 2)
  return goals.map((goal, index) => ({ goal, index })).sort((a, b) => rank(a.goal.status) - rank(b.goal.status) || a.index - b.index).map(entry => entry.goal)
}

// --- Suche ----------------------------------------------------------------

function fold(text: string, umlauts: 'expand' | 'strip'): string {
  const map: Record<string, string> = umlauts === 'expand'
    ? { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }
    : { ä: 'a', ö: 'o', ü: 'u', ß: 'ss' }
  return text.toLowerCase().replace(/[äöüß]/g, ch => map[ch]).normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Suche im Browser: jedes Wort muss in Vor- oder Nachname vorkommen; Umlaute und Schreibweisen (ö/oe) egal. */
export function filterPlayers(players: PlayerSummary[], query: string): PlayerSummary[] {
  const trimmed = query.trim()
  if (!trimmed) return players
  return players.filter(player => (['expand', 'strip'] as const).some(mode => {
    const haystack = fold(`${player.first_name} ${player.last_name}`, mode)
    return fold(trimmed, mode).split(/\s+/).every(token => haystack.includes(token))
  }))
}

// --- Eingaben -------------------------------------------------------------

const MAX_BODY = 10000
const MAX_NEXT_STEPS = 4000
const MAX_TITLE = 200
const MAX_METRIC = 60
const MAX_UNIT = 20
const MAX_MEASUREMENT_NOTE = 1000
const STANDARD_UNIT: Record<string, string> = { sprint_10m: 's', sprint_30m: 's', standweitsprung: 'cm', jonglieren: 'Anzahl' }
const FOCUS_VALUES = FOCUS_OPTIONS.map(option => option.value)

function optional(value: string | undefined): string | null {
  const text = (value ?? '').trim()
  return text === '' ? null : text
}

function dayError(value: string, label: string): string | null {
  return parseDay(value.trim()) ? null : `Bitte ${label} wählen.`
}

export interface NoteFields {
  note_date: string
  body: string
  focus: string[]
  rating: string
  next_steps: string
  video_url: string
  camp_id: string
}

export function parseNoteInput(fields: NoteFields): Parsed<PlayerNoteInput> {
  const errors: FieldErrors = {}
  const date = dayError(fields.note_date ?? '', 'ein Datum')
  if (date) errors.note_date = date
  const body = (fields.body ?? '').trim()
  if (body === '') errors.body = 'Bitte einen Text eintragen.'
  else if (body.length > MAX_BODY) errors.body = 'Höchstens 10.000 Zeichen.'
  const focus = (fields.focus ?? []) as PlayerFocus[]
  if (!focus.every(value => FOCUS_VALUES.includes(value))) errors.focus = 'Unbekannter Schwerpunkt.'
  let rating: number | null = null
  const ratingText = (fields.rating ?? '').trim()
  if (ratingText !== '') {
    rating = /^[1-5]$/.test(ratingText) ? Number(ratingText) : null
    if (rating === null) errors.rating = 'Bitte 1 bis 5 wählen.'
  }
  const nextSteps = optional(fields.next_steps)
  if (nextSteps && nextSteps.length > MAX_NEXT_STEPS) errors.next_steps = 'Höchstens 4.000 Zeichen.'
  const video = validateVideoUrl(fields.video_url ?? '')
  if (video) errors.video_url = video
  else if ((fields.video_url ?? '').trim().length > 2000) errors.video_url = 'Der Link ist zu lang.'
  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return {
    ok: true,
    value: {
      note_date: fields.note_date.trim(), body, focus: [...new Set(focus)], rating, next_steps: nextSteps,
      video_url: optional(fields.video_url), camp_id: optional(fields.camp_id),
    },
  }
}

export function parseGoalInput(fields: { title: string; area: string; target_date: string }): Parsed<PlayerGoalInput> {
  const errors: FieldErrors = {}
  const title = (fields.title ?? '').trim()
  if (title === '') errors.title = 'Bitte ein Ziel eintragen.'
  else if (title.length > MAX_TITLE) errors.title = 'Höchstens 200 Zeichen.'
  if (!FOCUS_VALUES.includes(fields.area as PlayerFocus)) errors.area = 'Bitte einen Bereich wählen.'
  const target = optional(fields.target_date)
  if (target && !parseDay(target)) errors.target_date = 'Bitte ein Datum wählen.'
  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, value: { title, area: fields.area as PlayerFocus, target_date: target } }
}

export function parseMeasurementInput(fields: {
  measured_on: string; metric: string; custom_metric: string; value: string; unit: string; note: string
}): Parsed<PlayerMeasurementInput> {
  const errors: FieldErrors = {}
  const date = dayError(fields.measured_on ?? '', 'ein Datum')
  if (date) errors.measured_on = date
  const custom = fields.metric === CUSTOM_METRIC
  const metric = custom ? (fields.custom_metric ?? '').trim() : fields.metric
  if (metric === '') errors.metric = 'Bitte eine Metrik benennen.'
  else if (metric.length > MAX_METRIC) errors.metric = 'Höchstens 60 Zeichen.'
  else if (!custom && !(metric in STANDARD_UNIT)) errors.metric = 'Unbekannte Metrik.'
  const unit = custom ? (fields.unit ?? '').trim() : STANDARD_UNIT[metric]
  if (custom && !unit) errors.unit = 'Bitte eine Einheit eintragen.'
  else if (unit && unit.length > MAX_UNIT) errors.unit = 'Höchstens 20 Zeichen.'
  const valueText = (fields.value ?? '').trim()
  const value = /^\d{1,12}([.,]\d{1,6})?$/.test(valueText) ? Number(valueText.replace(',', '.')) : null
  if (value === null) errors.value = 'Bitte eine Zahl eintragen, z. B. 2,14.'
  const note = optional(fields.note)
  if (note && note.length > MAX_MEASUREMENT_NOTE) errors.note = 'Höchstens 1.000 Zeichen.'
  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, value: { measured_on: fields.measured_on.trim(), metric, value: value as number, unit, note } }
}
