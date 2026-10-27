import { beforeEach, expect, it, vi } from 'vitest'
import { updateOrganizationConfigAction } from './configActions'
import { updateOrganizationAdmin } from '../../../lib/saasAdminApi'
import { getValidAccessToken } from '../../../lib/supabaseServer'
import { revalidatePath } from 'next/cache'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('../../../lib/supabaseServer', () => ({ getValidAccessToken: vi.fn() }))
vi.mock('../../../lib/saasAdminApi', () => ({ updateOrganizationAdmin: vi.fn() }))

const question = { key: 'hinweis', label: 'Hinweis', type: 'text', options: null, other_label: null, required: false }
function data(raw?: string) {
  const form = new FormData()
  form.set('name', 'Test Verein')
  form.set('contact_email', 'test@example.com')
  if (raw !== undefined) form.set('registration_questions', raw)
  return form
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getValidAccessToken).mockResolvedValue('test-token')
  vi.mocked(updateOrganizationAdmin).mockResolvedValue(undefined)
})
it.each(['{', '{}', '[null]', JSON.stringify([{ ...question, label: '  ' }]), JSON.stringify([{ ...question, type: 'date' }]),
  JSON.stringify([{ ...question, type: 'choice', options: ['A', ' A '] }]),
  JSON.stringify([{ ...question, type: 'choice', options: ['x'.repeat(81)] }]),
])(
  'rejects invalid configuration before any API write: %s', async raw => {
    const result = await updateOrganizationConfigAction('demo', { error: null, saved: false }, data(raw))
    expect(result.saved).toBe(false)
    expect(result.error).toBeTruthy()
    expect(updateOrganizationAdmin).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  },
)
it('uses the existing API and preserves identifiers and order', async () => {
  const questions = [question, { ...question, key: 'zweites', label: 'Zweites' }]
  expect(await updateOrganizationConfigAction('demo', { error: null, saved: false }, data(JSON.stringify(questions)))).toEqual({ error: null, saved: true })
  expect(updateOrganizationAdmin).toHaveBeenCalledWith('demo', 'test-token', expect.objectContaining({ registration_questions: questions }))
  expect(revalidatePath).toHaveBeenCalledWith('/pilot/demo', 'layout')
})
it('never persists a blank free-text alternative that the parent form cannot submit', async () => {
  const choice = { ...question, type: 'choice', options: ['A'], other_label: '   ' }
  await updateOrganizationConfigAction('demo', { error: null, saved: false }, data(JSON.stringify([choice])))
  expect(updateOrganizationAdmin).toHaveBeenCalledWith('demo', 'test-token', expect.objectContaining({
    registration_questions: [{ ...choice, other_label: null }],
  }))
})
it('distinguishes omitted unsupported data from explicitly removing every question', async () => {
  await updateOrganizationConfigAction('demo', { error: null, saved: false }, data())
  expect(vi.mocked(updateOrganizationAdmin).mock.calls[0][2]).not.toHaveProperty('registration_questions')
  await updateOrganizationConfigAction('demo', { error: null, saved: false }, data('[]'))
  expect(vi.mocked(updateOrganizationAdmin).mock.calls[1][2]).toHaveProperty('registration_questions', [])
})
it('reports API failure and never writes without an authenticated session', async () => {
  vi.mocked(updateOrganizationAdmin).mockRejectedValueOnce(new Error('unavailable'))
  expect((await updateOrganizationConfigAction('demo', { error: null, saved: false }, data('[]'))).saved).toBe(false)
  vi.clearAllMocks()
  vi.mocked(getValidAccessToken).mockResolvedValue(null)
  expect((await updateOrganizationConfigAction('demo', { error: null, saved: false }, data('[]'))).saved).toBe(false)
  expect(updateOrganizationAdmin).not.toHaveBeenCalled()
})
