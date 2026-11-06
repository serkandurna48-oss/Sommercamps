'use client'

import type { CsvPreview } from './memberCsv'
import { MAX_EXTRA_LABEL_LEN, TARGET_LABELS, TARGET_ORDER, type ColumnChoice, type ColumnTarget } from './memberMapping'

export const PRIVACY_HINT = 'Nur Felder übernehmen, die Sie für Training und Preis brauchen. Keine Gesundheitsdaten, Adressen oder Telefonnummern.'

/** Vorschau (erste Zeilen) mit einer Auswahl je CSV-Spalte. Zeigt Kinderdaten aus
 * der Datei: nur im Browser, nie loggen. */
export default function MemberImportMapping({ idPrefix, preview, choices, onChange }: {
  idPrefix: string
  preview: CsvPreview
  choices: ColumnChoice[]
  onChange: (index: number, next: ColumnChoice) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="cp-chip rounded-[var(--cp-r-chip)] border px-3 py-2" data-testid="privacy-hint"
        style={{ color: 'var(--cp-ink-2)', background: 'var(--cp-info-bg)', borderColor: 'var(--cp-info-line)' }}>
        {PRIVACY_HINT}
      </p>
      <p className="cp-chip" style={{ color: 'var(--cp-muted)' }}>
        Spalten zuordnen: Vorname, Nachname und Geburtsdatum sind Pflicht. Vorschau der ersten {preview.rows.length} von {preview.totalRows} Zeilen.
      </p>
      <div className="overflow-x-auto rounded-[var(--cp-r-field)] border" style={{ borderColor: 'var(--cp-line-2)' }}>
        <table className="cp-chip w-max min-w-full border-collapse text-left">
          <thead>
            <tr style={{ background: 'var(--cp-surface-2)' }}>
              {preview.header.map((name, index) => {
                const choice = choices[index]
                const selectId = `${idPrefix}-col-${index}`
                return (
                  <th key={index} scope="col" className="min-w-[150px] max-w-[220px] px-3 py-2 align-top font-normal">
                    <label htmlFor={selectId} className="block break-words font-semibold" style={{ color: 'var(--cp-ink)' }}>
                      {name || `Spalte ${index + 1}`}
                    </label>
                    <select id={selectId} value={choice.target} data-column={index}
                      onChange={event => onChange(index, { ...choice, target: event.target.value as ColumnTarget })}
                      className="cp-focus cp-input mt-1 w-full rounded-[var(--cp-r-field)] border px-2 py-1.5"
                      style={{ borderColor: 'var(--cp-field-line)', fontSize: '16px' }}>
                      {TARGET_ORDER.map(target => <option key={target} value={target}>{TARGET_LABELS[target]}</option>)}
                    </select>
                    {choice.target === 'extra' && (
                      <input type="text" aria-label={`Bezeichnung für Spalte ${name || index + 1}`} value={choice.label}
                        maxLength={MAX_EXTRA_LABEL_LEN} data-label-for={index}
                        onChange={event => onChange(index, { ...choice, label: event.target.value })}
                        className="cp-focus cp-input mt-1 w-full rounded-[var(--cp-r-field)] border px-2 py-1.5"
                        style={{ borderColor: 'var(--cp-field-line)', fontSize: '16px' }} />
                    )}
                    {choice.sensitive && (
                      <span className="mt-1 inline-flex rounded-[var(--cp-r-chip)] border px-2 py-0.5" data-sensitive={index}
                        style={{ color: 'var(--cp-pending)', background: 'var(--cp-pending-bg)', borderColor: 'var(--cp-pending-line)' }}>
                        Sensible Daten? Besser nicht importieren
                      </span>
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row, rowIndex) => (
              <tr key={rowIndex} style={{ borderTop: '1px solid var(--cp-line-2)' }}>
                {preview.header.map((_, index) => (
                  <td key={index} className="max-w-[220px] truncate px-3 py-1.5"
                    style={{ color: choices[index]?.target === 'skip' ? 'var(--cp-muted)' : 'var(--cp-ink-2)' }}>
                    {row[index] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
