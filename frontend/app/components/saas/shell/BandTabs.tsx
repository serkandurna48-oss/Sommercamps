'use client'

import { useLinkStatus } from 'next/link'
import Link from '../preview/AdminLink'
import { useAdminPreview, previewHref } from '../preview/AdminPreviewContext'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useBarHeight } from './useBarHeight'
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
 * Sofortige Rückmeldung auf den Klick. Gemessen (PRO-60, Production-Build):
 * ein Wechsel über die Bereichsleiste veränderte bis zu 2,1 s lang nichts
 * am Bildschirm — der Nutzer sah nicht, ob sein Klick angekommen ist, und
 * klickte erneut.
 *
 * Nicht per `loading.tsx` gelöst, obwohl Next das sonst zuerst empfiehlt:
 * das Band rendert bewusst jede Seite selbst (Begründung in
 * (org-admin)/layout.tsx), eine Route-Fallback-Datei würde also genau die
 * Navigationsleiste wegnehmen, die während des Ladens bedienbar bleiben
 * soll. `useLinkStatus` markiert stattdessen den geklickten Tab, während
 * die bisherige Seite stehen bleibt — der dokumentierte Fall "Zielroute ist
 * dynamisch und hat kein loading.js".
 *
 * Bewusst ohne die in der Next-Doku vorgeschlagene Anzeigeverzögerung von
 * 100 ms: die Rückmeldung soll den Klick sofort bestätigen, nicht erst,
 * wenn das Ziel ohnehin fast fertig ist.
 */
function TabHint() {
  const { pending } = useLinkStatus()
  return <span aria-hidden="true" className="cp-tab-hint" data-pending={pending} />
}

/**
 * M2 (Auftrag Abschnitt 7): Unterstrich wandert per transform (translateX +
 * scaleX), 200ms, cubic-bezier(.4,0,.2,1) — nie width/left animiert, nur
 * transform (siehe Verbote). Aktiver Tab per exaktem Pfad-Match.
 */
export default function BandTabs({ tabs, brandColor }: { tabs: TabItem[]; brandColor: string }) {
  const pathname = usePathname()
  const preview = useAdminPreview()
  const containerRef = useRef<HTMLDivElement>(null)
  useBarHeight(containerRef, '--cp-mobile-nav-height')
  const [underline, setUnderline] = useState<{ left: number; width: number } | null>(null)
  // --cp-tab-mark: die Vereinsfarbe für die Aktiv-Markierung der schmalen
  // Leiste. Als Custom Property, weil die Markierung in tokens.css hinter
  // einer Media Query sitzt und von dort nicht an ein Prop herankommt.
  const navStyle: React.CSSProperties & Record<'--cp-tab-mark', string> = {
    borderTop: '1px solid var(--cp-band-line)',
    background: 'var(--cp-band)',
    '--cp-tab-mark': brandColor,
  }

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
      className="cp-band-tabs fixed right-0 bottom-0 left-0 z-20 grid p-1 grid-cols-[1fr_1fr_1fr_1fr_1.3fr] md:relative md:flex md:gap-6 md:overflow-x-auto"
      style={navStyle}
      aria-label="Bereiche"
    >
      {tabs.map(tab => {
        const active = pathname === (preview ? previewHref(tab.href, preview.empty).split('?')[0] : tab.href)
        const Icon = tab.icon ? ICONS[tab.icon] : undefined
        return (
          <Link
            key={tab.href}
            href={tab.href}
            data-active={active}
            aria-current={active ? 'page' : undefined}
            className="cp-subheading cp-band-tab inline-flex items-center justify-center gap-1.5 px-1 pt-3 pb-3 text-center md:shrink-0 md:justify-start md:px-0 md:whitespace-nowrap"
            style={{
              color: active ? 'var(--cp-on-band)' : 'var(--cp-on-band-2)',
            }}
          >
            {Icon && <Icon className="hidden md:inline-block" size={16} />}
            <span className="min-w-0 whitespace-nowrap">{tab.label}</span>
            <TabHint />
          </Link>
        )
      })}
      {underline && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-0 hidden h-0.5 w-px transition-transform motion-reduce:transition-none md:block"
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
