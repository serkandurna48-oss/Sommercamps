import { describe, expect, it } from 'vitest'
import { parseCsvPreview, parseCsvRecords } from './memberCsv'
import { isSensitiveHeader, normalizeHeader, suggestMapping, toApiMapping, validateMapping, type ColumnChoice } from './memberMapping'
import { filterMembers, memberExtraLabels } from './trainingLogic'

const targets = (header: string[]) => suggestMapping(header).map(choice => choice.target)

describe('Alias-Vorschläge', () => {
  it('erkennt übliche Spaltennamen aus Vereinssoftware', () => {
    expect(targets(['Vorname', 'Name', 'Geb.-Datum', 'Mitgl.-Nr.'])).toEqual(['first_name', 'last_name', 'birth_date', 'member_number'])
    expect(targets(['First Name', 'Familienname', 'Geburtstag', 'Mitgliedsnr'])).toEqual(['first_name', 'last_name', 'birth_date', 'member_number'])
    expect(targets(['vorname', 'nachname', 'geb', 'Nr'])).toEqual(['first_name', 'last_name', 'birth_date', 'member_number'])
  })

  it('exakter Name schlägt Alias, jedes Ziel nur einmal', () => {
    // "Name" would be last_name, but the exact "Nachname" column wins.
    expect(targets(['Name', 'Vorname', 'Nachname', 'Geburtsdatum'])).toEqual(['skip', 'first_name', 'last_name', 'birth_date'])
    expect(targets(['Geb', 'Geburtstag'])).toEqual(['birth_date', 'skip'])
  })

  it('unbekannte Spalten: nicht importieren, Label = Spaltenname (max. 40 Zeichen)', () => {
    const [choice, long] = suggestMapping(['  Mannschaft ', 'X'.repeat(50)])
    expect(choice).toEqual({ target: 'skip', label: 'Mannschaft', sensitive: false })
    expect(long.label).toHaveLength(40)
  })

  it('normalisiert Satzzeichen und Umlaute', () => {
    expect(normalizeHeader('Geb.-Datum')).toBe('gebdatum')
    expect(normalizeHeader('Straße')).toBe('strasse')
  })
})

describe('Datenschutz-Warnung', () => {
  it.each(['Krankheiten', 'Allergien', 'Medikamente', 'Diagnose', 'Adresse', 'Straße', 'PLZ', 'Telefon', 'Handy', 'Mobil-Nr.', 'E-Mail', 'Email Eltern'])(
    '%s gilt als sensibel und wird abgewählt', header => {
      expect(isSensitiveHeader(header)).toBe(true)
      expect(suggestMapping([header])[0]).toMatchObject({ target: 'skip', sensitive: true })
    })

  it('normale Spalten sind nicht sensibel', () => {
    expect(['Vorname', 'Mannschaft', 'Beitragsgruppe', 'Geb.-Datum'].some(isSensitiveHeader)).toBe(false)
  })
})

const choice = (target: ColumnChoice['target'], label = ''): ColumnChoice => ({ target, label, sensitive: false })

describe('Zuordnung prüfen', () => {
  const base = [choice('first_name'), choice('last_name'), choice('birth_date')]

  it('gültig mit genau einmal Vorname, Nachname, Geburtsdatum', () => {
    expect(validateMapping([...base, choice('member_number'), choice('extra', 'Team'), choice('skip')])).toEqual([])
  })

  it('meldet fehlende und doppelte Pflichtfelder', () => {
    expect(validateMapping([choice('first_name'), choice('last_name')])).toEqual(['Bitte eine Spalte als Geburtsdatum zuordnen.'])
    expect(validateMapping([...base, choice('last_name')])[0]).toContain('Nachname ist mehreren Spalten zugeordnet')
    expect(validateMapping([...base, choice('member_number'), choice('member_number')])[0]).toContain('Mitgliedsnummer')
  })

  it('Grenzen für Zusatzfelder', () => {
    const many = Array.from({ length: 11 }, (_, i) => choice('extra', `Feld ${i}`))
    expect(validateMapping([...base, ...many])).toEqual(['Höchstens 10 Zusatzfelder pro Import.'])
    expect(validateMapping([...base, ...many.slice(0, 10)])).toEqual([])
    expect(validateMapping([...base, choice('extra', '   ')])).toEqual(['Jedes Zusatzfeld braucht eine Bezeichnung.'])
    expect(validateMapping([...base, choice('extra', 'L'.repeat(41))])[0]).toContain('40 Zeichen')
    expect(validateMapping([...base, choice('extra', 'Team'), choice('extra', 'team')])[0]).toContain('eindeutig')
    expect(validateMapping([...base, choice('extra', 'Vorname')])[0]).toContain('eindeutig')
  })

  it('API-Format: Index -> Ziel, Label getrimmt', () => {
    expect(toApiMapping([...base, choice('extra', '  Team  A '), choice('skip', 'x')])).toEqual({
      0: 'first_name', 1: 'last_name', 2: 'birth_date', 3: { extra: 'Team A' }, 4: null,
    })
  })
})

describe('CSV-Vorschau', () => {
  it('Kopfzeile + höchstens 5 Zeilen, Leerzeilen übersprungen, BOM entfernt', () => {
    const text = '﻿Vorname;Name\r\n\r\n' + Array.from({ length: 8 }, (_, i) => `K${i};M${i}`).join('\r\n')
    const preview = parseCsvPreview(text)!
    expect(preview.header).toEqual(['Vorname', 'Name'])
    expect(preview.rows).toHaveLength(5)
    expect(preview.rows[0]).toEqual(['K0', 'M0'])
    expect(preview.totalRows).toBe(8)
  })

  it('Komma als Trenner und Anführungszeichen wie im Backend', () => {
    expect(parseCsvRecords('a,"b, c","d ""x"""\n"zeile\nzwei",e\n', ',')).toEqual([['a', 'b, c', 'd "x"'], ['zeile\nzwei', 'e']])
    expect(parseCsvPreview('vorname,nachname\n"Anna, Lena",Muster\n')!.rows[0]).toEqual(['Anna, Lena', 'Muster'])
  })

  it('leere Datei ergibt keine Vorschau', () => {
    expect(parseCsvPreview('  \n \n')).toBeNull()
  })
})

describe('Zusatzfelder in der Liste', () => {
  type M = { first_name: string; last_name: string; member_number: string | null; active: boolean; extra?: Record<string, string> }
  const members: M[] = [
    { first_name: 'Max', last_name: 'M', member_number: null, active: true, extra: { Mannschaft: 'U10', Beitrag: 'Familie' } },
    { first_name: 'Eva', last_name: 'E', member_number: null, active: true, extra: { Fuß: 'links', Mannschaft: 'U12' } },
    { first_name: 'Ola', last_name: 'O', member_number: null, active: true },
  ]

  it('Spalten in Reihenfolge des ersten Auftretens', () => {
    expect(memberExtraLabels(members)).toEqual(['Mannschaft', 'Beitrag', 'Fuß'])
  })

  it('Suche findet Werte von Zusatzfeldern', () => {
    expect(filterMembers(members, 'familie', 'alle').map(m => m.first_name)).toEqual(['Max'])
    expect(filterMembers(members, 'U1', 'alle').map(m => m.first_name)).toEqual(['Max', 'Eva'])
  })
})
