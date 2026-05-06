/**
 * Zentrale Bankdaten für Überweisungshinweise.
 * Bitte vor dem Go-Live mit echten Werten befüllen.
 */
export const BANK_CONFIG = {
  accountHolder: '[noch einfügen]',
  iban:          '[noch einfügen]',
  bic:           '[noch einfügen]',
  bank:          '[noch einfügen]',
} as const

/**
 * Verwendungszweck für eine Anmeldung.
 * Format: "Sommercamp Vorname Nachname"
 */
export function bankPurpose(childFirstName: string, childLastName: string): string {
  return `Sommercamp ${childFirstName} ${childLastName}`.trim()
}
