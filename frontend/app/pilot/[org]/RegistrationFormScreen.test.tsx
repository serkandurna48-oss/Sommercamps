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

function render(onSubmitted = vi.fn()) {
  hooks.cursor = 0
  return walk(RegistrationFormScreen({
    orgSlug: 'testverein',
    orgName: 'Testverein',
    camp: { slug: 'sommer', title: 'Sommercamp', start_date: '2026-07-01', end_date: '2026-07-05', price_cents: 10000, currency: 'EUR' } as never,
    onBack: vi.fn(),
    onSubmitted,
  }))
}

function change(input: ElementNode, value: string | boolean) {
  const target = typeof value === 'boolean' ? { checked: value } : { value }
  ;(input.props.onChange as (event: unknown) => void)({ target })
}

function checkbox(nodes: ElementNode[], heading: string) {
  const label = nodes.find((node) => node.type === 'label' && walk(node.props.children).some((child) => child.type === 'b' && child.props.children === heading))
  const input = walk(label?.props.children).find((node) => node.type === 'input')
  if (!input) throw new Error('Checkbox missing: ' + heading)
  return input
}

function fillRequiredFields(nodes: ElementNode[]) {
  const inputs = nodes.filter((node) => node.type === 'input' && node.props.type !== 'checkbox')
  const values = ['Mia', 'Muster', '01.01.2018', 'Eva Muster', 'eva@example.de', '12345', '67890', '']
  inputs.forEach((input, index) => change(input, values[index]))
}

async function submit(nodes: ElementNode[]) {
  const form = nodes.find((node) => node.type === 'form')
  if (!form) throw new Error('Form missing')
  await (form.props.onSubmit as (event: unknown) => Promise<void>)({ preventDefault() {} })
}

function expectPrivacyFieldError(nodes: ElementNode[]) {
  expect(nodes.some((node) => node.props.id === 'err-privacy' && node.props.children === 'Bitte stimmen Sie der Datenschutzerklärung zu.')).toBe(true)
  expect(checkbox(nodes, 'Datenschutz').props['aria-invalid']).toBe(true)
  expect(submitRegistration).not.toHaveBeenCalled()
}

beforeEach(() => {
  hooks.slots = []
  hooks.cursor = 0
  vi.clearAllMocks()
})

it('shows a privacy field error and does not submit without either required consent', async () => {
  let nodes = render()
  fillRequiredFields(nodes)
  nodes = render()
  await submit(nodes)
  expectPrivacyFieldError(render())
})

it('shows the same privacy field error and does not submit with terms consent only', async () => {
  let nodes = render()
  fillRequiredFields(nodes)
  change(checkbox(nodes, 'Teilnahmebedingungen'), true)
  nodes = render()
  await submit(nodes)
  expectPrivacyFieldError(render())
})

it('submits both consent flags as true when both checkboxes are accepted', async () => {
  const onSubmitted = vi.fn()
  let nodes = render(onSubmitted)
  fillRequiredFields(nodes)
  change(checkbox(nodes, 'Teilnahmebedingungen'), true)
  change(checkbox(nodes, 'Datenschutz'), true)
  nodes = render(onSubmitted)
  await submit(nodes)
  expect(submitRegistration).toHaveBeenCalledWith('testverein', 'sommer', expect.objectContaining({ terms_accepted: true, privacy_accepted: true }))
  expect(onSubmitted).toHaveBeenCalledOnce()
})

it('opens the organization privacy policy in a new tab with noopener', () => {
  const nodes = render()
  const label = nodes.find((node) => node.type === 'label' && walk(node.props.children).includes(checkbox(nodes, 'Datenschutz')))
  const link = walk(label?.props.children).find((node) => node.type === 'a')
  expect(link?.props.href).toBe('/pilot/testverein/datenschutz')
  expect(link?.props.target).toBe('_blank')
  expect(String(link?.props.rel).split(' ')).toContain('noopener')
})
