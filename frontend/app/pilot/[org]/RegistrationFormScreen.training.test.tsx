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
  useEffect: () => { /* no-op: component function is invoked directly without a DOM */ },
}))

vi.mock('../../lib/saasApi', () => ({
  submitRegistration: vi.fn(async () => ({ ok: true, data: { registration_token: 'test' } })),
}))

import RegistrationFormScreen from './RegistrationFormScreen'
import { submitRegistration } from '../../lib/saasApi'

type ElementNode = { type: string; props: Record<string, unknown> }

function walk(node: unknown): ElementNode[] {
  if (Array.isArray(node)) return node.flatMap(walk)
  if (!node || typeof node !== 'object' || !('props' in node)) return []
  const element = node as ElementNode
  return [element, ...walk(element.props.children)]
}

const TRAINING = { dateTimeLabel: 'Do., 12. Nov. 2026, 16:00 Uhr', priceText: '35 € für Mitglieder, 45 € sonst – geprüft bei der Buchung', onSlotTaken: vi.fn() }
const SESSION_AS_CAMP = {
  slug: 'einzel-30-abc', title: 'Einzeltraining 30 Min', start_date: '2026-11-12', end_date: '2026-11-12',
  age_min: 6, age_max: 14, capacity: 1, price_cents: 0, currency: 'EUR', registration_open: true,
  location: 'Sportplatz', is_full: false, spots_remaining: 1,
}

function render(opts: { training?: boolean; onSubmitted?: (...args: unknown[]) => void } = {}) {
  hooks.cursor = 0
  return walk(RegistrationFormScreen({
    orgSlug: 'testverein', orgName: 'Testverein', hasBankDetails: true,
    camp: (opts.training === false
      ? { ...SESSION_AS_CAMP, price_cents: 10000 } : SESSION_AS_CAMP) as never,
    training: opts.training === false ? undefined : TRAINING,
    onBack: vi.fn(), onSubmitted: opts.onSubmitted ?? vi.fn(),
  }))
}

const text = (nodes: ElementNode[]) => JSON.stringify(nodes.map((node) => node.props.children))
function change(input: ElementNode, value: string | boolean) {
  ;(input.props.onChange as (event: unknown) => void)({ target: typeof value === 'boolean' ? { checked: value } : { value } })
}
function checkbox(nodes: ElementNode[], heading: string) {
  const label = nodes.find((node) => node.type === 'label' && walk(node.props.children).some((child) => {
    if (child.type !== 'b') return false
    const c = child.props.children
    return c === heading || (Array.isArray(c) && c[0] === heading)
  }))
  return walk(label?.props.children).find((node) => node.type === 'input')!
}
function fill(nodes: ElementNode[]) {
  const inputs = nodes.filter((node) => node.type === 'input' && node.props.type !== 'checkbox' && node.props.type !== 'radio')
  const values = ['Mia', 'Muster', '01.01.2018', 'Eva Muster', 'eva@example.de', '12345', '67890', '']
  inputs.forEach((input, index) => change(input, values[index]))
  change(checkbox(nodes, 'Teilnahmebedingungen'), true)
  change(checkbox(nodes, 'Datenschutz'), true)
}
const radio = (nodes: ElementNode[], value: string) => nodes.find((node) => node.type === 'input' && node.props.type === 'radio' && node.props.value === value)!
async function submit(nodes: ElementNode[]) {
  const form = nodes.find((node) => node.type === 'form')!
  await (form.props.onSubmit as (event: unknown) => Promise<void>)({ preventDefault() {} })
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => { callback(); return 0 })
  hooks.slots = []
  hooks.cursor = 0
  vi.clearAllMocks()
})

it('shows session date and time, the price text and the cancellation note instead of a camp price', () => {
  const rendered = text(render())
  expect(rendered).toContain('Do., 12. Nov. 2026, 16:00 Uhr')
  expect(rendered).toContain('35 € für Mitglieder, 45 € sonst – geprüft bei der Buchung')
  expect(rendered).toContain('Kostenlose Absage bis 24 h vorher – bitte direkt beim Verein melden.')
  expect(rendered).not.toContain('0,00')
  expect(rendered).not.toContain('Camp')
})

it('offers Überweisung and bar as payment methods', () => {
  const nodes = render()
  expect(radio(nodes, 'ueberweisung')).toBeDefined()
  expect(radio(nodes, 'bar')).toBeDefined()
  expect(text(nodes)).toContain('Überweisung')
  expect(text(nodes)).toContain('Bar beim Training')
})

it('names the action a booking without a price in the button', () => {
  const button = render().find((node) => node.type === 'button' && node.props.type === 'submit')
  expect(button?.props.children).toBe('Verbindlich buchen')
})

it('does not submit without a payment method and marks the group invalid', async () => {
  let nodes = render()
  fill(nodes)
  nodes = render()
  await submit(nodes)
  expect(submitRegistration).not.toHaveBeenCalled()
  nodes = render()
  const group = nodes.find((node) => node.props.role === 'radiogroup')
  expect(group?.props['aria-invalid']).toBe(true)
})

it.each(['bar', 'ueberweisung'] as const)('sends payment_method %s with the booking to the session slug', async (method) => {
  const onSubmitted = vi.fn()
  let nodes = render({ onSubmitted })
  fill(nodes)
  change(radio(nodes, method), true)
  nodes = render({ onSubmitted })
  await submit(nodes)
  expect(submitRegistration).toHaveBeenCalledWith('testverein', 'einzel-30-abc', expect.objectContaining({ payment_method: method, jersey_size: null }))
  expect(onSubmitted).toHaveBeenCalledOnce()
  expect((onSubmitted.mock.calls[0] as unknown[])[4]).toBe(method)
})

it('never sends payment_method in the camp flow', async () => {
  let nodes = render({ training: false })
  fill(nodes)
  nodes = render({ training: false })
  await submit(nodes)
  const payload = vi.mocked(submitRegistration).mock.calls[0][2]
  expect(payload).not.toHaveProperty('payment_method')
})

it('reports a full slot to the flow and shows the friendly message', async () => {
  vi.mocked(submitRegistration).mockResolvedValueOnce({ ok: false, status: 409, detail: 'x', conflict: 'full' })
  let nodes = render()
  fill(nodes)
  change(radio(nodes, 'bar'), true)
  nodes = render()
  await submit(nodes)
  expect(TRAINING.onSlotTaken).toHaveBeenCalledWith('full')
  expect(text(render())).toContain('Dieser Termin wurde gerade vergeben.')
})

it('does not reload the slots for a duplicate booking', async () => {
  vi.mocked(submitRegistration).mockResolvedValueOnce({ ok: false, status: 409, detail: 'x', conflict: 'duplicate' })
  let nodes = render()
  fill(nodes)
  change(radio(nodes, 'bar'), true)
  nodes = render()
  await submit(nodes)
  expect(TRAINING.onSlotTaken).not.toHaveBeenCalled()
  expect(text(render())).toContain('bereits eine Buchung')
})
