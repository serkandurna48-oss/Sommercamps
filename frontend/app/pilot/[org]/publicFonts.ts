/**
 * Schriften für den öffentlichen Eltern-Flow — Ticket §4.
 *
 * next/font/google statt next/font/local: Next.js lädt und hostet die Dateien selbst zur
 * Buildzeit (kein Request des Eltern-Browsers an fonts.gstatic.com, keine IP-Weitergabe an
 * Google zur Laufzeit) — dasselbe Ziel, das next/font/local verfolgen würde, ohne Font-Dateien
 * manuell ins Repo ziehen zu müssen. Gleiches Muster wie components/saas/fonts.ts für das
 * Dashboard.
 *
 * "Nur laden, was das aktive Theme braucht": jedes Theme bekommt sein eigenes next/font-Objekt;
 * (org-admin: server-rendertes) publicTheme wendet serverseitig nur die className/Variable des
 * tatsächlichen org.theme an — die anderen beiden werden für diese Anfrage nie referenziert.
 */
import { Archivo, Fraunces, Space_Grotesk } from 'next/font/google'

// tradition: Anzeigeschrift Fraunces (opsz, wght 400–700), Bedienschrift Archivo (wdth 75–125, wght 400–800)
export const fraunces = Fraunces({
  variable: '--font-cp-public-display',
  subsets: ['latin'],
  axes: ['opsz'],
  weight: 'variable',
  display: 'swap',
})

export const archivoTradition = Archivo({
  variable: '--font-cp-public-ui',
  subsets: ['latin'],
  axes: ['wdth'],
  weight: 'variable',
  display: 'swap',
})

// akademie: eine variable Familie (Archivo) trägt Anzeige- und Bedienschrift.
export const archivoAkademie = Archivo({
  variable: '--font-cp-public-akademie',
  subsets: ['latin'],
  axes: ['wdth'],
  weight: 'variable',
  display: 'swap',
})

// kompakt: eine Familie (Space Grotesk) für Anzeige und Bedienung.
export const spaceGrotesk = Space_Grotesk({
  variable: '--font-cp-public-kompakt',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
})

export type PublicTheme = 'tradition' | 'akademie' | 'kompakt'

/** Nur die für das aktive Theme nötigen CSS-Variablen-Klassen — nie alle drei gleichzeitig. */
export function publicFontClassName(theme: PublicTheme): string {
  switch (theme) {
    case 'tradition':
      return `${fraunces.variable} ${archivoTradition.variable}`
    case 'akademie':
      return archivoAkademie.variable
    case 'kompakt':
      return spaceGrotesk.variable
  }
}
