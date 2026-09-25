'use client'

import { useEffect, useRef } from 'react'

// Filmkorn: einmal als Canvas-Rauschen erzeugt, danach reine CSS-Bewegung
// (siehe .grain / @keyframes cp-grain in marketing.css). Ohne JavaScript
// bleibt der Layer leer und unsichtbar (opacity .055, pointer-events none) —
// rein dekorativ, blockiert nichts.
export default function Grain() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    try {
      const size = 140
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const imageData = ctx.createImageData(size, size)
      const data = imageData.data
      for (let i = 0; i < data.length; i += 4) {
        const v = (Math.random() * 255) | 0
        data[i] = data[i + 1] = data[i + 2] = v
        data[i + 3] = 26
      }
      ctx.putImageData(imageData, 0, 0)
      el.style.backgroundImage = `url(${canvas.toDataURL()})`
    } catch {
      // Rauschen ist rein dekorativ — bei Fehlern bleibt der Layer leer.
    }
  }, [])

  return <div ref={ref} className="grain" aria-hidden="true" />
}
