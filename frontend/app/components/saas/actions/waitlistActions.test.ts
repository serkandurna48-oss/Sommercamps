import { beforeEach, expect, it, vi } from 'vitest'
import { getAdminToken } from '../../../lib/adminSession'
import { cancelRegistrationAdmin, promoteWaitlistAdmin, updateRegistrationDetailsAdmin } from '../../../lib/saasAdminApi'
import { cancelRegistrationAction, promoteWaitlistAction, updateRegistrationDetailsAction } from './waitlistActions'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('../../../lib/adminSession', () => ({ getAdminToken: vi.fn() }))
vi.mock('../../../lib/saasAdminApi', async () => ({
  ...await vi.importActual('../../../lib/saasAdminApi'),
  cancelRegistrationAdmin: vi.fn(), promoteWaitlistAdmin: vi.fn(), updateRegistrationDetailsAdmin: vi.fn(),
}))

const initial = { error: null, success: null }
const promoted = { registration_token: 'actual-promoted-token', status: 'registered', payment_status: 'open' }
const cancelled = { registration_token: 'cancelled-token', status: 'cancelled', payment_status: 'paid' }

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getAdminToken).mockResolvedValue('admin-token')
})

it.each([promoted, null])('preserves the actual cancellation promotion result: %s', async promotion => {
  vi.mocked(cancelRegistrationAdmin).mockResolvedValue({ cancelled, promoted: promotion })
  const result = await cancelRegistrationAction('club', 'camp', 'cancelled-token', initial)
  expect(cancelRegistrationAdmin).toHaveBeenCalledWith('club', 'camp', 'cancelled-token', 'admin-token')
  expect(result.error).toBeNull()
  expect(result.success).toBeTruthy()
  expect(result.promoted).toEqual(promotion)
})

it('preserves the actual promoted registration for the parent notification link', async () => {
  vi.mocked(promoteWaitlistAdmin).mockResolvedValue({ promoted })
  const result = await promoteWaitlistAction('club', 'camp', initial)
  expect(result.promoted).toEqual(promoted)
  expect(result.success).toBeTruthy()
})

it('does not report success when capacity was taken before confirmation', async () => {
  vi.mocked(promoteWaitlistAdmin).mockResolvedValue({ promoted: null })
  const result = await promoteWaitlistAction('club', 'camp', initial)
  expect(result.success).toBeNull()
  expect(result.error).toBeTruthy()
})

function detailsForm(extra: Record<string, string>) {
  const form = new FormData()
  form.set('child_first_name', 'Lea')
  form.set('child_last_name', 'Kind')
  for (const [key, value] of Object.entries(extra)) form.set(key, value)
  return form
}
const detailsInitial = { error: null, saved: false, registration: null }

it('sends a corrected parent email with the participant details', async () => {
  vi.mocked(updateRegistrationDetailsAdmin).mockResolvedValue({} as never)
  const result = await updateRegistrationDetailsAction('club', 'camp', 'tok', detailsInitial, detailsForm({ parent_email: ' neu@example.com ' }))
  expect(result.error).toBeNull()
  expect(vi.mocked(updateRegistrationDetailsAdmin).mock.calls[0][4]).toMatchObject({ parent_email: 'neu@example.com' })
})

it('rejects an invalid parent email before calling the API', async () => {
  const result = await updateRegistrationDetailsAction('club', 'camp', 'tok', detailsInitial, detailsForm({ parent_email: 'kein-at' }))
  expect(result.error).toBe('Bitte eine gültige E-Mail-Adresse der Eltern eingeben.')
  expect(updateRegistrationDetailsAdmin).not.toHaveBeenCalled()
})

it('leaves the parent email untouched when the form does not send it', async () => {
  vi.mocked(updateRegistrationDetailsAdmin).mockResolvedValue({} as never)
  await updateRegistrationDetailsAction('club', 'camp', 'tok', detailsInitial, detailsForm({}))
  expect(vi.mocked(updateRegistrationDetailsAdmin).mock.calls[0][4]).not.toHaveProperty('parent_email')
})
