'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

export interface TabItem {
  label: string
  href: string
}

/**
 * M2 (Auftrag Abschnitt 7): Unterstrich wandert per transform (translateX +
 * scaleX), 200ms, cubic-bezier(.4,0,.2,1) — nie width/left animiert, nur
 * transform (siehe Verbote). Aktiver Tab per exaktem Pfad-Match.
 */
export default function BandTabs({ tabs, brandColor }: { tabs: TabItem[]; brandColor: string }) {
  const pathname = usePathname()
  const containerRef = useRef<HTMLDivElement>(null)
  const [underline, setUnderline] = useState<{ left: number; width: number } | null>(null)

  useEffect(() => {
    const activeEl = containerRef.current?.querySelector<HTMLElement>('[data-active="true"]')
    if (activeEl && containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect()
      const rect = activeEl.getBoundingClientRect()
      setUnderline({ left: rect.left - containerRect.left, width: rect.width })
    }
  }, [pathname, tabs])

  return (
    <nav
      ref={containerRef}
      className="relative flex gap-6 overflow-x-auto"
      style={{ borderTop: '1px solid var(--cp-band-line)' }}
      aria-label="Bereiche"
    >
      {tabs.map(tab => {
        const active = pathname === tab.href
        return (
          <Link
            key={tab.href}
            href={tab.href}
            data-active={active}
            aria-current={active ? 'page' : undefined}
            className="cp-subheading shrink-0 whitespace-nowrap pt-3 pb-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              color: active ? 'var(--cp-on-band)' : 'var(--cp-on-band-2)',
              outlineColor: brandColor,
            }}
          >
            {tab.label}
          </Link>
        )
      })}
      {underline && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-0 h-0.5 w-px transition-transform motion-reduce:transition-none"
          style={{
            background: brandColor,
            transform: `translateX(${underline.left}px) scaleX(${underline.width})`,
            transformOrigin: 'left',
            transitionDuration: '200ms',
            transitionTimingFunction: 'cubic-bezier(.4,0,.2,1)',
          }}
        />
      )}
    </nav>
  )
}
