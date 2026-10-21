'use client'

import { useEffect, useId, useRef, useState } from 'react'
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
    const today = new Date().toLocaleDateString('sv-SE')
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
        <button type="button" onClick={() => window.print()} className="min-h-[44px] rounded border px-4">Drucken</button>
        <button type="button" onClick={onClose} className="min-h-[44px] rounded border px-4">Zurück zur Liste</button>
        <label htmlFor={dateId}>Datum der Tagesliste</label>
        <input id={dateId} type="date" value={date} min={camp.start_date} max={camp.end_date} onChange={e => { if (e.target.value) setDate(e.target.value) }} className="min-h-[44px] min-w-0 rounded border px-2 text-base" />
      </div>
      <header className="cp-daylist-heading">
        <h1 id={titleId}>Camp-Tagesliste · {camp.title}</h1>
        <p>Datum: {new Date(`${date}T12:00:00`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
        <p>Erstellt: {createdAt.toLocaleString('de-DE')}</p>
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
