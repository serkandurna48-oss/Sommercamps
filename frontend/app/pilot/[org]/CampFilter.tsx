'use client'

import type { CampPublic } from '../../lib/saasApi'
import {
  type FilterState,
  type ZeitraumKey,
  EMPTY_FILTER,
  getLocationOptions,
  getZeitraumOptions,
  isFilterActive,
} from './campFilterUtils'

interface Props {
  camps: CampPublic[]
  filter: FilterState
  filteredCount: number
  onFilterChange: (filter: FilterState) => void
}

export default function CampFilter({ camps, filter, filteredCount, onFilterChange }: Props) {
  const locationOptions = getLocationOptions(camps)
  const zeitraumOptions = getZeitraumOptions(camps)
  const active = isFilterActive(filter)

  function toggleZeitraum(key: ZeitraumKey) {
    const zeiten = filter.zeiten.includes(key)
      ? filter.zeiten.filter(z => z !== key)
      : [...filter.zeiten, key]
    onFilterChange({ ...filter, zeiten })
  }

  return (
    <div className="campfilter" role="search" aria-label="Camps filtern">
      <div className="campfilter-bar">
        <div className="campfilter-ort">
          <label className="t-lab" htmlFor="cf-ort">Ort</label>
          <select
            id="cf-ort"
            className="campfilter-select"
            value={filter.ort}
            onChange={e => onFilterChange({ ...filter, ort: e.target.value })}
          >
            <option value="">Alle Orte</option>
            {locationOptions.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label} ({opt.count})
              </option>
            ))}
          </select>
        </div>

        <div className="campfilter-periods" role="group" aria-label="Zeitraum">
          {zeitraumOptions.map(opt => (
            <button
              key={opt.key}
              type="button"
              className={`campfilter-chip${filter.zeiten.includes(opt.key) ? ' active' : ''}`}
              aria-pressed={filter.zeiten.includes(opt.key)}
              onClick={() => toggleZeitraum(opt.key)}
            >
              {opt.label}
              <span className="campfilter-chip-n" aria-hidden="true">&thinsp;{opt.count}</span>
            </button>
          ))}
        </div>

        <div className="campfilter-foot">
          <span
            className="campfilter-count num"
            aria-live="polite"
            aria-atomic="true"
          >
            {filteredCount} {filteredCount === 1 ? 'Camp' : 'Camps'}
          </span>
          {active && (
            <button
              type="button"
              className="campfilter-reset"
              onClick={() => onFilterChange(EMPTY_FILTER)}
            >
              Filter zurücksetzen
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
