// @vitest-environment jsdom
// Funnel analytics of the registration form: which section was completed,
// which field failed, where parents leave. Same direct-call harness as
// RegistrationFormScreen.test.tsx, but effects run so the funnel hooks execute.
import { beforeEach, expect, it, vi } from 'vitest'

const hooks = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0 }))

vi.mock('react', () => ({
  useState: (initial: unknown) => {
    const index = hooks.cursor++
    if (!(index in hooks.slots)) hooks.slots[index] = initial
    return [hooks.slots[index], (value: unknown) => {
      hooks.slots[index] = typeof value === 'function' ? (value as (previous: unknown) => unknown)(hooks.slots[index]) : value
    }]
  },
  useRef: (initial: unknown) => {
    const index = hooks.cursor++
    if (!(index in hooks.slots)) hooks.slots[index] = { current: initial }
    return hooks.slots[index]
  },
  useMemo: (factory: () => unknown) => factory(),
  // Like React: re-run only when a dependency changed, and clean up first.
  useEffect: (effect: () => void | (() => void), deps?: unknown[]) => {
    const index = hooks.cursor++
    const previous = hooks.slots[index] as { deps?: unknown[]; cleanup?: () => void } | undefined
    const unchanged = previous && deps && previous.deps
      && deps.length === previous.deps.length && deps.every((dep, i) => Object.is(dep, previous.deps![i]))
    if (unchanged) return
    previous?.cleanup?.()
    const cleanup = effect()
    hooks.slots[index] = { deps, cleanup: typeof cleanup === 'function' ? cleanup : undefined }
  },
}))

vi.mock('../../lib/saasApi', () => ({
  submitRegistration: vi.fn(async () => ({ ok: true, data: { registration_token: 'test', status: 'registered' } })),
}))
vi.mock('../../lib/saasAnalytics', () => ({ captureSaasEvent: vi.fn() }))

import RegistrationFormScreen from './RegistrationFormScreen'
import { submitRegistration } from '../../lib/saasApi'
import { captureSaasEvent } from '../../lib/saasAnalytics'

type ElementNode = { type: string; props: Record<string, unknown> }

function walk(node: unknown): ElementNode[] {
  if (Array.isArray(node)) return node.flatMap(walk)
  if (!node || typeof node !== 'object' || !('props' in node)) return []
  const element = node as ElementNode
  return [element, ...walk(element.props.children)]
}

type RenderOptions = { demo?: boolean; campSlug?: string; parentPrefill?: Record<string, string> }

function render({ demo = false, campSlug = 'sommer', parentPrefill }: RenderOptions = {}) {
  hooks.cursor = 0
  return walk(RegistrationFormScreen({
    orgSlug: 'testverein',
    orgName: 'Testverein',
    hasBankDetails: true,
    demo,
    parentPrefill: parentPrefill as never,
    camp: { slug: campSlug, title: 'Sommercamp', start_date: '2026-07-01', end_date: '2026-07-05', price_cents: 10000, currency: 'EUR', is_full: false } as never,
    onBack: vi.fn(),
    onSubmitted: vi.fn(),
  }))
}

function change(input: ElementNode, value: string | boolean) {
  // The birth-date field restores the caret after formatting, so the stub needs the caret API.
  const target = typeof value === 'boolean'
    ? { checked: value }
    : { value, selectionStart: value.length, selectionEnd: value.length, setSelectionRange() {} }
  ;(input.props.onChange as (event: unknown) => void)({ target })
}

function textInputs(nodes: ElementNode[]) {
  return nodes.filter((node) => node.type === 'input' && node.props.type !== 'checkbox')
}

/** Child section only: first name, last name, birth date (synthetic values). */
function fillChildSection(nodes: ElementNode[]) {
  ;['Mia', 'Muster', '01.01.2018'].forEach((value, index) => change(textInputs(nodes)[index], value))
}

async function submit(nodes: ElementNode[]) {
  const form = nodes.find((node) => node.type === 'form')!
  await (form.props.onSubmit as (event: unknown) => Promise<void>)({ preventDefault() {} })
}

function events(name: string) {
  return vi.mocked(captureSaasEvent).mock.calls.filter((call) => call[0] === name)
}

/** Unmount: run every pending effect cleanup. */
function leavePage() {
  for (const slot of hooks.slots) {
    const cleanup = (slot as { cleanup?: () => void } | undefined)?.cleanup
    if (typeof cleanup === 'function') cleanup()
  }
  hooks.slots = []
}

beforeEach(() => {
  leavePage() // removes listeners of the previous test
  hooks.cursor = 0
  vi.clearAllMocks()
})

it('reports a completed section once, with its number only', () => {
  fillChildSection(render())
  render()
  render()
  expect(events('camp_registration_section_completed')).toEqual([
    ['camp_registration_section_completed', 'testverein', 'sommer', { section: 1 }],
  ])
})

it('reports nothing while the form is untouched', () => {
  render()
  leavePage()
  expect(captureSaasEvent).not.toHaveBeenCalled()
})

it('reports the failing field keys on submit, never the typed values', async () => {
  fillChildSection(render())
  await submit(render())
  const [[, , , details]] = events('camp_registration_failed')
  expect(details?.error_kind).toBe('validation')
  expect(details?.fields).toEqual(expect.arrayContaining(['parentName', 'parentEmail', 'parentPhone', 'emergencyPhone', 'agb', 'privacy']))
  expect(details?.fields).not.toContain('childFirstName')
  expect(JSON.stringify(vi.mocked(captureSaasEvent).mock.calls)).not.toMatch(/Mia|Muster|2018/)
  expect(submitRegistration).not.toHaveBeenCalled()
})

it('reports the field keys the server rejected', async () => {
  vi.mocked(submitRegistration).mockResolvedValueOnce({
    ok: false, status: 422, fieldErrors: { child_first_name: 'Bitte prüfen', parent_email: 'Bitte prüfen' },
  } as never)
  let nodes = render()
  const values = ['Mia', 'Muster', '01.01.2018', 'Eva Muster', 'eva@example.de', '12345', '67890', '', 'Musterweg 1', '34117', 'Kassel']
  textInputs(nodes).forEach((input, index) => change(input, values[index]))
  nodes.filter((node) => node.type === 'input' && node.props.type === 'checkbox' && node.props.required !== false)
    .forEach((box) => change(box, true))
  nodes = render()
  await submit(nodes)
  const failed = events('camp_registration_failed')
  expect(failed).toHaveLength(1)
  expect(failed[0][3]).toEqual({ error_kind: 'api', status_code: 422, fields: ['childFirstName', 'parentEmail'] })
})

it('reports where a parent left on in-app navigation, once', () => {
  fillChildSection(render())
  render()
  leavePage()
  expect(events('camp_registration_abandoned')).toEqual([
    ['camp_registration_abandoned', 'testverein', 'sommer', { last_section: 1, sections_done: 1 }],
  ])
})

it('reports where a parent left when the tab closes, and not again on unmount', () => {
  fillChildSection(render())
  render()
  window.dispatchEvent(new Event('pagehide'))
  expect(events('camp_registration_abandoned')).toHaveLength(1)
  leavePage()
  expect(events('camp_registration_abandoned')).toHaveLength(1)
})

it('counts a page restored from the back/forward cache as live again', () => {
  fillChildSection(render())
  render()
  window.dispatchEvent(new Event('pagehide'))
  window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }))
  window.dispatchEvent(new Event('pagehide'))
  expect(events('camp_registration_abandoned')).toHaveLength(2)
})

it('does not count switching the camp inside the form as leaving', () => {
  fillChildSection(render())
  render()
  render({ campSlug: 'herbst' })
  expect(events('camp_registration_abandoned')).toEqual([])
  leavePage()
  expect(events('camp_registration_abandoned')).toEqual([
    ['camp_registration_abandoned', 'testverein', 'herbst', { last_section: 1, sections_done: 1 }],
  ])
})

it('ignores a prefilled form until the parent edits it', () => {
  const parentPrefill = { parentName: 'Eva Muster', parentEmail: 'eva@example.de', parentPhone: '12345', emergencyPhone: '67890',
    billingStreet: 'Musterweg 1', billingPostalCode: '34117', billingCity: 'Kassel' }
  render({ parentPrefill })
  render({ parentPrefill })
  leavePage()
  expect(captureSaasEvent).not.toHaveBeenCalled()
})

it('reports sections complete in order: a later section alone does not move the position', () => {
  const nodes = render()
  // Emergency phone only (section 3), child and parent sections still empty.
  change(textInputs(nodes)[6], '67890')
  render()
  leavePage()
  expect(events('camp_registration_abandoned')[0][3]).toEqual({ last_section: 0, sections_done: 1 })
})

it('does not report a successful registration as abandoned', async () => {
  let nodes = render()
  const values = ['Mia', 'Muster', '01.01.2018', 'Eva Muster', 'eva@example.de', '12345', '67890', '', 'Musterweg 1', '34117', 'Kassel']
  textInputs(nodes).forEach((input, index) => change(input, values[index]))
  nodes.filter((node) => node.type === 'input' && node.props.type === 'checkbox' && node.props.required !== false)
    .forEach((box) => change(box, true))
  nodes = render()
  await submit(nodes)
  expect(events('camp_registration_succeeded')).toHaveLength(1)
  leavePage() // the parent screen replaces the form right after onSubmitted
  expect(events('camp_registration_abandoned')).toEqual([])
})

it('stays silent in the public demo, including a failed submit', async () => {
  fillChildSection(render({ demo: true }))
  await submit(render({ demo: true }))
  leavePage()
  expect(captureSaasEvent).not.toHaveBeenCalled()
})
