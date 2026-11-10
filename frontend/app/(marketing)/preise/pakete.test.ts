import { describe, expect, it } from 'vitest'
import { euro, rechenbeispiel, pakete, preise, tarife } from './pakete'

describe('euro', () => {
  it.each([[0, '0,00 €'], [2490, '24,90 €'], [20700, '207,00 €'], [1494000, '14.940,00 €'], [5, '0,05 €']])(
    'formatiert %i Cent als %s', (cents, expected) => {
      expect(euro(cents)).toBe(expected)
    },
  )
})

describe('Rechenbeispiel', () => {
  it('rechnet 20 Kinder à 150 € für Starter und Verein', () => {
    expect(rechenbeispiel).toMatchObject({
      kinder: 20, preisJeKind: '150,00 €', umsatz: '3.000,00 €',
      starterGebuehr: '207,00 €', vereinGebuehr: '147,00 €', vereinGrundgebuehrJahr: '298,80 €',
    })
  })

  it('nennt die Umsatzschwelle, ab der Verein günstiger ist (298,80 € / 2 Prozentpunkte)', () => {
    expect(rechenbeispiel.schwelleJahresumsatz).toBe('14.940,00 €')
    // Gegenprobe: an der Schwelle kosten beide Pakete gleich viel.
    const schwelle = 1494000
    expect(Math.round(schwelle * 0.069)).toBe(Math.round(schwelle * 0.049) + 29880)
  })
})

describe('Preisseite-Texte', () => {
  it('ist nicht mehr als Entwurf gekennzeichnet und behauptet keine Gebührenfreiheit je Anmeldung', () => {
    expect('entwurf' in preise).toBe(false)
    expect(JSON.stringify(preise)).not.toContain('Keine Gebühr pro Anmeldung')
  })

  it('nennt die Zahlungsgebühren als enthalten (Ahmads Preismodell)', () => {
    expect(preise.steuerhinweis).toContain('Alle Beträge zzgl. USt.')
    expect(preise.steuerhinweis).toContain('enthält die Stripe-Gebühr für Kartenzahlungen mit europäischen Karten')
  })

  it('hat genau drei Pakete', () => {
    expect(pakete.map((paket) => paket.name)).toEqual(['Starter', 'Verein', 'Verband/Individuell'])
  })
})

describe('tarife (Zahlen für den ROI-Rechner)', () => {
  it('stimmen mit den Anzeigetexten der Pakete überein', () => {
    const prozent = (bp: number) => `${(bp / 100).toFixed(1).replace('.', ',')} %`
    expect(pakete[0].buchungsgebuehr).toContain(prozent(tarife.starter.basisPoints))
    expect(pakete[1].buchungsgebuehr).toContain(prozent(tarife.verein.basisPoints))
    expect(pakete[0].preis).toBe(tarife.starter.monatCents === 0 ? '0 €' : euro(tarife.starter.monatCents))
    expect(pakete[1].preis).toBe(euro(tarife.verein.monatCents))
  })
})
