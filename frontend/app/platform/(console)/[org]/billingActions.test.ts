import { beforeEach, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { getAdminToken } from '../../../lib/adminSession'
import { fetchMe, updateOrganizationAdmin, type Me } from '../../../lib/saasAdminApi'
import { updateBillingNotesAction } from './billingActions'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('../../../lib/adminSession', () => ({ getAdminToken: vi.fn() }))
vi.mock('../../../lib/saasAdminApi', () => ({ fetchMe: vi.fn(), updateOrganizationAdmin: vi.fn() }))

const owner: Me = { user_id: 'owner', email: null, is_platform_owner: true, admin_organization_slugs: [] }
function form(notes: string) {
  const data = new FormData()
  data.set('billing_notes', notes)
  data.set('name', 'Unrelated change')
  return data
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getAdminToken).mockResolvedValue('token')
  vi.mocked(fetchMe).mockResolvedValue(owner)
  vi.mocked(updateOrganizationAdmin).mockResolvedValue(undefined)
})

it.each([[' New terms ', 'New terms'], ['', null]])('saves owner notes and supports clearing (%s)', async (input, expected) => {
  const state = await updateBillingNotesAction('demo', { error: null, saved: false }, form(input!))
  expect(state).toEqual({ error: null, saved: true })
  expect(updateOrganizationAdmin).toHaveBeenCalledWith('demo', 'token', { billing_notes: expected })
  expect(revalidatePath).toHaveBeenCalledWith('/platform/demo')
})

it('rejects a club admin calling the server action directly', async () => {
  vi.mocked(fetchMe).mockResolvedValue({ ...owner, is_platform_owner: false })
  const state = await updateBillingNotesAction('demo', { error: null, saved: false }, form('Injected'))
  expect(state.saved).toBe(false)
  expect(state.error).toBeTruthy()
  expect(updateOrganizationAdmin).not.toHaveBeenCalled()
  expect(revalidatePath).not.toHaveBeenCalled()
})

it('rejects an expired session', async () => {
  vi.mocked(getAdminToken).mockResolvedValue(null)
  const state = await updateBillingNotesAction('demo', { error: null, saved: false }, form('Notes'))
  expect(state.saved).toBe(false)
  expect(fetchMe).not.toHaveBeenCalled()
  expect(updateOrganizationAdmin).not.toHaveBeenCalled()
})

it('reports a failed write without reporting success', async () => {
  vi.mocked(updateOrganizationAdmin).mockRejectedValue(new Error('Unavailable'))
  const state = await updateBillingNotesAction('demo', { error: null, saved: false }, form('Notes'))
  expect(state.saved).toBe(false)
  expect(state.error).toBeTruthy()
  expect(revalidatePath).not.toHaveBeenCalled()
})