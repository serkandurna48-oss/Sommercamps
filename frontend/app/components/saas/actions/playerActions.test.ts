import { beforeEach, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('../../../lib/supabaseServer', () => ({ getValidAccessToken: vi.fn() }))
vi.mock('../../../lib/saasAdminApi', async importOriginal => ({
  ...await importOriginal<typeof import('../../../lib/saasAdminApi')>(),
  createPlayerNoteAdmin: vi.fn(),
  updatePlayerNoteAdmin: vi.fn(),
  deletePlayerNoteAdmin: vi.fn(),
  createPlayerGoalAdmin: vi.fn(),
  updatePlayerGoalAdmin: vi.fn(),
  createPlayerMeasurementAdmin: vi.fn(),
  deletePlayerMeasurementAdmin: vi.fn(),
}))

import { revalidatePath } from 'next/cache'
import { getValidAccessToken } from '../../../lib/supabaseServer'
import {
  AdminAuthError, PlayerRecordError, createPlayerGoalAdmin, createPlayerMeasurementAdmin, createPlayerNoteAdmin,
  deletePlayerNoteAdmin, updatePlayerGoalAdmin, updatePlayerNoteAdmin,
} from '../../../lib/saasAdminApi'
import {
  createGoalAction, createMeasurementAction, createNoteAction, deleteNoteAction, setGoalStatusAction, updateNoteAction,
} from './playerActions'

const initial = { error: null }
const SECRET = 'GEHEIM-Mentalnotiz-4711'
function form(fields: Record<string, string | string[]>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) for (const v of Array.isArray(value) ? value : [value]) data.append(key, v)
  return data
}
const NOTE = { note_date: '2027-03-29', body: SECRET, focus: ['technik', 'mental'], rating: '4', next_steps: '', video_url: 'https://vimeo.com/1', camp_id: 'camp-1' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getValidAccessToken).mockResolvedValue('tok')
})

it('verlangt eine Sitzung und ruft ohne sie nichts auf', async () => {
  vi.mocked(getValidAccessToken).mockResolvedValue(null)
  expect((await createNoteAction('ksv', 'p1', initial, form(NOTE))).error).toContain('Sitzung abgelaufen')
  expect((await deleteNoteAction('ksv', 'p1', 'n1', { error: null, success: null })).error).toContain('Sitzung abgelaufen')
  expect(createPlayerNoteAdmin).not.toHaveBeenCalled()
  expect(deletePlayerNoteAdmin).not.toHaveBeenCalled()
})

it('legt eine Notiz mit normalisierten Feldern an und lädt die Seiten neu', async () => {
  const state = await createNoteAction('ksv', 'p1', initial, form(NOTE))
  expect(state).toEqual({ error: null, saved: true })
  expect(createPlayerNoteAdmin).toHaveBeenCalledWith('ksv', 'p1', 'tok', {
    note_date: '2027-03-29', body: SECRET, focus: ['technik', 'mental'], rating: 4, next_steps: null, video_url: 'https://vimeo.com/1', camp_id: 'camp-1',
  })
  expect(revalidatePath).toHaveBeenCalledWith('/pilot/ksv', 'layout')
})

it('weist ungültige Eingaben ohne Backend-Aufruf ab und nennt nur Felder', async () => {
  const state = await createNoteAction('ksv', 'p1', initial, form({ ...NOTE, video_url: 'http://x.de', body: '' }))
  expect(state.error).toBe('Bitte die markierten Felder prüfen.')
  expect(Object.keys(state.fieldErrors ?? {}).sort()).toEqual(['body', 'video_url'])
  expect(createPlayerNoteAdmin).not.toHaveBeenCalled()
})

it('gibt Backend-Fehler als festen Text zurück, ohne Notizinhalt', async () => {
  vi.mocked(createPlayerNoteAdmin).mockRejectedValue(new PlayerRecordError('Notiz konnte nicht gespeichert werden. Bitte die Eingaben prüfen.', 'video_url'))
  const state = await createNoteAction('ksv', 'p1', initial, form(NOTE))
  expect(state.error).toContain('Notiz konnte nicht gespeichert werden')
  expect(state.fieldErrors).toEqual({ video_url: 'Bitte prüfen.' })
  expect(JSON.stringify(state)).not.toContain(SECRET)
  vi.mocked(createPlayerNoteAdmin).mockRejectedValue(new Error(`boom ${SECRET}`))
  const unknown = await createNoteAction('ksv', 'p1', initial, form(NOTE))
  expect(unknown.error).toBe('Notiz konnte nicht gespeichert werden.')
  expect(JSON.stringify(unknown)).not.toContain(SECRET)
  vi.mocked(createPlayerNoteAdmin).mockRejectedValue(new AdminAuthError())
  expect((await createNoteAction('ksv', 'p1', initial, form(NOTE))).error).toContain('Sitzung abgelaufen')
})

it('ändert eine Notiz', async () => {
  expect((await updateNoteAction('ksv', 'p1', 'n1', initial, form(NOTE))).saved).toBe(true)
  expect(updatePlayerNoteAdmin).toHaveBeenCalledWith('ksv', 'p1', 'n1', 'tok', expect.objectContaining({ body: SECRET }))
})

it('löscht eine Notiz', async () => {
  const state = await deleteNoteAction('ksv', 'p1', 'n1', { error: null, success: null })
  expect(deletePlayerNoteAdmin).toHaveBeenCalledWith('ksv', 'p1', 'n1', 'tok')
  expect(state).toEqual({ error: null, success: 'Notiz gelöscht.' })
  vi.mocked(deletePlayerNoteAdmin).mockRejectedValue(new PlayerRecordError('Eintrag nicht gefunden – bitte die Seite neu laden.'))
  expect((await deleteNoteAction('ksv', 'p1', 'n1', { error: null, success: null })).error).toContain('nicht gefunden')
})

it('legt Ziele an und setzt den Status', async () => {
  expect((await createGoalAction('ksv', 'p1', initial, form({ title: 'Linker Fuß', area: 'technik', target_date: '' }))).saved).toBe(true)
  expect(createPlayerGoalAdmin).toHaveBeenCalledWith('ksv', 'p1', 'tok', { title: 'Linker Fuß', area: 'technik', target_date: null })
  const state = await setGoalStatusAction('ksv', 'p1', 'g1', 'erreicht', { error: null, success: null })
  expect(updatePlayerGoalAdmin).toHaveBeenCalledWith('ksv', 'p1', 'g1', 'tok', { status: 'erreicht' })
  expect(state.success).toBe('Ziel als erreicht markiert.')
})

it('legt Messwerte mit Standardeinheit an', async () => {
  const state = await createMeasurementAction('ksv', 'p1', initial, form({ measured_on: '2027-03-29', metric: 'sprint_10m', custom_metric: '', value: '2,14', unit: '', note: '' }))
  expect(state.saved).toBe(true)
  expect(createPlayerMeasurementAdmin).toHaveBeenCalledWith('ksv', 'p1', 'tok', { measured_on: '2027-03-29', metric: 'sprint_10m', value: 2.14, unit: 's', note: null })
  const bad = await createMeasurementAction('ksv', 'p1', initial, form({ measured_on: '2027-03-29', metric: 'sprint_10m', custom_metric: '', value: 'abc', unit: '', note: '' }))
  expect(bad.fieldErrors?.value).toBeTruthy()
})
