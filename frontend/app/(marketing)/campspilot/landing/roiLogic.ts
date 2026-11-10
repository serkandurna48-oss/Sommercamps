import { euro, tarife } from '../../preise/pakete'

export interface RoiInput {
  camps: number
  kids: number
  price: number
  hours: number
}

const angebote = [tarife.starter, tarife.verein]

/** Gesamtkosten eines Pakets pro Jahr in Cent: Gebühr je Buchung plus Grundgebühr. Zahlen kommen aus pakete.ts. */
export function jahreskostenCents(paket: (typeof angebote)[number], umsatzCents: number): number {
  return Math.round((umsatzCents * paket.basisPoints) / 10000) + paket.monatCents * 12
}

export function roi({ camps, kids, price, hours }: RoiInput) {
  const umsatzCents = camps * kids * price * 100
  const guenstigstes = angebote.reduce((best, p) => (jahreskostenCents(p, umsatzCents) < jahreskostenCents(best, umsatzCents) ? p : best))
  const gebuehrCents = jahreskostenCents(guenstigstes, umsatzCents)
  // Beispielrechnung auf Basis von Annahmen: Papierkram und Nachfragen sowie weniger Ausfälle durch Wartelisten.
  const gespartStunden = Math.round(camps * kids * 0.25 + hours * camps * 2)
  const zusatzCents = Math.round(camps * kids * 0.12) * price * 100
  return { umsatzCents, paket: guenstigstes.name, gebuehrCents, gespartStunden, zusatzCents }
}

export { euro }
