import { beforeEach, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('../../../lib/supabaseServer', () => ({ getValidAccessToken: vi.fn() }))
vi.mock('../../../lib/saasAdminApi', async importOriginal => ({
  ...await importOriginal<typeof import('../../../lib/saasAdminApi')>(),
  createTrainingOfferAdmin: vi.fn(),
  updateTrainingOfferAdmin: vi.fn(),
  createTrainingSessionAdmin: vi.fn(),
  deleteTrainingSessionAdmin: vi.fn(),
  cancelTrainingSessionAdmin: vi.fn(),
  createClubMemberAdmin: vi.fn(),
  setClubMemberActiveAdmin: vi.fn(),
  importClubMembersAdmin: vi.fn(),
}))

import { getValidAccessToken } from '../../../lib/supabaseServer'
import {
  MemberImportError, SlugConflictError, TrainingAdminError,
  cancelTrainingSessionAdmin, createClubMemberAdmin, createTrainingOfferAdmin, createTrainingSessionAdmin,
  deleteTrainingSessionAdmin, importClubMembersAdmin, setClubMemberActiveAdmin, updateTrainingOfferAdmin,
  type TrainingOffer,
} from '../../../lib/saasAdminApi'
import {
  cancelSessionAction, createMemberAction, createOfferAction, createSessionAction, deleteSessionAction,
  importMembersAction, setMemberActiveAction, updateOfferAction,
} from './trainingActions'

const initial = { error: null }
function form(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}
const OFFER = {
  slug: 'einzel-45', title: 'Einzeltraining', kind: 'einzel', description: '', duration_minutes: '45', location: '',
  price_member_euros: '30', price_nonmember_euros: '40', status: 'draft',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getValidAccessToken).mockResolvedValue('tok')
})

it('verlangt eine Sitzung', async () => {
  vi.mocked(getValidAccessToken).mockResolvedValue(null)
  expect((await createOfferAction('ksv', initial, form(OFFER))).error).toContain('Sitzung abgelaufen')
  expect((await importMembersAction('ksv', 'x')).error).toContain('Sitzung abgelaufen')
  expect(createTrainingOfferAdmin).not.toHaveBeenCalled()
})

it('legt ein Angebot mit Cent-Preisen an und leitet auf die Detailseite', async () => {
  vi.mocked(createTrainingOfferAdmin).mockResolvedValue({ id: 'o-1' } as TrainingOffer)
  const state = await createOfferAction('ksv', initial, form(OFFER))
  expect(createTrainingOfferAdmin).toHaveBeenCalledWith('ksv', 'tok', expect.objectContaining({
    slug: 'einzel-45', kind: 'einzel', price_member_cents: 3000, price_nonmember_cents: 4000, duration_minutes: 45, description: null,
  }))
  expect(state.redirectTo).toBe('/pilot/ksv/trainings/o-1?neu=1')
})

it('sendet bei ungültigen Eingaben nichts und nennt die Felder', async () => {
  const state = await createOfferAction('ksv', initial, form({ ...OFFER, duration_minutes: '0', title: '' }))
  expect(Object.keys(state.fieldErrors ?? {}).sort()).toEqual(['duration_minutes', 'title'])
  expect(createTrainingOfferAdmin).not.toHaveBeenCalled()
})

it('meldet eine doppelte Web-Adresse am Feld slug', async () => {
  vi.mocked(createTrainingOfferAdmin).mockRejectedValue(new SlugConflictError('einzel-45'))
  const state = await createOfferAction('ksv', initial, form(OFFER))
  expect(state.fieldErrors?.slug).toContain('bereits vergeben')
})

it('Bearbeiten sendet weder slug noch kind', async () => {
  vi.mocked(updateTrainingOfferAdmin).mockResolvedValue({} as TrainingOffer)
  const state = await updateOfferAction('ksv', 'o-1', initial, form(OFFER))
  expect(state.saved).toBe(true)
  const body = vi.mocked(updateTrainingOfferAdmin).mock.calls[0][3]
  expect(body).not.toHaveProperty('slug')
  expect(body).not.toHaveProperty('kind')
})

it('unbekannte Fehler werden nicht durchgereicht', async () => {
  vi.mocked(updateTrainingOfferAdmin).mockRejectedValue(new Error('SQL exploded with secret'))
  expect((await updateOfferAction('ksv', 'o-1', initial, form(OFFER))).error).not.toContain('secret')
})

it('Termin: Einzel ohne Kapazität, Gruppe mit Kapazität', async () => {
  const session = { date: '2026-11-20', start_time: '17:30' }
  await createSessionAction('ksv', 'o-1', 'einzel', initial, form({ ...session, capacity: '5' }))
  expect(vi.mocked(createTrainingSessionAdmin).mock.calls[0][3]).not.toHaveProperty('capacity')
  const bad = await createSessionAction('ksv', 'o-1', 'gruppe', initial, form(session))
  expect(bad.fieldErrors?.capacity).toBeTruthy()
  await createSessionAction('ksv', 'o-1', 'gruppe', initial, form({ ...session, capacity: '6' }))
  expect(vi.mocked(createTrainingSessionAdmin).mock.calls[1][3]).toMatchObject({ capacity: 6 })
})

it('Termin: Servermeldung (Dublette/Zeitumstellung) wird angezeigt', async () => {
  vi.mocked(createTrainingSessionAdmin).mockRejectedValue(new TrainingAdminError('Zu diesem Zeitpunkt existiert bereits ein Termin.'))
  const state = await createSessionAction('ksv', 'o-1', 'einzel', initial, form({ date: '2026-11-20', start_time: '17:30' }))
  expect(state.error).toContain('existiert bereits')
})

it('Löschen/Absagen geben Erfolg oder die verständliche Sperrmeldung zurück', async () => {
  expect((await deleteSessionAction('ksv', 'o-1', 's-1', { error: null, success: null })).success).toBe('Termin gelöscht.')
  vi.mocked(cancelTrainingSessionAdmin).mockRejectedValue(new TrainingAdminError('Es gibt noch aktive Buchungen.', 'session_has_active_registrations'))
  const blocked = await cancelSessionAction('ksv', 'o-1', 's-1', { error: null, success: null })
  expect(blocked.error).toContain('aktive Buchungen')
  expect(blocked.success).toBeNull()
  vi.mocked(deleteTrainingSessionAdmin).mockRejectedValue(new Error('boom'))
  expect((await deleteSessionAction('ksv', 'o-1', 's-1', { error: null, success: null })).error).toBe('Termin konnte nicht gelöscht werden.')
})

const MEMBER = { first_name: ' Max ', last_name: 'Mustermann', birth_date: '2015-02-01', member_number: '' }

it('Mitglied: bereinigt Eingaben, leere Nummer wird null', async () => {
  const state = await createMemberAction('ksv', initial, form(MEMBER))
  expect(state.saved).toBe(true)
  expect(createClubMemberAdmin).toHaveBeenCalledWith('ksv', 'tok', { first_name: 'Max', last_name: 'Mustermann', birth_date: '2015-02-01', member_number: null })
})

it('Mitglied: prüft Pflichtfelder und Geburtsdatum (nicht in der Zukunft)', async () => {
  const state = await createMemberAction('ksv', initial, form({ first_name: '', last_name: 'X', birth_date: '2999-01-01' }))
  expect(Object.keys(state.fieldErrors ?? {}).sort()).toEqual(['birth_date', 'first_name'])
  expect(createClubMemberAdmin).not.toHaveBeenCalled()
})

it('Mitglied: Dublette aus dem Backend wird gemeldet, ohne Namen zu wiederholen', async () => {
  vi.mocked(createClubMemberAdmin).mockRejectedValue(new TrainingAdminError('Dieses Mitglied ist bereits eingetragen.'))
  const state = await createMemberAction('ksv', initial, form(MEMBER))
  expect(state.error).toBe('Dieses Mitglied ist bereits eingetragen.')
})

it('aktiv/inaktiv', async () => {
  const state = await setMemberActiveAction('ksv', 'm-1', false, { error: null, success: null })
  expect(setClubMemberActiveAdmin).toHaveBeenCalledWith('ksv', 'm-1', 'tok', false)
  expect(state.success).toContain('inaktiv')
})

it('Import: reicht Text an die API und gibt Zähler zurück', async () => {
  vi.mocked(importClubMembersAdmin).mockResolvedValue({ rows: 2, created: 2, updated: 0, merged_in_file: 0 })
  const state = await importMembersAction('ksv', 'vorname;nachname;geburtsdatum\nA;B;01.01.2015\n')
  expect(state.result).toEqual({ rows: 2, created: 2, updated: 0, merged_in_file: 0 })
  expect(state.error).toBeNull()
})

it('Import: Fehlerliste enthält nur Zeile/Feld/Code', async () => {
  vi.mocked(importClubMembersAdmin).mockRejectedValue(new MemberImportError([{ row: 2, field: 'geburtsdatum', code: 'invalid_date' }]))
  const state = await importMembersAction('ksv', 'a;b\nGeheim;Name\n')
  expect(state.errors).toEqual([{ row: 2, field: 'geburtsdatum', code: 'invalid_date' }])
  expect(JSON.stringify(state)).not.toContain('Geheim')
  expect(state.result).toBeNull()
})

it('Import: leere und zu große Dateien gehen nicht ans Backend', async () => {
  expect((await importMembersAction('ksv', '   ')).error).toContain('leer')
  const big = await importMembersAction('ksv', 'x'.repeat(1_000_001))
  expect(big.errors[0].code).toBe('file_too_large')
  expect(importClubMembersAdmin).not.toHaveBeenCalled()
})
