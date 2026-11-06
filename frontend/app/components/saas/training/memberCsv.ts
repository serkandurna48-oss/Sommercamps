/**
 * CSV-Hilfen für den Mitglieder-Import. Alles läuft im Browser; Namen und
 * Geburtsdaten werden weder geloggt noch an Analytics gesendet.
 */

/** Backend-Grenze (Zeichen); größere Dateien werden gar nicht erst gesendet. */
export const MEMBER_CSV_MAX_CHARS = 1_000_000

export const MEMBER_CSV_TEMPLATE = 'vorname;nachname;geburtsdatum;mitgliedsnummer\r\nMax;Mustermann;01.02.2015;M-0001\r\n'

export const MEMBER_CSV_TEMPLATE_FILENAME = 'mitglieder-vorlage.csv'

export function memberTemplateBlob(): Blob {
  return new Blob([MEMBER_CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' })
}

/** UTF-8; enthält das Ergebnis U+FFFD (kein gültiges UTF-8), wird als windows-1252 gelesen (Excel). */
export function decodeCsvBytes(buffer: ArrayBuffer): string {
  const utf8 = new TextDecoder('utf-8').decode(buffer)
  if (!utf8.includes('�')) return utf8
  return new TextDecoder('windows-1252').decode(buffer)
}

/** Liest eine ausgewählte Datei im Browser und dekodiert sie mit decodeCsvBytes. */
export function readCsvFile(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'))
    reader.onload = () => resolve(decodeCsvBytes(reader.result as ArrayBuffer))
    reader.readAsArrayBuffer(file)
  })
}
