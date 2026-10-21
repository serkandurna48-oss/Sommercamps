import { beforeEach, expect, it, vi } from 'vitest'
import { createCampAction, updateCampConfigAction, updateOrganizationConfigAction } from './configActions'
import { redirect } from 'next/navigation'

vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('../../../lib/adminSession', () => ({ getAdminToken: vi.fn() }))
vi.mock('../../../lib/saasAdminApi', async importOriginal => ({
  ...await importOriginal<typeof import('../../../lib/saasAdminApi')>(),
  updateOrganizationAdmin: vi.fn(), createCampAdmin: vi.fn(), updateCampAdmin: vi.fn(),
}))

import { getAdminToken } from '../../../lib/adminSession'
import { createCampAdmin, SlugConflictError, updateCampAdmin, updateOrganizationAdmin, type CampAdmin } from '../../../lib/saasAdminApi'

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
  terms_text: '',
  billing_notes: '',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getAdminToken).mockResolvedValue('tok-123')
  vi.mocked(updateOrganizationAdmin).mockResolvedValue(undefined)
})

const CAMP_FIELDS = { slug: 'sommer', title: 'Sommer', start_date: '2027-07-05', end_date: '2027-07-09', age_min: '6', age_max: '12', capacity: '20', price_euros: '149.50' }

it('always creates a draft even when an obsolete immediate-publication field is submitted', async () => {
  await createCampAction('demo', { error: null }, makeFormData({ ...CAMP_FIELDS, publish_now: 'on' }))
  expect(createCampAdmin).toHaveBeenCalledWith('demo', 'tok-123', expect.objectContaining({ slug: 'sommer', status: 'draft', price_cents: 14950 }))
  expect(redirect).toHaveBeenCalledWith('/pilot/demo/camps/sommer/konfiguration?created=1')
})

it('describes address conflicts without technical slug wording and does not redirect', async () => {
  vi.mocked(createCampAdmin).mockRejectedValueOnce(new SlugConflictError('sommer'))
  const state = await createCampAction('demo', { error: null }, makeFormData(CAMP_FIELDS))
  expect(state.error).toBe('Die Web-Adresse „sommer“ ist bereits vergeben — wähle eine andere.')
  expect(redirect).not.toHaveBeenCalled()
})

it('does not create a camp when the session has expired', async () => {
  vi.mocked(getAdminToken).mockResolvedValueOnce(null)
  const state = await createCampAction('demo', { error: null }, makeFormData(CAMP_FIELDS))
  expect(state.error).toContain('Sitzung abgelaufen')
  expect(createCampAdmin).not.toHaveBeenCalled()
  expect(redirect).not.toHaveBeenCalled()
})

it('returns the persisted camp for the publication card', async () => {
  const persisted = { slug: 'sommer', status: 'published', location: 'Sportplatz' } as CampAdmin
  vi.mocked(updateCampAdmin).mockResolvedValueOnce(persisted)
  const state = await updateCampConfigAction('demo', 'sommer', { error: null, saved: false }, makeFormData({ ...CAMP_FIELDS, status: 'published', location: 'Sportplatz' }))
  expect(state).toEqual({ error: null, saved: true, status: 'published', camp: persisted })
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

it('passes terms_text to updateOrganizationAdmin', async () => {
  const fd = makeFormData({ ...BASE_FIELDS, terms_text: 'Unsere Stornobedingungen.' })
  await updateOrganizationConfigAction('demo', { error: null, saved: false }, fd)
  expect(updateOrganizationAdmin).toHaveBeenCalledOnce()
  const [, , payload] = vi.mocked(updateOrganizationAdmin).mock.calls[0]
  expect(payload.terms_text).toBe('Unsere Stornobedingungen.')
})

it('sends null for terms_text when input is empty', async () => {
  const fd = makeFormData({ ...BASE_FIELDS, terms_text: '' })
  await updateOrganizationConfigAction('demo', { error: null, saved: false }, fd)
  expect(updateOrganizationAdmin).toHaveBeenCalledOnce()
  const [, , payload] = vi.mocked(updateOrganizationAdmin).mock.calls[0]
  expect(payload.terms_text).toBeNull()
})


it.each([undefined, '', 'Injected notes'])('never sends billing_notes from the club form (%s)', async notes => {
  const fd = makeFormData(BASE_FIELDS)
  fd.delete('billing_notes')
  if (notes !== undefined) fd.set('billing_notes', notes)
  const state = await updateOrganizationConfigAction('demo', { error: null, saved: false }, fd)
  expect(state.saved).toBe(true)
  expect(updateOrganizationAdmin).toHaveBeenCalledOnce()
  expect(vi.mocked(updateOrganizationAdmin).mock.calls[0][2]).not.toHaveProperty('billing_notes')
})
