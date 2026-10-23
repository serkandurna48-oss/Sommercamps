'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Button from '../ui/Button'
import { berlinDay, formatDate, formatDateRange, formatDateTime } from '../../../lib/i18n/de'
import { createPortal } from 'react-dom'
import type { CampAdmin, RegistrationAdmin } from '../../../lib/saasAdminApi'
import { campAttendanceColumns, DAY_LIST_COLUMNS, dayListCountText } from '../dayListExport'

export default function DayListPrint({ camp, rows, filterText, orgName, onClose }: {
  camp: CampAdmin
  rows: RegistrationAdmin[]
  filterText: string
  orgName?: string
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const dateId = useId()
  const [createdAt] = useState(() => new Date())
  const [date, setDate] = useState(() => {
    const today = berlinDay(new Date())
    return today >= camp.start_date && today <= camp.end_date ? today : camp.start_date
  })

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => {
      dialog?.close()
      opener?.focus()
    }
  }, [])

  const attendanceCols = campAttendanceColumns(camp.start_date, camp.end_date)
  const printColumns = [...DAY_LIST_COLUMNS.slice(0, -1), ...attendanceCols]
  const manyColumns = printColumns.length > 7

  return createPortal(
    <dialog ref={dialogRef} aria-labelledby={titleId} onCancel={onClose} className={`cp-scope cp-daylist-preview${manyColumns ? ' cp-daylist-many-cols' : ''}`}>
      <div className="cp-noprint mb-4 flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => window.print()}>PDF / Drucken</Button>
        <Button type="button" onClick={onClose}>Zurück zur Liste</Button>
        <label htmlFor={dateId}>Datum der Tagesliste</label>
        <input id={dateId} type="date" value={date} min={camp.start_date} max={camp.end_date} onChange={e => { if (e.target.value) setDate(e.target.value) }} className="min-h-[44px] min-w-0 rounded border px-2 text-base" />
      </div>
      <p className="cp-noprint text-sm">Im Druckdialog ‚Als PDF speichern&lsquo; wählen.</p>
      <header className="cp-daylist-heading">
        {orgName && <p>{orgName}</p>}
        <h1 id={titleId}>Camp-Tagesliste · {camp.title}</h1>
        <p>{formatDateRange(camp.start_date, camp.end_date)}</p>
        <p>Datum: {formatDate(date)}</p>
        <p>Stand: {formatDateTime(createdAt)}</p>
        <p>{dayListCountText(rows.length)}</p>
        <p>{filterText}</p>
        <p>Alphabetisch nach Nachname, Vorname · Jahrgang als Geburtsjahr</p>
      </header>
      <div className="cp-daylist-table-scroll">
        <table>
          <thead><tr>{printColumns.map(column => <th key={column.header} scope="col" className={attendanceCols.includes(column) ? 'cp-daylist-check-col' : ''}>{column.header}</th>)}</tr></thead>
          <tbody>{rows.map(row => <tr key={row.registration_token}>{printColumns.map(column => <td key={column.header} className={attendanceCols.includes(column) ? 'cp-daylist-check-col' : ''}>{column.value(row)}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </dialog>,
    document.body,
  )
}
