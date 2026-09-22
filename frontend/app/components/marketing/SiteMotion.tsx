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
      const heroTitle = document.getElementById('heroTitle')
      const heroWords = heroTitle ? splitWords(heroTitle) : []
      const intro = gsap.timeline({ delay: 1.35, defaults: { ease: 'expo.out' } })
      intro.from('#heroImg', { scale: 1.16, duration: 1.9 }, 0)
      if (heroWords.length) intro.from(heroWords, { yPercent: 118, duration: 1.15, stagger: 0.055 }, 0.12)
      intro.from('.hero [data-rise]', { y: 22, opacity: 0, duration: 1, stagger: 0.09 }, 0.42)

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

      // ── Überschriften steigen zeilenweise auf ───────────────────────
      document.querySelectorAll('[data-split]').forEach((h) => {
        const words = splitWords(h)
        if (!words.length) return
        gsap.from(words, {
          yPercent: 118,
          duration: 1.05,
          ease: 'expo.out',
          stagger: 0.05,
          scrollTrigger: { trigger: h, start: 'top 84%', once: true },
        })
      })
      document.querySelectorAll('[data-rise]').forEach((el) => {
        if (el.closest('.hero')) return
        gsap.from(el, {
          y: 26,
          opacity: 0,
          duration: 0.95,
          ease: 'expo.out',
          scrollTrigger: { trigger: el, start: 'top 88%', once: true },
        })
      })

      // ── Das Kapitel, das am Scrollrad hängt ──────────────────────────
      const mm = gsap.matchMedia()
      mm.add('(min-width: 860px)', () => {
        const items = gsap.utils.toArray<HTMLElement>('#zList .z-item')
        const tl = gsap.timeline({
          scrollTrigger: { trigger: '#zStage', start: 'top top', end: '+=1600', pin: true, scrub: 0.7, anticipatePin: 1 },
        })
        tl.to('#zImg', { scale: 1.1, ease: 'none' }, 0)
        tl.to('#zDim', { opacity: 0.62, ease: 'none' }, 0.08)
        items.forEach((it, i) => {
          const at = 0.1 + i * 0.135
          tl.to(it.querySelector('.strike'), { scaleX: 1, duration: 0.09, ease: 'power2.inOut' }, at)
          tl.to(it.querySelector('.t'), { opacity: 0.34, duration: 0.09, ease: 'none' }, at + 0.02)
        })
        tl.from('#zResolve', { opacity: 0, y: 34, duration: 0.14, ease: 'expo.out' }, 0.8)
        return () => {
          tl.scrollTrigger?.kill()
          tl.kill()
        }
      })
      mm.add('(max-width: 859px)', () => {
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
        gsap.to(o, {
          v: target,
          duration: 1.4,
          ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 88%', once: true },
          onUpdate: () => {
            el.textContent = pre + Math.round(o.v) + post
          },
          onComplete: () => {
            el.textContent = pre + target + post
          },
        })
      })

      ScrollTrigger.refresh()
    })

    return () => {
      clearTimeout(bootGoneTimer)
      clearTimeout(bootRemoveTimer)
      form?.removeEventListener('submit', onSubmit)
      anchorCleanups.forEach((fn) => fn())
      ctx.revert()
      lenis?.destroy()
    }
  }, [])

  return null
}
