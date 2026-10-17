'use client'

import { useEffect, useRef } from 'react'

/**
 * Filmkorn für den Org-Admin — Port von pilot/[org]/GrainOverlay.tsx, dort
 * bereits gegen eine Referenz gebaut und verifiziert (siehe dortiger
 * Docstring). Bewusst eine eigene Kopie statt eines Imports aus dem
 * Eltern-Flow-Verzeichnis: der Org-Admin-Baum soll unabhängig vom
 * Eltern-Flow bleiben (eigene Fonts, eigene Motion, eigenes tokens.css —
 * derselbe Trennungsgrundsatz wie überall sonst in diesem Projekt), auch
 * wenn die Canvas-Logik hier identisch ist. Deutlich dezenter als dort
 * (--cp-grain in tokens.css, ~0.035 statt 0.03–0.07) — ein Werkzeug, das
 * mehrmals täglich benutzt wird, darf nicht ermüden.
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
      // Canvas nicht verfügbar — Korn bleibt unsichtbar, kein Fehlerzustand.
    }
  }, [])

  return <div ref={ref} className="cp-grain" aria-hidden="true" />
}
