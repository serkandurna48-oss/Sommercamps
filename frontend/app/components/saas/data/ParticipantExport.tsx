'use client'

import { useId, useState } from 'react'
import { xlsxHrefWithFilter, type ExportColumn } from '../../../lib/exportCsv'
import { paymentStatusLabel } from '../../../lib/i18n/de'
import type { CampAdmin, RegistrationAdmin } from '../../../lib/saasAdminApi'
import { filterRegistrations, type ParticipantFilter } from '../commandCenterLogic'
import { DAY_LIST_COLUMNS, dayListRows, exportFilterText } from '../dayListExport'
import ExportBar from '../ui/ExportBar'
import DayListPrint from './DayListPrint'

export default function ParticipantExport({ registrations, camp, orgSlug, filter, search, allColumns, onReset }: {
  registrations: RegistrationAdmin[]
  camp: CampAdmin
  orgSlug: string
  filter: ParticipantFilter
  search: string
  allColumns: ExportColumn<RegistrationAdmin>[]
  onReset: () => void
}) {
  const [purpose, setPurpose] = useState('daylist')
  const [printing, setPrinting] = useState(false)
  const purposeId = useId()
  const filtered = filterRegistrations(registrations, filter, search)
  const rows = purpose === 'daylist' ? dayListRows(registrations, filter, search) : filtered
  const filterText = exportFilterText(filter, search)
  const paymentColumns: ExportColumn<RegistrationAdmin>[] = [
    { header: 'Kind', value: r => `${r.child_first_name} ${r.child_last_name}` },
    { header: 'Elternteil', value: r => `${r.parent_first_name} ${r.parent_last_name}` },
    { header: 'E-Mail', value: r => r.parent_email },
    { header: 'Preis (EUR)', value: () => (camp.price_cents / 100).toFixed(2).replace('.', ',') },
    { header: 'Zahlungsstatus', value: r => paymentStatusLabel[r.payment_status] ?? r.payment_status },
  ]

  return <>
    <ExportBar
      rows={rows}
      columns={purpose === 'daylist' ? DAY_LIST_COLUMNS : purpose === 'payments' ? paymentColumns : allColumns}
      csvFilename={`${camp.slug}-${purpose}.csv`}
      xlsxHref={xlsxHrefWithFilter(`/pilot/${orgSlug}/camps/${camp.slug}/export?view=${purpose}`, rows.map(r => r.registration_token), registrations.length)}
      summary={<>
        <p>{purpose === 'daylist' ? `Tagesliste enthält ${rows.length} Teilnehmende (ohne Warteliste und Stornierungen)` : `${rows.length} Anmeldungen · einschließlich Warteliste und Stornierungen`}</p>
        {(filter !== 'all' || search.trim()) && <p>{filterText}</p>}
      </>}
      configuration={<>
        <label htmlFor={purposeId} className="mb-1 block">Was möchtest du exportieren?</label>
        <select id={purposeId} value={purpose} onChange={e => setPurpose(e.target.value)} className="min-h-[44px] w-full rounded border px-2 text-base">
          <option value="daylist">Camp-Tagesliste</option>
          <option value="payments">Zahlungsübersicht</option>
          <option value="participants">Alle Anmeldungen</option>
        </select>
        <p className="mt-2 text-sm">{purpose === 'daylist' ? 'Angemeldet und bestätigt · alphabetisch nach Nachname, Vorname.' : 'Aktuelle Suche und Filter gelten auch hier.'} Deine Checkbox-Auswahl hat keinen Einfluss auf den Export.</p>
      </>}
      onReset={onReset}
      onPrint={() => setPrinting(true)}
      printEnabled={purpose === 'daylist'}
    />
    {printing && <DayListPrint camp={camp} rows={rows} filterText={filterText} onClose={() => setPrinting(false)} />}
  </>
}
