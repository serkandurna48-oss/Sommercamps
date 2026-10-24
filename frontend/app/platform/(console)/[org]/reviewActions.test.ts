import { beforeEach, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { getValidAccessToken } from '../../../lib/supabaseServer'
import { reviewOrganization } from '../../../lib/saasAdminApi'
import { reviewOrganizationAction } from './reviewActions'
import { reviewOrg } from '../../reviewFixtures'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('../../../lib/supabaseServer', () => ({ getValidAccessToken: vi.fn() }))
vi.mock('../../../lib/saasAdminApi', () => ({ reviewOrganization: vi.fn() }))

const initial = { error: null, done: false, decision: null }
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getValidAccessToken).mockResolvedValue('test-token')
  vi.mocked(reviewOrganization).mockResolvedValue(reviewOrg)
})

it.each(['approve', 'reject'])('aktualisiert nach %s auch Warteliste und Navigationsbadge', async decision => {
  const data = new FormData()
  data.set('decision', decision)
  if (decision === 'reject') data.set('note', 'Bitte Angaben vervollständigen.')
  expect((await reviewOrganizationAction('test-verein', initial, data)).done).toBe(true)
  expect(revalidatePath).toHaveBeenCalledWith('/platform/test-verein')
  expect(revalidatePath).toHaveBeenCalledWith('/platform', 'layout')
})

it('aktualisiert bei fehlgeschlagener Entscheidung keinen Erfolgszustand', async () => {
  vi.mocked(reviewOrganization).mockRejectedValue(new Error('Speichern fehlgeschlagen'))
  const data = new FormData()
  data.set('decision', 'approve')
  const result = await reviewOrganizationAction('test-verein', initial, data)
  expect(result.done).toBe(false)
  expect(result.error).toBe('Speichern fehlgeschlagen')
  expect(revalidatePath).not.toHaveBeenCalled()
})
