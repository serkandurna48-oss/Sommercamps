'use client'

import { useEffect, useRef } from 'react'

/**
 * Ein geteiltes Import-Promise für alle CountUpNumber-Instanzen — eine
 * Seite mit mehreren StatCards (Dashboard: 4) importiert GSAP sonst einmal
 * pro Mount, obwohl der Browser das Modul beim zweiten Mal ohnehin aus dem
 * Modul-Cache bedient; das gemeinsame Promise macht das explizit und
 * spart die wiederholte dynamische import()-Buchhaltung.
 */
let gsapImportPromise: Promise<typeof import('gsap')> | null = null
function loadGsap() {
  if (!gsapImportPromise) {
    gsapImportPromise = import('gsap')
  }
  return gsapImportPromise
}

/**
 * Zählt beim Mount von 0 auf `value` hoch — derselbe GSAP-Zähler-Ansatz
 * wie pilot/[org]/motion.ts::runCounters (dort scroll-getriggert; hier
 * immer beim Mount, weil Admin-Kacheln praktisch nie unterhalb des
 * sichtbaren Bereichs starten). Nur für reine Ganzzahlen gedacht (siehe
 * StatCard-Doku) — ein Geldbetrag oder "3/3" lässt sich nicht sinnvoll als
 * eine einzelne Zahl hochzählen.
 *
 * GSAP dynamisch importiert statt statisch, damit eine Seite ohne
 * animierte Zahl (z. B. während SSR/erstem Paint) das Paket nicht lädt —
 * gleiches Muster wie useParentFlowMotion.
 */
export default function CountUpNumber({
  value,
  className,
  style,
}: {
  value: number
  className?: string
  style?: React.CSSProperties
}) {
  const ref = useRef<HTMLSpanElement>(null)

  /**
   * SSR/erster Paint zeigt bereits den echten Wert (nicht "0") — die
   * Zähl-Animation ist reine progressive Verbesserung, kein Pfad, von dem
   * die Korrektheit abhängt. Vorher hing die angezeigte Zahl vollständig
   * vom Erfolg dieses Effekts ab: lief er aus irgendeinem Grund nicht
   * (langsames Netz, deaktiviertes JS, Ad-Blocker gegen den gsap-Chunk,
   * o.ä.), blieb die Kachel für den Rest der Sitzung sichtbar falsch bei
   * "0" stehen — für "Warteliste"/"Aufgaben" eine Zahl, auf die ein
   * Organisator sich verlässt.
   */
  useEffect(() => {
    const el = ref.current
    if (!el) return

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) return

    let cancelled = false
    loadGsap().then(({ default: gsap }) => {
      // Erst hier auf "0" zurücksetzen, nicht schon vor dem Laden von gsap
      // — sonst bleibt die Kachel bei "0" hängen, falls das Promise nie
      // aufgelöst wird (die eigentliche Korrektheit hängt bereits am
      // JSX-Anfangswert oben, nicht mehr an diesem Effekt).
      if (cancelled || !ref.current) return
      ref.current.textContent = '0'
      const counter = { v: 0 }
      gsap.to(counter, {
        v: value,
        duration: 0.8,
        ease: 'power3.out',
        onUpdate: () => {
          if (ref.current) ref.current.textContent = String(Math.round(counter.v))
        },
        onComplete: () => {
          if (ref.current) ref.current.textContent = String(value)
        },
      })
    })

    return () => {
      cancelled = true
    }
  }, [value])

  return (
    <span ref={ref} className={className} style={style} aria-label={String(value)}>
      {value}
    </span>
  )
}
