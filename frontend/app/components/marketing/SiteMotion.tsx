'use client'

import { useEffect } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'

// Progressive enhancement: SSR content stays readable without this component.
// Native navigation works in both motion modes; animation owns its own cleanup.
export default function SiteMotion() {
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const nav = document.getElementById('nav')
    const updateNav = () => nav?.classList.toggle('solid', window.scrollY > window.innerHeight * 0.72)
    updateNav()
    window.addEventListener('scroll', updateNav, { passive: true })

    let stopMotion: (() => void) | undefined
    const syncMotion = () => {
      stopMotion?.()
      stopMotion = undefined
      // Do not initialize GSAP, ScrollTrigger, Lenis or split text in reduced motion.
      if (preference.matches) return
      stopMotion = setupMotion()
    }
    syncMotion()
    preference.addEventListener('change', syncMotion)
    return () => {
      preference.removeEventListener('change', syncMotion)
      window.removeEventListener('scroll', updateNav)
      stopMotion?.()
    }
  }, [])

  return null
}

function setupMotion() {
  const boot = document.getElementById('boot')
  const bootGoneTimer = boot ? setTimeout(() => boot.classList.add('gone'), 1450) : undefined
  const bootRemoveTimer = boot ? setTimeout(() => boot.remove(), 2400) : undefined
  gsap.registerPlugin(ScrollTrigger)
  let lenis: Lenis | null = null
  const restoreDom: Array<() => void> = []
  let introSafety: ReturnType<typeof setTimeout> | undefined
  let revealSafety: ReturnType<typeof setTimeout> | undefined
  const tick = (time: number) => lenis?.raf(time * 1000)

  const ctx = gsap.context(() => {
    lenis = new Lenis({ duration: 1.15, smoothWheel: true, wheelMultiplier: 0.9, touchMultiplier: 1.6 })
    lenis.on('scroll', ScrollTrigger.update)
    gsap.ticker.add(tick)
    // Keep anchors native so the skip link also transfers keyboard focus.

    function splitWords(el: Element): HTMLElement[] {
      const text = (el.textContent || '').trim()
      if (!text) return []
      const original = Array.from(el.childNodes)
      restoreDom.push(() => el.replaceChildren(...original))
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
      return out
    }

    // ── Eröffnung: eine orchestrierte Bewegung, danach Ruhe ─────────
    //
    // fromTo statt from: from() lässt GSAP den "Zielwert" aus dem
    // aktuellen berechneten Stil ableiten. Läuft dieser Effekt durch
    // React Strict Mode zweimal (Dev-Modus) oder bleibt requestAnimationFrame
    // kurz aus (Tab im Hintergrund beim Laden), kann das einen bereits
    // halb-animierten Wert als "fertig" einfrieren — Held bleibt dauerhaft
    // unsichtbar/verschoben statt sich zu zeigen. fromTo() legt Start UND
    // Ziel explizit fest, keine Ableitung, kein Risiko.
    const heroTitle = document.getElementById('heroTitle')
    const heroWords = heroTitle ? splitWords(heroTitle) : []
    const heroRiseEls = gsap.utils.toArray<HTMLElement>('.hero [data-rise]')
    const intro = gsap.timeline({ delay: 1.35, defaults: { ease: 'expo.out' } })
    const heroImg = document.getElementById('heroImg')
    if (heroImg) intro.fromTo(heroImg, { scale: 1.16 }, { scale: 1, duration: 1.9 }, 0)
    if (heroWords.length) intro.fromTo(heroWords, { yPercent: 118 }, { yPercent: 0, duration: 1.15, stagger: 0.055 }, 0.12)
    if (heroRiseEls.length) {
      intro.fromTo(heroRiseEls, { y: 22, opacity: 0 }, { y: 0, opacity: 1, duration: 1, stagger: 0.09 }, 0.42)
    }

    // Sicherheitsnetz: requestAnimationFrame kann aussetzen (Tab im
    // Hintergrund beim ersten Laden, gedrosselte Geräte) — dann bliebe der
    // komplette Heldenbereich dauerhaft unsichtbar hängen, obwohl der
    // Text im DOM längst da ist. setTimeout läuft unabhängig von rAF
    // weiter und zwingt die Eröffnung spätestens nach 4s in ihren
    // Endzustand — lieber sofort fertig als dauerhaft leer aussehend.
    introSafety = setTimeout(() => intro.progress(1), 4000)

    // ── Parallaxe auf den ganzflächigen Bildern ─────────────────────
    function parallax(sel: string, amount: number) {
      const el = document.querySelector(sel)
      if (!el) return
      gsap.fromTo(
        el,
        { yPercent: -amount },
        {
          yPercent: amount,
          ease: 'none',
          scrollTrigger: {
            trigger: el.closest('section,header,div.band'),
            start: 'top bottom',
            end: 'bottom top',
            scrub: true,
          },
        }
      )
    }
    parallax('#linieImg', 8)
    parallax('#closeImg', 6)
    gsap.to('#heroImg', {
      yPercent: 12,
      ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
    })
    gsap.to('#netzImg', {
      yPercent: -5,
      ease: 'none',
      scrollTrigger: { trigger: '.trust-fig', start: 'top bottom', end: 'bottom top', scrub: true },
    })
    // Leichter Parallax auf dem Produktbild "Die Ordnung" (max. 40px bei typischen Bildhöhen)
    gsap.to('#ordnungImg', {
      yPercent: -7,
      ease: 'none',
      scrollTrigger: { trigger: '.ordnung-right', start: 'top bottom', end: 'bottom top', scrub: true },
    })

    // ── Überschriften steigen zeilenweise auf ───────────────────────
    //
    // Gleiches Muster wie oben: paused erstellt, explizite fromTo-Ziele,
    // und — weil ein Trigger, der schon beim Erstellen im sichtbaren
    // Bereich liegt, sein once:true-onEnter nicht rückwirkend auslöst —
    // hier selbst geprüft und sofort abgespielt statt auf ScrollTrigger
    // zu warten. Jede gestartete Tween landet in playedTweens fürs
    // globale Sicherheitsnetz weiter unten.
    const playedTweens: gsap.core.Tween[] = []
    function revealOnScroll(trigger: Element, startPercent: number, tween: gsap.core.Tween) {
      const threshold = window.innerHeight * startPercent
      if (trigger.getBoundingClientRect().top <= threshold) {
        tween.play()
        playedTweens.push(tween)
        return
      }
      ScrollTrigger.create({
        trigger,
        start: `top ${startPercent * 100}%`,
        once: true,
        onEnter: () => {
          tween.play()
          playedTweens.push(tween)
        },
      })
    }

    // Feat-Karten als Gruppe mit Stagger — data-rise wird danach entfernt
    // damit die allgemeine Schleife sie nicht nochmals einzeln startet.
    document.querySelectorAll<HTMLElement>('[data-group="feat"]').forEach((group) => {
      const items = gsap.utils.toArray<HTMLElement>('[data-rise]', group)
      if (!items.length) return
      items.forEach(el => {
        const value = el.getAttribute('data-rise') ?? ''
        restoreDom.push(() => el.setAttribute('data-rise', value))
        el.removeAttribute('data-rise')
      })
      const tween = gsap.fromTo(
        items,
        { y: 26, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.95, ease: 'expo.out', stagger: 0.12, paused: true },
      )
      revealOnScroll(group, 0.82, tween)
    })

    document.querySelectorAll('[data-split]').forEach((h) => {
      const words = splitWords(h)
      if (!words.length) return
      const tween = gsap.fromTo(
        words,
        { yPercent: 118 },
        { yPercent: 0, duration: 1.05, ease: 'expo.out', stagger: 0.05, paused: true },
      )
      revealOnScroll(h, 0.84, tween)
    })
    document.querySelectorAll('[data-rise]').forEach((el) => {
      if (el.closest('.hero')) return
      const tween = gsap.fromTo(
        el,
        { y: 26, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.95, ease: 'expo.out', paused: true },
      )
      revealOnScroll(el, 0.88, tween)
    })

    // Gleiches Sicherheitsnetz wie bei der Eröffnung: jede bereits
    // gestartete Einblendung wird spätestens nach 1,5s in ihren
    // Endzustand gezwungen, falls rAF aussetzt.
    revealSafety = setTimeout(() => {
      playedTweens.forEach((t) => t.progress(1))
    }, 1500)

    // ── "Der Zettel": Punkte erscheinen, werden durchgestrichen, CampsPilot blendet ein
    //
    // Ablauf (mit scrub auf 900 px Scrollweg):
    //   Phase 1 (0–1.08): 5 Punkte erscheinen nacheinander (Stagger 0.12, Dauer 0.6, expo.out)
    //   Phase 2 (1.08–1.5): strike through items without reducing text contrast.
    //   Phase 3 (1.1–1.7): "CampsPilot" blendet ein (während Strikes laufen)
    //
    // z-list--animated-Klasse macht Punkte vor dem Trigger unsichtbar (CSS),
    // wird nur gesetzt wenn !reduce — kein opacity:0 im SSR-Markup.
    const zList = document.getElementById('zList')
    if (zList) zList.classList.add('z-list--animated')
    gsap.set('#zCampsPilot', { opacity: 0, y: 20 })

    const mm = gsap.matchMedia()
    mm.add('(min-width: 860px)', () => {
      const items = gsap.utils.toArray<HTMLElement>('#zList .z-item')
      const tl = gsap.timeline({
        scrollTrigger: { trigger: '#zStage', start: 'top top', end: '+=900', pin: true, scrub: 0.65, anticipatePin: 1 },
      })
      tl.to('#zImg', { scale: 1.06, ease: 'none' }, 0)

      // Phase 1: Punkte erscheinen
      items.forEach((it, i) => {
        tl.fromTo(it, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6, ease: 'expo.out' }, i * 0.12)
      })

      // Phase 2: strike through items while keeping the text readable.
      tl.to('#zDim', { opacity: 0.4, ease: 'none' }, 1.0)
      items.forEach((it, i) => {
        const at = 1.08 + i * 0.09
        tl.to(it.querySelector('.strike'), { scaleX: 1, duration: 0.08, ease: 'power3.out' }, at)
        tl.to(it, { paddingTop: 4, paddingBottom: 4, duration: 0.08, ease: 'power3.out' }, at + 0.02)
      })

      // Phase 3: CampsPilot einblenden (während Strikes laufen)
      tl.to('#zCampsPilot', { opacity: 1, y: 0, duration: 0.5, ease: 'expo.out' }, 1.15)

      return () => {
        tl.scrollTrigger?.kill()
        tl.kill()
      }
    })
    mm.add('(max-width: 859px)', () => {
      // Mobile: Endzustand sofort, Strike per Scroll
      if (zList) zList.classList.remove('z-list--animated')
      gsap.set('#zCampsPilot', { opacity: 1, y: 0 })
      gsap.utils.toArray<HTMLElement>('#zList .z-item').forEach((it, i) => {
        gsap.to(it.querySelector('.strike'), {
          scaleX: 1,
          duration: 0.5,
          ease: 'power2.inOut',
          delay: i * 0.06,
          scrollTrigger: { trigger: it, start: 'top 80%', once: true },
        })
      })
    })

    // ── Zahlen zählen beim Eintreten hoch ────────────────────────────
    gsap.utils.toArray<HTMLElement>('#metrics .v').forEach((el) => {
      const original = el.textContent
      restoreDom.push(() => { el.textContent = original })
      const target = parseFloat(el.dataset.count ?? '0')
      const pre = el.dataset.pre ?? ''
      const post = el.dataset.post ?? ''
      const o = { v: 0 }
      const tween = gsap.to(o, {
        v: target,
        duration: 1.4,
        ease: 'power3.out',
        paused: true,
        onUpdate: () => {
          el.textContent = pre + Math.round(o.v) + post
        },
        onComplete: () => {
          el.textContent = pre + target + post
        },
      })
      revealOnScroll(el, 0.88, tween)
    })

    ScrollTrigger.refresh()
    return () => mm.revert()
  })

  return () => {
    clearTimeout(bootGoneTimer)
    clearTimeout(bootRemoveTimer)
    clearTimeout(introSafety)
    clearTimeout(revealSafety)
    gsap.ticker.remove(tick)
    document.getElementById('zList')?.classList.remove('z-list--animated')
    ctx.revert()
    restoreDom.reverse().forEach((restore) => restore())
    lenis?.destroy()
  }
}
