// @vitest-environment jsdom
/**
 * Anforderungen aus dem Judge-Auftrag D2b:
 *   m1motion  – SSR-Markup kein opacity:0 → alle Abschnittstexte ohne JS sichtbar
 *   m2pin     – reduced-motion → keine ScrollTrigger-Pins registriert
 *   m3ch      – .d2-Elemente haben max-width in ch (≥ 12)
 *   m4pill    – Hero-Buttons sind Pills (border-radius: 9999px)
 *
 * Mutationsprobe m2pin: Wenn der `return`-Guard in SiteMotion.tsx nach dem
 * `if (reduce)` entfernt wird, ruft der Code mm.add mit dem Desktop-Query auf,
 * der Mock-Callback erzeugt ein gsap.timeline mit { pin: true } — und der Test
 * schlägt fehl. So lässt sich belegen, dass m2pin das Richtige prüft.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ReactNode } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pakete, faq } from '../preise/pakete'

// ── Tracking-Variable für m2pin ───────────────────────────────────────────────
const pinCreatedConfigs: unknown[] = []

// ── GSAP-Mock (wird für m2pin benötigt; für SSR-Tests ist SiteMotion gemockt) ─
vi.mock('gsap', () => {
  type TlConfig = { scrollTrigger?: { pin?: boolean }; defaults?: unknown }
  interface MockTl {
    to: ReturnType<typeof vi.fn>
    from: ReturnType<typeof vi.fn>
    fromTo: ReturnType<typeof vi.fn>
    scrollTrigger: null
    kill: ReturnType<typeof vi.fn>
    progress: ReturnType<typeof vi.fn>
  }
  const makeTl = (): MockTl => {
    const tl: Record<string, unknown> = {
      scrollTrigger: null,
      kill: vi.fn(),
      progress: vi.fn(),
    }
    tl.to = vi.fn().mockReturnValue(tl)
    tl.from = vi.fn().mockReturnValue(tl)
    tl.fromTo = vi.fn().mockReturnValue(tl)
    return tl as unknown as MockTl
  }
  return {
    default: {
      registerPlugin: vi.fn(),
      context: (fn: () => unknown) => {
        fn()
        return { revert: vi.fn() }
      },
      timeline: vi.fn((cfg?: TlConfig) => {
        if (cfg?.scrollTrigger && (cfg.scrollTrigger as { pin?: boolean }).pin) {
          pinCreatedConfigs.push(cfg)
        }
        return makeTl()
      }),
      to: vi.fn().mockReturnValue({ progress: vi.fn(), kill: vi.fn() }),
      fromTo: vi.fn().mockReturnValue({ progress: vi.fn(), kill: vi.fn() }),
      set: vi.fn(),
      utils: { toArray: vi.fn(() => []) },
      ticker: { add: vi.fn(), lagSmoothing: vi.fn() },
      matchMedia: vi.fn(() => ({
        add: vi.fn((query: string, cb: () => (() => void) | void) => {
          // Desktop-Viewport simulieren: (min-width: 860px)-Callback sofort aufrufen.
          // Damit wird die Pin-Erstellung ausgelöst — SOFERN der Code bis mm.add kommt.
          // Mit reduce=true kehrt der Code vorher zurück, mm.add wird nie erreicht.
          if (query.includes('min-width: 860px')) cb()
        }),
      })),
    },
  }
})

vi.mock('gsap/ScrollTrigger', () => ({
  ScrollTrigger: {
    create: vi.fn((cfg?: { pin?: boolean }) => {
      if (cfg?.pin) pinCreatedConfigs.push(cfg)
      return { kill: vi.fn(), scroll: () => 0 }
    }),
    refresh: vi.fn(),
    update: vi.fn(),
    kill: vi.fn(),
    getAll: vi.fn(() => []),
  },
}))

vi.mock('lenis', () => ({
  default: vi.fn(() => ({
    on: vi.fn(),
    destroy: vi.fn(),
    raf: vi.fn(),
    scrollTo: vi.fn(),
  })),
}))

// ── Mocks für den SSR-Test ─────────────────────────────────────────────────────
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) =>
    createElement('img', {
      src: String(props.src ?? ''),
      alt: String(props.alt ?? ''),
      id: props.id as string | undefined,
      className: props.className as string | undefined,
    }),
}))
vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) =>
    createElement('a', { href: String(props.href ?? ''), className: props.className as string | undefined }, props.children as ReactNode),
}))
vi.mock('../../components/marketing/BrandMark', () => ({
  default: (props: Record<string, unknown>) => createElement('svg', { className: props.className as string | undefined }),
}))
vi.mock('../../components/marketing/BootCurtain', () => ({ default: () => null }))
vi.mock('../../components/marketing/Grain', () => ({ default: () => null }))
vi.mock('../../components/marketing/SiteMotion', () => ({ default: () => null }))

// ── m1motion: SSR-Markup hat kein opacity:0 ────────────────────────────────────
describe('m1motion – SSR-Markup ohne opacity:0', () => {
  it('rendert alle Abschnittstexte ohne inline opacity:0', async () => {
    const { default: CampsPilotPage } = await import('./page')
    const html = renderToStaticMarkup(createElement(CampsPilotPage))

    // Kein inline-Style mit opacity:0 (weder "" noch '')
    expect(html).not.toMatch(/style="[^"]*opacity\s*:\s*0/)
    expect(html).not.toMatch(/style='[^']*opacity\s*:\s*0/)

    // Wichtige Abschnittstexte müssen im Markup stehen
    expect(html).toContain('Fünf Systeme für ein Camp.')
    expect(html).toContain('Alles, was ein Camp braucht.')
    expect(html).toContain('Für Eltern')
    expect(html).toContain('Für den Organisator')
    expect(html).toContain('Für den Verein')
    expect(html).toContain('CampsPilot')
  })

  it('z-list hat KEIN z-list--animated im SSR-Markup', async () => {
    const { default: CampsPilotPage } = await import('./page')
    const html = renderToStaticMarkup(createElement(CampsPilotPage))
    // Die Klasse wird nur per JS gesetzt, nie im JSX — Punkte starten sichtbar
    expect(html).not.toContain('z-list--animated')
  })
})

// Renaming either section anchor must make the corresponding anchor test fail.
describe('CX2 – Preis und Fragen', () => {
  let wrapper: HTMLDivElement

  beforeEach(async () => {
    const { default: CampsPilotPage } = await import('./page')
    wrapper = document.createElement('div')
    wrapper.innerHTML = renderToStaticMarkup(createElement(CampsPilotPage))
  })

  it.each(['preis', 'fragen'])('Anker #%s existiert genau einmal', (anchor) => {
    const sections = wrapper.querySelectorAll(`section#${anchor}`)
    expect(sections).toHaveLength(1)
    const headingId = sections[0].getAttribute('aria-labelledby')
    expect(sections[0].querySelector(`h2[id="${headingId}"]`)).not.toBeNull()
  })

  it('zeigt Preistext und Anfrageknopf vor dem Pilotabschnitt', () => {
    const price = wrapper.querySelector('#preis')!
    const pilot = wrapper.querySelector('#pilot')!
    expect(price).not.toBeNull()
    expect(pilot).not.toBeNull()
    expect(price.querySelector('h2')?.textContent).toBe('Ihr Camp. Ihr Paket.')
    expect(price.querySelectorAll('article')).toHaveLength(3)
    expect(price.querySelectorAll('a.btn')).toHaveLength(3)
    expect(price.compareDocumentPosition(pilot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('enthält drei Pakete mit aufsteigenden Jahrespreisen', () => {
    expect(pakete.map(({ name, preis }) => [name, preis])).toEqual([
      ['Start', 199], ['Verein', 490], ['Fußballschule', 990],
    ])
    expect(pakete.every((paket, index) => index === 0 || paket.preis > pakete[index - 1].preis)).toBe(true)
    const cards = Array.from(wrapper.querySelectorAll('#preis article'))
    for (const [index, paket] of pakete.entries()) {
      expect(cards[index].querySelector('h3')?.textContent).toBe(paket.name)
      expect(cards[index].textContent).toContain(`${paket.preis} €`)
      expect(cards[index].textContent).toContain('pro Jahr')
      expect(cards[index].querySelectorAll('li')).toHaveLength(5)
    }
  })

  it('zeigt den vollständigen MwSt-Hinweis und den Saisonhinweis', () => {
    expect(wrapper.querySelector('#preis')?.textContent).toContain('Alle Preise zzgl. MwSt. Keine Gebühr pro Anmeldung.')
    expect(wrapper.querySelector('#preis small')?.textContent).toBe('Preise gültig für die Saison 2027')
  })

  it('verlinkt jedes Paket mit seinem Namen zum vorhandenen Anfrageformular', () => {
    const buttons = Array.from(wrapper.querySelectorAll<HTMLAnchorElement>('#preis a.btn'))
    expect(buttons).toHaveLength(3)
    for (const [index, button] of buttons.entries()) {
      const url = new URL(button.getAttribute('href')!, 'https://campspilot.example')
      expect(url.pathname).toBe('/campspilot')
      expect(url.hash).toBe('#pilot')
      expect(url.searchParams.get('paket')).toBe(pakete[index].name)
      expect(button.textContent).toContain('Unverbindlich anfragen')
      expect(wrapper.querySelector(url.hash + ' form')).not.toBeNull()
    }
    expect(wrapper.querySelector('.nav a[href="#preis"]')?.textContent).toBe('Preise')
    expect(wrapper.querySelector('footer a[href="#preis"]')?.textContent).toBe('Preise')
  })

  it('enthält sechs native Aufklappelemente mit den vorgegebenen Fragen', () => {
    const entries = Array.from(wrapper.querySelectorAll('#fragen details'))
    expect(entries).toHaveLength(6)
    expect(entries.map((entry) => entry.querySelector('summary')?.textContent)).toEqual([
      'Gibt es eine Testphase?',
      'Brauchen Eltern ein Konto?',
      'Können wir unser Vereinslogo und unsere Farben nutzen?',
      'Wo liegen die Daten (Deutschland/EU)?',
      'Können wir jederzeit kündigen?',
      'Wie läuft der Start ab?',
    ])
    expect(faq).toHaveLength(6)
    for (const entry of entries) {
      expect(entry.firstElementChild?.tagName).toBe('SUMMARY')
      expect(entry.querySelectorAll('summary')).toHaveLength(1)
      const answer = entry.querySelector('p')?.textContent?.trim() ?? ''
      expect(answer.length).toBeGreaterThan(0)
      expect(answer.split(/[.!?]+/).filter((sentence) => sentence.trim()).length).toBeLessThanOrEqual(2)
    }
  })

  it('macht keine Zusage zu Testphase oder jederzeitiger Kündigung', () => {
    for (const question of ['Gibt es eine Testphase?', 'Können wir jederzeit kündigen?']) {
      const entry = Array.from(wrapper.querySelectorAll('#fragen details')).find(
        (item) => item.querySelector('summary')?.textContent === question,
      )
      expect(entry?.querySelector('p')?.textContent).toContain('Sprechen Sie uns an.')
    }
  })
})

// ── m2pin: reduced-motion → kein ScrollTrigger-Pin ────────────────────────────
describe('m2pin – reduced-motion: kein Pin', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    pinCreatedConfigs.length = 0
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)

    // matchMedia: reduce=true für prefers-reduced-motion, sonst false
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn((query: string) => ({
        matches: query.includes('reduced-motion'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  })

  afterEach(async () => {
    await act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  it('registriert keinen Pin wenn prefers-reduced-motion aktiv ist', async () => {
    const { default: SiteMotion } = await vi.importActual<typeof import('../../components/marketing/SiteMotion')>('../../components/marketing/SiteMotion')
    await act(() => root.render(createElement(SiteMotion)))
    expect(pinCreatedConfigs).toHaveLength(0)
  })
})

// ── m3ch: .d2-Headlines haben max-width in ch (≥ 12) ─────────────────────────
describe('m3ch – .d2 hat max-width in ch', () => {
  it('.cp-scope .d2 hat max-width: Xch mit X ≥ 12', () => {
    const css = readFileSync(resolve(__dirname, 'marketing.css'), 'utf-8')
    // Suche nach .d2 { ... max-width: Xch ... }
    const block = css.match(/\.cp-scope\s+\.d2\s*\{([^}]*)\}/)?.[1] ?? ''
    const match = block.match(/max-width:\s*(\d+)ch/)
    expect(match, '.d2 muss max-width in ch-Einheiten haben').not.toBeNull()
    expect(Number(match![1])).toBeGreaterThanOrEqual(12)
  })
})

// ── m4pill: Hero-Buttons sind Pills ───────────────────────────────────────────
describe('m4pill – Hero-Buttons sind Pills', () => {
  it('.cp-scope .btn hat border-radius: 9999px', () => {
    const css = readFileSync(resolve(__dirname, 'marketing.css'), 'utf-8')
    const block = css.match(/\.cp-scope\s+\.btn\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(block).toMatch(/border-radius\s*:\s*9999px/)
  })
})

// ── fs: Fußballschulen-Abschnitt ──────────────────────────────────────────────
// Mutationsprobe: id="fussballschulen" umbenennen → sectionEl ist null → alle Tests rot.
describe('fs – Fußballschulen-Abschnitt', () => {
  let sectionEl: Element | null = null

  beforeEach(async () => {
    const { default: CampsPilotPage } = await import('./page')
    const html = renderToStaticMarkup(createElement(CampsPilotPage))
    const wrapper = document.createElement('div')
    wrapper.innerHTML = html
    sectionEl = wrapper.querySelector('#fussballschulen')
  })

  it('Anker #fussballschulen existiert im Markup', () => {
    expect(sectionEl).not.toBeNull()
  })

  it('enthält alle drei Punkte', () => {
    const text = sectionEl?.textContent ?? ''
    expect(text).toContain('Alle Camps an allen Gastvereinen auf einer Seite')
    expect(text).toContain('Eltern bekommen sofort eine Bestätigung mit Überweisungsdaten')
    expect(text).toContain('Tagesliste je Camp zum Drucken')
  })

  it('Knopf verweist auf #pilot', () => {
    const btn = sectionEl?.querySelector('a[href="#pilot"]')
    expect(btn).not.toBeNull()
    expect(btn?.textContent?.trim()).toBe('Pilotplatz anfragen')
  })

  it('enthält kein „Online-Zahlung"', () => {
    expect(sectionEl?.textContent ?? '').not.toContain('Online-Zahlung')
  })
})
