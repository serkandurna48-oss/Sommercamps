import { de } from '../../lib/i18n/de'

/**
 * Icon kommt als Name (String), nicht als Komponentenreferenz: die
 * Navigationsdaten werden serverseitig gebaut und in Client-Module
 * gereicht; Funktionen lassen sich nicht über die Server/Client-Grenze
 * serialisieren, Strings schon.
 */
export type NavIconName =
  | 'board' | 'coin' | 'hourglass' | 'flag' | 'gear' | 'jersey'
  | 'tent' | 'whistle' | 'inbox' | 'people' | 'help'

export interface TabItem {
  label: string
  href: string
  icon?: NavIconName
}

export interface NavGroup {
  /** Gruppen ohne id/Überschrift sind einzelne Einträge auf oberster Ebene. */
  id?: string
  label?: string
  items: TabItem[]
}

/** Seitenleiste des Verwaltungsbereichs (Launch-UX-Brief): Übersicht,
 * Angebote, Teilnehmer, Zahlungen, Aufgaben. Einstellungen/Hilfe stehen
 * unten in {@link adminNavFooter}. */
export function adminNav(orgSlug: string): NavGroup[] {
  const base = `/pilot/${orgSlug}`
  return [
    { items: [{ label: 'Übersicht', href: `${base}/dashboard`, icon: 'board' }] },
    {
      id: 'angebote',
      label: 'Angebote',
      items: [
        { label: 'Camps', href: `${base}/camps`, icon: 'tent' },
        { label: 'Trainings', href: `${base}/trainings`, icon: 'whistle' },
      ],
    },
    {
      id: 'teilnehmer',
      label: 'Teilnehmer',
      items: [
        { label: 'Anmeldungen', href: `${base}/anmeldungen`, icon: 'inbox' },
        { label: de.command.waitlist, href: `${base}/warteliste`, icon: 'hourglass' },
        { label: 'Spieler', href: `${base}/spieler`, icon: 'jersey' },
        { label: 'Mitglieder', href: `${base}/mitglieder`, icon: 'people' },
      ],
    },
    {
      items: [
        { label: de.command.payments, href: `${base}/zahlungen`, icon: 'coin' },
        { label: de.command.tasks, href: `${base}/aufgaben`, icon: 'flag' },
      ],
    },
  ]
}

export function adminNavFooter(orgSlug: string): TabItem[] {
  return [
    { label: 'Einstellungen', href: `/pilot/${orgSlug}/konfiguration`, icon: 'gear' },
    { label: 'Hilfe', href: `/pilot/${orgSlug}/hilfe`, icon: 'help' },
  ]
}

/** Alle Ziele der Seitenleiste in Reihenfolge (für Aktiv-Markierung und Tests). */
export function adminNavItems(orgSlug: string): TabItem[] {
  return [...adminNav(orgSlug).flatMap(group => group.items), ...adminNavFooter(orgSlug)]
}

/** Camp-Ebene: kompakte Reiterzeile im Seitenkopf jeder Camp-Seite. */
export function campTabs(orgSlug: string, campSlug: string): TabItem[] {
  const base = `/pilot/${orgSlug}/camps/${campSlug}`
  return [
    { label: de.command.participants, href: base, icon: 'jersey' },
    { label: de.command.payments, href: `${base}/zahlungen`, icon: 'coin' },
    { label: de.command.waitlist, href: `${base}/warteliste`, icon: 'hourglass' },
    { label: de.command.tasks, href: `${base}/aufgaben`, icon: 'flag' },
    { label: 'Einstellungen', href: `${base}/konfiguration`, icon: 'gear' },
  ]
}

/**
 * Aktiver Eintrag = das Ziel, dessen href das längste segmentweise Präfix
 * des aktuellen Pfads ist; Unterseiten (/trainings/[id], /spieler/[id],
 * /camps/[slug]/…) markieren so ihren Bereich.
 */
export function activeTabHref(pathname: string, hrefs: string[]): string | undefined {
  let best: string | undefined
  for (const href of hrefs) {
    const matches = pathname === href || pathname.startsWith(href.endsWith('/') ? href : `${href}/`)
    if (matches && (!best || href.length > best.length)) best = href
  }
  return best
}
