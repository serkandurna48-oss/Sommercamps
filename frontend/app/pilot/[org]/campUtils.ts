import type { CampPublic } from '../../lib/saasApi'

/** Today's date as YYYY-MM-DD string in Europe/Berlin timezone. */
export function getTodayBerlin(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })
}

/**
 * Removes camps whose end_date has already passed in Europe/Berlin.
 * A camp ending exactly today stays visible (end_date >= today).
 *
 * Mutation probe: changing >= to > here removes today's camps and turns
 * the boundary test in d1b.test.tsx red.
 */
export function filterFutureCamps(camps: CampPublic[]): CampPublic[] {
  const today = getTodayBerlin()
  return camps.filter(c => c.end_date >= today)
}

/**
 * Shortens intro text for the hero section to the first sentence
 * (if it fits within 140 chars), or to a word boundary with an ellipsis.
 * Returns text unchanged when it is 140 chars or fewer.
 */
export function truncateIntroForHero(text: string): string {
  if (text.length <= 140) return text
  const sentMatch = /^[\s\S]+?[.!?](?=\s|$)/.exec(text)
  if (sentMatch && sentMatch[0].length <= 140) return sentMatch[0]
  const slice = text.slice(0, 140)
  const lastSpace = slice.lastIndexOf(' ')
  if (lastSpace > 0) return text.slice(0, lastSpace) + '…'
  return slice + '…'
}
