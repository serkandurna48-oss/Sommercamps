/**
 * Geteilte Bewegung für den Eltern-Flow — Ticket §8, Werte/Kurven 1:1 aus
 * reference/index.html's setupMotion() portiert (§8.2 Kennwerte, §8.3
 * Eigenbewegung je Theme, §8.4 Wortaufteilung).
 *
 * Lenis bewusst nicht eingebunden (§8.5 nennt es "optional"; die
 * mandatory native-scroll-Fallback-Anforderung ist damit ohnehin erfüllt,
 * ohne eine zusätzliche Abhängigkeit zu brauchen).
 *
 * Screenwechsel = React-Mount/Unmount: jeder Screen ist eine eigene
 * Komponente, die nur gerendert wird, während sie aktiv ist (siehe
 * ParentFlow.tsx) — das ersetzt die Referenz's manuelles show()/ctx.revert()
 * -Paar. useParentFlowMotion ruft ctx.revert() im Effekt-Cleanup auf, der
 * beim Unmount (= Screenwechsel) automatisch läuft (§11 Technik: "ctx.revert()
 * bei jedem Screenwechsel, kein Leak in den ScrollTriggern").
 *
 * ABWEICHUNG von der Referenz (Abschnitt 0: gemessen, aber ein echter
 * Portierungs-Fallstrick, kein Auftrag-Widerspruch): reference/index.html
 * hängt jede Einblendung direkt über die `scrollTrigger:{...}`-Kurzschreib-
 * weise an gsap.from()/gsap.to(). Für ein Element, das schon beim Erstellen
 * im sichtbaren Bereich liegt (z. B. der Heldenbereich beim ersten Laden,
 * ohne dass gescrollt wurde), feuert ScrollTrigger `onEnter` nicht
 * rückwirkend — das Element bliebe dauerhaft in seinem "from"-Zustand
 * hängen (unsichtbar/verschoben). In der Referenz fällt das nicht auf,
 * weil sie eine Demo mit Theme-/Screen-Umschalter ist (jeder Wechsel triggert
 * einen Reflow, der das i. d. R. kaschiert); im echten Erstladen einer
 * Next.js-Seite war es reproduzierbar (Filmkorn-Testseite, Thema kompakt,
 * §9-Verifikation). `revealOnScroll()` prüft deshalb die Position beim
 * Erstellen selbst und animiert sofort, statt auf ScrollTrigger zu warten,
 * wenn das Element bereits über der Schwelle liegt.
 */
'use client'

import { useEffect } from 'react'
import type { RefObject } from 'react'

export type PublicTheme = 'tradition' | 'akademie' | 'kompakt'

type Gsap = typeof import('gsap').default
type ScrollTriggerType = typeof import('gsap/ScrollTrigger').ScrollTrigger

/**
 * Wortmaskierung — wortgenau, nicht buchstabengenau (§8.4). Idempotent
 * (data-split="done"-Guard), mutiert den DOM erst beim tatsächlichen Lauf,
 * nicht beim Rendern — das serverseitig gerenderte Markup bleibt bis dahin
 * reiner Text (SEO/Screenreader, §8.4).
 */
function splitWords(el: HTMLElement): HTMLElement[] {
  if (el.dataset.split === 'done') {
    return Array.prototype.slice.call(el.querySelectorAll('.w'))
  }
  const text = (el.textContent || '').trim()
  if (!text) return []
  const frag = document.createDocumentFragment()
  const out: HTMLElement[] = []
  text.split(/\s+/).forEach((word, i) => {
    if (i) frag.appendChild(document.createTextNode(' '))
    const mask = document.createElement('span')
    mask.className = 'mask-w'
    const inner = document.createElement('span')
    inner.className = 'w'
    inner.textContent = word
    mask.appendChild(inner)
    frag.appendChild(mask)
    out.push(inner)
  })
  el.textContent = ''
  el.appendChild(frag)
  el.dataset.split = 'done'
  return out
}

/**
 * Spielt eine bereits erstellte, pausierte Tween ab, sobald `trigger` die
 * Schwelle `startPercent` (Anteil der Viewport-Höhe von oben) erreicht —
 * sofort, wenn das schon beim Aufruf der Fall ist, sonst über einen
 * einmaligen ScrollTrigger. Die Tween muss `paused: true` erstellt worden
 * sein (siehe Modul-Docstring) — play() statt einer separaten .set()+.to()-
 * Kombination vermeidet ein Wettrennen zwischen den beiden Aufrufen.
 *
 * `played` sammelt jede gestartete Tween für das Sicherheitsnetz in
 * useParentFlowMotion — siehe dort.
 */
function revealOnScroll(
  ScrollTrigger: ScrollTriggerType,
  trigger: Element,
  startPercent: number,
  tween: ReturnType<Gsap['to']>,
  played: ReturnType<Gsap['to']>[],
) {
  const threshold = window.innerHeight * startPercent
  if (trigger.getBoundingClientRect().top <= threshold) {
    tween.play()
    played.push(tween)
    return
  }
  ScrollTrigger.create({
    trigger,
    start: `top ${startPercent * 100}%`,
    once: true,
    onEnter: () => {
      tween.play()
      played.push(tween)
    },
  })
}

interface MotionKind {
  stag: number
  dur: number
  eas: string
}

// §8.2 — Kennwerte pro Theme, wortgleich aus der Referenz.
const MOTION_KIND: Record<PublicTheme, MotionKind> = {
  tradition: { stag: 0.12, dur: 0.6, eas: 'expo.out' },
  akademie: { stag: 0.12, dur: 0.6, eas: 'expo.out' },
  kompakt: { stag: 0.12, dur: 0.6, eas: 'power3.out' },
}

/**
 * Läuft einmal beim Mount eines Screens. Baut [data-split]/[data-rise]-
 * Einblendungen plus die themespezifische Eigenbewegung (§8.3) auf, alles
 * innerhalb eines auf `containerRef` gescopten gsap.context() — Cleanup
 * (ctx.revert()) läuft beim Unmount. Kein Effekt, wenn
 * prefers-reduced-motion aktiv ist oder GSAP/ScrollTrigger fehlen.
 */
export function useParentFlowMotion(theme: PublicTheme, containerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const container = containerRef.current
    if (reduce || !container) return

    // M1: Abschnitt-Einblendung — synchron starten (kein GSAP, kein Library)
    // Bereits sichtbare Abschnitte sofort markieren, bevor m1-ready gesetzt
    // wird, damit kein Flicker entsteht.
    container.querySelectorAll<Element>('[data-section]').forEach((el) => {
      if ((el as HTMLElement).getBoundingClientRect().top < window.innerHeight * 0.9) {
        el.classList.add('m1-in')
      }
    })
    container.classList.add('m1-ready')
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            ;(e.target as HTMLElement).classList.add('m1-in')
            io.unobserve(e.target)
          }
        })
      },
      { threshold: 0.1 },
    )
    container.querySelectorAll<Element>('[data-section]').forEach((el) => {
      if (!el.classList.contains('m1-in')) io.observe(el)
    })

    let gsapCleanup: (() => void) | undefined
    let cancelled = false
    const playedTweens: ReturnType<Gsap['to']>[] = []
    const allTweens: ReturnType<Gsap['to']>[] = []

    Promise.all([import('gsap'), import('gsap/ScrollTrigger')]).then(([{ default: gsap }, { ScrollTrigger }]) => {
      if (cancelled) return
      gsap.registerPlugin(ScrollTrigger)

      const { stag, dur, eas } = MOTION_KIND[theme]

      const ctx = gsap.context(() => {
        if (theme === 'akademie') {
          const heroEl = container.querySelector<HTMLElement>('.h-akad')
          if (heroEl) {
            const seqEls: { el: HTMLElement; isHeadline?: boolean }[] = []
            const heroLabel = heroEl.querySelector<HTMLElement>('.hero-label')
            const heroH1 = heroEl.querySelector<HTMLElement>('[data-split]')
            const heroIntro = heroEl.querySelector<HTMLElement>('.intro')
            const heroBtns = heroEl.querySelector<HTMLElement>('.hero-btns')
            const heroStats = heroEl.querySelector<HTMLElement>('.hero-stats')

            if (heroLabel) seqEls.push({ el: heroLabel })
            if (heroH1) seqEls.push({ el: heroH1, isHeadline: true })
            if (heroIntro) seqEls.push({ el: heroIntro })
            if (heroBtns) seqEls.push({ el: heroBtns })
            if (heroStats) seqEls.push({ el: heroStats })

            const seqDur = 0.6
            const seqStag = 0.12
            const seqEas = 'expo.out'

            seqEls.forEach(({ el, isHeadline }, i) => {
              const delay = i * seqStag
              if (isHeadline) {
                const words = splitWords(el)
                if (words.length) {
                  const t = gsap.fromTo(words, { yPercent: 118 }, { yPercent: 0, duration: seqDur, ease: seqEas, stagger: 0.04, delay })
                  allTweens.push(t)
                }
                el.dataset.riseHandled = '1'
              } else {
                const t = gsap.fromTo(el, { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: seqDur, ease: seqEas, delay })
                allTweens.push(t)
                el.dataset.riseHandled = '1'
              }
            })
          }
        }

        container.querySelectorAll<HTMLElement>('[data-split]').forEach((h) => {
          if (h.dataset.riseHandled) return
          const words = splitWords(h)
          if (!words.length) return
          // fromTo statt from: explizite Zielwerte statt GSAPs Auto-Erkennung
          // des "aktuellen" Zustands als Ziel — bei einem zweiten Effektlauf
          // (React Strict Mode im Dev-Modus doppelt-invoke) könnte das
          // "aktuelle" opacity/transform sonst schon ein unfertiger
          // Zwischenwert eines vorherigen, eigentlich verworfenen Laufs sein,
          // und würde dann fälschlich als Zielwert eingefroren.
          const tween = gsap.fromTo(
            words,
            { yPercent: 118 },
            { yPercent: 0, duration: dur, ease: eas, stagger: stag, paused: true },
          )
          allTweens.push(tween)
          revealOnScroll(ScrollTrigger, h, 0.9, tween, playedTweens)
        })

        // M1: Camp-Karten gestaffelt — als Gruppe, bevor der allgemeine
        // [data-rise]-Durchlauf läuft, damit kein Doppel-Tween entsteht.
        const campEls = Array.from(container.querySelectorAll<HTMLElement>('.camps .camp[data-rise]'))
        if (campEls.length > 0) {
          const campY = theme === 'kompakt' ? 12 : 18
          const campDur = theme === 'kompakt' ? 0.44 : 0.52
          const campTween = gsap.fromTo(
            campEls,
            { y: campY, opacity: 0 },
            { y: 0, opacity: 1, duration: campDur, ease: 'expo.out', stagger: 0.08, paused: true },
          )
          allTweens.push(campTween)
          revealOnScroll(ScrollTrigger, campEls[0], 0.94, campTween, playedTweens)
          campEls.forEach((el) => { el.dataset.riseHandled = '1' })
        }

        // [data-rise] — Hero-Elemente (immer im Viewport beim Laden) bekommen
        // kürzere Dauer (400–650 ms), Rest behält Theme-Timing.
        container.querySelectorAll<HTMLElement>('[data-rise]').forEach((el) => {
          if (el.dataset.riseHandled) return
          const inHero = !!el.closest('.hero')
          const y = inHero ? 12 : theme === 'kompakt' ? 14 : 26
          const riseDur = inHero
            ? theme === 'kompakt' ? 0.42 : theme === 'akademie' ? 0.58 : 0.52
            : theme === 'kompakt' ? 0.5 : 0.9
          const riseEas = inHero ? 'power2.out' : 'expo.out'
          const tween = gsap.fromTo(el, { y, opacity: 0 }, { y: 0, opacity: 1, duration: riseDur, ease: riseEas, paused: true })
          allTweens.push(tween)
          revealOnScroll(ScrollTrigger, el, 0.94, tween, playedTweens)
        })

        if (theme === 'tradition') {
          const shot = container.querySelector<HTMLElement>('#shotA')
          if (shot?.offsetParent) {
            gsap.fromTo(
              shot,
              { scale: 1.16 },
              {
                scale: 1,
                ease: 'none',
                scrollTrigger: { trigger: shot.parentElement, start: 'top bottom', end: 'bottom top', scrub: true },
              },
            )
          }
        }

        if (theme === 'akademie') {
          const shot = container.querySelector<HTMLElement>('#shotB')
          if (shot?.offsetParent) {
            gsap.fromTo(
              shot,
              { yPercent: -8 },
              { yPercent: 10, ease: 'none', scrollTrigger: { trigger: '.h-akad', start: 'top top', end: 'bottom top', scrub: true } },
            )
          }
          runCounters(gsap, ScrollTrigger, container, 1.3, 'power3.out', playedTweens)
        }

        if (theme === 'kompakt') {
          const rail = container.querySelector<HTMLElement>('#rail')
          if (rail) {
            rail.style.setProperty('--sp', '0.02')
            ScrollTrigger.create({
              start: 0,
              end: 'max',
              onUpdate: (self) => {
                rail.style.setProperty('--sp', Math.max(0.02, self.progress).toFixed(4))
              },
            })
          }
          runCounters(gsap, ScrollTrigger, container, 0.9, 'power2.out', playedTweens)
        }

        ScrollTrigger.refresh()
      }, container)

      // Sicherheitsnetz: requestAnimationFrame kann in Hintergrund-Tabs oder
      // unter Last aussetzen/stark gedrosselt laufen — dann bliebe eine
      // Einblendung dauerhaft in einer halbanimierten, unleserlichen
      // Zwischenposition hängen (z. B. Wortmasken auf halber Höhe, Текst bei
      // halber Deckkraft). setTimeout läuft unabhängig von rAF weiter (auch
      // gedrosselt in Hintergrund-Tabs feuert es irgendwann) und zwingt jede
      // bereits gestartete Einblendung spätestens nach 1,5 s in ihren
      // Endzustand — lieber sofort fertig als dauerhaft kaputt aussehend.
      // M1: Abschnitte ebenfalls sicherstellen.
      const safety = window.setTimeout(() => {
        allTweens.forEach((t) => t.progress(1))
        container.querySelectorAll<HTMLElement>('[data-section]').forEach((el) => el.classList.add('m1-in'))
      }, 1500)

      gsapCleanup = () => {
        window.clearTimeout(safety)
        ctx.revert()
      }
    })

    return () => {
      cancelled = true
      container.classList.remove('m1-ready')
      io.disconnect()
      gsapCleanup?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme])
}

function runCounters(
  gsap: Gsap,
  ScrollTrigger: ScrollTriggerType,
  scope: HTMLElement,
  dur: number,
  ease: string,
  played: ReturnType<Gsap['to']>[],
) {
  scope.querySelectorAll<HTMLElement>('[data-count]').forEach((el) => {
    const to = parseFloat(el.dataset.count || '0')
    const o = { v: 0 }
    const tween = gsap.to(o, {
      v: to,
      duration: dur,
      ease,
      paused: true,
      onUpdate: () => {
        el.textContent = String(Math.round(o.v))
      },
      onComplete: () => {
        el.textContent = String(to)
      },
    })
    revealOnScroll(ScrollTrigger, el, 0.94, tween, played)
  })
}
