'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import type { MediaEntry } from '../lib/clubConfig'

const AUTO_ADVANCE_MS = 5000

export default function MediaSlideshow({ items }: { items: MediaEntry[] }) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  const goTo = useCallback((i: number) => {
    setIndex((i + items.length) % items.length)
  }, [items.length])

  const next = useCallback(() => goTo(index + 1), [goTo, index])
  const prev = useCallback(() => goTo(index - 1), [goTo, index])

  // Auto-Advance für Bild-Slides; Video-Slides warten auf ihr eigenes Ende (onEnded).
  // Pausiert bei Hover, damit Besucher ein Bild in Ruhe anschauen können.
  useEffect(() => {
    if (items.length <= 1 || items[index]?.type === 'video' || paused) return
    const timer = setTimeout(next, AUTO_ADVANCE_MS)
    return () => clearTimeout(timer)
  }, [index, items, next, paused])

  useEffect(() => {
    if (items[index]?.type === 'video' && videoRef.current) {
      videoRef.current.currentTime = 0
      videoRef.current.play().catch(() => {})
    }
  }, [index, items])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') prev()
    if (e.key === 'ArrowRight') next()
  }, [next, prev])

  if (items.length === 0) return null

  return (
    <div
      className="relative w-full aspect-[4/3] sm:aspect-[16/9] bg-gray-950 overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onKeyDown={handleKeyDown}
      role="region"
      aria-label="Bildergalerie"
      tabIndex={0}
    >
      {items.map((item, i) => (
        <div
          key={item.src}
          className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${i === index ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          aria-hidden={i !== index}
        >
          {item.type === 'video' ? (
            <video
              ref={i === index ? videoRef : undefined}
              src={item.src}
              className="w-full h-full object-cover"
              muted
              playsInline
              onEnded={i === index ? next : undefined}
            />
          ) : (
            <>
              {/* Verschwommener Hintergrund füllt den Rahmen, damit Hochformat-Handyfotos
                  nicht hart beschnitten werden müssen (Instagram-Stories-Prinzip). Abdunklung
                  vereinheitlicht den Ton, damit der Übergang zum scharfen Bild nicht "matschig" wirkt. */}
              <Image
                src={item.src}
                alt=""
                fill
                unoptimized
                aria-hidden
                className="object-cover scale-125 blur-3xl brightness-[0.55] saturate-75"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/10" />
              <Image
                src={item.src}
                alt={item.alt ?? ''}
                fill
                unoptimized
                className="object-contain drop-shadow-2xl"
              />
            </>
          )}
        </div>
      ))}

      {items.length > 1 && (
        <>
          <button
            type="button"
            onClick={prev}
            aria-label="Vorheriges Bild"
            className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Nächstes Bild"
            className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>

          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2">
            {items.map((item, i) => (
              <button
                key={item.src}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Zu Slide ${i + 1} springen`}
                className={`h-2 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 ${i === index ? 'w-6 bg-white' : 'w-2 bg-white/40 hover:bg-white/60'}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
