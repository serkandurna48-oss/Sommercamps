'use client'

import type { CsvPreview } from './memberCsv'
import {
  MAX_EXTRA_LABEL_LEN, TARGET_LABELS, TARGET_ORDER, mappingSummary, sampleValues,
  type ColumnChoice, type ColumnTarget,
} from './memberMapping'

export const PRIVACY_HINT = 'Nur Felder übernehmen, die Sie für Training und Preis brauchen. Keine Gesundheitsdaten, Adressen oder Telefonnummern.'

const FIELD_STYLE = { borderColor: 'var(--cp-field-line)', fontSize: '16px' }

/** Senkrechte Zuordnung: je CSV-Spalte eine Zeile mit Spaltenname, Beispielwerten,
 * Ziel-Auswahl und ggf. Warnung. Passt ohne horizontales Scrollen ins Seitenpanel.
 * Zeigt Kinderdaten aus der Datei: nur im Browser, nie loggen. */
export default function MemberImportMapping({ idPrefix, preview, choices, onChange }: {
  idPrefix: string
  preview: CsvPreview
  choices: ColumnChoice[]
  onChange: (index: number, next: ColumnChoice) => void
}) {
  const summary = mappingSummary(preview.header, choices)
  return (
    <div className="flex flex-col gap-3">
      <p className="cp-chip rounded-[var(--cp-r-chip)] border px-3 py-2" data-testid="privacy-hint"
        style={{ color: 'var(--cp-ink-2)', background: 'var(--cp-info-bg)', borderColor: 'var(--cp-info-line)' }}>
        {PRIVACY_HINT}
      </p>
      <p className="cp-chip" style={{ color: 'var(--cp-muted)' }}>
        {preview.totalRows} {preview.totalRows === 1 ? 'Zeile' : 'Zeilen'}, {preview.header.length} Spalten. Vorname, Nachname und Geburtsdatum sind Pflicht.
      </p>
      <ol className="flex flex-col rounded-[var(--cp-r-field)] border" style={{ borderColor: 'var(--cp-line-2)' }} aria-label="Spalten zuordnen">
        {preview.header.map((name, index) => {
          const choice = choices[index]
          if (!choice) return null
          const selectId = `${idPrefix}-col-${index}`
          const samples = sampleValues(preview.rows, index)
          return (
            <li key={index} className="flex flex-col gap-1.5 px-3 py-2.5" data-mapping-row={index}
              style={{ borderTop: index > 0 ? '1px solid var(--cp-line-2)' : undefined }}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <label htmlFor={selectId} className="cp-chip min-w-0 break-words font-semibold" style={{ color: 'var(--cp-ink)' }}>
                  {name || `Spalte ${index + 1}`}
                </label>
                {choice.sensitive && (
                  <span className="cp-chip inline-flex rounded-[var(--cp-r-chip)] border px-2 py-0.5" data-sensitive={index}
                    style={{ color: 'var(--cp-pending)', background: 'var(--cp-pending-bg)', borderColor: 'var(--cp-pending-line)' }}>
                    Sensible Daten? Besser nicht importieren
                  </span>
                )}
              </div>
              <p className="cp-chip min-w-0 truncate" data-samples={index} style={{ color: 'var(--cp-muted)' }}>
                {samples.length > 0 ? `z. B. ${samples.join(' · ')}` : 'keine Werte in den ersten Zeilen'}
              </p>
              <select id={selectId} value={choice.target} data-column={index}
                onChange={event => onChange(index, { ...choice, target: event.target.value as ColumnTarget })}
                className="cp-focus cp-input w-full min-w-0 rounded-[var(--cp-r-field)] border px-3 py-2" style={FIELD_STYLE}>
                {TARGET_ORDER.map(target => <option key={target} value={target}>{TARGET_LABELS[target]}</option>)}
              </select>
              {choice.target === 'extra' && (
                <input type="text" aria-label={`Bezeichnung des Zusatzfelds für Spalte ${name || index + 1}`} value={choice.label}
                  maxLength={MAX_EXTRA_LABEL_LEN} data-label-for={index} placeholder="Bezeichnung"
                  onChange={event => onChange(index, { ...choice, label: event.target.value })}
                  className="cp-focus cp-input w-full min-w-0 rounded-[var(--cp-r-field)] border px-3 py-2" style={FIELD_STYLE} />
              )}
            </li>
          )
        })}
      </ol>
      <div className="cp-chip flex flex-col gap-1 rounded-[var(--cp-r-chip)] border px-3 py-2" data-testid="mapping-summary" aria-live="polite"
        style={{ color: 'var(--cp-ink-2)', background: 'var(--cp-surface-2)', borderColor: 'var(--cp-line-2)' }}>
        <p>{summary.text}</p>
        {summary.missing.length > 0 && (
          <p data-testid="mapping-missing" style={{ color: 'var(--cp-error)' }}>Fehlt noch: {summary.missing.join(', ')}</p>
        )}
        {summary.sensitiveImported > 0 && (
          <p style={{ color: 'var(--cp-pending)' }}>
            {summary.sensitiveImported === 1 ? '1 möglicherweise sensible Spalte wird importiert.' : `${summary.sensitiveImported} möglicherweise sensible Spalten werden importiert.`}
          </p>
        )}
      </div>
    </div>
  )
}
