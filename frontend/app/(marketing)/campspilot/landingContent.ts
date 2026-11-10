// Texte der Startseite. Preise und Gebühren stehen NICHT hier, sondern ausschließlich in ../preise/pakete.ts.
export const demoHref = '/demo/verein'
export const dashboardDemoHref = '/demo/dashboard'
export const loginHref = '/campspilot/anmelden'

export const features = [
  { icon: 'calendar', title: 'Camps in Minuten live', text: 'Anlegen, Link teilen, fertig.' },
  { icon: 'card', title: 'Zahlung inklusive', text: 'Online bezahlen, Status automatisch.' },
  { icon: 'palette', title: 'Ihr Verein, Ihr Look', text: 'Logo, Farbe und eigene Fragen.' },
  { icon: 'sheet', title: 'Teilnehmerlisten', text: 'Filtern, drucken, als Excel laden.' },
  { icon: 'people', title: 'Warteliste', text: 'Freie Plätze gehen automatisch weiter.' },
  { icon: 'shield', title: 'DSGVO-bewusst', text: 'Daten pro Verein getrennt, Server in Frankfurt.' },
] as const

export const trust = [
  { icon: 'pin', title: 'Daten in Frankfurt', text: 'Anwendung und Datenbank laufen in Frankfurt am Main.' },
  { icon: 'lock', title: 'Sichere Zahlung', text: 'Abwicklung über Stripe. Kartendaten sehen wir zu keinem Zeitpunkt.' },
  { icon: 'clipboard', title: 'Einwilligungen nachweisbar', text: 'Datenschutz, Gesundheitsangaben und Fotos werden mit Zeitstempel protokolliert.' },
  { icon: 'phone', title: 'Eltern ohne Konto', text: 'Buchen in drei Schritten am Handy, ganz ohne Registrierung.' },
] as const

export const heroFacts = ['Daten in Frankfurt', 'Zahlung über Stripe', 'Eltern buchen ohne Konto'] as const
