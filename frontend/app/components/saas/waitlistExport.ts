import { daysSince } from '../../lib/i18n/de'
import type { ExportColumn } from '../../lib/exportCsv'
import type { CampAdmin, RegistrationAdmin } from '../../lib/saasAdminApi'

export interface WaitlistExportRow {
  camp: CampAdmin
  position: number
  registration: RegistrationAdmin
}

/** Shared between the org- and camp-level Warteliste pages — mirrors the
 * column set backend_saas's export.xlsx?view=waitlist produces (see
 * app/routers/exports.py::_waitlist_sheet). */
export function waitlistExportColumns(showCampTitle: boolean): ExportColumn<WaitlistExportRow>[] {
  return [
    ...(showCampTitle ? [{ header: 'Camp', value: (r: WaitlistExportRow) => r.camp.title }] : []),
    { header: 'Platz', value: r => r.position },
    { header: 'Kind', value: r => `${r.registration.child_first_name} ${r.registration.child_last_name}` },
    { header: 'Geburtsjahr', value: r => r.registration.child_birth_date.slice(0, 4) },
    { header: 'Elternteil', value: r => `${r.registration.parent_first_name} ${r.registration.parent_last_name}` },
    { header: 'E-Mail', value: r => r.registration.parent_email },
    { header: 'Telefon', value: r => r.registration.parent_phone },
    { header: 'Wartet seit (Tage)', value: r => daysSince(r.registration.created_at) },
  ]
}
