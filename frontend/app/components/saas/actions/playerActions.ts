'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { de } from '../../../lib/i18n/de'
import { getValidAccessToken } from '../../../lib/supabaseServer'
import {
  AdminAuthError,
  AdminConnectionError,
  PlayerRecordError,
  createPlayerGoalAdmin,
  createPlayerMeasurementAdmin,
  createPlayerNoteAdmin,
  deletePlayerMeasurementAdmin,
  deletePlayerRecordAdmin,
  deletePlayerNoteAdmin,
  updatePlayerGoalAdmin,
  updatePlayerNoteAdmin,
  type PlayerGoalStatus,
} from '../../../lib/saasAdminApi'
import type { ActionFormState } from '../ui/ActionForm'
import { parseGoalInput, parseMeasurementInput, parseNoteInput, type FieldErrors } from '../player/playerLogic'

/**
 * Server Actions der Spielerakte. Es sind Kinderdaten (Leistungs- und Mentalnotizen):
 * nichts davon wird geloggt, in Fehlertexte übernommen oder in URLs gelegt. Fehler
 * tragen feste deutsche Texte; Eingaben bleiben im Browser erhalten.
 */
export interface PlayerFormState {
  error: string | null
  fieldErrors?: FieldErrors
  saved?: boolean
}

const NO_SESSION = 'Sitzung abgelaufen – bitte neu anmelden.'
const GENERIC = de.adminActions.saveFailed

function text(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value : ''
}

function noteFields(formData: FormData) {
  return {
    note_date: text(formData, 'note_date'),
    body: text(formData, 'body'),
    focus: formData.getAll('focus').filter((value): value is string => typeof value === 'string'),
    rating: text(formData, 'rating'),
    next_steps: text(formData, 'next_steps'),
    video_url: text(formData, 'video_url'),
    camp_id: text(formData, 'camp_id'),
  }
}

function failure(error: unknown, fallback: string): { error: string; fieldErrors?: FieldErrors } {
  if (error instanceof AdminAuthError) return { error: NO_SESSION }
  if (error instanceof PlayerRecordError) {
    return { error: error.message, ...(error.field ? { fieldErrors: { [error.field]: 'Bitte prüfen.' } } : {}) }
  }
  if (error instanceof AdminConnectionError) return { error: error.message }
  return { error: fallback }
}

function refresh(orgSlug: string) {
  revalidatePath(`/pilot/${orgSlug}`, 'layout')
}

export async function createNoteAction(orgSlug: string, playerId: string, _prev: PlayerFormState, formData: FormData): Promise<PlayerFormState> {
  const token = await getValidAccessToken()
  if (!token) return { error: NO_SESSION }
  const parsed = parseNoteInput(noteFields(formData))
  if (!parsed.ok) return { error: 'Bitte die markierten Felder prüfen.', fieldErrors: parsed.errors }
  try {
    await createPlayerNoteAdmin(orgSlug, playerId, token, parsed.value)
  } catch (error) {
    return failure(error, 'Notiz konnte nicht gespeichert werden.')
  }
  refresh(orgSlug)
  return { error: null, saved: true }
}

export async function updateNoteAction(orgSlug: string, playerId: string, noteId: string, _prev: PlayerFormState, formData: FormData): Promise<PlayerFormState> {
  const token = await getValidAccessToken()
  if (!token) return { error: NO_SESSION }
  const parsed = parseNoteInput(noteFields(formData))
  if (!parsed.ok) return { error: 'Bitte die markierten Felder prüfen.', fieldErrors: parsed.errors }
  try {
    await updatePlayerNoteAdmin(orgSlug, playerId, noteId, token, parsed.value)
  } catch (error) {
    return failure(error, 'Notiz konnte nicht gespeichert werden.')
  }
  refresh(orgSlug)
  return { error: null, saved: true }
}

export async function deleteNoteAction(orgSlug: string, playerId: string, noteId: string, _prev: ActionFormState): Promise<ActionFormState> {
  const token = await getValidAccessToken()
  if (!token) return { error: NO_SESSION, success: null }
  try {
    await deletePlayerNoteAdmin(orgSlug, playerId, noteId, token)
  } catch (error) {
    return { error: failure(error, 'Notiz konnte nicht gelöscht werden.').error, success: null }
  }
  refresh(orgSlug)
  return { error: null, success: 'Notiz gelöscht.' }
}

export async function createGoalAction(orgSlug: string, playerId: string, _prev: PlayerFormState, formData: FormData): Promise<PlayerFormState> {
  const token = await getValidAccessToken()
  if (!token) return { error: NO_SESSION }
  const parsed = parseGoalInput({ title: text(formData, 'title'), area: text(formData, 'area'), target_date: text(formData, 'target_date') })
  if (!parsed.ok) return { error: 'Bitte die markierten Felder prüfen.', fieldErrors: parsed.errors }
  try {
    await createPlayerGoalAdmin(orgSlug, playerId, token, parsed.value)
  } catch (error) {
    return failure(error, GENERIC)
  }
  refresh(orgSlug)
  return { error: null, saved: true }
}

const GOAL_STATUS_DONE: Record<PlayerGoalStatus, string> = {
  offen: 'Ziel wieder geöffnet.',
  erreicht: 'Ziel als erreicht markiert.',
  verworfen: 'Ziel verworfen.',
}

export async function setGoalStatusAction(orgSlug: string, playerId: string, goalId: string, status: PlayerGoalStatus, _prev: ActionFormState): Promise<ActionFormState> {
  const token = await getValidAccessToken()
  if (!token) return { error: NO_SESSION, success: null }
  try {
    await updatePlayerGoalAdmin(orgSlug, playerId, goalId, token, { status })
  } catch (error) {
    return { error: failure(error, 'Ziel konnte nicht geändert werden.').error, success: null }
  }
  refresh(orgSlug)
  return { error: null, success: GOAL_STATUS_DONE[status] }
}

export async function createMeasurementAction(orgSlug: string, playerId: string, _prev: PlayerFormState, formData: FormData): Promise<PlayerFormState> {
  const token = await getValidAccessToken()
  if (!token) return { error: NO_SESSION }
  const parsed = parseMeasurementInput({
    measured_on: text(formData, 'measured_on'), metric: text(formData, 'metric'), custom_metric: text(formData, 'custom_metric'),
    value: text(formData, 'value'), unit: text(formData, 'unit'), note: text(formData, 'note'),
  })
  if (!parsed.ok) return { error: 'Bitte die markierten Felder prüfen.', fieldErrors: parsed.errors }
  try {
    await createPlayerMeasurementAdmin(orgSlug, playerId, token, parsed.value)
  } catch (error) {
    return failure(error, 'Messwert konnte nicht gespeichert werden.')
  }
  refresh(orgSlug)
  return { error: null, saved: true }
}

export async function deleteMeasurementAction(orgSlug: string, playerId: string, measurementId: string, _prev: ActionFormState): Promise<ActionFormState> {
  const token = await getValidAccessToken()
  if (!token) return { error: NO_SESSION, success: null }
  try {
    await deletePlayerMeasurementAdmin(orgSlug, playerId, measurementId, token)
  } catch (error) {
    return { error: failure(error, 'Messwert konnte nicht gelöscht werden.').error, success: null }
  }
  refresh(orgSlug)
  return { error: null, success: 'Messwert gelöscht.' }
}

/** Deletes the whole player record, then leaves the (now missing) page for the player list. */
export async function deletePlayerRecordAction(orgSlug: string, playerId: string, _prev: ActionFormState): Promise<ActionFormState> {
  const token = await getValidAccessToken()
  if (!token) return { error: NO_SESSION, success: null }
  try {
    await deletePlayerRecordAdmin(orgSlug, playerId, token)
  } catch (error) {
    return { error: failure(error, 'Spielerakte konnte nicht gelöscht werden.').error, success: null }
  }
  refresh(orgSlug)
  redirect(`/pilot/${orgSlug}/spieler`)
}
