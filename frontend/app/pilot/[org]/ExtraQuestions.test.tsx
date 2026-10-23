/**
 * Tests for ExtraQuestions component (KV1: Zusatzfragen).
 * Same pattern as RegistrationFormScreen.test.tsx: invoke component function
 * directly, walk the React element tree, simulate events.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// Provide a minimal React mock with useState support
const hooks = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0 }))

vi.mock('react', () => ({
  useState: (initial: unknown) => {
    const index = hooks.cursor++
    if (!(index in hooks.slots)) hooks.slots[index] = initial
    return [hooks.slots[index], (value: unknown) => {
      hooks.slots[index] = typeof value === 'function'
        ? (value as (p: unknown) => unknown)(hooks.slots[index])
        : value
    }]
  },
  useId: () => 'test-id',
  useMemo: (f: () => unknown) => f(),
  useEffect: () => {},
  useRef: (initial: unknown) => {
    const index = hooks.cursor++
    if (!(index in hooks.slots)) hooks.slots[index] = { current: initial }
    return hooks.slots[index]
  },
}))

import ExtraQuestions from './ExtraQuestions'
import type { RegistrationQuestion } from '../../lib/saasApi'

type ElementNode = { type: string | ((...args: unknown[]) => unknown); props: Record<string, unknown> }

function walk(node: unknown): ElementNode[] {
  if (Array.isArray(node)) return node.flatMap(walk)
  if (!node || typeof node !== 'object' || !('props' in node)) return []
  const element = node as ElementNode
  // If the element type is a function component, invoke it to get its rendered output.
  if (typeof element.type === 'function') {
    return [element, ...walk(element.type(element.props))]
  }
  return [element, ...walk(element.props.children)]
}

function render(
  questions: RegistrationQuestion[],
  answers: Record<string, string> = {},
  submitAttempted = false,
  onChange = vi.fn(),
) {
  hooks.cursor = 0
  return walk(ExtraQuestions({ questions, answers, submitAttempted, onChange }))
}

function change(node: ElementNode, value: string | boolean) {
  const target = typeof value === 'boolean' ? { checked: value } : { value }
  ;(node.props.onChange as (e: unknown) => void)({ target })
}

const CHOICE_QUESTION: RegistrationQuestion = {
  key: 'position',
  label: 'Position',
  type: 'choice',
  options: ['Feldspieler', 'Torwart'],
  other_label: null,
  required: true,
}

const CHOICE_WITH_OTHER: RegistrationQuestion = {
  key: 'verein',
  label: 'Verein',
  type: 'choice',
  options: ['KSV Baunatal'],
  other_label: 'Anderer Verein',
  required: true,
}

const TEXT_QUESTION: RegistrationQuestion = {
  key: 'kommentar',
  label: 'Kommentar',
  type: 'text',
  options: null,
  other_label: null,
  required: false,
}

beforeEach(() => {
  hooks.slots = []
  hooks.cursor = 0
  vi.clearAllMocks()
})

describe('ExtraQuestions', () => {
  it('returns null when questions array is empty', () => {
    const result = ExtraQuestions({ questions: [], answers: {}, submitAttempted: false, onChange: vi.fn() })
    expect(result).toBeNull()
  })

  it('renders a section heading when questions are provided', () => {
    const nodes = render([CHOICE_QUESTION])
    const headings = nodes.filter(n => n.type === 'h2')
    expect(headings.some(h => String(h.props.children).includes('Fußball'))).toBe(true)
  })

  describe('text question', () => {
    it('renders a text input for text-type questions', () => {
      const nodes = render([TEXT_QUESTION])
      const inputs = nodes.filter(n => n.type === 'input' && n.props.type === 'text')
      expect(inputs.length).toBeGreaterThan(0)
    })

    it('calls onChange when text input changes', () => {
      const onChange = vi.fn()
      const nodes = render([TEXT_QUESTION], {}, false, onChange)
      const input = nodes.find(n => n.type === 'input' && n.props.type === 'text')
      expect(input).toBeDefined()
      change(input!, 'Test-Antwort')
      expect(onChange).toHaveBeenCalledWith('kommentar', 'Test-Antwort')
    })

    it('shows error message for required text field when submit attempted with empty value', () => {
      const nodes = render([{ ...TEXT_QUESTION, required: true }], {}, true)
      const errorSpans = nodes.filter(n => n.type === 'span' && n.props.id === 'err-extra-kommentar')
      expect(errorSpans.length).toBeGreaterThan(0)
      expect(String(errorSpans[0].props.children)).toContain('Bitte geben Sie')
    })

    it('does not show error when value is provided', () => {
      const nodes = render([{ ...TEXT_QUESTION, required: true }], { kommentar: 'Hallo' }, true)
      const errorSpans = nodes.filter(n => n.type === 'span' && n.props.id === 'err-extra-kommentar')
      expect(errorSpans.length).toBe(0)
    })
  })

  describe('choice question', () => {
    it('renders radio inputs for each option', () => {
      const nodes = render([CHOICE_QUESTION])
      const radios = nodes.filter(n => n.type === 'input' && n.props.type === 'radio')
      expect(radios.length).toBe(2) // Feldspieler + Torwart
    })

    it('calls onChange with option value when radio is clicked', () => {
      const onChange = vi.fn()
      const nodes = render([CHOICE_QUESTION], {}, false, onChange)
      const radios = nodes.filter(n => n.type === 'input' && n.props.type === 'radio')
      change(radios[0], true) // click "Feldspieler"
      expect(onChange).toHaveBeenCalledWith('position', 'Feldspieler')
    })

    it('shows error for required choice field when submit attempted with no selection', () => {
      const nodes = render([CHOICE_QUESTION], {}, true)
      const errorSpans = nodes.filter(n => n.type === 'span' && n.props.id === 'err-extra-position')
      expect(errorSpans.length).toBeGreaterThan(0)
      expect(String(errorSpans[0].props.children)).toContain('wählen Sie')
    })

    it('does not show error when a choice is selected', () => {
      const nodes = render([CHOICE_QUESTION], { position: 'Feldspieler' }, true)
      const errorSpans = nodes.filter(n => n.type === 'span' && n.props.id === 'err-extra-position')
      expect(errorSpans.length).toBe(0)
    })
  })

  describe('choice with Sonstiges option', () => {
    it('renders an extra Sonstiges radio button when other_label is set', () => {
      const nodes = render([CHOICE_WITH_OTHER])
      const radios = nodes.filter(n => n.type === 'input' && n.props.type === 'radio')
      // KSV Baunatal + Anderer Verein
      expect(radios.length).toBe(2)
    })

    it('shows Sonstiges text input when other option is pre-selected (value not in options)', () => {
      // When answers contains a value not in options, Sonstiges was already selected
      const nodes = render([CHOICE_WITH_OTHER], { verein: 'FC Kassel' }, false)
      const otherInputs = nodes.filter(n => n.props['data-testid'] === 'extra-other-verein')
      expect(otherInputs.length).toBeGreaterThan(0)
    })

    it('calls onChange with typed freetext when Sonstiges text input changes', () => {
      const onChange = vi.fn()
      // Start with other already selected (value not in options)
      const nodes = render([CHOICE_WITH_OTHER], { verein: 'FC Kassel' }, false, onChange)
      const otherInput = nodes.find(n => n.props['data-testid'] === 'extra-other-verein')
      expect(otherInput).toBeDefined()
      change(otherInput!, 'SV Musterstadt')
      expect(onChange).toHaveBeenCalledWith('verein', 'SV Musterstadt')
    })
  })

  describe('multiple questions', () => {
    it('renders all questions', () => {
      const nodes = render([CHOICE_QUESTION, TEXT_QUESTION])
      const radios = nodes.filter(n => n.type === 'input' && n.props.type === 'radio')
      const textInputs = nodes.filter(n => n.type === 'input' && n.props.type === 'text')
      expect(radios.length).toBe(2) // Feldspieler + Torwart
      expect(textInputs.length).toBeGreaterThan(0)
    })
  })
})
