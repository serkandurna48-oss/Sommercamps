import { afterEach, expect, it, vi } from 'vitest'
import {
  AdminAuthError,
  PlayerRecordError,
  createPlayerGoalAdmin,
  createPlayerMeasurementAdmin,
  createPlayerNoteAdmin,
  deletePlayerMeasurementAdmin,
  deletePlayerNoteAdmin,
  fetchPlayerAdmin,
  fetchPlayersAdmin,
  updatePlayerGoalAdmin,
  updatePlayerNoteAdmin,
} from './saasAdminApi'

afterEach(() => vi.unstubAllGlobals())

function stubFetch(status: number, body?: unknown) {
  const fn = vi.fn(async () => new Response(body === undefined || status === 204 ? null : JSON.stringify(body), { status }))
  vi.stubGlobal('fetch', fn)
  return fn
}
function lastCall(fn: ReturnType<typeof stubFetch>) {
  const [url, init] = fn.mock.calls.at(-1) as unknown as [string, RequestInit]
  return { url, init, headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : undefined }
}
const NOTE = { note_date: '2027-03-29', body: 'GEHEIM-4711', focus: ['technik' as const], rating: 4, next_steps: null, video_url: null, camp_id: null }

it('liest Liste und Akte mit Bearer-Token; Pfadsegmente werden kodiert', async () => {
  let fn = stubFetch(200, [{ id: 'p1' }])
  expect(await fetchPlayersAdmin('ksv', 'tok')).toEqual([{ id: 'p1' }])
  expect(lastCall(fn).url).toMatch(/\/admin\/organizations\/ksv\/players$/)
  expect(lastCall(fn).headers.Authorization).toBe('Bearer tok')
  fn = stubFetch(200, { player: {} })
  await fetchPlayerAdmin('a/b', 'x?y#z', 'tok')
  expect(lastCall(fn).url).toMatch(/\/admin\/organizations\/a%2Fb\/players\/x%3Fy%23z$/)
})

it('404 und ungültige Id (422) bei der Akte -> null, andere Fehler -> Fehlertext ohne Antwortinhalt', async () => {
  stubFetch(404, { detail: 'Player not found' })
  expect(await fetchPlayerAdmin('ksv', 'p1', 'tok')).toBeNull()
  stubFetch(422, { detail: [{ input: 'GEHEIM' }] })
  expect(await fetchPlayerAdmin('ksv', 'kaputt', 'tok')).toBeNull()
  stubFetch(500, { detail: 'GEHEIM' })
  await expect(fetchPlayerAdmin('ksv', 'p1', 'tok')).rejects.toThrow('Spielerakte konnte nicht geladen werden.')
  stubFetch(401)
  await expect(fetchPlayersAdmin('ksv', 'tok')).rejects.toBeInstanceOf(AdminAuthError)
})

it('legt Notizen, Ziele und Messwerte an und ändert/löscht sie unter dem Spieler-Pfad', async () => {
  let fn = stubFetch(201, { id: 'n1' })
  await createPlayerNoteAdmin('ksv', 'p1', 'tok', NOTE)
  expect(lastCall(fn)).toMatchObject({ init: { method: 'POST' }, body: NOTE })
  expect(lastCall(fn).url).toMatch(/\/players\/p1\/notes$/)
  fn = stubFetch(200, { id: 'n1' })
  await updatePlayerNoteAdmin('ksv', 'p1', 'n/1', 'tok', { body: 'neu' })
  expect(lastCall(fn).url).toMatch(/\/players\/p1\/notes\/n%2F1$/)
  expect(lastCall(fn).init.method).toBe('PATCH')
  fn = stubFetch(204)
  await deletePlayerNoteAdmin('ksv', 'p1', 'n1', 'tok')
  expect(lastCall(fn).init.method).toBe('DELETE')
  fn = stubFetch(201, { id: 'g1' })
  await createPlayerGoalAdmin('ksv', 'p1', 'tok', { title: 'Z', area: 'technik', target_date: null })
  expect(lastCall(fn).url).toMatch(/\/players\/p1\/goals$/)
  fn = stubFetch(200, { id: 'g1' })
  await updatePlayerGoalAdmin('ksv', 'p1', 'g1', 'tok', { status: 'erreicht' })
  expect(lastCall(fn).body).toEqual({ status: 'erreicht' })
  fn = stubFetch(201, { id: 'm1' })
  await createPlayerMeasurementAdmin('ksv', 'p1', 'tok', { measured_on: '2027-03-29', metric: 'sprint_10m', value: 2.1, unit: 's', note: null })
  expect(lastCall(fn).url).toMatch(/\/players\/p1\/measurements$/)
  fn = stubFetch(204)
  await deletePlayerMeasurementAdmin('ksv', 'p1', 'm1', 'tok')
  expect(lastCall(fn).url).toMatch(/\/players\/p1\/measurements\/m1$/)
})

it('Fehlertexte sind fest: 422 nennt nur das Feld, nie Eingaben oder Antwortinhalt', async () => {
  stubFetch(422, { detail: { code: 'validation_error', field: 'video_url', reason: 'must be an https link', body: 'GEHEIM-4711' } })
  const error = await createPlayerNoteAdmin('ksv', 'p1', 'tok', NOTE).catch((e: unknown) => e)
  expect(error).toBeInstanceOf(PlayerRecordError)
  expect((error as PlayerRecordError).field).toBe('video_url')
  expect((error as Error).message).not.toContain('GEHEIM')
  stubFetch(404, { detail: 'Note not found' })
  await expect(deletePlayerNoteAdmin('ksv', 'p1', 'n1', 'tok')).rejects.toThrow('nicht gefunden')
  stubFetch(500, 'GEHEIM')
  await expect(createPlayerNoteAdmin('ksv', 'p1', 'tok', NOTE)).rejects.toThrow('Notiz konnte nicht gespeichert werden.')
})
