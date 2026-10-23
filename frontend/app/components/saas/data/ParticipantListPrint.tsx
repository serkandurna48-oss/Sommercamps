'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Button from '../ui/Button'
import { formatDateRange, formatDateTime } from '../../../lib/i18n/de'
import { createPortal } from 'react-dom'
import type { CampAdmin, RegistrationAdmin } from '../../../lib/saasAdminApi'
import type { ExportColumn } from '../../../lib/exportCsv'
import { campAttendanceColumns } from '../dayListExport'

export const PARTICIPANT_PRINT_COLUMNS: ExportColumn<RegistrationAdmin>[] = [
  { header: 'Kind', value: r => `${r.child_first_name} ${r.child_last_name}` },
  { header: 'Jahrgang', value: r => r.child_birth_date.slice(0, 4) },
  { header: 'Trikot', value: r => r.jersey_size },
  { header: 'Notfallkontakt', value: r => [r.emergency_contact_name, r.emergency_contact_phone].filter(Boolean).join(' · ') },
  { header: 'Allergien/Hinweise', value: r => [r.allergies, r.medical_notes].filter(Boolean).join(' · ') },
  { header: 'Abholberechtigt', value: r => r.pickup_authorized },
]

export default function ParticipantListPrint({ camp, rows, filterText, orgName, onClose }: {
  camp: CampAdmin
  rows: RegistrationAdmin[]
  filterText: string
  orgName?: string
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [createdAt] = useState(() => new Date())

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
  const printColumns = [...PARTICIPANT_PRINT_COLUMNS, ...attendanceCols]
  const manyColumns = printColumns.length > 7

  return createPortal(
    <dialog ref={dialogRef} aria-labelledby={titleId} onCancel={onClose} className={`cp-scope cp-daylist-preview${manyColumns ? ' cp-daylist-many-cols' : ''}`}>
      <div className="cp-noprint mb-4 flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => window.print()}>PDF / Drucken</Button>
        <Button type="button" onClick={onClose}>Zurück zur Liste</Button>
      </div>
      <p className="cp-noprint text-sm">Im Druckdialog ‚Als PDF speichern&lsquo; wählen.</p>
      <header className="cp-daylist-heading">
        {orgName && <p>{orgName}</p>}
        <h1 id={titleId}>Teilnehmerliste · {camp.title}</h1>
        <p>{formatDateRange(camp.start_date, camp.end_date)}</p>
        <p>Stand: {formatDateTime(createdAt)}</p>
        <p>{rows.length} Anmeldungen</p>
        <p>{filterText}</p>
      </header>
      <div className="cp-daylist-table-scroll">
        <table>
          <thead>
            <tr>{printColumns.map(column => <th key={column.header} scope="col" className={attendanceCols.includes(column) ? 'cp-daylist-check-col' : ''}>{column.header}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.registration_token}>
                {printColumns.map(column => <td key={column.header} className={attendanceCols.includes(column) ? 'cp-daylist-check-col' : ''}>{column.value(row)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </dialog>,
    document.body,
  )
}
