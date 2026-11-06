import { beforeEach, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { getValidAccessToken } from '../../../lib/supabaseServer'
import { fetchMe, updateOrganizationModulesAdmin, type Me } from '../../../lib/saasAdminApi'
import { updateModulesAction } from './modulesActions'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('../../../lib/supabaseServer', () => ({ getValidAccessToken: vi.fn() }))
vi.mock('../../../lib/saasAdminApi', () => ({ fetchMe: vi.fn(), updateOrganizationModulesAdmin: vi.fn() }))

const owner: Me = { user_id: 'owner', email: null, is_platform_owner: true, admin_organization_slugs: [] }
const empty = { error: null, saved: false }
function form(...modules: string[]) {
  const data = new FormData()
  for (const m of modules) data.append('modules', m)
  return data
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getValidAccessToken).mockResolvedValue('token')
  vi.mocked(fetchMe).mockResolvedValue(owner)
  vi.mocked(updateOrganizationModulesAdmin).mockResolvedValue(undefined)
})

it('speichert die gewählten Module, camps immer, Unbekanntes fällt weg', async () => {
  const state = await updateModulesAction('demo', empty, form('players', 'shop', 'trainings'))
  expect(state).toEqual({ error: null, saved: true })
  expect(updateOrganizationModulesAdmin).toHaveBeenCalledWith('demo', 'token', ['camps', 'trainings', 'players'])
  expect(revalidatePath).toHaveBeenCalledWith('/platform/demo')
})

it('nichts angehakt: nur camps', async () => {
  await updateModulesAction('demo', empty, form())
  expect(updateOrganizationModulesAdmin).toHaveBeenCalledWith('demo', 'token', ['camps'])
})

it('lehnt einen Vereinsadmin ab', async () => {
  vi.mocked(fetchMe).mockResolvedValue({ ...owner, is_platform_owner: false })
  const state = await updateModulesAction('demo', empty, form('trainings'))
  expect(state.saved).toBe(false)
  expect(updateOrganizationModulesAdmin).not.toHaveBeenCalled()
})

it('abgelaufene Sitzung und Fehler melden keinen Erfolg', async () => {
  vi.mocked(getValidAccessToken).mockResolvedValue(null)
  expect((await updateModulesAction('demo', empty, form('trainings'))).saved).toBe(false)
  vi.mocked(getValidAccessToken).mockResolvedValue('token')
  vi.mocked(updateOrganizationModulesAdmin).mockRejectedValue(new Error('down'))
  const state = await updateModulesAction('demo', empty, form('trainings'))
  expect(state.saved).toBe(false)
  expect(state.error).toBeTruthy()
  expect(revalidatePath).not.toHaveBeenCalled()
})
