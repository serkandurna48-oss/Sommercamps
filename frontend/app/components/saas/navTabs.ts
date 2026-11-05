import { de } from '../../lib/i18n/de'
import type { TabItem } from './shell/BandTabs'

/** Org-Ebene (Dashboard-Band). */
export function orgTabs(orgSlug: string): TabItem[] {
  return [
    { label: 'Übersicht', shortLabel: 'Start', href: `/pilot/${orgSlug}/dashboard`, icon: 'board' },
    { label: de.command.payments, shortLabel: 'Zahlung', href: `/pilot/${orgSlug}/zahlungen`, icon: 'coin' },
    { label: de.command.waitlist, shortLabel: 'Warten', href: `/pilot/${orgSlug}/warteliste`, icon: 'hourglass' },
    { label: de.command.tasks, shortLabel: 'Aufgaben', href: `/pilot/${orgSlug}/aufgaben`, icon: 'flag' },
    { label: 'Trainings', shortLabel: 'Training', href: `/pilot/${orgSlug}/trainings`, icon: 'jersey' },
    { label: 'Mitglieder', shortLabel: 'Mitglied', href: `/pilot/${orgSlug}/mitglieder`, icon: 'board' },
    { label: 'Einstellungen', shortLabel: 'Optionen', href: `/pilot/${orgSlug}/konfiguration`, icon: 'gear' },
  ]
}

/** Camp-Ebene (Command-Center-Band). */
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
