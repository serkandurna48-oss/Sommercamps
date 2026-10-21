import { afterEach, expect, it, vi } from 'vitest'
import { submitRegistration, type RegistrationCreateInput } from './saasApi'

afterEach(() => vi.unstubAllGlobals())
const payload = { parent_email: 'invalid', child_birth_date: '2020-01-01' } as RegistrationCreateInput

it('maps structured validation errors to fields without exposing raw server values', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ detail: [
    { loc: ['body', 'parent_email'], msg: 'private server message', input: 'private value' },
  ] }), { status: 422 })))
  const result = await submitRegistration('club', 'camp', payload)
  expect(result).toMatchObject({ ok: false, fieldErrors: { parent_email: 'Bitte geben Sie eine gültige E-Mail-Adresse an.' } })
  expect(JSON.stringify(result)).not.toContain('private')
})

it('maps the age rejection to the birth date field', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ detail: "Child's age does not meet this camp's age requirements" }), { status: 422 })))
  expect(await submitRegistration('club', 'camp', payload)).toMatchObject({
    ok: false, fieldErrors: { child_birth_date: expect.stringContaining('Alter Ihres Kindes') },
  })
})

it.each([404, 409, 422, 500])('returns a German message for HTTP %s', async status => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('not JSON', { status })))
  const result = await submitRegistration('club', 'camp', payload)
  expect(result).toMatchObject({ ok: false, status, detail: expect.stringContaining('Anmeldung') })
})
