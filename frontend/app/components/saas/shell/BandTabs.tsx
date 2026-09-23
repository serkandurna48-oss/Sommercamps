'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { IconBoard, IconCoin, IconFlag, IconGear, IconHourglass, IconJersey } from '../icons'

/**
 * Icon kommt als Name (String), nicht als Komponentenreferenz — TabItem
 * wird serverseitig in navTabs.ts gebaut und als Prop in dieses "use
 * client"-Modul gereicht; eine Funktion (Icon-Komponente) ließe sich dort
 * nicht über die Server/Client-Grenze serialisieren ("Functions cannot be
 * passed directly to Client Components" — derselbe Fehler wie bei den
 * Export-Spalten, siehe WaitlistExportBar.tsx). Ein String schon.
 */
export type TabIconName = 'board' | 'coin' | 'hourglass' | 'flag' | 'gear' | 'jersey'

const ICONS: Record<TabIconName, typeof IconBoard> = {
  board: IconBoard,
  coin: IconCoin,
  hourglass: IconHourglass,
  flag: IconFlag,
  gear: IconGear,
  jersey: IconJersey,
}

export interface TabItem {
  label: string
  href: string
  icon?: TabIconName
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
      className="relative flex gap-6 overflow-x-auto max-md:fixed max-md:right-0 max-md:bottom-0 max-md:left-0 max-md:z-20 max-md:justify-around max-md:gap-0 max-md:px-2"
      style={{ borderTop: '1px solid var(--cp-band-line)', background: 'var(--cp-band)' }}
      aria-label="Bereiche"
    >
      {tabs.map(tab => {
        const active = pathname === tab.href
        const Icon = tab.icon ? ICONS[tab.icon] : undefined
        return (
          <Link
            key={tab.href}
            href={tab.href}
            data-active={active}
            aria-current={active ? 'page' : undefined}
            className="cp-subheading inline-flex shrink-0 items-center gap-1.5 pt-3 pb-3 whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 max-md:px-2 max-md:text-center max-md:text-[12px]"
            style={{
              color: active ? 'var(--cp-on-band)' : 'var(--cp-on-band-2)',
              outlineColor: brandColor,
            }}
          >
            {Icon && <Icon className="hidden md:inline-block" size={16} />}
            {tab.label}
          </Link>
        )
      })}
      {underline && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-0 h-0.5 w-px transition-transform motion-reduce:transition-none max-md:hidden"
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
