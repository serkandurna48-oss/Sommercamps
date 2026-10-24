/** Never surface raw upstream text (which may be English or contain internals). */
export function submitErrorMessage(status: number): string {
  if (status === 0) return 'Die Verbindung zum Server ist fehlgeschlagen; der Anmeldestatus ist unklar. Bitte prüfen Sie Ihre Verbindung und versuchen Sie es erneut.'
  if (status === 404) return 'Dieses Camp ist nicht mehr verfügbar. Bitte wählen Sie einen anderen Termin aus der Camp-Übersicht.'
  if (status === 409) return 'Für dieses Kind liegt für dieses Camp bereits eine Anmeldung vor. Bitte wenden Sie sich bei Fragen an den Verein.'
  if (status === 422) return 'Die Anmeldung konnte mit diesen Angaben nicht abgeschlossen werden. Bitte prüfen Sie Ihre Angaben und die Anmeldefrist des Camps.'
  if (status === 429) return 'Es wurden zu viele Anmeldeversuche in kurzer Zeit gesendet. Bitte warten Sie einen Moment und versuchen Sie es erneut.'
  return 'Der Server konnte die Anmeldung nicht bestätigen; der Anmeldestatus ist unklar. Bitte versuchen Sie es später erneut.'
}
