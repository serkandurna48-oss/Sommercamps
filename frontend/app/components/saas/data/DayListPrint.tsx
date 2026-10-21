'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Button from '../ui/Button'
import { berlinDay, formatDate, formatDateTime } from '../../../lib/i18n/de'
import { createPortal } from 'react-dom'
import type { CampAdmin, RegistrationAdmin } from '../../../lib/saasAdminApi'
import { DAY_LIST_COLUMNS, dayListCountText } from '../dayListExport'

export default function DayListPrint({ camp, rows, filterText, onClose }: {
  camp: CampAdmin
  rows: RegistrationAdmin[]
  filterText: string
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

  return createPortal(
    <dialog ref={dialogRef} aria-labelledby={titleId} onCancel={onClose} className="cp-scope cp-daylist-preview">
      <div className="cp-noprint mb-4 flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => window.print()}>Drucken</Button>
        <Button type="button" onClick={onClose}>Zurück zur Liste</Button>
        <label htmlFor={dateId}>Datum der Tagesliste</label>
        <input id={dateId} type="date" value={date} min={camp.start_date} max={camp.end_date} onChange={e => { if (e.target.value) setDate(e.target.value) }} className="min-h-[44px] min-w-0 rounded border px-2 text-base" />
      </div>
      <header className="cp-daylist-heading">
        <h1 id={titleId}>Camp-Tagesliste · {camp.title}</h1>
        <p>Datum: {formatDate(date)}</p>
        <p>Erstellt: {formatDateTime(createdAt)}</p>
        <p>{dayListCountText(rows.length)}</p>
        <p>{filterText}</p>
        <p>Alphabetisch nach Nachname, Vorname · Jahrgang als Geburtsjahr</p>
      </header>
      <div className="cp-daylist-table-scroll">
        <table>
          <thead><tr>{DAY_LIST_COLUMNS.map(column => <th key={column.header} scope="col">{column.header}</th>)}</tr></thead>
          <tbody>{rows.map(row => <tr key={row.registration_token}>{DAY_LIST_COLUMNS.map(column => <td key={column.header}>{column.value(row)}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </dialog>,
    document.body,
  )
}
