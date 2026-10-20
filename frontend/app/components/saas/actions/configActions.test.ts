import { beforeEach, expect, it, vi } from 'vitest'
import { updateOrganizationConfigAction } from './configActions'

vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('../../../lib/adminSession', () => ({ getAdminToken: vi.fn() }))
vi.mock('../../../lib/saasAdminApi', () => ({ updateOrganizationAdmin: vi.fn() }))

import { getAdminToken } from '../../../lib/adminSession'
import { updateOrganizationAdmin } from '../../../lib/saasAdminApi'

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

const BASE_FIELDS = {
  name: 'Test Verein',
  contact_email: 'test@example.com',
  legal_name: '',
  legal_address: '',
  contact_phone: '',
  contact_person_name: '',
  logo_url: '',
  primary_color: '',
  iban: '',
  intro_heading: '',
  intro_text: '',
  hero_image_url: '',
  trainer_image_url: '',
  trainer_text: '',
  billing_notes: '',
}

beforeEach(() => {
  vi.mocked(getAdminToken).mockResolvedValue('tok-123')
  vi.mocked(updateOrganizationAdmin).mockResolvedValue(undefined)
})

it('passes trainer_image_url and trainer_text to updateOrganizationAdmin', async () => {
  const fd = makeFormData({
    ...BASE_FIELDS,
    trainer_image_url: 'https://example.com/trainer.jpg',
    trainer_text: 'Ein erfahrener Trainer.',
  })
  await updateOrganizationConfigAction('demo', { error: null, saved: false }, fd)
  expect(updateOrganizationAdmin).toHaveBeenCalledOnce()
  const [, , payload] = vi.mocked(updateOrganizationAdmin).mock.calls[0]
  expect(payload.trainer_image_url).toBe('https://example.com/trainer.jpg')
  expect(payload.trainer_text).toBe('Ein erfahrener Trainer.')
})

it('sends null for trainer_image_url and trainer_text when inputs are empty', async () => {
  const fd = makeFormData({ ...BASE_FIELDS, trainer_image_url: '', trainer_text: '' })
  await updateOrganizationConfigAction('demo', { error: null, saved: false }, fd)
  expect(updateOrganizationAdmin).toHaveBeenCalledOnce()
  const [, , payload] = vi.mocked(updateOrganizationAdmin).mock.calls[0]
  expect(payload.trainer_image_url).toBeNull()
  expect(payload.trainer_text).toBeNull()
})
