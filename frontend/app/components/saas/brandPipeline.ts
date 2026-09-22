/**
 * Mandanten-Farbpipeline für das Org-Admin-Dashboard — Auftrag Abschnitt 3.3.
 *
 * Dünner Wrapper um die geteilte, beidseitige Pipeline in app/lib/brandPipeline.ts (Ticket
 * "CampsPilot Eltern-Flow (Vereins-Themes)" §5: "Dieselbe Funktion wie im Dashboard... wenn
 * noch nicht extrahiert, jetzt in ein geteiltes Modul ziehen"). Das Dashboard rendert immer
 * auf hellem Papiergrund (--cp-paper), lässt also nur die Abwärts-Richtung laufen — die
 * Bidirektionalität selbst lebt zentral im geteilten Modul, nicht hier.
 *
 * --cp-brand-tint bleibt bewusst eine CSS color-mix()-Expression in tokens.css statt hier
 * berechnet — die Tabelle in 3.3 schreibt sie selbst schon als CSS-Funktion, nicht als
 * Algorithmus.
 */

import { computeBrandSafe, __internal as sharedInternal } from '../../lib/brandPipeline'

// Muss mit --cp-paper in tokens.css übereinstimmen.
const PAPER_HEX = '#F4F5F2'

export interface BrandTokens {
  /** Nur für textfreie Flächen: Tab-Unterstrich, Belegungsbalken, Band-Kante. */
  brand: string
  /** Text, Links, Primärbutton-Fläche — garantiert >=4.5:1 gegen --cp-paper. */
  brandStrong: string
  /** Beschriftung auf der Primärbutton-Fläche (Weiß oder Fast-Schwarz). */
  brandOn: string
}

export function computeBrandTokens(primaryColor: string | null | undefined): BrandTokens {
  const result = computeBrandSafe(primaryColor, PAPER_HEX)
  return {
    brand: result.brand,
    brandStrong: result.strong,
    brandOn: result.on,
  }
}

// Nur für Tests.
export const __internal = sharedInternal
