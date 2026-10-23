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
    openPaymentsLabel: 'Zahlungen offen',
    waitlistLabel: 'Warteliste',
  },
  tasks: {
    payment: {
      title: (count: number, campTitle: string) =>
        count === 1
          ? `Eine offene Zahlung für „${campTitle}“`
          : `${count} offene Zahlungen für „${campTitle}“`,
      hint: 'Zahlung ist noch offen – kurze Erinnerung schicken.',
    },
    missingContact: {
      title: (count: number, campTitle: string) =>
        count === 1
          ? `Ein Notfallkontakt fehlt bei „${campTitle}“`
          : `${count} Notfallkontakte fehlen bei „${campTitle}“`,
      hint: 'Vor Camp-Start nachfragen.',
    },
    waitlist: {
      title: (count: number, campTitle: string) =>
        count === 1
          ? `Eine Anmeldung wartet bei „${campTitle}“ auf einen Platz`
          : `${count} Anmeldungen warten bei „${campTitle}“ auf einen Platz`,
      hint: 'Beim Nachrücken werden die Eltern nicht automatisch benachrichtigt. Der Verein meldet sich bei ihnen.',
    },
    review: 'Ansehen',
    markDone: 'Erledigt',
    allDone: 'Alles erledigt – nichts steht gerade an.',
  },
  command: {
    participants: 'Teilnehmer',
    payments: 'Zahlungen',
    waitlist: 'Warteliste',
    tasks: 'Aufgaben',
    configuration: 'Einstellungen',
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
    hasAllergies: 'Allergien/Hinweise eingetragen – vor dem Camp prüfen',
    editParticipant: 'Bearbeiten',
    editParticipantCancel: 'Abbrechen',
    editParticipantSave: 'Speichern',
    editParticipantSaving: 'Wird gespeichert …',
    editParticipantSaved: 'Gespeichert.',
    fieldChildFirstName: 'Vorname',
    fieldChildLastName: 'Nachname',
    fieldJerseySize: 'Trikotgröße',
    fieldAllergies: 'Allergien',
    fieldPickupAuthorized: 'Abholberechtigte',
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
    emptyOrg: 'Alles erledigt – über alle Camps steht gerade nichts an.',
    emptyCamp: 'Für dieses Camp steht gerade nichts an.',
    emptyFiltered: 'Kein Ergebnis für diese Auswahl.',
  },
  waitlistPage: {
    heading: 'Warteliste',
    subtitleOrg: 'Über alle Camps',
    position: (n: number) => `Platz ${n}`,
    waitingSince: (days: number) => (days < 0 ? 'Anmeldedatum liegt in der Zukunft' : days === 0 ? 'wartet seit heute' : days === 1 ? 'wartet seit 1 Tag' : `wartet seit ${days} Tagen`),
    familiesWaiting: (n: number) => (n === 1 ? '1 Familie wartet' : `${n} Familien warten`),
    promote: (name: string) => `Platz an ${name} vergeben`,
    promoting: 'Wird vergeben …',
    promoteHint: 'Beim Nachrücken werden die Eltern nicht automatisch benachrichtigt. Der Verein meldet sich bei ihnen.',
    promoteNoCapacity: 'Alle Plätze belegt – nach einer Stornierung rückt das nächste Kind automatisch nach.',
    promoteSuccess: (name: string) => `${name} ist jetzt angemeldet.`,
    promoteError: 'Konnte nicht aufrücken – erneut versuchen.',
    emptyOrg: 'Aktuell wartet niemand auf einen Platz.',
    emptyCamp: 'Niemand wartet gerade auf einen Platz bei diesem Camp.',
  },
  paymentsPage: {
    heading: 'Zahlungen',
    subtitleOrg: 'Über alle Camps',
    collected: 'Als bezahlt markiert',
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
    updateError: 'Konnte nicht gespeichert werden – erneut versuchen.',
    emptyOrg: 'Aktuell keine Zahlungen erfasst.',
    emptyCamp: 'Für dieses Camp liegen noch keine Anmeldungen vor.',
    emptyFiltered: 'Kein Ergebnis für diese Auswahl.',
  },
  onboarding: {
    cardTitle: 'In 3 Schritten zur Anmeldeseite',
    step1Title: 'Vereinsangaben vervollständigen',
    step1Body: 'Trag Kontakt-E-Mail, Anschrift und Teilnahmebedingungen ein. IBAN ist optional.',
    step1Action: 'Angaben ergänzen',
    step2Title: 'Erstes Camp anlegen',
    step2Body: 'Erstelle dein erstes Camp mit Termin und Preisangabe.',
    step2Action: 'Camp anlegen',
    step3Title: 'Seite und Camp veröffentlichen',
    step3Body: 'Veröffentliche deine Vereinsseite und das Camp – dann können sich Eltern anmelden.',
    step3Action: 'Jetzt veröffentlichen',
    step3TitleSubmit: 'Zur Freigabe einreichen',
    step3BodySubmit: 'Reichen Sie Ihren Verein zur Prüfung ein – wir melden uns meist innerhalb eines Werktags.',
    step3ActionSubmit: 'Zur Freigabe einreichen',
    reviewDialogAvvHint: 'Mit dem Einreichen stimmen Sie dem Auftragsverarbeitungsvertrag (Version 2026-10) zu.',
    reviewDialogAvvLabel: 'Ich stimme dem Auftragsverarbeitungsvertrag (Version 2026-10) zu.',
    reviewDialogSubmit: 'Jetzt einreichen',
    reviewDialogSubmitting: 'Wird eingereicht …',
    reviewDialogCancel: 'Abbrechen',
    reviewPendingBanner: 'Wir prüfen Ihren Verein, meist innerhalb eines Werktags.',
    reviewRejectedPrefix: 'Ablehnungsgrund:',
    missingFieldsHint: (fields: string[]) => `Angaben fehlen noch: ${fields.join(', ')}.`,
    missingFieldsAction: 'Ergänzen',
    liveLabel: 'Deine Anmeldeseite ist live.',
    liveOpen: 'Elternseite ansehen',
    liveCopyLink: 'Anmeldelink kopieren',
  },
  hilfe: {
    title: 'Hilfe',
    s1: 'In 3 Schritten zur Anmeldeseite',
    s2: 'Camp anlegen und veröffentlichen',
    s3: 'Anmeldelink teilen',
    s4: 'Zahlungen prüfen und als bezahlt markieren',
    s5: 'Warteliste und Storno',
    s6: 'Tagesliste exportieren',
    s7: 'Häufige Eltern-Fragen',
    whatsappTemplate: (orgSlug: string) =>
      `Liebe Eltern,\n\nunsere Camp-Anmeldung ist jetzt offen. Bitte melden Sie Ihr Kind unter folgendem Link an:\n/pilot/${orgSlug}\n\nBei Fragen melden Sie sich gerne bei uns.\n\nHerzliche Grüße`,
    instagramTemplate: (orgSlug: string) =>
      `Unsere Camp-Anmeldung ist geöffnet! Jetzt anmelden: /pilot/${orgSlug} – Bei Fragen sind wir gerne für Sie da.`,
    faq: [
      {
        q: 'Wie läuft die Bezahlung ab?',
        a: 'Bei einem reservierten Platz erhalten Sie eine Anmeldebestätigung mit einem Verwendungszweck (z. B. CP-ABC12345). Bitte überweisen Sie den Camppreis auf das Vereinskonto. Auf der Warteliste entstehen noch keine Kosten.',
      },
      {
        q: 'Mein Kind steht auf der Warteliste – wann gibt es eine Rückmeldung?',
        a: 'Der Verein meldet sich bei Ihnen, sobald ein Platz frei wird. Es gibt keine automatische Benachrichtigung.',
      },
      {
        q: 'Wie kann ich eine Anmeldung stornieren?',
        a: 'Schreiben Sie dem Camp-Team eine E-Mail. Die Stornobedingungen stehen in den Teilnahmebedingungen.',
      },
      {
        q: 'Kommen Kinder ohne Vereinsmitgliedschaft?',
        a: 'Ja, die Camps stehen allen Kindern offen – eine Mitgliedschaft ist nicht erforderlich.',
      },
      {
        q: 'Wie erreiche ich das Camp-Team?',
        a: 'Die Kontaktadresse des Vereins finden Sie am Ende der Anmeldeseite.',
      },
    ],
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
      primaryColor: 'Hex-Code, z. B. #1c6b45 – bestimmt Balken, Tabs und Buttons.',
      includes: 'Erscheint als Liste auf der öffentlichen Camp-Seite.',
      slugLocked: 'Nicht änderbar – sonst brechen bestehende Links.',
    },
    save: 'Speichern',
    saving: 'Wird gespeichert …',
    saved: 'Gespeichert.',
    saveError: 'Konnte nicht gespeichert werden – Angaben prüfen und erneut versuchen.',
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
export function daysSince(isoDateTime: string, now = new Date()): number {
  const berlinNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Berlin' }))
  const today = new Date(berlinNow.getFullYear(), berlinNow.getMonth(), berlinNow.getDate())
  const target = new Date(new Date(isoDateTime).toLocaleString('en-US', { timeZone: 'Europe/Berlin' }))
  const targetDay = new Date(target.getFullYear(), target.getMonth(), target.getDate())
  return Math.round((today.getTime() - targetDay.getTime()) / 86_400_000)
}

/** Check the instant before clamping calendar days, including later today. */
export function waitingSince(isoDateTime: string, now = new Date()): string {
  const timestamp = new Date(isoDateTime).getTime()
  if (!Number.isFinite(timestamp)) return 'Anmeldedatum unbekannt'
  if (timestamp > now.getTime()) return 'Anmeldedatum liegt in der Zukunft'
  return de.waitlistPage.waitingSince(Math.max(0, daysSince(isoDateTime, now)))
}

export function formatDateRange(startIso: string, endIso: string): string {
  const [sy, sm, sd] = startIso.split('-').map(Number)
  const [ey, em, ed] = endIso.split('-').map(Number)
  const months = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.']
  const end = `${ed}. ${months[em - 1]} ${ey}`
  if (startIso === endIso) return end
  const start = sy !== ey ? `${sd}. ${months[sm - 1]} ${sy}` : sm !== em ? `${sd}. ${months[sm - 1]}` : `${sd}.`
  return `${start}–${end}`
}

const dateOptions = { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' } as const
const timeOptions = { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' } as const

/** Date-only values stay calendar dates; timestamps are displayed in German time. */
export function formatDate(value: string | Date): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unbekannt' : new Intl.DateTimeFormat('de-DE', dateOptions).format(date)
}

export function formatDateTime(value: string | Date): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unbekannt' : `${formatDate(date)}, ${formatTime(date)}`
}

export function formatTime(value: string | Date): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unbekannt' : new Intl.DateTimeFormat('de-DE', timeOptions).format(date)
}

/** ISO day key for comparisons and native date inputs, never a display format. */
export function berlinDay(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', dateOptions).formatToParts(date)
  const part = (type: string) => parts.find(p => p.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function formatRelativeDateTime(value: string | Date, now = new Date()): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unbekannt'
  return berlinDay(date) === berlinDay(now) ? `heute, ${formatTime(date)}` : formatDateTime(date)
}

/** Vereinsneutrale Texte für die öffentliche Org-Seite (Parent Flow) */
export const publicUI = {
  trainer: {
    heading: 'Ihr Trainer',
  },
  howItWorks: {
    heading: 'So einfach geht\'s',
    steps: [
      { num: '1', title: 'Platz wählen', body: 'Suchen Sie den Termin, der passt, und klicken Sie auf „Ansehen“.' },
      { num: '2', title: 'Anmelden', body: 'Füllen Sie das Formular in ca. 4 Minuten aus – kein Konto nötig.' },
      { num: '3', title: 'Bestätigung', body: 'Sie erhalten Ihre Anmeldebestätigung mit allen Infos zum Camp.' },
    ],
  },
  faq: [
    { q: 'Wie läuft die Bezahlung ab?', a: 'Die Bestätigung zeigt Ihnen, ob ein Platz reserviert ist oder Ihr Kind auf der Warteliste steht. Bei einem reservierten Platz überweisen Sie mit dem angegebenen Verwendungszweck. Falls keine Bankdaten hinterlegt sind, meldet sich der Verein zur Zahlung. Auf der Warteliste entstehen noch keine Kosten.' },
    { q: 'Was passiert, wenn ein Camp ausgebucht ist?', a: 'Sie können sich auf die Warteliste setzen. Sobald ein Platz frei wird, rückt das nächste Kind automatisch nach. Es wird keine automatische E-Mail versendet; der Verein meldet sich bei Ihnen, wenn Ihr Kind einen Platz erhält.' },
    { q: 'Wie kann ich stornieren?', a: 'Schreiben Sie dem Camp-Team einfach eine E-Mail. Die genauen Stornobedingungen stehen in den Teilnahmebedingungen.' },
    { q: 'Wer darf mein Kind abholen?', a: 'Die abholberechtigten Personen geben Sie direkt im Anmeldeformular an. Bitte halten Sie bei der Abholung einen Lichtbildausweis bereit.' },
    { q: 'Wie erreiche ich das Camp-Team?', a: 'Die E-Mail-Adresse des Vereins finden Sie am Ende dieser Seite. Wir antworten in der Regel am selben Tag.' },
    { q: 'Kommen Kinder ohne Vereinsmitgliedschaft?', a: 'Ja, die Camps stehen allen Kindern offen – eine Mitgliedschaft ist nicht erforderlich.' },
  ],
}
