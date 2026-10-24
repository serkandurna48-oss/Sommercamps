import type { CampPublic } from '../../lib/saasApi'

/**
 * Mutation probe: changing this to 0 makes the threshold regression test red.
 * The filter bar appears only when camps.length > FILTER_THRESHOLD.
 */
export const FILTER_THRESHOLD = 6

export type ZeitraumKey = 'winter' | 'ostern' | 'fruehjahr' | 'sommer' | 'herbst'

export const ZEITRAUM_LABELS: Record<ZeitraumKey, string> = {
  winter: 'Winter',
  ostern: 'Ostern',
  fruehjahr: 'Frühjahr',
  sommer: 'Sommer',
  herbst: 'Herbst',
}

const VALID_ZEITEN = new Set<string>(['winter', 'ostern', 'fruehjahr', 'sommer', 'herbst'])

export function getZeitraum(startDate: string): ZeitraumKey {
  const m = parseInt(startDate.slice(5, 7), 10)
  if (m === 12 || m <= 2) return 'winter'
  if (m <= 4) return 'ostern'
  if (m <= 6) return 'fruehjahr'
  if (m <= 8) return 'sommer'
  return 'herbst'
}

export interface FilterState {
  ort: string       // '' = Alle Orte; '__none__' = ohne Ortsangabe
  zeiten: ZeitraumKey[]
}

export const EMPTY_FILTER: FilterState = { ort: '', zeiten: [] }

export const NO_LOCATION_VALUE = '__none__'

export function parseUrlFilter(search: string): FilterState {
  const p = new URLSearchParams(search)
  const ort = p.get('ort') ?? ''
  const zeitStr = p.get('zeit') ?? ''
  const zeiten = zeitStr
    .split(',')
    .map(s => s.trim())
    .filter(s => VALID_ZEITEN.has(s)) as ZeitraumKey[]
  return { ort, zeiten }
}

export function buildUrlSearch(filter: FilterState): string {
  const p = new URLSearchParams()
  if (filter.ort) p.set('ort', filter.ort)
  if (filter.zeiten.length > 0) p.set('zeit', filter.zeiten.join(','))
  const s = p.toString()
  return s ? `?${s}` : ''
}

export interface LocationOption {
  value: string
  label: string
  count: number
}

export interface ZeitraumOption {
  key: ZeitraumKey
  label: string
  count: number
}

export function getLocationOptions(camps: CampPublic[]): LocationOption[] {
  const counts = new Map<string, number>()
  for (const c of camps) {
    const key = c.location?.trim() || NO_LOCATION_VALUE
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort(([a], [b]) => {
      if (a === NO_LOCATION_VALUE) return 1
      if (b === NO_LOCATION_VALUE) return -1
      return a.localeCompare(b, 'de')
    })
    .map(([value, count]) => ({
      value,
      label: value === NO_LOCATION_VALUE ? 'Ohne Ortsangabe' : value,
      count,
    }))
}

export function getZeitraumOptions(camps: CampPublic[]): ZeitraumOption[] {
  const counts = new Map<ZeitraumKey, number>()
  for (const c of camps) {
    const key = getZeitraum(c.start_date)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const ORDER: ZeitraumKey[] = ['winter', 'ostern', 'fruehjahr', 'sommer', 'herbst']
  return ORDER
    .filter(k => counts.has(k))
    .map(k => ({ key: k, label: ZEITRAUM_LABELS[k], count: counts.get(k)! }))
}

export function applyFilter(camps: CampPublic[], filter: FilterState): CampPublic[] {
  return camps.filter(c => {
    if (filter.ort) {
      const campOrt = c.location?.trim() || NO_LOCATION_VALUE
      if (campOrt !== filter.ort) return false
    }
    if (filter.zeiten.length > 0) {
      if (!filter.zeiten.includes(getZeitraum(c.start_date))) return false
    }
    return true
  })
}

export function isFilterActive(filter: FilterState): boolean {
  return filter.ort !== '' || filter.zeiten.length > 0
}
