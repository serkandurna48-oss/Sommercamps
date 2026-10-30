'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { berlinDay, formatDateRange, formatDateTime, formatWeekdayDate } from '../../../lib/i18n/de'
import type { CampAdmin, RegistrationAdmin, RegistrationQuestion } from '../../../lib/saasAdminApi'
import { dayListCountText } from '../dayListExport'
import { participantPrintFields, printColumnSections, selectedPrintColumns, DEFAULT_PRINT_FIELDS, type PrintPurpose } from '../participantPrint'
import Button from '../ui/Button'

export interface ParticipantPrintProps {
  camp: CampAdmin
  rows: RegistrationAdmin[]
  filterText: string
  orgName?: string
  /** Club logo and accessible brand color for the printed sheet header. */
  orgLogoUrl?: string | null
  brandColor?: string
  questions?: RegistrationQuestion[]
  selectedFields: readonly string[]
  onFieldsChange: (fields: string[]) => void
  onClose: () => void
}

export default function ParticipantPrintDialog({ camp, rows, filterText, orgName, orgLogoUrl, brandColor, questions, selectedFields, onFieldsChange, onClose, purpose }: ParticipantPrintProps & { purpose: PrintPurpose }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const dateId = useId()
  const hintId = useId()
  const [createdAt] = useState(() => new Date())
  const [date, setDate] = useState(() => {
    const today = berlinDay(new Date())
    return today >= camp.start_date && today <= camp.end_date ? today : camp.start_date
  })
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => { dialog?.close(); opener?.focus() }
  }, [])

  const fields = participantPrintFields(questions)
  const columns = selectedPrintColumns(fields, selectedFields, camp)
  const sections = printColumnSections(columns)
  const listName = purpose === 'daylist' ? 'Camp-Tagesliste' : 'Teilnehmerliste'
  const title = `${listName} · ${camp.title}`
  const validDate = purpose !== 'daylist' || (!!date && date >= camp.start_date && date <= camp.end_date)
  const canPrint = columns.length > 0 && rows.length > 0 && validDate
  // Day list: mark the attendance column of the printed date for the trainer.
  const dayIndex = purpose === 'daylist' && validDate
    ? Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${camp.start_date}T00:00:00Z`)) / 86_400_000)
    : -1
  const cellClass = (column: { id: string, attendance?: boolean, size?: string }) => column.attendance
    ? column.id === `attendance:${dayIndex}` ? 'cp-daylist-check-col cp-sheet-today' : 'cp-daylist-check-col'
    : column.size ? `cp-col-${column.size}` : undefined
  const cellValue = (column: { attendance?: boolean, alert?: boolean, value: (row: RegistrationAdmin) => unknown }, row: RegistrationAdmin) => {
    if (column.attendance) return ''
    const raw = column.value(row)
    const text = raw === null || raw === undefined ? '' : String(raw).trim()
    if (!text) return <span className="cp-sheet-empty">–</span>
    return column.alert ? <strong className="cp-sheet-alert">{text}</strong> : text
  }

  return createPortal(
    <dialog ref={dialogRef} aria-labelledby={titleId} onCancel={onClose} className="cp-scope cp-daylist-preview cp-participant-print">
      <div className="cp-noprint cp-print-toolbar">
        <div>
          <h1 id={titleId}>Druckausgabe vorbereiten</h1>
          <p>Spalten auswählen, Vorschau prüfen und drucken.</p>
        </div>
        <div className="cp-print-actions">
          <Button type="button" onClick={onClose}>Zurück zur Liste</Button>
          <Button type="button" variant="primary" disabled={!canPrint} aria-describedby={!canPrint ? hintId : undefined} onClick={() => { if (canPrint) window.print() }}>Drucken / Als PDF speichern</Button>
        </div>
      </div>
      <div className="cp-print-workspace">
        <aside className="cp-noprint cp-print-settings" aria-label="Druckeinstellungen">
          <fieldset className="cp-print-fieldset">
            <legend>Sichtbare Spalten</legend>
            <p>Kontakt- und Gesundheitsdaten nur bei Bedarf auswählen. Diese Auswahl gilt für den Browserdruck und das Speichern als PDF. CSV und Excel enthalten ihre eigenen Spalten einschließlich konfigurierter Zusatzantworten.</p>
            {(['Teilnahme', 'Kontakt und Betreuung', 'Zusatzfragen'] as const).map(group => {
              const groupFields = fields.filter(field => field.group === group)
              return groupFields.length > 0 && <div key={group} className="cp-print-field-group">
                <p className="cp-print-group-title">{group}</p>
                {groupFields.map(field => <label key={field.id} className="cp-print-choice">
                  <input type="checkbox" checked={selectedFields.includes(field.id)} onChange={e => onFieldsChange(e.target.checked ? [...selectedFields, field.id] : selectedFields.filter(id => id !== field.id))} />
                  <span>{field.header}</span>
                </label>)}
              </div>
            })}
          </fieldset>
          <div className="cp-print-actions">
            <Button type="button" onClick={() => onFieldsChange([...DEFAULT_PRINT_FIELDS[purpose]])}>Standardauswahl</Button>
            <Button type="button" onClick={() => onFieldsChange([])}>Alle abwählen</Button>
          </div>
          <p>Position und Herkunftsverein stehen als Spalten bereit, wenn Ihr Verein diese Zusatzfragen eingerichtet hat.</p>
          {purpose === 'daylist' && <div className="cp-print-date">
            <label htmlFor={dateId}>Datum der Tagesliste</label>
            <input id={dateId} type="date" value={date} min={camp.start_date} max={camp.end_date} onChange={e => setDate(e.target.value)} />
          </div>}
          <p>Im Druckdialog „Als PDF speichern“ wählen. Die Ausgabe ist für A4 vorbereitet.</p>
        </aside>
        <div className="cp-print-output" aria-label="Druckvorschau">
          {!canPrint && <p id={hintId} role="alert">{!columns.length ? 'Bitte wählen Sie mindestens eine Spalte für die Druckausgabe.' : !rows.length ? 'Keine Treffer für diese Druckausgabe.' : 'Bitte wählen Sie ein Datum innerhalb des Camps.'}</p>}
          {canPrint && <>
            <p className="cp-noprint cp-print-status" role="status">{fields.filter(field => selectedFields.includes(field.id)).length} Felder ausgewählt · {sections.length > 1 ? `${sections.length} Tabellenabschnitte mit gleicher Zeilennummer` : 'Vorschau der Druckausgabe'}</p>
            {sections.map((section, index) => <section key={index} className="cp-print-sheet" style={brandColor ? { '--cp-sheet-brand': brandColor } as React.CSSProperties : undefined}>
              <header className="cp-daylist-heading cp-sheet-head">
                <div className="cp-sheet-id">
                  {/* Plain img: print output must not depend on the image optimizer. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {orgLogoUrl && <img className="cp-sheet-logo" src={orgLogoUrl} alt={orgName ? `Logo ${orgName}` : 'Vereinslogo'} />}
                  <div className="cp-sheet-titles">
                    {orgName && <p className="cp-print-org">{orgName}</p>}
                    <h2><span className="cp-sheet-kind">{listName}</span><span className="cp-sr-sep"> · </span><span className="cp-sheet-camp">{camp.title}</span></h2>
                  </div>
                </div>
                <dl className="cp-sheet-meta">
                  {purpose === 'daylist' && <div className="cp-sheet-day"><dt>Datum</dt><dd>{formatWeekdayDate(date)}</dd></div>}
                  <div><dt>Camp</dt><dd>{formatDateRange(camp.start_date, camp.end_date)}</dd></div>
                  <div><dt>{purpose === 'daylist' ? 'Kinder' : 'Anmeldungen'}</dt><dd>{rows.length}</dd></div>
                </dl>
                <p className="cp-sheet-note">
                  {purpose === 'daylist' ? dayListCountText(rows.length) : `${rows.length} Anmeldungen · einschließlich Warteliste und Stornierungen`}
                  {filterText && <> · {filterText}</>}
                  {' · '}Stand: {formatDateTime(createdAt)}
                  {sections.length > 1 && <> · Tabellenabschnitt {index + 1} von {sections.length}, Zuordnung über die Zeilennummer</>}
                </p>
              </header>
              <div className="cp-daylist-table-scroll">
                <table aria-label={`${title}${sections.length > 1 ? ` · Abschnitt ${index + 1}` : ''}`}>
                  <thead><tr><th scope="col" className="cp-print-row-number">Nr.</th>{section.map(column => <th key={column.id} scope="col" className={cellClass(column)}>{column.header}</th>)}</tr></thead>
                  <tbody>{rows.map((row, rowIndex) => <tr key={row.registration_token}>
                    <td className="cp-print-row-number">{rowIndex + 1}</td>
                    {section.map(column => <td key={column.id} className={cellClass(column)}>{cellValue(column, row)}</td>)}
                  </tr>)}</tbody>
                </table>
              </div>
              {purpose === 'daylist' && index === sections.length - 1 && <div className="cp-sheet-notes" aria-hidden="true">
                <p>Notizen</p>
              </div>}
              <footer className="cp-sheet-foot">
                <span>{orgName ? `${orgName} · ` : ''}{title}</span>
                <span>Vertraulich: enthält personenbezogene Daten von Kindern</span>
              </footer>
            </section>)}
          </>}
        </div>
      </div>
    </dialog>, document.body,
  )
}
