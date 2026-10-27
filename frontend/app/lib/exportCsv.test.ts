import { describe, expect, it } from 'vitest'
import { toCsv } from './exportCsv'

const csv = (value: string) => toCsv([{ value }], [{ header: 'Antwort', value: row => row.value }])

describe('CSV formula protection', () => {
  it.each([
    ['=1+1', "'=1+1"],
    ['+1+1', "'+1+1"],
    ['-1+1', "'-1+1"],
    ['@SUM(1;2)', `"'@SUM(1;2)"`],
    ['=1+1;Kommentar', `"'=1+1;Kommentar"`],
    ['\t=1+1', "'\t=1+1"],
    [' \u200b\ufeff=1+1', "' \u200b\ufeff=1+1"],
    ['Herkunftsverein\r\n=1+1', `"Herkunftsverein\r\n'=1+1"`],
    ['Text\n \t@SUM(1)', `"Text\n' \t@SUM(1)"`],
    ['Text\r+1', `"Text\r'+1"`],
    ['Text\u2028\u00a0=1+1', `"Text\u2028'\u00a0=1+1"`],
    ['=HYPERLINK("x";"y")', `"'=HYPERLINK(""x"";""y"")"`],
  ])('neutralizes %j without losing its CSV structure', (value, expected) => {
    expect(csv(value)).toBe(`Antwort\r\n${expected}`)
  })

  it.each([
    ['Müller', 'Müller'],
    ['FC Teststadt', 'FC Teststadt'],
    ['Spieler; Torwart', '"Spieler; Torwart"'],
    ['"Anderer Verein"', '"""Anderer Verein"""'],
    ['Hinweis\r\nKSV Baunatal', '"Hinweis\r\nKSV Baunatal"'],
  ])('preserves ordinary German and quoted text %j', (value, expected) => {
    expect(csv(value)).toBe(`Antwort\r\n${expected}`)
  })

  it('protects user-controlled column headers and every exported row', () => {
    expect(toCsv([{ value: '=1+1' }, { value: 'Anna' }], [{ header: '@Frage', value: row => row.value }]))
      .toBe("'@Frage\r\n'=1+1\r\nAnna")
  })
})
