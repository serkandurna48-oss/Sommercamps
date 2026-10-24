// Draft pricing: keep all package copy and amounts here for Serkan's decision.
const features = [
  'Anmeldeseite im Vereinsdesign',
  'Bestätigungsmails',
  'Teilnehmerlisten und Export',
  'Einrichtung in unter 15 Minuten',
  'Persönlicher Support',
] as const

export const pakete = [
  { name: 'Start', preis: 199, zielgruppe: 'Für Vereine mit einem Camp in der Saison.', umfang: '1 Camp pro Saison', features },
  { name: 'Verein', preis: 490, zielgruppe: 'Für Vereine mit mehreren Feriencamps.', umfang: 'Bis 5 Camps', features },
  { name: 'Fußballschule', preis: 990, zielgruppe: 'Für Fußballschulen an mehreren Standorten.', umfang: 'Unbegrenzte Camps, mehrere Standorte', features },
] as const

export const preise = {
  entwurf: true,
  navigation: 'Preise',
  titel: 'Ihr Camp. Ihr Paket.',
  einleitung: 'Ein fester Jahrespreis, passend zu Ihrer Campsaison. Alle Pakete enthalten die Funktionen für Anmeldung und Teilnehmerverwaltung.',
  zeitraum: 'pro Jahr',
  waehrung: '€',
  steuerhinweis: 'Alle Preise zzgl. MwSt. Keine Gebühr pro Anmeldung.',
  saisonhinweis: 'Preise gültig für die Saison 2027',
  anfrage: 'Unverbindlich anfragen',
  formular: '/campspilot',
  formularAnker: 'pilot',
  paketParameter: 'paket',
  nachricht: 'Ich interessiere mich für das Paket „{paket}“. Bitte senden Sie mir weitere Informationen.',
  faqTitel: 'Häufige Fragen',
  pilotEinleitung: 'CampsPilot ist im Pilotbetrieb. Erzählen Sie uns von Ihren Camps und Standorten. Gemeinsam klären wir, wie Ihr Verein oder Ihre Fußballschule starten kann.',
} as const

export const faq = [
  { frage: 'Gibt es eine Testphase?', antwort: 'Sprechen Sie uns an. Gemeinsam klären wir, wie Sie CampsPilot kennenlernen können.' },
  { frage: 'Brauchen Eltern ein Konto?', antwort: 'Nein. Eltern melden ihr Kind direkt über die Anmeldeseite an, ohne ein Konto anzulegen.' },
  { frage: 'Können wir unser Vereinslogo und unsere Farben nutzen?', antwort: 'Ja. Ihre Anmeldeseite nutzt Ihr Vereinslogo und Ihre Vereinsfarbe.' },
  { frage: 'Wo liegen die Daten (Deutschland/EU)?', antwort: 'Die Anmeldedaten speichern wir in einer Datenbank mit EU-Hosting. Details zur Verarbeitung finden Sie in der Datenschutzerklärung der jeweiligen Anmeldeseite.' },
  { frage: 'Können wir jederzeit kündigen?', antwort: 'Sprechen Sie uns an. Laufzeit und Kündigungsbedingungen klären wir mit Ihnen vor dem Start.' },
  { frage: 'Wie läuft der Start ab?', antwort: 'Sie senden uns eine unverbindliche Anfrage. Gemeinsam klären wir Ihren Bedarf und die Einrichtung Ihres Vereins.' },
] as const

export function paketAnfrageHref(name: string): string {
  return `${preise.formular}?${preise.paketParameter}=${encodeURIComponent(name)}#${preise.formularAnker}`
}

export function paketNachricht(name: string | null): string {
  const paket = pakete.find((eintrag) => eintrag.name === name)
  return paket ? preise.nachricht.replace('{paket}', paket.name) : ''
}
