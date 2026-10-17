'use client'

import { useEffect, useRef } from 'react'

/**
 * Filmkorn — Ticket §9. Einmal beim ersten Laden eine Rausch-Kachel auf
 * einem Canvas erzeugen (wortgleich aus der Referenz portiert: 140×140,
 * Alpha 26/255 ≈ 10%), als background-image auf das feste `.grain`-Element
 * setzen. Die Bewegung selbst läuft rein in CSS (steps()-Keyframe, siehe
 * publicTheme.css `.cp-public .grain` / `@keyframes cp-grain`) — hier wird
 * nur die statische Textur erzeugt, keine Bewegung.
 *
 * Referenz statt Ticket-Beispielwerte für inset/z-index/Animationsdauer:
 * §9 beschreibt zusätzlich `mix-blend-mode: overlay`, das die tatsächlich
 * gemessene Referenz nicht verwendet — beide CSS-Regeln stehen bereits in
 * publicTheme.css und wurden bewusst nach der Referenz gebaut (siehe
 * Rangordnung in LIESMICH.md, vom Auftraggeber für diese Art Konflikt
 * bereits entschieden).
 */
export default function GrainOverlay() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    try {
      const size = 140
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const image = ctx.createImageData(size, size)
      const data = image.data
      for (let i = 0; i < data.length; i += 4) {
        const v = (Math.random() * 255) | 0
        data[i] = v
        data[i + 1] = v
        data[i + 2] = v
        data[i + 3] = 26
      }
      ctx.putImageData(image, 0, 0)
      el.style.backgroundImage = `url(${canvas.toDataURL()})`
    } catch {
      // Canvas nicht verfügbar (z. B. sehr altes Gerät) — Korn bleibt
      // einfach unsichtbar, kein Fehlerzustand nötig (§9: "Politur, kein
      // Produktmerkmal").
    }
  }, [])

  return <div ref={ref} className="grain" aria-hidden="true" />
}
