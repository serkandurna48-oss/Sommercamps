/**
 * Verwendungszweck für eine Anmeldung.
 * Format: "Sommercamp Vorname Nachname"
 *
 * Bankdaten (IBAN, BIC etc.) kommen aus der Backend-API-Antwort (POST /registrations).
 * Sie werden nicht im Frontend hardcodiert – nur das Backend kennt die Env-Vars.
 */
export function bankPurpose(childFirstName: string, childLastName: string): string {
  return `Sommercamp ${childFirstName} ${childLastName}`.trim()
}
