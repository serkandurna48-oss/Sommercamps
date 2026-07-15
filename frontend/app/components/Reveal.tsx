'use client'

import { useEffect, useRef, useState } from 'react'

// Startet sichtbar, damit Inhalt bei fehlendem/langsamem JS und bei bereits im
// Viewport liegenden Elementen nie unsichtbar bleibt. Nur Elemente, die beim Mount
// unterhalb des Viewports liegen, werden kurz ausgeblendet und beim Scrollen
// eingeblendet. Ein Timeout dient als Sicherheitsnetz, falls der Observer nie
// auslöst (z. B. Headless-Tools ohne echtes Scroll-Event).
export default function Reveal({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const rect = el.getBoundingClientRect()
    const alreadyInViewport = rect.top < window.innerHeight && rect.bottom > 0
    if (alreadyInViewport) return

    const hideId = requestAnimationFrame(() => setHidden(true))

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHidden(false)
          observer.disconnect()
        }
      },
      { threshold: 0.15 },
    )
    observer.observe(el)

    const safetyId = setTimeout(() => setHidden(false), 2000)

    return () => {
      cancelAnimationFrame(hideId)
      clearTimeout(safetyId)
      observer.disconnect()
    }
  }, [])

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${hidden ? 'opacity-0 translate-y-6' : 'opacity-100 translate-y-0'} ${className}`}
    >
      {children}
    </div>
  )
}
