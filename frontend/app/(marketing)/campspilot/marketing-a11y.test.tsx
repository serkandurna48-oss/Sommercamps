// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import SiteMotion from '../../components/marketing/SiteMotion'
import CampsPilotPage from './page'

const motion = vi.hoisted(() => ({
  revert: vi.fn(), destroy: vi.fn(), mediaRevert: vi.fn(),
}))

vi.mock('gsap', () => {
  const tween = () => ({ play: vi.fn(), progress: vi.fn(), kill: vi.fn() })
  return { default: {
    registerPlugin: vi.fn(),
    context: vi.fn((setup: () => (() => void)) => {
      const cleanup = setup()
      return { revert: () => { motion.revert(); cleanup?.() } }
    }),
    timeline: vi.fn(() => {
      const timeline = { ...tween(), fromTo: vi.fn(), to: vi.fn() }
      timeline.fromTo.mockReturnValue(timeline)
      timeline.to.mockReturnValue(timeline)
      return timeline
    }),
    fromTo: vi.fn(tween), to: vi.fn(tween), set: vi.fn(),
    utils: { toArray: (selector: string, scope: ParentNode = document) => Array.from(scope.querySelectorAll(selector)) },
    ticker: { add: vi.fn(), remove: vi.fn() },
    matchMedia: vi.fn(() => ({ add: vi.fn(), revert: motion.mediaRevert })),
  } }
})
vi.mock('gsap/ScrollTrigger', () => ({ ScrollTrigger: {
  create: vi.fn(), update: vi.fn(), refresh: vi.fn(),
} }))
vi.mock('lenis', () => ({ default: vi.fn(function () {
  return { on: vi.fn(), raf: vi.fn(), destroy: motion.destroy }
}) }))

describe('CX17 – Struktur und Ladeverhalten im echten SSR-Markup', () => {
  let page: HTMLDivElement
  beforeEach(() => {
    page = document.createElement('div')
    page.innerHTML = renderToStaticMarkup(createElement(CampsPilotPage))
  })

  it('hat einen ersten Sprunglink zu einem fokussierbaren main mit genau einer H1', () => {
    const link = page.querySelector('a')!
    expect(link.textContent).toBe('Zum Inhalt springen')
    const main = page.querySelector(link.getAttribute('href')!)!
    expect(main.tagName).toBe('MAIN')
    expect(main.getAttribute('tabindex')).toBe('-1')
    expect(page.querySelectorAll('main')).toHaveLength(1)
    expect(page.querySelectorAll('h1')).toHaveLength(1)
    expect(main.querySelector('h1')).not.toBeNull()
  })

  it('überspringt keine Überschriftenebene', () => {
    let previous = 0
    for (const heading of page.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
      const level = Number(heading.tagName.slice(1))
      expect(level).toBeLessThanOrEqual(previous + 1)
      previous = level
    }
  })

  it('gibt jedem Bild ein alt-Attribut und lädt alle Bilder unter dem Hero lazy', () => {
    const images = [...page.querySelectorAll('img')]
    expect(images.length).toBeGreaterThan(1)
    for (const image of images) expect(image.hasAttribute('alt')).toBe(true)
    const belowFold = images.filter(image => !image.closest('.hero'))
    expect(belowFold.length).toBeGreaterThan(0)
    for (const image of belowFold) expect(image.getAttribute('loading')).toBe('lazy')
  })

  it('priorisiert das vollbreite Hero und reserviert Bildflächen', () => {
    const hero = page.querySelector('.hero img')!
    expect(hero.getAttribute('sizes')).toBe('100vw')
    expect(hero.getAttribute('fetchPriority')).toBe('high')
    expect(hero.getAttribute('loading')).not.toBe('lazy')
    const source = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8')
    expect(source.slice(source.indexOf('src={CP_IMAGES.hero.src}'), source.indexOf('blurDataURL={CP_IMAGES.hero'))).toMatch(/\bpriority\b/)
    const css = readFileSync(resolve(__dirname, 'marketing.css'), 'utf8')
    for (const image of page.querySelectorAll('img')) {
      if (image.hasAttribute('width') && image.hasAttribute('height')) continue
      const area = image.closest('.hero,.z-stage,.ordnung-right,.band,.close')
      expect(area, image.getAttribute('src')!).not.toBeNull()
      const name = area!.classList[0]
      const rule = [...css.matchAll(new RegExp(`\\.cp-scope \\.${name} \\{([^}]+)\\}`, 'g'))].map(match => match[1]).join('\n')
      expect(rule).toMatch(/(?:min-height|height|aspect-ratio):/)
    }
  })

  it('rendert Text ohne versteckende Inline-Stile und nutzt swap mit angepasstem Font-Fallback', () => {
    expect(page.innerHTML).not.toMatch(/style="[^"]*(?:opacity:\s*0(?:;|")|visibility:\s*hidden)/)
    expect(page.querySelector('.z-list--animated')).toBeNull()
    const layout = readFileSync(resolve(__dirname, 'layout.tsx'), 'utf8')
    expect(layout).toContain("display: 'swap'")
    expect(layout).toContain('adjustFontFallback: true')
  })
})

describe('CX17 – echte SiteMotion-Komponente mit gemocktem matchMedia', () => {
  let root: Root
  let host: HTMLDivElement
  let preference: { matches: boolean; addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> }
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    preference = { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }
    vi.stubGlobal('matchMedia', vi.fn(() => preference))
    host = document.createElement('div')
    host.innerHTML = '<nav id="nav"></nav><a href="#inhalt">Zum Inhalt springen</a><main id="inhalt" tabindex="-1"><h1 id="heroTitle">Camp ohne Bewegung</h1><h2 data-split>Alles bleibt lesbar</h2><div id="zList" class="z-list"><p class="z-item">Anmeldung</p></div><div data-group="feat"><p data-rise>Für Eltern</p></div></main><div id="mount"></div>'
    document.body.append(host)
    root = createRoot(host.querySelector('#mount')!)
  })
  afterEach(async () => {
    await act(() => root.unmount())
    host.remove()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('ruft bei reduced motion kein Animationssetup auf und lässt Inhalt und Anker unangetastet', async () => {
    const original = host.querySelector('main')!.innerHTML
    await act(() => root.render(createElement(SiteMotion)))
    expect(window.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)')
    expect(gsap.registerPlugin).not.toHaveBeenCalled()
    expect(gsap.context).not.toHaveBeenCalled()
    expect(gsap.matchMedia).not.toHaveBeenCalled()
    expect(gsap.ticker.add).not.toHaveBeenCalled()
    expect(ScrollTrigger.create).not.toHaveBeenCalled()
    expect(ScrollTrigger.refresh).not.toHaveBeenCalled()
    expect(Lenis).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    expect(host.querySelector('main')!.innerHTML).toBe(original)
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    host.querySelector('a')!.dispatchEvent(click)
    expect(click.defaultPrevented).toBe(false)
  })

  it('startet ohne Reduktion und räumt beim Wechsel Splits, Listener, Ticker und Lenis auf', async () => {
    preference.matches = false
    const original = host.querySelector('main')!.innerHTML
    await act(() => root.render(createElement(SiteMotion)))
    expect(gsap.context).toHaveBeenCalledTimes(1)
    expect(Lenis).toHaveBeenCalledTimes(1)
    expect(host.querySelector('.mask-w')).not.toBeNull()
    const tick = vi.mocked(gsap.ticker.add).mock.calls[0][0]
    const change = preference.addEventListener.mock.calls[0][1]
    preference.matches = true
    await act(() => change())
    expect(motion.revert).toHaveBeenCalledTimes(1)
    expect(motion.mediaRevert).toHaveBeenCalledTimes(1)
    expect(motion.destroy).toHaveBeenCalledTimes(1)
    expect(gsap.ticker.remove).toHaveBeenCalledWith(tick)
    expect(host.querySelector('main')!.innerHTML).toBe(original)
    expect(vi.getTimerCount()).toBe(0)
    expect(gsap.context).toHaveBeenCalledTimes(1)
    await act(() => root.unmount())
    expect(preference.removeEventListener).toHaveBeenCalledWith('change', change)
    root = createRoot(host.querySelector('#mount')!)
  })
})
