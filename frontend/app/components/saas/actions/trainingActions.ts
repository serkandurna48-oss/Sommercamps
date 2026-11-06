'use server'

import { revalidatePath } from 'next/cache'
import { de } from '../../../lib/i18n/de'
import { getValidAccessToken } from '../../../lib/supabaseServer'
import {
  AdminAuthError,
  AdminConnectionError,
  MemberImportError,
  SlugConflictError,
  TrainingAdminError,
  cancelTrainingSessionAdmin,
  createClubMemberAdmin,
  createTrainingOfferAdmin,
  createTrainingSessionAdmin,
  createTrainingSessionSeriesAdmin,
  deleteTrainingSessionAdmin,
  importClubMembersAdmin,
  setClubMemberActiveAdmin,
  updateTrainingOfferAdmin,
  type ImportErrorItem,
  type MemberImportMapping,
  type MemberImportResult,
} from '../../../lib/saasAdminApi'
import type { ActionFormState } from '../ui/ActionForm'
import { MEMBER_CSV_MAX_CHARS } from '../training/memberCsv'
import { parseOfferInput, parseSessionInput, type FieldErrors, type OfferKind } from '../training/trainingLogic'

/** Zustand der Trainings-Formulare. `values` spiegelt die gesendeten Eingaben
 * zurück (nur Angebots-/Termindaten, keine Personendaten). */
export interface TrainingFormState {
  error: string | null
  fieldErrors?: FieldErrors
  saved?: boolean
  /** Anzahl angelegter Termine (Serie), nur nach Erfolg. */
  createdCount?: number
  redirectTo?: string
}

const NO_SESSION = 'Sitzung abgelaufen – bitte neu anmelden.'
const GENERIC = de.adminActions.saveFailed

function fields(formData: FormData): Record<string, string> {
  return Object.fromEntries([...formData].filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
}

function message(error: unknown, fallback: string): string {
  if (error instanceof AdminAuthError) return NO_SESSION
  if (error instanceof TrainingAdminError || error instanceof AdminConnectionError) return error.message
  return fallback
}

function refresh(orgSlug: string) {
  revalidatePath(`/pilot/${orgSlug}`, 'layout')
}

export async function createOfferAction(orgSlug: string, _prev: TrainingFormState, formData: FormData): Promise<TrainingFormState> {
  const token = await getValidAccessToken()
  if (!token) return { error: NO_SESSION }
  const parsed = parseOfferInput(fields(formData), 'create')
  if (!parsed.ok) return { error: 'Bitte die markierten Felder prüfen.', fieldErrors: parsed.errors }
  const { slug, kind, ...rest } = parsed.value
  try {
    const offer = await createTrainingOfferAdmin(orgSlug, token, { slug: slug!, kind: kind!, ...rest })
    refresh(orgSlug)
    return { error: null, saved: true, redirectTo: `/pilot/${orgSlug}/trainings/${offer.id}?neu=1` }
  } catch (error) {
    if (error instanceof SlugConflictError) {
      return { error: null, fieldErrors: { slug: `Die Web-Adresse „${slug}“ ist in Ihrem Verein bereits vergeben.` } }
    }
    return { error: message(error, 'Angebot konnte nicht angelegt werden – Angaben prüfen und erneut versuchen.') }
  }
}

export async function updateOfferAction(orgSlug: string, offerId: string, _prev: TrainingFormState, formData: FormData): Promise<TrainingFormState> {
  const token = await getValidAccessToken()
  if (!token) return { error: NO_SESSION }
  const parsed = parseOfferInput(fields(formData), 'update')
  if (!parsed.ok) return { error: 'Bitte die markierten Felder prüfen.', fieldErrors: parsed.errors }
  try {
    await updateTrainingOfferAdmin(orgSlug, offerId, token, parsed.value)
  } catch (error) {
    return { error: message(error, GENERIC) }
  }
  refresh(orgSlug)
  return { error: null, saved: true }
}

export async function createSessionAction(
  orgSlug: string,
  offerId: string,
  kind: OfferKind,
  _prev: TrainingFormState,
  formData: FormData,
): Promise<TrainingFormState> {
  const token = await getValidAccessToken()
  if (!token) return { error: NO_SESSION }
  const parsed = parseSessionInput(fields(formData), kind)
  if (!parsed.ok) return { error: 'Bitte die markierten Felder prüfen.', fieldErrors: parsed.errors }
  const { weeks, date, ...single } = parsed.value
  try {
    if (weeks !== undefined) {
      const result = await createTrainingSessionSeriesAdmin(orgSlug, offerId, token, { ...single, start_date: date, weeks })
      refresh(orgSlug)
      return { error: null, saved: true, createdCount: result.created }
    }
    await createTrainingSessionAdmin(orgSlug, offerId, token, { ...single, date })
  } catch (error) {
    return { error: message(error, 'Termin konnte nicht angelegt werden.') }
  }
  refresh(orgSlug)
  return { error: null, saved: true, createdCount: 1 }
}

export async function deleteSessionAction(orgSlug: string, offerId: string, sessionId: string, _prev: ActionFormState): Promise<ActionFormState> {
  const token = await getValidAccessToken()
  if (!token) return { error: NO_SESSION, success: null }
  try {
    await deleteTrainingSessionAdmin(orgSlug, offerId, sessionId, token)
  } catch (error) {
    return { error: message(error, 'Termin konnte nicht gelöscht werden.'), success: null }
  }
  refresh(orgSlug)
  return { error: null, success: 'Termin gelöscht.' }
}

export async function cancelSessionAction(orgSlug: string, offerId: string, sessionId: string, _prev: ActionFormState): Promise<ActionFormState> {
  const token = await getValidAccessToken()
  if (!token) return { error: NO_SESSION, success: null }
  try {
    await cancelTrainingSessionAdmin(orgSlug, offerId, sessionId, token)
  } catch (error) {
    return { error: message(error, 'Termin konnte nicht abgesagt werden.'), success: null }
  }
  refresh(orgSlug)
  return { error: null, success: 'Termin abgesagt.' }
}

// --- Mitglieder -----------------------------------------------------------

export interface MemberFormState {
  error: string | null
  fieldErrors?: FieldErrors
  saved?: boolean
}

export async function createMemberAction(orgSlug: string, _prev: MemberFormState, formData: FormData): Promise<MemberFormState> {
  const token = await getValidAccessToken()
  if (!token) return { error: NO_SESSION }
  const input = fields(formData)
  const firstName = (input.first_name ?? '').trim()
  const lastName = (input.last_name ?? '').trim()
  const birthDate = (input.birth_date ?? '').trim()
  const memberNumber = (input.member_number ?? '').trim()
  const fieldErrors: FieldErrors = {}
  if (!firstName || firstName.length > 100) fieldErrors.first_name = 'Bitte einen Vornamen eintragen (höchstens 100 Zeichen).'
  if (!lastName || lastName.length > 100) fieldErrors.last_name = 'Bitte einen Nachnamen eintragen (höchstens 100 Zeichen).'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || Number.isNaN(Date.parse(`${birthDate}T00:00:00Z`))) {
    fieldErrors.birth_date = 'Bitte ein Geburtsdatum wählen.'
  } else if (birthDate > new Date().toISOString().slice(0, 10) || birthDate < '1900-01-01') {
    fieldErrors.birth_date = 'Das Geburtsdatum muss zwischen 1900 und heute liegen.'
  }
  if (memberNumber.length > 50) fieldErrors.member_number = 'Höchstens 50 Zeichen.'
  if (Object.keys(fieldErrors).length > 0) return { error: 'Bitte die markierten Felder prüfen.', fieldErrors }
  try {
    await createClubMemberAdmin(orgSlug, token, {
      first_name: firstName,
      last_name: lastName,
      birth_date: birthDate,
      member_number: memberNumber || null,
    })
  } catch (error) {
    return { error: message(error, GENERIC) }
  }
  refresh(orgSlug)
  return { error: null, saved: true }
}

export async function setMemberActiveAction(orgSlug: string, memberId: string, active: boolean, _prev: ActionFormState): Promise<ActionFormState> {
  const token = await getValidAccessToken()
  if (!token) return { error: NO_SESSION, success: null }
  try {
    await setClubMemberActiveAdmin(orgSlug, memberId, token, active)
  } catch (error) {
    return { error: message(error, 'Status konnte nicht geändert werden.'), success: null }
  }
  refresh(orgSlug)
  return { error: null, success: active ? 'Als aktiv markiert.' : 'Als inaktiv markiert.' }
}

export interface ImportActionState {
  error: string | null
  /** Nur Zeile/Feld/Code, nie Zellinhalte. */
  errors: ImportErrorItem[]
  result: MemberImportResult | null
}

/** Grobe Formprüfung der Zuordnung (der Server prüft vollständig). */
function isMapping(value: unknown): value is MemberImportMapping {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const entries = Object.entries(value as Record<string, unknown>)
  return entries.length <= 200 && entries.every(([key, target]) => /^\d{1,3}$/.test(key) && (
    target === null || ['first_name', 'last_name', 'birth_date', 'member_number'].includes(target as string)
    || (typeof target === 'object' && target !== null && typeof (target as { extra?: unknown }).extra === 'string')))
}

/** Der CSV-Text wird im Browser gelesen und dekodiert und hier nur
 * weitergereicht — er wird nicht geloggt oder gespeichert. */
export async function importMembersAction(orgSlug: string, csv: string, mapping?: MemberImportMapping): Promise<ImportActionState> {
  const token = await getValidAccessToken()
  if (!token) return { error: NO_SESSION, errors: [], result: null }
  if (typeof csv !== 'string' || csv.trim() === '') {
    return { error: 'Die Datei ist leer.', errors: [], result: null }
  }
  if (csv.length > MEMBER_CSV_MAX_CHARS) {
    return { error: 'Die Datei ist zu groß (höchstens 1.000.000 Zeichen).', errors: [{ row: 1, field: 'file', code: 'file_too_large' }], result: null }
  }
  try {
    if (mapping !== undefined && !isMapping(mapping)) {
      return { error: 'Die Spaltenzuordnung ist ungültig. Bitte erneut auswählen.', errors: [], result: null }
    }
    const result = mapping ? await importClubMembersAdmin(orgSlug, token, csv, mapping) : await importClubMembersAdmin(orgSlug, token, csv)
    refresh(orgSlug)
    return { error: null, errors: [], result }
  } catch (error) {
    if (error instanceof MemberImportError) {
      return { error: error.message, errors: error.errors, result: null }
    }
    return { error: message(error, 'Import fehlgeschlagen – es wurde nichts gespeichert.'), errors: [], result: null }
  }
}
