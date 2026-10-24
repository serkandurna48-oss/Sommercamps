import { beforeEach, expect, it, vi } from 'vitest'
import PlatformLayout from './layout'
import AdminLayoutUnavailable from '../../components/saas/screens/AdminLayoutUnavailable'
import { AdminAuthError, fetchMe } from '../../lib/saasAdminApi'
import { getValidAccessToken } from '../../lib/supabaseServer'

vi.mock('../../lib/supabaseServer', () => ({ getValidAccessToken: vi.fn() }))
vi.mock('../../lib/saasAdminApi', async () => ({ ...await vi.importActual('../../lib/saasAdminApi'), fetchMe: vi.fn() }))
vi.mock('../../components/saas/fonts', () => ({ archivo: { variable: 'test-font' } }))
vi.mock('../logoutAction', () => ({ platformLogoutAction: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`) } }))
beforeEach(() => { vi.mocked(getValidAccessToken).mockResolvedValue('test-token') })

it('shows a retryable fallback instead of login or protected children on backend failure', async () => {
  vi.mocked(fetchMe).mockRejectedValue(new Error('503 unavailable'))
  const layout = await PlatformLayout({ children: 'private' })
  expect(layout.type).toBe(AdminLayoutUnavailable)
  expect(layout.props.platform).toBe(true)
  expect(layout.props.children).toBeUndefined()
})
it('still redirects expired authorization to login', async () => {
  vi.mocked(fetchMe).mockRejectedValue(new AdminAuthError())
  await expect(PlatformLayout({ children: 'private' })).rejects.toThrow('redirect:/platform/login')
})
