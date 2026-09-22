/**
 * Zentrale deutsche Texte für die Org-Admin-Screens (Richtung C, Auftrag
 * Abschnitt 9.2). Klartext, ganze Sätze, keine Systemsprache — "Fünf
 * Familien haben noch nicht bezahlt", nicht "5 Registrations with
 * payment_status=pending". Keine Übersetzungsbibliothek, nur eine Stelle,
 * an der später eine andere Sprache andocken könnte.
 */

export const registrationStatusLabel: Record<string, string> = {
  registered: 'Angemeldet',
  confirmed: 'Bestätigt',
  cancelled: 'Storniert',
  waitlist: 'Warteliste',
}

export const paymentStatusLabel: Record<string, string> = {
  open: 'Zahlung offen',
  paid: 'Bezahlt',
  refunded: 'Erstattet',
  waived: 'Erlassen',
  cancelled: 'Storniert',
}

export const campStatusLabel: Record<string, string> = {
  draft: 'Entwurf',
  published: 'Veröffentlicht',
  closed: 'Geschlossen',
  archived: 'Archiviert',
}

export const de = {
  dashboard: {
    kicker: 'CampsPilot',
    nextCamp: 'Nächstes Camp',
    allCamps: 'Alle Camps',
    upNext: 'Jetzt dran',
    noUpcomingCamp: 'Kein anstehendes Camp',
    noUpcomingCampHint: 'Sobald ein Camp veröffentlicht ist, steht es hier.',
    noCamps: 'Noch keine Camps angelegt.',
    daysLeft: (n: number) => (n === 1 ? '1 Tag' : `${n} Tage`),
    spotsLabel: 'belegt',
    openPaymentsLabel: 'offen',
    waitlistLabel: 'Warteliste',
  },
  tasks: {
    payment: {
      title: (count: number, campTitle: string) =>
        count === 1
          ? `Eine Familie hat für „${campTitle}" noch nicht bezahlt`
          : `${count} Familien haben für „${campTitle}" noch nicht bezahlt`,
      hint: 'Zahlung ist noch offen — kurze Erinnerung schicken.',
    },
    missingContact: {
      title: (count: number, campTitle: string) =>
        count === 1
          ? `Ein Notfallkontakt fehlt bei „${campTitle}"`
          : `${count} Notfallkontakte fehlen bei „${campTitle}"`,
      hint: 'Vor Camp-Start nachfragen.',
    },
    waitlist: {
      title: (count: number, campTitle: string) =>
        count === 1
          ? `Eine Anmeldung wartet bei „${campTitle}" auf einen Platz`
          : `${count} Anmeldungen warten bei „${campTitle}" auf einen Platz`,
      hint: 'Wird ein Platz frei, informiere die Warteliste in Reihenfolge.',
    },
    review: 'Ansehen',
    markDone: 'Erledigt',
    allDone: 'Alles erledigt — nichts steht gerade an.',
  },
  command: {
    participants: 'Teilnehmer',
    payments: 'Zahlungen',
    waitlist: 'Warteliste',
    tasks: 'Aufgaben',
    configuration: 'Konfiguration',
    searchPlaceholder: 'Name oder E-Mail suchen …',
    filterPaymentOpen: 'Zahlung offen',
    filterMissingInfo: 'Angaben fehlen',
    filterAll: 'Alle',
    noParticipants: 'Noch keine Anmeldungen für dieses Camp.',
    noParticipantsFiltered: 'Kein Ergebnis für diese Auswahl.',
    whatIsMissing: 'Was hier fehlt',
    nextStep: 'Nächster Schritt',
    nothingMissing: 'Alle Pflichtangaben liegen vor.',
    missingEmergencyContact: 'Kein Notfallkontakt hinterlegt',
    hasAllergies: 'Allergien/Hinweise eingetragen — vor dem Camp prüfen',
  },
  comingSoon: {
    title: 'Noch nicht verfügbar',
    body: 'Dieser Bereich ist als Navigation schon da, aber ohne Inhalt — kommt in einem späteren Schritt.',
  },
  states: {
    loading: 'Wird geladen …',
    errorTitle: 'Das hat nicht geklappt',
    errorBody: 'Die Daten konnten nicht geladen werden. Versuch es gleich noch mal.',
    retry: 'Erneut versuchen',
  },
} as const

export function formatEuro(cents: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(cents / 100)
}

/** Countdown in vollen Kalendertagen (Europe/Berlin), nicht 24h-Blöcken —
 * Auftrag Abschnitt 9.1. */
export function daysUntil(isoDate: string): number {
  const now = new Date()
  const berlinNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Berlin' }))
  const today = new Date(berlinNow.getFullYear(), berlinNow.getMonth(), berlinNow.getDate())
  const target = new Date(`${isoDate}T00:00:00`)
  const targetDay = new Date(target.getFullYear(), target.getMonth(), target.getDate())
  return Math.round((targetDay.getTime() - today.getTime()) / 86_400_000)
}

export function formatDateRange(startIso: string, endIso: string): string {
  const start = new Date(`${startIso}T00:00:00`)
  const end = new Date(`${endIso}T00:00:00`)
  const day = (d: Date) => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
  const full = end.toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })
  return `${day(start)}.–${full}`
}
