import { afterEach, expect, it, vi } from 'vitest'
import {
  AdminActionError,
  MemberImportError,
  SlugConflictError,
  TrainingAdminError,
  cancelTrainingSessionAdmin,
  createClubMemberAdmin,
  createTrainingOfferAdmin,
  createTrainingSessionAdmin,
  deleteTrainingSessionAdmin,
  fetchClubMembersAdmin,
  fetchTrainingOfferAdmin,
  fetchSessionRegistrationsAdmin,
  fetchTrainingOffersAdmin,
  fetchTrainingSessionsAdmin,
  importClubMembersAdmin,
  setClubMemberActiveAdmin,
  updateTrainingOfferAdmin,
} from './saasAdminApi'

afterEach(() => vi.unstubAllGlobals())

function stubFetch(status: number, body?: unknown) {
  const fn = vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), { status }))
  vi.stubGlobal('fetch', fn)
  return fn
}
function lastCall(fn: ReturnType<typeof stubFetch>) {
  const [url, init] = fn.mock.calls.at(-1) as unknown as [string, RequestInit]
  return { url, init, headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : undefined }
}

const offerInput = {
  slug: 'einzel-45', title: 'Einzeltraining', kind: 'einzel' as const, description: null, duration_minutes: 45,
  location: null, price_member_cents: 3000, price_nonmember_cents: 4000, status: 'draft' as const,
}

it('listet Angebote mit Bearer-Token unter dem Org-Pfad', async () => {
  const fn = stubFetch(200, [{ id: 'o1' }])
  expect(await fetchTrainingOffersAdmin('ksv', 'tok')).toEqual([{ id: 'o1' }])
  const call = lastCall(fn)
  expect(call.url).toMatch(/\/admin\/organizations\/ksv\/training-offers$/)
  expect(call.init.method).toBe('GET')
  expect(call.headers.Authorization).toBe('Bearer tok')
})

it('legt ein Angebot an und meldet doppelte Slugs als SlugConflictError', async () => {
  const fn = stubFetch(201, { id: 'o1' })
  await createTrainingOfferAdmin('ksv', 'tok', offerInput)
  const call = lastCall(fn)
  expect(call.init.method).toBe('POST')
  expect(call.body).toEqual(offerInput)
  stubFetch(409, { detail: 'exists' })
  await expect(createTrainingOfferAdmin('ksv', 'tok', offerInput)).rejects.toBeInstanceOf(SlugConflictError)
  stubFetch(422, {})
  await expect(createTrainingOfferAdmin('ksv', 'tok', offerInput)).rejects.toBeInstanceOf(AdminActionError)
})

it('ändert ein Angebot per PATCH auf die Angebots-ID', async () => {
  const fn = stubFetch(200, { id: 'o1' })
  await updateTrainingOfferAdmin('ksv', 'o1', 'tok', { title: 'Neu' })
  const call = lastCall(fn)
  expect(call.url).toMatch(/\/training-offers\/o1$/)
  expect(call.init.method).toBe('PATCH')
  expect(call.body).toEqual({ title: 'Neu' })
})

it('liest Termine eines Angebots', async () => {
  const fn = stubFetch(200, [])
  await fetchTrainingSessionsAdmin('ksv', 'o1', 'tok')
  expect(lastCall(fn).url).toMatch(/\/training-offers\/o1\/sessions$/)
})

it('legt einen Termin an; 409 und 422 haben eigene verständliche Meldungen', async () => {
  const fn = stubFetch(201, { id: 's1' })
  await createTrainingSessionAdmin('ksv', 'o1', 'tok', { date: '2026-11-20', start_time: '17:30', status: 'published' })
  expect(lastCall(fn).body).toEqual({ date: '2026-11-20', start_time: '17:30', status: 'published' })

  stubFetch(409, { detail: 'exists' })
  const conflict = await createTrainingSessionAdmin('ksv', 'o1', 'tok', { date: '2026-11-20', start_time: '17:30', status: 'published' }).catch(e => e)
  expect(conflict).toBeInstanceOf(TrainingAdminError)
  expect(conflict.message).toContain('existiert bereits')

  stubFetch(422, { detail: 'ambiguous' })
  const invalid = await createTrainingSessionAdmin('ksv', 'o1', 'tok', { date: '2026-10-25', start_time: '02:30', status: 'published' }).catch(e => e)
  expect(invalid).toBeInstanceOf(TrainingAdminError)
  expect(invalid.message).toContain('Zeitumstellung')
})

it('löscht Termine (204) und übersetzt die 409-Codes', async () => {
  const fn = stubFetch(204)
  await deleteTrainingSessionAdmin('ksv', 'o1', 's1', 'tok')
  expect(lastCall(fn).init.method).toBe('DELETE')
  expect(lastCall(fn).url).toMatch(/\/training-offers\/o1\/sessions\/s1$/)

  stubFetch(409, { detail: { code: 'session_has_active_registrations' } })
  const active = await deleteTrainingSessionAdmin('ksv', 'o1', 's1', 'tok').catch(e => e)
  expect(active).toBeInstanceOf(TrainingAdminError)
  expect(active.code).toBe('session_has_active_registrations')
  expect(active.message).toContain('Buchungen')

  stubFetch(409, { detail: { code: 'session_has_registration_history' } })
  const history = await deleteTrainingSessionAdmin('ksv', 'o1', 's1', 'tok').catch(e => e)
  expect(history.code).toBe('session_has_registration_history')
  expect(history.message).toContain('absagen')
})

it('sagt Termine per POST /cancel ab', async () => {
  const fn = stubFetch(200, { id: 's1', status: 'archived' })
  await cancelTrainingSessionAdmin('ksv', 'o1', 's1', 'tok')
  expect(lastCall(fn).url).toMatch(/\/sessions\/s1\/cancel$/)
  expect(lastCall(fn).init.method).toBe('POST')
  stubFetch(409, { detail: { code: 'session_has_active_registrations' } })
  await expect(cancelTrainingSessionAdmin('ksv', 'o1', 's1', 'tok')).rejects.toBeInstanceOf(TrainingAdminError)
})

it('liest Buchungen je Termin; unbekannter Termin gibt eine leere Liste nicht vor, sondern Fehler', async () => {
  const fn = stubFetch(200, [{ id: 'r1' }])
  expect(await fetchSessionRegistrationsAdmin('ksv', 'o1', 's1', 'tok')).toEqual([{ id: 'r1' }])
  expect(lastCall(fn).url).toMatch(/\/sessions\/s1\/registrations$/)
  stubFetch(404, {})
  await expect(fetchSessionRegistrationsAdmin('ksv', 'o1', 's1', 'tok')).rejects.toBeInstanceOf(AdminActionError)
})

it('sucht Mitglieder mit kodierten Filtern unter club-members', async () => {
  const fn = stubFetch(200, [])
  await fetchClubMembersAdmin('ksv', 'tok', { q: 'Müller & Co', active: true })
  const url = new URL(lastCall(fn).url)
  expect(url.pathname).toBe('/admin/organizations/ksv/club-members')
  expect(url.searchParams.get('q')).toBe('Müller & Co')
  expect(url.searchParams.get('active')).toBe('true')
  await fetchClubMembersAdmin('ksv', 'tok')
  expect(new URL(lastCall(fn).url).search).toBe('')
  await fetchClubMembersAdmin('ksv', 'tok', { q: '  ', active: false })
  const params = new URL(lastCall(fn).url).searchParams
  expect(params.has('q')).toBe(false)
  expect(params.get('active')).toBe('false')
})

it('legt Mitglieder an; Dublette (409) bekommt eine eigene Meldung', async () => {
  const fn = stubFetch(201, { id: 'm1' })
  await createClubMemberAdmin('ksv', 'tok', { first_name: 'Max', last_name: 'Mustermann', birth_date: '2015-02-01', member_number: null })
  expect(lastCall(fn).body).toEqual({ first_name: 'Max', last_name: 'Mustermann', birth_date: '2015-02-01', member_number: null })
  stubFetch(409, { detail: 'Member already exists' })
  const err = await createClubMemberAdmin('ksv', 'tok', { first_name: 'Max', last_name: 'Mustermann', birth_date: '2015-02-01' }).catch(e => e)
  expect(err).toBeInstanceOf(TrainingAdminError)
  expect(err.message).toContain('bereits')
})

it('setzt aktiv/inaktiv per PATCH', async () => {
  const fn = stubFetch(200, { id: 'm1', active: false })
  await setClubMemberActiveAdmin('ksv', 'm1', 'tok', false)
  expect(lastCall(fn).url).toMatch(/\/club-members\/m1$/)
  expect(lastCall(fn).init.method).toBe('PATCH')
  expect(lastCall(fn).body).toEqual({ active: false })
})

it('importiert CSV als JSON {csv} und liefert die Zähler', async () => {
  const fn = stubFetch(200, { rows: 2, created: 1, updated: 1, merged_in_file: 0 })
  const result = await importClubMembersAdmin('ksv', 'tok', 'vorname;nachname\n')
  expect(result).toEqual({ rows: 2, created: 1, updated: 1, merged_in_file: 0 })
  expect(lastCall(fn).url).toMatch(/\/club-members\/import$/)
  expect(lastCall(fn).body).toEqual({ csv: 'vorname;nachname\n' })
})

it('sendet die Spaltenzuordnung mit, wenn vorhanden', async () => {
  const fn = stubFetch(200, { rows: 1, created: 1, updated: 0, merged_in_file: 0 })
  await importClubMembersAdmin('ksv', 'tok', 'Name;Vorname\n', { 0: 'last_name', 1: { extra: 'Team' }, 2: null })
  expect(lastCall(fn).body).toEqual({ csv: 'Name;Vorname\n', mapping: { 0: 'last_name', 1: { extra: 'Team' }, 2: null } })
})

it('Importfehler (422) tragen nur Zeile/Feld/Code, nie Inhalte', async () => {
  stubFetch(422, { detail: { code: 'import_invalid', errors: [{ row: 3, field: 'geburtsdatum', code: 'invalid_date', value: 'Geheim' }, { row: 4, field: 'row', code: 'column_count' }] } })
  const err = await importClubMembersAdmin('ksv', 'tok', 'x').catch(e => e)
  expect(err).toBeInstanceOf(MemberImportError)
  expect(err.errors).toEqual([
    { row: 3, field: 'geburtsdatum', code: 'invalid_date' },
    { row: 4, field: 'row', code: 'column_count' },
  ])
  expect(JSON.stringify(err)).not.toContain('Geheim')
  expect(err.message).not.toContain('Geheim')
})

it('413 file_too_large und unerwartete 422-Formate werden als Importfehler gemeldet', async () => {
  stubFetch(413, { detail: { code: 'file_too_large', errors: [{ row: 1, field: 'file', code: 'file_too_large' }] } })
  const big = await importClubMembersAdmin('ksv', 'tok', 'x').catch(e => e)
  expect(big).toBeInstanceOf(MemberImportError)
  expect(big.errors[0].code).toBe('file_too_large')

  stubFetch(422, { detail: [{ loc: ['body', 'csv'], msg: 'bad', input: 'Kind Name' }] })
  const odd = await importClubMembersAdmin('ksv', 'tok', 'x').catch(e => e)
  expect(odd).toBeInstanceOf(MemberImportError)
  expect(odd.errors).toEqual([])
  expect(JSON.stringify(odd)).not.toContain('Kind Name')

  stubFetch(500, { detail: 'Import failed, nothing was saved' })
  const failed = await importClubMembersAdmin('ksv', 'tok', 'x').catch(e => e)
  expect(failed).toBeInstanceOf(AdminActionError)
  expect(failed).not.toBeInstanceOf(MemberImportError)
})

it('ein einzelnes Angebot: 404 und ungültige ID (422) sind \"nicht gefunden\", andere Fehler nicht', async () => {
  stubFetch(200, { id: 'o1' })
  expect(await fetchTrainingOfferAdmin('ksv', 'o1', 'tok')).toEqual({ id: 'o1' })
  stubFetch(404, {})
  expect(await fetchTrainingOfferAdmin('ksv', 'o1', 'tok')).toBeNull()
  stubFetch(422, {})
  expect(await fetchTrainingOfferAdmin('ksv', 'kein-uuid', 'tok')).toBeNull()
  stubFetch(500, {})
  await expect(fetchTrainingOfferAdmin('ksv', 'o1', 'tok')).rejects.toBeInstanceOf(TrainingAdminError)
})

it('kodiert Slugs und IDs in allen neuen Pfaden', async () => {
  const fn = stubFetch(200, [])
  await fetchTrainingOffersAdmin('a/../b', 'tok')
  expect(lastCall(fn).url).toMatch(/\/admin\/organizations\/a%2F\.\.%2Fb\/training-offers$/)
  await fetchClubMembersAdmin('a/b', 'tok')
  expect(lastCall(fn).url).toMatch(/\/admin\/organizations\/a%2Fb\/club-members$/)
  await setClubMemberActiveAdmin('ksv', 'x/y', 'tok', true)
  expect(lastCall(fn).url).toMatch(/\/club-members\/x%2Fy$/)
})
