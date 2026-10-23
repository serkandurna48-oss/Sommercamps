'use client'

import { useEffect } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'

// Die gesamte Animationslogik von reference/index.html, 1:1 auf die
// gerenderte DOM-Struktur der Seite angewandt (dieselben ids: heroImg,
// zImg, zDim, zList, zResolve, bandImg, netzImg, linieImg, closeImg,
// metrics, pilotForm, formNote, boot, nav). Läuft komplett progressiv:
// die Seite steht ohne dieses Modul bereits vollständig da (Schritt 4),
// hier kommt nur Bewegung obendrauf.
//
// Timing-Werte (Duration, Delay, Ease, Stagger) sind aus Ticket
// Abschnitt 8 bzw. — wo das Ticket schweigt — 1:1 aus der Referenz
// übernommen, nicht geschätzt.
export default function SiteMotion() {
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // ── Markenmoment: CSS blendet ihn ohnehin aus, wir beschleunigen nur
    //    und räumen danach den Knoten weg. ─────────────────────────────
    const boot = document.getElementById('boot')
    let bootGoneTimer: ReturnType<typeof setTimeout> | undefined
    let bootRemoveTimer: ReturnType<typeof setTimeout> | undefined
    if (boot) {
      if (reduce) {
        boot.remove()
      } else {
        bootGoneTimer = setTimeout(() => boot.classList.add('gone'), 1450)
        bootRemoveTimer = setTimeout(() => boot.remove(), 2400)
      }
    }

    // ── Navigation verdichtet sich nach dem Hero ───────────────────────
    const nav = document.getElementById('nav')
    const navState = (y: number) => {
      nav?.classList.toggle('solid', y > window.innerHeight * 0.72)
    }
    navState(window.scrollY)

    // ── Formular: ehrlich über seinen Zustand ──────────────────────────
    const form = document.getElementById('pilotForm')
    const formNote = document.getElementById('formNote')
    const onSubmit = (e: SubmitEvent) => {
      e.preventDefault()
      if (formNote) {
        formNote.textContent = ''
        formNote.append(
          'Dies ist ein Seitenentwurf — das Formular ist noch nicht angebunden. Aktuelle Pilotvereine: '
        )
        const ksv = document.createElement('strong')
        ksv.textContent = 'KSV Baunatal'
        formNote.append(ksv, ' und ')
        const jk = document.createElement('strong')
        jk.textContent = 'JK Performance Academy'
        formNote.append(jk, '.')
      }
    }
    form?.addEventListener('submit', onSubmit)

    gsap.registerPlugin(ScrollTrigger)

    let lenis: Lenis | null = null
    const anchorCleanups: Array<() => void> = []
    let introSafety: ReturnType<typeof setTimeout> | undefined
    let revealSafety: ReturnType<typeof setTimeout> | undefined

    const ctx = gsap.context(() => {
      // ── Träger Scroll (Lenis) ────────────────────────────────────────
      if (!reduce) {
        lenis = new Lenis({ duration: 1.15, smoothWheel: true, wheelMultiplier: 0.9, touchMultiplier: 1.6 })
        lenis.on('scroll', ScrollTrigger.update)
        gsap.ticker.add((t) => lenis?.raf(t * 1000))
        gsap.ticker.lagSmoothing(0)

        document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((a) => {
          const handler = (e: Event) => {
            const target = document.querySelector(a.getAttribute('href') ?? '')
            if (target) {
              e.preventDefault()
              lenis?.scrollTo(target as HTMLElement, { offset: 0, duration: 1.3 })
            }
          }
          a.addEventListener('click', handler)
          anchorCleanups.push(() => a.removeEventListener('click', handler))
        })
      }

      ScrollTrigger.create({ start: 0, end: 'max', onUpdate: (self) => navState(self.scroll()) })

      if (reduce) {
        ScrollTrigger.refresh()
        return
      }

      // ── Eigener Wort-Splitter für den Eröffnungssatz und die
      //    scrollausgelösten Überschriften. ────────────────────────────
      function splitWords(el: Element): HTMLElement[] {
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
      parallax('#bandImg', 8)
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
        items.forEach(el => el.removeAttribute('data-rise'))
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
      //   Phase 2 (1.08–1.5): Punkte werden durchgestrichen + auf 30 % abgeblendet
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

        // Phase 2: Punkte durchgestrichen + abgeblendet
        tl.to('#zDim', { opacity: 0.4, ease: 'none' }, 1.0)
        items.forEach((it, i) => {
          const at = 1.08 + i * 0.09
          tl.to(it.querySelector('.strike'), { scaleX: 1, duration: 0.08, ease: 'power3.out' }, at)
          tl.to(it.querySelector('.t'), { opacity: 0.3, duration: 0.08, ease: 'none' }, at + 0.01)
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
    })

    return () => {
      clearTimeout(bootGoneTimer)
      clearTimeout(bootRemoveTimer)
      clearTimeout(introSafety)
      clearTimeout(revealSafety)
      form?.removeEventListener('submit', onSubmit)
      anchorCleanups.forEach((fn) => fn())
      document.getElementById('zList')?.classList.remove('z-list--animated')
      ctx.revert()
      lenis?.destroy()
    }
  }, [])

  return null
}
