'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { berlinDay, formatDate, formatDateRange, formatDateTime } from '../../../lib/i18n/de'
import type { CampAdmin, RegistrationAdmin, RegistrationQuestion } from '../../../lib/saasAdminApi'
import { dayListCountText } from '../dayListExport'
import { participantPrintFields, printColumnSections, selectedPrintColumns, DEFAULT_PRINT_FIELDS, type PrintPurpose } from '../participantPrint'
import Button from '../ui/Button'

export interface ParticipantPrintProps {
  camp: CampAdmin
  rows: RegistrationAdmin[]
  filterText: string
  orgName?: string
  questions?: RegistrationQuestion[]
  selectedFields: readonly string[]
  onFieldsChange: (fields: string[]) => void
  onClose: () => void
}

export default function ParticipantPrintDialog({ camp, rows, filterText, orgName, questions, selectedFields, onFieldsChange, onClose, purpose }: ParticipantPrintProps & { purpose: PrintPurpose }) {
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
  const title = `${purpose === 'daylist' ? 'Camp-Tagesliste' : 'Teilnehmerliste'} · ${camp.title}`
  const validDate = purpose !== 'daylist' || (!!date && date >= camp.start_date && date <= camp.end_date)
  const canPrint = columns.length > 0 && rows.length > 0 && validDate

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
            {sections.map((section, index) => <section key={index} className="cp-print-sheet">
              <header className="cp-daylist-heading">
                {orgName && <p className="cp-print-org">{orgName}</p>}
                <h2>{title}</h2>
                <p>{formatDateRange(camp.start_date, camp.end_date)}</p>
                {purpose === 'daylist' && <p>Datum: {formatDate(date)}</p>}
                <p>Stand: {formatDateTime(createdAt)}</p>
                <p>{purpose === 'daylist' ? dayListCountText(rows.length) : `${rows.length} Anmeldungen · einschließlich Warteliste und Stornierungen`}</p>
                <p>{filterText}</p>
                {sections.length > 1 && <p>Tabellenabschnitt {index + 1} von {sections.length} · Zuordnung über die Zeilennummer</p>}
              </header>
              <div className="cp-daylist-table-scroll">
                <table aria-label={`${title}${sections.length > 1 ? ` · Abschnitt ${index + 1}` : ''}`}>
                  <thead><tr><th scope="col" className="cp-print-row-number">Nr.</th>{section.map(column => <th key={column.id} scope="col" className={column.attendance ? 'cp-daylist-check-col' : undefined}>{column.header}</th>)}</tr></thead>
                  <tbody>{rows.map((row, rowIndex) => <tr key={row.registration_token}>
                    <td className="cp-print-row-number">{rowIndex + 1}</td>
                    {section.map(column => <td key={column.id} className={column.attendance ? 'cp-daylist-check-col' : undefined}>{column.value(row) ?? ''}</td>)}
                  </tr>)}</tbody>
                </table>
              </div>
            </section>)}
          </>}
        </div>
      </div>
    </dialog>, document.body,
  )
}
