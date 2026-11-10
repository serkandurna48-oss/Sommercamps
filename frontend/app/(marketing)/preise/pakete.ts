// Preismodell (Plan P): alle Paketdaten und Preistexte stehen hier. Beträge zzgl. USt.
const features = [
  'Anmeldeseite im Vereinsdesign',
  'Bestätigungsmails',
  'Teilnehmerlisten und Export',
  'Einrichtung in unter 15 Minuten',
  'Persönlicher Support',
] as const

/** Cent als deutscher Eurobetrag, z. B. 2490 -> „24,90 €“, 1494000 -> „14.940,00 €“. */
export function euro(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(Math.round(cents))
  const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${sign}${whole},${String(abs % 100).padStart(2, '0')} €`
}

export const registrierungHref = '/campspilot/registrieren'

export const startSchritte = [
  { titel: 'Verein registrieren', text: 'Legen Sie Ihr Konto an und bestätigen Sie Ihre E-Mail-Adresse.' },
  { titel: 'Wir prüfen und schalten frei', text: 'Reichen Sie Ihren Verein im Konto zur Freigabe ein. Wir prüfen Ihre Angaben manuell und schalten Ihren Verein nach erfolgreicher Prüfung frei.' },
  { titel: 'Camp anlegen und Anmeldelink teilen', text: 'Legen Sie Ihr Camp an, veröffentlichen Sie es und teilen Sie den Anmeldelink mit den Eltern.' },
] as const

const STARTER_BASIS_POINTS = 690
const VEREIN_BASIS_POINTS = 490
const VEREIN_MONAT_CENTS = 2490
const VEREIN_JAHR_CENTS = VEREIN_MONAT_CENTS * 12
const BEISPIEL_KINDER = 20
const BEISPIEL_PREIS_CENTS = 15000
const BEISPIEL_UMSATZ_CENTS = BEISPIEL_KINDER * BEISPIEL_PREIS_CENTS
const percentOf = (cents: number, basisPoints: number) => Math.round((cents * basisPoints) / 10000)

// Ab diesem Buchungsumsatz im Jahr spart der niedrigere Satz die Grundgebühr wieder ein.
const SCHWELLE_CENTS = Math.round((VEREIN_JAHR_CENTS * 10000) / (STARTER_BASIS_POINTS - VEREIN_BASIS_POINTS))

export const rechenbeispiel = {
  kinder: BEISPIEL_KINDER,
  preisJeKind: euro(BEISPIEL_PREIS_CENTS),
  umsatz: euro(BEISPIEL_UMSATZ_CENTS),
  starterGebuehr: euro(percentOf(BEISPIEL_UMSATZ_CENTS, STARTER_BASIS_POINTS)),
  vereinGebuehr: euro(percentOf(BEISPIEL_UMSATZ_CENTS, VEREIN_BASIS_POINTS)),
  vereinGrundgebuehrMonat: euro(VEREIN_MONAT_CENTS),
  vereinGrundgebuehrJahr: euro(VEREIN_JAHR_CENTS),
  schwelleJahresumsatz: euro(SCHWELLE_CENTS),
} as const

export const pakete = [
  {
    name: 'Starter', preis: '0 €', zeitraum: 'pro Monat', buchungsgebuehr: '6,9 % je Buchung, inkl. Zahlungsgebühren',
    zielgruppe: 'Für Vereine, die mit einem Camp starten.', umfang: '1 aktives Camp', features,
  },
  {
    name: 'Verein', preis: '24,90 €', zeitraum: 'pro Monat', buchungsgebuehr: '4,9 % je Buchung, inkl. Zahlungsgebühren',
    zielgruppe: 'Für Vereine mit mehreren Feriencamps.', umfang: 'Unbegrenzt viele Camps · 298,80 € pro Jahr', features,
  },
  {
    name: 'Verband/Individuell', preis: 'Individuell', zeitraum: '', buchungsgebuehr: 'Individuell je Buchung',
    zielgruppe: 'Für Verbände und Fußballschulen mit mehreren Standorten.', umfang: 'Unbegrenzt viele Camps', features,
  },
] as const

export const preise = {
  navigation: 'Preise',
  titel: 'Ihr Camp. Ihr Paket.',
  einleitung: 'Starter hat keine Grundgebühr: Sie zahlen nur, wenn gebucht wird. Wer mehr Camps veranstaltet, wechselt ins Paket Verein.',
  waehrung: '€',
  steuerhinweis: 'Alle Beträge zzgl. USt. Die Gebühr je Buchung enthält die Stripe-Gebühr für Kartenzahlungen mit europäischen Karten (1,5 % + 0,25 €). Für andere Karten berechnet Stripe teils mehr, bei Erstattungen behält Stripe seine Gebühr. Bei Überweisung fallen keine Zahlungsgebühren an.',
  beispielTitel: 'Rechenbeispiel',
  anfrage: 'Unverbindlich anfragen',
  formular: '/campspilot',
  formularAnker: 'pilot',
  paketParameter: 'paket',
  nachricht: 'Ich interessiere mich für das Paket „{paket}“. Bitte senden Sie mir weitere Informationen.',
  faqTitel: 'Häufige Fragen',
  pilotEinleitung: 'Registrieren Sie Ihren Verein direkt. Nach der E-Mail-Bestätigung reichen Sie ihn im Konto zur manuellen Prüfung ein. Wenn Sie vorher Fragen haben, können Sie uns unverbindlich anfragen.',
} as const

export const faq = [
  { frage: 'Gibt es eine Testphase?', antwort: 'Starter hat keine Grundgebühr, Sie zahlen nur bei Buchungen.' },
  { frage: 'Brauchen Eltern ein Konto?', antwort: 'Nein. Eltern melden ihr Kind direkt über die Anmeldeseite an, ohne ein Konto anzulegen.' },
  { frage: 'Können wir unser Vereinslogo und unsere Farben nutzen?', antwort: 'Ja. Ihre Anmeldeseite nutzt Ihr Vereinslogo und Ihre Vereinsfarbe.' },
  { frage: 'Wo liegen die Daten (Deutschland/EU)?', antwort: 'Die Anmeldedaten speichern wir in einer Datenbank mit EU-Hosting. Details zur Verarbeitung finden Sie in der Datenschutzerklärung der jeweiligen Anmeldeseite.' },
  { frage: 'Können wir jederzeit kündigen?', antwort: 'Sprechen Sie uns an. Laufzeit und Kündigungsbedingungen klären wir mit Ihnen vor dem Start.' },
  { frage: 'Wie läuft der Start ab?', antwort: '1) Verein registrieren: Konto anlegen und E-Mail bestätigen; 2) zur Freigabe einreichen: Wir prüfen Ihre Angaben manuell und schalten Ihren Verein nach erfolgreicher Prüfung frei; 3) Camp anlegen, veröffentlichen und den Anmeldelink mit den Eltern teilen.' },
] as const

export function paketAnfrageHref(name: string): string {
  return `${preise.formular}?${preise.paketParameter}=${encodeURIComponent(name)}#${preise.formularAnker}`
}

export function paketNachricht(name: string | null): string {
  const paket = pakete.find((eintrag) => eintrag.name === name)
  return paket ? preise.nachricht.replace('{paket}', paket.name) : ''
}
