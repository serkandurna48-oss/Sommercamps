import { de } from '../../lib/i18n/de'
import type { TabItem } from './shell/BandTabs'

/** Org-Ebene (Dashboard-Band). Nur "Übersicht" hat echten Inhalt — die
 * übrigen sind Navigation ohne Inhalt (Abschnitt 1), führen zu ComingSoon. */
export function orgTabs(orgSlug: string): TabItem[] {
  return [
    { label: 'Übersicht', href: `/pilot/${orgSlug}/dashboard` },
    { label: de.command.payments, href: `/pilot/${orgSlug}/zahlungen` },
    { label: de.command.waitlist, href: `/pilot/${orgSlug}/warteliste` },
    { label: de.command.tasks, href: `/pilot/${orgSlug}/aufgaben` },
    { label: de.command.configuration, href: `/pilot/${orgSlug}/konfiguration` },
  ]
}

/** Camp-Ebene (Command-Center-Band). Nur "Teilnehmer" hat echten Inhalt. */
export function campTabs(orgSlug: string, campSlug: string): TabItem[] {
  const base = `/pilot/${orgSlug}/camps/${campSlug}`
  return [
    { label: de.command.participants, href: base },
    { label: de.command.payments, href: `${base}/zahlungen` },
    { label: de.command.waitlist, href: `${base}/warteliste` },
    { label: de.command.tasks, href: `${base}/aufgaben` },
    { label: de.command.configuration, href: `${base}/konfiguration` },
  ]
}
