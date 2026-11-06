import { describe, expect, it } from 'vitest'
import { decodeCsvBytes, MEMBER_CSV_MAX_CHARS, MEMBER_CSV_TEMPLATE, memberTemplateBlob } from './memberCsv'

const bytes = (...values: number[]) => new Uint8Array(values).buffer

describe('CSV-Dekodierung', () => {
  it('liest UTF-8 mit Umlauten', () => {
    const buffer = new TextEncoder().encode('vorname;nachname\nJürgen;Müller\n').buffer as ArrayBuffer
    expect(decodeCsvBytes(buffer)).toBe('vorname;nachname\nJürgen;Müller\n')
  })

  it('fällt bei ungültigem UTF-8 auf windows-1252 zurück (Excel-Export)', () => {
    // "Müller" in CP1252: M ü(0xFC) l l e r
    const text = decodeCsvBytes(bytes(0x4d, 0xfc, 0x6c, 0x6c, 0x65, 0x72))
    expect(text).toBe('Müller')
    expect(text).not.toContain('�')
  })

  it('dekodiert windows-1252-Sonderzeichen wie € und ß', () => {
    expect(decodeCsvBytes(bytes(0x80, 0xdf))).toBe('€ß')
  })

  it('behält ein echtes UTF-8-BOM bei (Backend entfernt es)', () => {
    const buffer = new Uint8Array([0xef, 0xbb, 0xbf, 0x61]).buffer
    expect(decodeCsvBytes(buffer).endsWith('a')).toBe(true)
  })
})

describe('Vorlage', () => {
  it('hat die vier Spalten und genau eine eindeutig erfundene Beispielzeile', () => {
    const lines = MEMBER_CSV_TEMPLATE.trim().split(/\r?\n/)
    expect(lines[0]).toBe('vorname;nachname;geburtsdatum;mitgliedsnummer')
    expect(lines).toHaveLength(2)
    expect(lines[1]).toMatch(/^Max;Mustermann;\d{2}\.\d{2}\.\d{4};\S*$/)
  })

  it('wird als CSV-Blob ausgeliefert', async () => {
    const blob = memberTemplateBlob()
    expect(blob.type).toContain('text/csv')
    expect(await blob.text()).toContain('vorname;nachname;geburtsdatum;mitgliedsnummer')
  })

  it('kennt das Größenlimit des Backends', () => {
    expect(MEMBER_CSV_MAX_CHARS).toBe(1_000_000)
  })
})
