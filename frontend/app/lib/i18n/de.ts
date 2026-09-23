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

/** Einzige Quelle für die vier Camp-Status (Cleanup nach Review-Fund: das
 * gleiche Vierer-Array stand vorher wortgleich noch einmal in
 * CampConfigForm.tsx (Dropdown-Optionen) und noch einmal als Set in
 * configActions.ts (Server-seitige Validierung) — ein neuer Status hätte
 * an einer der drei Stellen vergessen werden können, ohne dass TypeScript
 * das gemerkt hätte. */
export const CAMP_STATUSES = ['draft', 'published', 'closed', 'archived'] as const

export const campStatusLabel: Record<(typeof CAMP_STATUSES)[number], string> = {
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
  states: {
    loading: 'Wird geladen …',
    errorTitle: 'Das hat nicht geklappt',
    errorBody: 'Die Daten konnten nicht geladen werden. Versuch es gleich noch mal.',
    retry: 'Erneut versuchen',
  },
  tasksPage: {
    heading: 'Aufgaben',
    subtitleOrg: 'Über alle Camps',
    filterAll: 'Alle',
    filterPayment: 'Zahlung offen',
    filterMissingContact: 'Notfallkontakt fehlt',
    filterWaitlist: 'Warteliste',
    emptyOrg: 'Alles erledigt — über alle Camps steht gerade nichts an.',
    emptyCamp: 'Für dieses Camp steht gerade nichts an.',
    emptyFiltered: 'Kein Ergebnis für diese Auswahl.',
  },
  waitlistPage: {
    heading: 'Warteliste',
    subtitleOrg: 'Über alle Camps',
    position: (n: number) => `Platz ${n}`,
    waitingSince: (days: number) => (days <= 0 ? 'wartet seit heute' : days === 1 ? 'wartet seit 1 Tag' : `wartet seit ${days} Tagen`),
    familiesWaiting: (n: number) => (n === 1 ? '1 Familie wartet' : `${n} Familien warten`),
    promote: 'Nächste Familie aufrücken',
    promoting: 'Rückt auf …',
    promoteNoCapacity: 'Kein freier Platz gerade — später erneut versuchen.',
    promoteSuccess: (name: string) => `${name} ist jetzt angemeldet.`,
    promoteError: 'Konnte nicht aufrücken — erneut versuchen.',
    emptyOrg: 'Aktuell wartet niemand auf einen Platz.',
    emptyCamp: 'Niemand wartet gerade auf einen Platz bei diesem Camp.',
  },
  paymentsPage: {
    heading: 'Zahlungen',
    subtitleOrg: 'Über alle Camps',
    collected: 'Eingegangen',
    open: 'Offen',
    breakdown: 'Nach Status',
    filterOpen: 'Offen',
    filterPaid: 'Bezahlt',
    filterAll: 'Alle',
    markPaid: 'Als bezahlt markieren',
    markWaived: 'Erlassen',
    markRefunded: 'Als erstattet markieren',
    markPaidSuccess: 'Als bezahlt gespeichert.',
    markWaivedSuccess: 'Als erlassen gespeichert.',
    markRefundedSuccess: 'Als erstattet gespeichert.',
    updating: 'Wird gespeichert …',
    updateError: 'Konnte nicht gespeichert werden — erneut versuchen.',
    emptyOrg: 'Aktuell keine Zahlungen erfasst.',
    emptyCamp: 'Für dieses Camp liegen noch keine Anmeldungen vor.',
    emptyFiltered: 'Kein Ergebnis für diese Auswahl.',
  },
  configPage: {
    orgHeading: 'Verein',
    orgHint: 'Diese Angaben erscheinen im Anmelde-Formular der Eltern und auf der Bestätigungsseite.',
    campHeading: 'Camp-Einstellungen',
    campHint: 'Änderungen wirken sich sofort auf die öffentliche Anmeldeseite dieses Camps aus.',
    section: {
      branding: 'Verein',
      contact: 'Kontakt',
      payment: 'Zahlung',
      facts: 'Steckbrief',
      schedule: 'Termine & Kapazität',
      parentInfo: 'Angaben für Eltern',
      visibility: 'Sichtbarkeit',
    },
    field: {
      name: 'Vereinsname',
      legalName: 'Rechtsname (optional)',
      contactEmail: 'Kontakt-E-Mail',
      contactPhone: 'Kontakt-Telefon',
      logoUrl: 'Logo-URL',
      primaryColor: 'Vereinsfarbe',
      iban: 'IBAN für Überweisungen',
      title: 'Titel',
      startDate: 'Beginn',
      endDate: 'Ende',
      registrationStart: 'Anmeldung ab',
      registrationEnd: 'Anmeldung bis',
      ageMin: 'Mindestalter',
      ageMax: 'Höchstalter',
      capacity: 'Plätze',
      price: 'Preis (in Euro)',
      currency: 'Währung',
      location: 'Ort',
      careInfo: 'Betreuung',
      mealsInfo: 'Verpflegung',
      includes: 'Enthaltene Leistungen (eine pro Zeile)',
      status: 'Status',
    },
    hint: {
      primaryColor: 'Hex-Code, z. B. #1c6b45 — bestimmt Balken, Tabs und Buttons.',
      includes: 'Erscheint als Liste auf der öffentlichen Camp-Seite.',
      slugLocked: 'Nicht änderbar — sonst brechen bestehende Links.',
    },
    save: 'Speichern',
    saving: 'Wird gespeichert …',
    saved: 'Gespeichert.',
    saveError: 'Konnte nicht gespeichert werden — Angaben prüfen und erneut versuchen.',
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

/** Gegenstück zu daysUntil für einen Zeitpunkt in der Vergangenheit (z. B.
 * `created_at` einer Warteliste-Anmeldung) — gleiche Kalendertag-Logik
 * (Europe/Berlin), nur mit vertauschten Operanden.
 *
 * Bugfix (Review): `daysUntil`s `target` ist ein reines Datum ("2027-07-05"
 * + "T00:00:00" angehängt) — da steckt keine Zeitzone drin, lokale
 * Date-Getter sind also unproblematisch. `created_at` hier ist dagegen ein
 * echter Zeitstempel MIT Zeitzone (z. B. "...+02:00" vom Server) — `target`
 * ohne dieselbe Europe/Berlin-Konvertierung wie `today` zu lesen, gibt auf
 * einem UTC-Server rund um Mitternacht deutscher Zeit einen Tag daneben. */
export function daysSince(isoDateTime: string): number {
  const now = new Date()
  const berlinNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Berlin' }))
  const today = new Date(berlinNow.getFullYear(), berlinNow.getMonth(), berlinNow.getDate())
  const target = new Date(new Date(isoDateTime).toLocaleString('en-US', { timeZone: 'Europe/Berlin' }))
  const targetDay = new Date(target.getFullYear(), target.getMonth(), target.getDate())
  return Math.round((today.getTime() - targetDay.getTime()) / 86_400_000)
}

export function formatDateRange(startIso: string, endIso: string): string {
  const start = new Date(`${startIso}T00:00:00`)
  const end = new Date(`${endIso}T00:00:00`)
  const day = (d: Date) => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
  const full = end.toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })
  return `${day(start)}.–${full}`
}
