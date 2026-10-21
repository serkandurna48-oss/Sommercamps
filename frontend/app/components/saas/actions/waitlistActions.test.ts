import { beforeEach, expect, it, vi } from 'vitest'
import { getAdminToken } from '../../../lib/adminSession'
import { cancelRegistrationAdmin, promoteWaitlistAdmin } from '../../../lib/saasAdminApi'
import { cancelRegistrationAction, promoteWaitlistAction } from './waitlistActions'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('../../../lib/adminSession', () => ({ getAdminToken: vi.fn() }))
vi.mock('../../../lib/saasAdminApi', () => ({
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