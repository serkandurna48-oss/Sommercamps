import type { CampAdmin, OrganizationAdmin, RegistrationAdmin } from './saasAdminApi'
import { isOpenPayment } from '../components/saas/commandCenterLogic'
import { formatCampDateRange, formatPrice } from './parentFlowFormat'

export type ReminderOrganization = Pick<OrganizationAdmin,
  'name' | 'legal_name' | 'iban' | 'contact_person_name' | 'contact_email'>

export interface ReminderEntry {
  registration: RegistrationAdmin
  camp: CampAdmin
}

export const reminderLabels = {
  copy: 'Erinnerung kopieren',
  copyAll: 'Alle offenen als Liste kopieren',
  missingIban: 'IBAN in den Vereinseinstellungen fehlt',
  copied: 'Text kopiert',
  fallback: 'Kopieren nicht möglich. Bitte wählen Sie den Text aus und kopieren Sie ihn manuell.',
  fallbackLabel: 'Text zum manuellen Kopieren',
} as const

export function formatIban(iban: string): string {
  return iban.replace(/\s/g, '').match(/.{1,4}/g)?.join(' ') ?? ''
}

export function canCopyReminder(entry: ReminderEntry, org: ReminderOrganization): boolean {
  return isOpenPayment(entry.registration) && formatIban(org.iban ?? '').length > 0
}

/** Pure client-side text generation; the reference is deliberately never normalized. */
export function buildPaymentReminder(entry: ReminderEntry, org: ReminderOrganization): string | null {
  if (!canCopyReminder(entry, org)) return null
  const { registration: r, camp } = entry
  const accountHolder = org.legal_name ?? org.name
  const signature = [org.contact_person_name, accountHolder, org.contact_email].filter(Boolean).join('\n')
  return [
    `Guten Tag ${r.parent_first_name} ${r.parent_last_name},`,
    `die Zahlung für ${r.child_first_name} für ${camp.title} (${formatCampDateRange(camp.start_date, camp.end_date)}) ist bisher noch nicht bei uns eingegangen.`,
    'Bitte überweisen Sie den offenen Betrag mit folgendem Verwendungszweck:',
    [
      `Kontoinhaber: ${accountHolder}`,
      `IBAN: ${formatIban(org.iban!)}`,
      `Betrag: ${formatPrice(camp.price_cents, camp.currency)}`,
      `Verwendungszweck: ${r.payment_reference}`,
    ].join('\n'),
    'Falls Sie bereits überwiesen haben, betrachten Sie diese Erinnerung bitte als gegenstandslos. Vielen Dank!',
    `Mit freundlichen Grüßen\n${signature}`,
  ].join('\n\n')
}

export function buildOpenPaymentList(entries: readonly ReminderEntry[]): string {
  return entries.filter(entry => isOpenPayment(entry.registration)).map(({ registration: r, camp }) => [
    `${r.parent_first_name} ${r.parent_last_name}`,
    `${r.child_first_name} ${r.child_last_name}`,
    camp.title,
    formatPrice(camp.price_cents, camp.currency),
    r.payment_reference,
  ].join(' – ')).join('\n')
}
