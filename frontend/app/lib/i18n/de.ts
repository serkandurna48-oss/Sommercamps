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
  adminActions: {
    reviewNote: 'Bitte geben Sie einen Ablehnungsgrund ein (mindestens 10 Zeichen).',
    sessionExpired: "Sitzung abgelaufen – bitte neu anmelden.",
    saveFailed: "Konnte nicht gespeichert werden – erneut versuchen.",
    noCapacity: "Kein freier Platz gerade – später erneut versuchen.",
    promoted: "Platz vergeben.",
    promoteFailed: "Konnte nicht aufrücken – erneut versuchen.",
    cancelled: "Anmeldung storniert.",
    cancelFailed: "Konnte nicht storniert werden – erneut versuchen.",
    namesRequired: "Vor- und Nachname dürfen nicht leer sein.",
    detailsFailed: "Konnte nicht gespeichert werden – Angaben prüfen und erneut versuchen.",
    mailResent: "Mail erneut gesendet.",
    mailResendFailed: "Mail konnte nicht gesendet werden – Adresse prüfen oder Familie direkt kontaktieren.",
  },
  adminApi: {
    auth: "Admin-Sitzung abgelaufen oder ungültig",
    action: "Aktion konnte nicht ausgeführt werden",
    organizationLoad: "Verein konnte nicht geladen werden",
    organizationsLoad: "Vereine konnten nicht geladen werden",
    organizationCreate: "Verein konnte nicht angelegt werden",
    campCreate: "Camp konnte nicht angelegt werden",
    statsLoad: "Kennzahlen konnten nicht geladen werden",
    registrationsLoad: "Anmeldungen konnten nicht geladen werden",
    auditLoad: "Änderungsverlauf konnte nicht geladen werden",
    membersLoad: "Zugriffsliste konnte nicht geladen werden",
    accountMissing: "Für diese E-Mail existiert noch kein Konto",
    memberAdd: "Zugriff konnte nicht zugewiesen werden",
    memberRemove: "Zugriff konnte nicht entfernt werden",
    reviewSave: "Freigabe konnte nicht gespeichert werden",
    reviewSubmit: "Einreichung nicht möglich",
    reviewConflict: 'Entscheidung nicht möglich: Verein ist nicht im Status „eingereicht“',
    campsLoad: "Camps konnten nicht geladen werden",
    slugConflict: (slug: string) => `Slug '${slug}' ist bereits vergeben`,
  },
  dashboard: {
    kicker: 'CampsPilot',
    nextCamp: 'Nächstes Camp',
    allCamps: 'Alle Camps',
    yourCamps: 'Ihre Camps',
    pastCamps: (n: number) => `Vergangene Camps (${n})`,
    otherCamps: (n: number) => `Geschlossene und archivierte Camps (${n})`,
    drafts: 'Entwürfe',
    draftHint: 'Entwurf – noch nicht sichtbar',
    publishCamp: 'Veröffentlichen',
    openCamp: 'Zum Camp',
    locationMissing: 'Ort noch nicht hinterlegt',
    occupiedPlaces: (filled: number, total: number) => `${filled} von ${total} Plätzen belegt`,
    almostFull: 'fast voll',
    fullyBooked: 'ausgebucht',
    waitingPlaces: (n: number) => `${n} auf der Warteliste`,
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
    errorBody: 'Die Daten konnten nicht geladen werden. Bitte versuchen Sie es in einigen Sekunden erneut.',
    retry: 'Erneut versuchen',
    dashboard: 'Zum Dashboard',
    serverRestarting: 'Der Server startet gerade neu. Bitte in einigen Sekunden erneut versuchen.',
    offline: 'Keine Verbindung – bitte Internet prüfen.',
    networkError: 'Die Verbindung zum Server ist unterbrochen. Bitte versuchen Sie es in einigen Sekunden erneut.',
  },
  adminRoute: {
    organization: 'Verein',
    campOverview: 'Camp-Übersicht',
    campConfiguration: 'Camp-Einstellungen',
    titles: {
      dashboard: 'Übersicht',
      zahlungen: 'Zahlungen',
      warteliste: 'Warteliste',
      aufgaben: 'Aufgaben',
      anmeldungen: 'Neue Anmeldungen heute',
      new: 'Neues Camp',
      konfiguration: 'Vereinseinstellungen',
      einrichtung: 'Einrichtung',
      hilfe: 'Hilfe',
    },
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
    step1Body: 'Tragen Sie Kontakt-E-Mail, Anschrift und Teilnahmebedingungen ein. IBAN ist optional.',
    step1Action: 'Angaben ergänzen',
    step2Title: 'Erstes Camp anlegen',
    step2Body: 'Erstellen Sie Ihr erstes Camp mit Termin und Preisangabe.',
    step2Action: 'Camp anlegen',
    step3Title: 'Seite und Camp veröffentlichen',
    step3Body: 'Veröffentlichen Sie Ihre Vereinsseite und das Camp – dann können sich Eltern anmelden.',
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
    reviewPendingTitle: 'Ihr Verein wartet auf Freigabe',
    reviewPendingHint: 'Sie müssen nichts erneut einreichen. Prüfen Sie hier den Status. Nach der Freigabe können Sie Ihre Vereinsseite und Ihr Camp veröffentlichen.',
    reviewRefresh: 'Freigabestatus aktualisieren',
    reviewHelp: 'Hilfe zur Einrichtung',
    reviewError: 'Die Angaben konnten nicht eingereicht werden. Bitte versuchen Sie es erneut.',
    reviewRejectedPrefix: 'Ablehnungsgrund:',
    missingFieldsHint: (fields: string[]) => `Angaben fehlen noch: ${fields.join(', ')}.`,
    missingFieldsAction: 'Ergänzen',
    liveLabel: 'Ihre Anmeldeseite ist live.',
    liveOpen: 'Elternseite ansehen',
    liveCopyLink: 'Anmeldelink kopieren',
    liveShareHint: 'Kopieren Sie diesen Link und teilen Sie ihn mit den Eltern. Dort wählen sie ein Camp und melden ihr Kind an.',
    liveCopied: 'Anmeldelink kopiert.',
    liveCopyError: 'Kopieren nicht möglich. Bitte öffnen Sie die Elternseite und kopieren Sie dort die Adresse aus Ihrem Browser.',
    publicationNext: 'Weiter zur Camp-Übersicht',
    publicationHint: 'Auf der Elternseite erscheinen nur veröffentlichte Camps. Prüfen Sie Ihr Camp in der Übersicht, bevor Sie den Link teilen.',
  },
  hilfe: {
    title: 'Hilfe',
    contents: 'Auf dieser Seite',
    s1: 'Einrichtung in 4 Schritten',
    s2: 'Camp anlegen und veröffentlichen',
    s3: 'Anmeldelink teilen',
    s4: 'Zahlungen prüfen und als bezahlt markieren',
    s5: 'Warteliste und Storno',
    s6: 'Tagesliste exportieren',
    s7: 'Häufige Eltern-Fragen',
    s8: 'Viele Camps an mehreren Orten',
    setupIntro: 'Der Einrichtungsassistent führt Sie durch die Vorbereitung Ihrer Vereinsseite.',
    setupSteps: [
      { title: 'Auftritt', text: 'Tragen Sie den Vereinsnamen ein und wählen Sie Logo und Vereinsfarbe.' },
      { title: 'Rechtliches', text: 'Ergänzen Sie Kontakt-E-Mail, Anschrift und Teilnahmebedingungen. Eine Vorlage können Sie einfügen und an Ihren Verein anpassen.' },
      { title: 'Erstes Camp', text: 'Legen Sie Ihr erstes Camp mit Titel, Termin, Kapazität und Preis an. Ein bereits angelegtes Camp können Sie bearbeiten.' },
      { title: 'Prüfen und einreichen', text: 'Prüfen Sie die Pflichtangaben und die Elternseite. Klicken Sie auf „Zur Freigabe einreichen“, bestätigen Sie den Auftragsverarbeitungsvertrag und reichen Sie die Angaben ein.' },
    ],
    setupReview: 'Nach dem Einreichen prüfen wir Ihren Verein innerhalb eines Werktags. Währenddessen sehen Sie den Prüfstatus. Falls Angaben fehlen, erhalten Sie einen Hinweis zur Korrektur und können erneut einreichen. Nach der Freigabe können Sie Vereinsseite und Camps veröffentlichen.',
    campSteps: [
      'Klicken Sie in der Übersicht auf „+ Camp anlegen“.',
      'Tragen Sie Titel, Termin, Kapazität und Preis ein und speichern Sie das Camp.',
      'Öffnen Sie im Camp den Tab „Einstellungen“, prüfen Sie Ort und Anmeldezeitraum und klicken Sie im Bereich „Veröffentlichung“ auf „Camp veröffentlichen“.',
      'Veröffentlichen Sie nach der Freigabe auch Ihre Vereinsseite unter „Einstellungen“ mit „Vereinsseite veröffentlichen“.',
    ],
    campPublished: 'Eltern sehen Ihre Camps, wenn Vereinsseite und Camp veröffentlicht sind. Anmeldungen sind innerhalb des eingestellten Anmeldezeitraums möglich.',
    filterIntro: 'Ab 7 Camps auf Ihrer öffentlichen Vereinsseite erscheint der Filter nach Ort und Ferienzeitraum. Bei bis zu 6 Camps bleibt die Liste ohne Filter sichtbar.',
    filterDetails: 'Eltern können einen Ort und einen oder mehrere Zeiträume auswählen. Die Zeiträume richten sich nach dem Startmonat des Camps. Mit „Filter zurücksetzen“ werden wieder alle Camps angezeigt.',
    filterShare: 'Wählen Sie die gewünschten Filter auf der Elternseite und kopieren Sie anschließend die vollständige Adresse aus dem Browser. So können Sie einen bereits gefilterten Link teilen, zum Beispiel mit ?ort=Kassel oder ?ort=Kassel&zeit=sommer.',
    linkLabel: 'Ihr Anmeldelink:',
    linkPath: (orgSlug: string) => `/pilot/${orgSlug}`,
    linkHint: 'Kopieren Sie den vollständigen Anmeldelink mit Domain aus der Übersicht. Ersetzen Sie vor dem Versenden den relativen Pfad in den folgenden Vorlagen durch diesen vollständigen Link.',
    whatsappHeading: 'WhatsApp-Vorlage',
    instagramHeading: 'Instagram / Facebook',
    paymentIntro: 'Jede Anmeldung erhält automatisch eine CP-Referenz, zum Beispiel CP-ABC12345. Diese geben die Eltern bei der Überweisung als Verwendungszweck an.',
    paymentSteps: [
      'Öffnen Sie die Seite „Zahlungen“.',
      'Suchen Sie die Anmeldung anhand der CP-Referenz oder des Namens.',
      'Sobald die Überweisung auf Ihrem Konto eingegangen ist, klicken Sie auf „Als bezahlt markieren“.',
    ],
    waitlistItems: [
      'Wenn ein Camp voll ist, können Eltern ihr Kind auf der Warteliste anmelden.',
      'Wenn durch eine Stornierung ein Platz frei wird, rückt das nächste Kind auf der Warteliste automatisch nach.',
      'Informieren Sie die Eltern selbst über das Nachrücken. Es gibt keine automatische Benachrichtigung.',
      'Zum Stornieren öffnen Sie im Camp die Teilnehmerliste, wählen die Anmeldung aus und klicken auf „Stornieren“.',
    ],
    exportSteps: [
      'Öffnen Sie im Camp den Tab „Teilnehmer“.',
      'Klicken Sie auf „Exportieren“ und wählen Sie „Camp-Tagesliste“.',
      'Wählen Sie „Als CSV“, „Als Excel“ oder „PDF / Drucken“.',
    ],
    exportHint: 'Die Tagesliste enthält angemeldete und bestätigte Teilnehmende ohne Warteliste und Stornierungen. Aktive Suche und Filter begrenzen auch den Export. Setzen Sie diese zurück, wenn Sie die vollständige Tagesliste benötigen. Die Auswahl einzelner Checkboxen beeinflusst den Export nicht.',
    faqIntro: 'Kurze Antworten, die Sie an Eltern weitergeben können. Prüfen Sie vor dem Weitergeben, ob die Angaben zu Ihrem Camp passen.',
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
        a: 'Schreiben Sie dem Camp-Team eine E-Mail. Der Verein informiert Sie über das weitere Vorgehen und die für Ihr Camp geltenden Bedingungen.',
      },
      {
        q: 'Kommen Kinder ohne Vereinsmitgliedschaft?',
        a: 'Ob eine Vereinsmitgliedschaft erforderlich ist, erfahren Sie beim Camp-Team. Bitte beachten Sie auch die Altersangaben und Teilnahmebedingungen des jeweiligen Camps.',
      },
      {
        q: 'Wie erreiche ich das Camp-Team?',
        a: 'Die Kontaktadresse des Vereins finden Sie am Ende der Anmeldeseite.',
      },
    ],
  },
  einrichtung: {
    title: 'Einrichtungsassistent',
    stepOf: (step: number, total: number) => `Schritt ${step} von ${total}`,
    back: 'Zurück',
    weiter: 'Weiter',
    weiterSaving: 'Wird gespeichert …',
    step1Title: 'Auftritt',
    step1Kicker: 'So sieht Ihr Verein auf der Anmeldeseite aus.',
    step2Title: 'Rechtliches',
    step2Kicker: 'Kontakt-E-Mail, Anschrift und Teilnahmebedingungen für Ihre Vereinsseite.',
    step3Title: 'Erstes Camp',
    step3Kicker: 'Das erste Camp anlegen.',
    step3DoneHint: 'Das erste Camp ist angelegt. Im nächsten Schritt geht es zur Freigabe.',
    step3EditLink: 'Camp bearbeiten',
    step4Title: 'Prüfen und einreichen',
    step4Kicker: 'Alle Pflichtangaben auf einen Blick – dann zur Freigabe einreichen.',
    checklistTitle: 'Pflichtangaben',
    checklistDoneLabel: 'Vollständig',
    checklistOpenLabel: 'Fehlt',
    ergaenzen: 'ergänzen',
    previewLink: 'Elternseite ansehen',
    pendingBanner: 'Wir prüfen Ihren Verein, meist innerhalb eines Werktags.',
    approvedBanner: 'Ihr Verein ist freigegeben.',
    dashboardLink: 'Zum Dashboard',
    publishSite: 'Vereinsseite veröffentlichen',
    publishCamp: 'Camp prüfen und veröffentlichen',
    unpublishedHint: 'Die Elternseite ist erst nach der Veröffentlichung erreichbar. Prüfen Sie bis dahin Ihre Angaben hier im Einrichtungsassistenten.',
    continueSetup: 'Weiter zur Einrichtung und Freigabe',
    continueSetupHint: 'Speichern Sie zuerst Ihre Camp-Angaben. Gehen Sie anschließend zurück zur Einrichtung, um die Freigabe vorzubereiten oder den Prüfstatus anzusehen.',
    vorlagenBtn: 'Vorlage einfügen',
    vorlagenHint: 'Bitte prüfen und anpassen – diese Vorlage ist kein Rechtsrat.',
    previewLabel: 'Vorschau',
    previewBtnExample: 'Jetzt anmelden',
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
      { num: '1', title: 'Platz wählen', body: 'Suchen Sie den Termin, der passt, und klicken Sie auf „Platz sichern”.' },
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
