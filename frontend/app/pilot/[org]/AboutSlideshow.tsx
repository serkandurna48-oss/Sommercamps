'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'

export interface SlideshowImage {
  src: string
  alt: string
}

const INTERVAL_MS = 5000

/**
 * Crossfading photo slideshow for the "Über uns" block. Advances on its own unless the visitor
 * prefers reduced motion, hovers it or moves keyboard focus into it; arrows and dots always work.
 */
export default function AboutSlideshow({ images }: { images: readonly SlideshowImage[] }) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const count = images.length

  useEffect(() => {
    if (count < 2 || paused) return
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setInterval(() => setIndex(i => (i + 1) % count), INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [count, paused])

  if (count === 0) return null
  const go = (next: number) => setIndex((next + count) % count)

  return (
    <div
      className="about-slides"
      role="group"
      aria-roledescription="Diashow"
      aria-label="Bilder aus dem Training"
      data-rise
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="about-slides-stage">
        {images.map((image, i) => (
          <div
            key={image.src}
            className={`about-slide${i === index ? ' is-active' : ''}`}
            aria-hidden={i !== index}
          >
            <Image
              src={image.src}
              alt={i === index ? image.alt : ''}
              unoptimized
              fill
              sizes="(min-width: 900px) 45vw, 92vw"
              priority={i === 0}
              style={{ objectFit: 'cover', objectPosition: 'center 30%' }}
            />
          </div>
        ))}
      </div>
      {count > 1 && (
        <div className="about-slides-bar">
          <button type="button" className="about-slides-nav" aria-label="Vorheriges Bild" onClick={() => go(index - 1)}>
            <span aria-hidden="true">←</span>
          </button>
          <div className="about-slides-dots">
            {images.map((image, i) => (
              <button
                key={image.src}
                type="button"
                className={`about-slides-dot${i === index ? ' is-active' : ''}`}
                aria-label={`Bild ${i + 1} von ${count}`}
                aria-current={i === index ? 'true' : undefined}
                onClick={() => go(i)}
              />
            ))}
          </div>
          <button type="button" className="about-slides-nav" aria-label="Nächstes Bild" onClick={() => go(index + 1)}>
            <span aria-hidden="true">→</span>
          </button>
        </div>
      )}
    </div>
  )
}
