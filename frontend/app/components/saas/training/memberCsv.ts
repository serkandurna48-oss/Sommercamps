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

/** Gleiche Regel wie das Backend: Semikolon, wenn die erste nicht leere Zeile
 * mindestens so viele Semikolons wie Kommas enthält, sonst Komma. */
export function detectDelimiter(text: string): ';' | ',' {
  const first = text.split(/\r\n|\r|\n/).find(line => line.trim() !== '') ?? ''
  const semis = first.split(';').length - 1
  const commas = first.split(',').length - 1
  return semis > 0 && semis >= commas ? ';' : ','
}

/** Minimaler CSV-Leser (Anführungszeichen, "" als Escape, Zeilenumbrüche in
 * Anführungszeichen), passend zu Pythons csv.reader im Backend. */
export function parseCsvRecords(text: string, delimiter: string): string[][] {
  const records: string[][] = []
  let record: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++ } else quoted = false
      } else cell += ch
      continue
    }
    if (ch === '"' && cell === '') quoted = true
    else if (ch === delimiter) { record.push(cell); cell = '' }
    else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      record.push(cell); records.push(record); record = []; cell = ''
    } else cell += ch
  }
  if (cell !== '' || record.length > 0) { record.push(cell); records.push(record) }
  return records
}

export interface CsvPreview {
  header: string[]
  /** Erste Datenzeilen (ohne Leerzeilen), höchstens `limit`. */
  rows: string[][]
  /** Anzahl nicht leerer Datenzeilen. */
  totalRows: number
}

/** Kopfzeile + erste Zeilen für die Zuordnung. Bleibt im Browser. */
export function parseCsvPreview(text: string, limit = 5): CsvPreview | null {
  const clean = text.replace(/^﻿/, '')
  if (clean.trim() === '') return null
  const records = parseCsvRecords(clean, detectDelimiter(clean)).filter(record => record.some(cell => cell.trim() !== ''))
  if (records.length === 0) return null
  const [header, ...data] = records
  return { header: header.map(cell => cell.trim()), rows: data.slice(0, limit), totalRows: data.length }
}
