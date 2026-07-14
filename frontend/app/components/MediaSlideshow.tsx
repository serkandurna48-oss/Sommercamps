'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import type { MediaEntry } from '../lib/clubConfig'

const AUTO_ADVANCE_MS = 5000

export default function MediaSlideshow({ items }: { items: MediaEntry[] }) {
  const [index, setIndex] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)

  const goTo = useCallback((i: number) => {
    setIndex((i + items.length) % items.length)
  }, [items.length])

  const next = useCallback(() => goTo(index + 1), [goTo, index])
  const prev = useCallback(() => goTo(index - 1), [goTo, index])

  // Auto-Advance für Bild-Slides; Video-Slides warten auf ihr eigenes Ende (onEnded).
  useEffect(() => {
    if (items.length <= 1 || items[index]?.type === 'video') return
    const timer = setTimeout(next, AUTO_ADVANCE_MS)
    return () => clearTimeout(timer)
  }, [index, items, next])

  useEffect(() => {
    if (items[index]?.type === 'video' && videoRef.current) {
      videoRef.current.currentTime = 0
      videoRef.current.play().catch(() => {})
    }
  }, [index, items])

  if (items.length === 0) return null

  const current = items[index]

  return (
    <div className="relative w-full aspect-video sm:aspect-[21/9] bg-gray-950 overflow-hidden">
      {current.type === 'video' ? (
        <video
          ref={videoRef}
          src={current.src}
          className="w-full h-full object-cover"
          muted
          playsInline
          onEnded={next}
        />
      ) : (
        <Image
          key={current.src}
          src={current.src}
          alt={current.alt ?? ''}
          fill
          unoptimized
          className="object-cover"
        />
      )}

      {items.length > 1 && (
        <>
          <button
            type="button"
            onClick={prev}
            aria-label="Vorheriges Bild"
            className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Nächstes Bild"
            className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors"
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
                className={`w-2 h-2 rounded-full transition-colors ${i === index ? 'bg-white' : 'bg-white/40'}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
