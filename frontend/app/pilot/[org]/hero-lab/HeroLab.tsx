'use client'

import Image from 'next/image'
import { useEffect, useRef } from 'react'
import type { CampPublic, OrganizationPublic } from '../../../lib/saasApi'

// Replicated from ParentFlow.tsx — pure function, no import needed
function headlineScale(text: string): 'xl' | 'lg' | 'md' {
  const len = text.length
  if (len <= 24) return 'xl'
  if (len <= 48) return 'lg'
  return 'md'
}

function campStats(camps: CampPublic[]) {
  return {
    count: camps.length,
    ageMin: camps.length > 0 ? Math.min(...camps.map(c => c.age_min)) : null,
    ageMax: camps.length > 0 ? Math.max(...camps.map(c => c.age_max)) : null,
    seats: camps.reduce((s, c) => s + c.capacity, 0),
  }
}

function orgCode(name: string): string {
  return name.split(' ').map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase()
}

// ── Shared navigation pill ──

function HlNav({ org, glass }: { org: OrganizationPublic; glass: boolean }) {
  return (
    <nav
      className={`hl-nav ${glass ? 'hl-nav-glass' : 'hl-nav-light'}`}
      aria-label="Seitennavigation"
    >
      <div className="hl-nav-left">
        <span className="hl-nav-logo">
          {org.logo_url ? (
            <Image
              src={org.logo_url}
              alt={org.name}
              width={32}
              height={32}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            orgCode(org.name)
          )}
        </span>
        <span className="hl-nav-name">{org.name}</span>
      </div>
      <button className="hl-nav-cta" type="button">
        Jetzt anmelden
      </button>
    </nav>
  )
}

// ── Line-split helper (browser-only, called inside useEffect) ──

function splitLinesForMotion(h1: HTMLElement): HTMLElement[] {
  const text = (h1.textContent || '').trim()
  if (!text) return []

  h1.textContent = ''
  const wordSpans: HTMLSpanElement[] = []
  text.split(/\s+/).forEach((word, i) => {
    if (i > 0) h1.appendChild(document.createTextNode(' '))
    const sp = document.createElement('span')
    sp.textContent = word
    sp.style.display = 'inline'
    h1.appendChild(sp)
    wordSpans.push(sp)
  })

  const lineGroups: string[][] = []
  let currentY = -Infinity
  let currentGroup: string[] = []
  wordSpans.forEach(w => {
    const top = w.getBoundingClientRect().top
    if (top - currentY > 4) {
      if (currentGroup.length) lineGroups.push(currentGroup)
      currentY = top
      currentGroup = [w.textContent || '']
    } else {
      currentGroup.push(w.textContent || '')
    }
  })
  if (currentGroup.length) lineGroups.push(currentGroup)

  h1.textContent = ''
  const lineInners: HTMLElement[] = []
  lineGroups.forEach(words => {
    const mask = document.createElement('span')
    mask.style.cssText = 'display:block;overflow:hidden;padding-bottom:0.04em;margin-bottom:-0.04em'
    const inner = document.createElement('span')
    inner.style.cssText = 'display:block;will-change:transform'
    inner.textContent = words.join(' ')
    mask.appendChild(inner)
    h1.appendChild(mask)
    lineInners.push(inner)
  })
  return lineInners
}

// ══════════════════════════════════════════════
// Variante 1 — Kino
// ══════════════════════════════════════════════

function useV1Motion(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let cancelled = false
    let gsapCleanup: (() => void) | undefined

    import('gsap').then(({ default: gsap }) => {
      if (cancelled) return
      const ctx = gsap.context(() => {
        const label = el.querySelector<HTMLElement>('.hl-sup-label')
        const h1 = el.querySelector<HTMLElement>('[data-hl-split]')
        const btns = el.querySelector<HTMLElement>('.hl-btns')
        const statsEl = el.querySelector<HTMLElement>('.hl-v1-stats')

        if (label) {
          gsap.fromTo(label, { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: 'expo.out', delay: 0.05 })
        }
        if (h1) {
          const lines = splitLinesForMotion(h1)
          if (lines.length) {
            gsap.fromTo(lines,
              { yPercent: 115 },
              { yPercent: 0, duration: 0.9, ease: 'expo.out', stagger: 0.09, delay: 0.15 }
            )
          }
        }
        if (btns) {
          gsap.fromTo(btns, { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: 'expo.out', delay: 0.45 })
        }
        if (statsEl) {
          gsap.fromTo(statsEl, { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: 'expo.out', delay: 0.55 })
        }
        // Count-up
        el.querySelectorAll<HTMLElement>('[data-count]').forEach(counter => {
          const to = parseFloat(counter.dataset.count || '0')
          const obj = { v: 0 }
          gsap.to(obj, {
            v: to, duration: 1.4, ease: 'expo.out', delay: 0.6,
            onUpdate() { counter.textContent = String(Math.round(obj.v)) },
            onComplete() { counter.textContent = String(to) },
          })
        })
      }, el)
      gsapCleanup = () => ctx.revert()
    })

    return () => { cancelled = true; gsapCleanup?.() }
  }, [])
}

function V1({ org, camps }: { org: OrganizationPublic; camps: CampPublic[] }) {
  const hero = org.hero_image_url?.trim()
  const heading = org.intro_heading?.trim() || org.name
  const { count, ageMin, ageMax, seats } = campStats(camps)
  const ref = useRef<HTMLElement>(null)
  const locations = [...new Set(camps.map(c => c.location).filter(Boolean))]
  const marqueeText = locations.length > 0 ? locations.join(' · ') : org.name

  useV1Motion(ref)

  return (
    <header className="hl-v1" ref={ref} lang="de">
      <HlNav org={org} glass={true} />
      <div className="hl-v1-bg">
        {hero && (
          <Image
            src={hero}
            alt=""
            fill
            unoptimized
            priority
            style={{ objectFit: 'cover', objectPosition: 'center 25%' }}
          />
        )}
      </div>
      <div className="hl-v1-veil" aria-hidden="true" />
      <div className="hl-v1-in">
        <div className="hl-v1-text">
          <span className="hl-sup-label">{org.name}</span>
          <h1 className="hl-v1-h1" data-hl-split data-scale={headlineScale(heading)}>
            {heading}
          </h1>
          <div className="hl-btns">
            <button className="hl-btn-glass" type="button">Camps ansehen</button>
            <button className="hl-btn-solid" type="button">Jetzt anmelden</button>
          </div>
        </div>
        {count > 0 && (
          <div className="hl-glass hl-v1-stats">
            <div className="hl-stat">
              <b data-count={count}>{count}</b>
              <span>{count === 1 ? 'Camp' : 'Camps'}</span>
            </div>
            {ageMin !== null && ageMax !== null && (
              <div className="hl-stat">
                <b>{ageMin}–{ageMax}</b>
                <span>Jahre</span>
              </div>
            )}
            <div className="hl-stat">
              <b data-count={seats}>{seats}</b>
              <span>Plätze</span>
            </div>
          </div>
        )}
      </div>
      <div className="hl-v1-marquee" aria-hidden="true">
        <div className="hl-marquee-track">
          <span className="hl-marquee-inner">{marqueeText} &nbsp;·&nbsp; </span>
          <span className="hl-marquee-inner">{marqueeText} &nbsp;·&nbsp; </span>
        </div>
      </div>
    </header>
  )
}

// ══════════════════════════════════════════════
// Variante 2 — Split
// ══════════════════════════════════════════════

function useV2Motion(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let cancelled = false
    let gsapCleanup: (() => void) | undefined

    Promise.all([import('gsap'), import('gsap/ScrollTrigger')]).then(
      ([{ default: gsap }, { ScrollTrigger }]) => {
        if (cancelled) return
        gsap.registerPlugin(ScrollTrigger)
        const ctx = gsap.context(() => {
          const label = el.querySelector<HTMLElement>('.hl-sup-label')
          const h1 = el.querySelector<HTMLElement>('[data-hl-split]')
          const intro = el.querySelector<HTMLElement>('.hl-v2-intro')
          const btns = el.querySelector<HTMLElement>('.hl-btns')
          const photoCard = el.querySelector<HTMLElement>('.hl-v2-right')
          const counters = el.querySelectorAll<HTMLElement>('.hl-v2-counter')

          if (label) {
            gsap.fromTo(label, { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: 'expo.out', delay: 0.05 })
          }
          if (h1) {
            const lines = splitLinesForMotion(h1)
            if (lines.length) {
              gsap.fromTo(lines,
                { yPercent: 115 },
                { yPercent: 0, duration: 0.9, ease: 'expo.out', stagger: 0.09, delay: 0.12 }
              )
            }
          }
          if (intro) {
            gsap.fromTo(intro, { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: 'expo.out', delay: 0.42 })
          }
          if (btns) {
            gsap.fromTo(btns, { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: 'expo.out', delay: 0.52 })
          }
          // Photo card entry + subtle parallax
          if (photoCard) {
            gsap.fromTo(photoCard,
              { y: 32, opacity: 0 },
              { y: 0, opacity: 1, duration: 1.0, ease: 'expo.out', delay: 0.2 }
            )
            const photoImg = photoCard.querySelector('img')
            if (photoImg && window.innerWidth >= 900) {
              gsap.fromTo(photoImg, { yPercent: -4 }, {
                yPercent: 4,
                ease: 'none',
                scrollTrigger: {
                  trigger: photoCard,
                  start: 'top bottom',
                  end: 'bottom top',
                  scrub: true,
                },
              })
            }
          }
          // Count-up — animate when counters enter viewport
          counters.forEach((counter, i) => {
            const numEl = counter.querySelector<HTMLElement>('[data-count]')
            if (!numEl) return
            const to = parseFloat(numEl.dataset.count || '0')
            const obj = { v: 0 }
            const tween = gsap.to(obj, {
              v: to, duration: 1.5, ease: 'expo.out', paused: true,
              onUpdate() { numEl.textContent = String(Math.round(obj.v)) },
              onComplete() { numEl.textContent = String(to) },
            })
            gsap.fromTo(counter,
              { y: 20, opacity: 0 },
              {
                y: 0, opacity: 1, duration: 0.7, ease: 'expo.out',
                delay: i * 0.08,
                scrollTrigger: {
                  trigger: counter,
                  start: 'top 90%',
                  once: true,
                  onEnter: () => tween.play(),
                },
              }
            )
          })
        }, el)
        gsapCleanup = () => ctx.revert()
      }
    )

    return () => { cancelled = true; gsapCleanup?.() }
  }, [])
}

function V2({ org, camps }: { org: OrganizationPublic; camps: CampPublic[] }) {
  const hero = org.hero_image_url?.trim()
  const heading = org.intro_heading?.trim() || org.name
  const intro = org.intro_text?.trim() || ''
  const { count, ageMin, ageMax, seats } = campStats(camps)
  const ref = useRef<HTMLDivElement>(null)

  useV2Motion(ref)

  return (
    <div className="hl-v2" ref={ref} lang="de">
      <header className="hl-v2-hero">
        <HlNav org={org} glass={true} />
        <div className="hl-v2-left">
          <div className="hl-v2-text">
            <span className="hl-sup-label">{org.name}</span>
            <h1 className="hl-v2-h1" data-hl-split>{heading}</h1>
            {intro && <p className="hl-v2-intro">{intro}</p>}
            <div className="hl-btns">
              <button className="hl-btn-glass" type="button">Camps ansehen</button>
              <button className="hl-btn-solid" type="button">Jetzt anmelden</button>
            </div>
          </div>
        </div>
        {hero && (
          <div className="hl-v2-right">
            <Image
              src={hero}
              alt=""
              fill
              unoptimized
              priority
              style={{ objectFit: 'cover', objectPosition: 'center 25%' }}
            />
          </div>
        )}
      </header>
      {count > 0 && (
        <div className="hl-v2-counters">
          <div className="hl-v2-counter">
            <b className="hl-v2-num" data-count={count}>{count}</b>
            <span>{count === 1 ? 'Camp' : 'Camps'}</span>
          </div>
          {ageMin !== null && ageMax !== null && (
            <div className="hl-v2-counter">
              <b className="hl-v2-num">{ageMin}–{ageMax}</b>
              <span>Jahre</span>
            </div>
          )}
          <div className="hl-v2-counter">
            <b className="hl-v2-num" data-count={seats}>{seats}</b>
            <span>Plätze gesamt</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════
// Variante 3 — Mosaik
// ══════════════════════════════════════════════

const JK_PHOTOS = ['/jk/hero.jpg', '/jk/team.jpg', '/jk/training.jpg', '/jk/camp.jpg']

function useV3Motion(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let cancelled = false
    let gsapCleanup: (() => void) | undefined

    import('gsap').then(({ default: gsap }) => {
      if (cancelled) return
      const ctx = gsap.context(() => {
        const label = el.querySelector<HTMLElement>('.hl-sup-label')
        const h1 = el.querySelector<HTMLElement>('[data-hl-split]')
        const cta = el.querySelector<HTMLElement>('.hl-btn-solid-brand')
        const tiles = el.querySelectorAll<HTMLElement>('[data-hl-tile]')

        if (label) {
          gsap.fromTo(label, { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: 'expo.out', delay: 0.05 })
        }
        if (h1) {
          gsap.fromTo(h1, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: 'expo.out', delay: 0.12 })
        }
        if (cta) {
          gsap.fromTo(cta, { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: 'expo.out', delay: 0.3 })
        }
        if (tiles.length) {
          gsap.fromTo(tiles,
            { y: 28, opacity: 0, scale: 0.96 },
            { y: 0, opacity: 1, scale: 1, duration: 0.8, ease: 'expo.out', stagger: 0.1, delay: 0.2 }
          )
        }
      }, el)
      gsapCleanup = () => ctx.revert()
    })

    return () => { cancelled = true; gsapCleanup?.() }
  }, [])
}

function V3({ org, camps: _camps }: { org: OrganizationPublic; camps: CampPublic[] }) {
  const hero = org.hero_image_url?.trim()
  const heading = org.intro_heading?.trim() || org.name
  const ref = useRef<HTMLDivElement>(null)

  // Build mosaic: use JK photos, fall back to hero if JK photos unavailable
  const photoSrcs = hero ? JK_PHOTOS : []
  const tilePhotos = (photoSrcs.length > 0 ? photoSrcs : (hero ? [hero] : [])).slice(0, 3)

  useV3Motion(ref)

  return (
    <div className="hl-v3" ref={ref} lang="de">
      <HlNav org={org} glass={true} />
      <div className="hl-v3-in">
        <div className="hl-v3-headline">
          <span className="hl-sup-label">{org.name}</span>
          <h1 className="hl-v3-h1" data-hl-split data-scale={headlineScale(heading)}>
            {heading}
          </h1>
          <button className="hl-btn-solid-brand" type="button">Jetzt anmelden</button>
        </div>
        <div className="hl-v3-mosaic">
          {tilePhotos.map((src, i) => (
            <div key={i} className="hl-tile" data-hl-tile>
              <Image
                src={src}
                alt=""
                fill
                unoptimized
                style={{ objectFit: 'cover', objectPosition: 'center 25%' }}
              />
            </div>
          ))}
          <div className="hl-tile hl-tile-accent" data-hl-tile>
            <span className="hl-tile-accent-text">Sommercamps 2027</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════
// Haupt-Export
// ══════════════════════════════════════════════

interface Props {
  org: OrganizationPublic
  camps: CampPublic[]
  variant?: 1 | 2 | 3
}

export default function HeroLab({ org, camps, variant }: Props) {
  if (variant === 1) return <V1 org={org} camps={camps} />
  if (variant === 2) return <V2 org={org} camps={camps} />
  if (variant === 3) return <V3 org={org} camps={camps} />

  return (
    <div className="hl-all">
      <div className="hl-variant-wrap">
        <p className="hl-variant-label">Variante 1</p>
        <V1 org={org} camps={camps} />
      </div>
      <div className="hl-variant-wrap">
        <p className="hl-variant-label">Variante 2</p>
        <V2 org={org} camps={camps} />
      </div>
      <div className="hl-variant-wrap">
        <p className="hl-variant-label">Variante 3</p>
        <V3 org={org} camps={camps} />
      </div>
    </div>
  )
}
