'use client'

import ExportBar from '../ui/ExportBar'
import { waitlistExportColumns, type WaitlistExportRow } from '../waitlistExport'

/**
 * Thin client wrapper around ExportBar for the Warteliste pages. Needed
 * because those pages are Server Components — computing `columns` there
 * (an array containing functions, from waitlistExportColumns) and passing
 * it down as a prop would try to serialize functions across the
 * server/client boundary, which React rejects ("Functions cannot be
 * passed directly to Client Components"). ParticipantList and
 * PaymentSection don't need this wrapper because they're already client
 * components themselves and compute their columns internally.
 */
export default function WaitlistExportBar({
  rows,
  showCampTitle,
  csvFilename,
  xlsxHref,
}: {
  rows: WaitlistExportRow[]
  showCampTitle: boolean
  csvFilename: string
  xlsxHref: string
}) {
  return <ExportBar rows={rows} columns={waitlistExportColumns(showCampTitle)} csvFilename={csvFilename} xlsxHref={xlsxHref} />
}
