import type { LeadKind, LeadStatus } from '../lib/saasAdminApi'

export const STATUS_ORDER: LeadStatus[] = ['neu', 'kontaktiert', 'gespraech', 'demo', 'angebot', 'gewonnen', 'verloren']

export const STATUS_LABEL: Record<LeadStatus, string> = {
  neu: 'Neu',
  kontaktiert: 'Kontaktiert',
  gespraech: 'Gespräch',
  demo: 'Demo',
  angebot: 'Angebot',
  gewonnen: 'Gewonnen',
  verloren: 'Verloren',
}

export const KIND_LABEL: Record<LeadKind, string> = {
  verein: 'Verein',
  fussballschule: 'Fußballschule',
  sonstige: 'Sonstige',
}

export const ROLE_LABEL = { owner: 'Plattform', sales_lead: 'Vertriebsleitung', sales_rep: 'Vertrieb' } as const

export function isOpen(status: LeadStatus): boolean {
  return status !== 'gewonnen' && status !== 'verloren'
}

/** Due date relative to today (Berlin date string YYYY-MM-DD from the API). */
export function dueLabel(date: string | null, today: string): { text: string; overdue: boolean } | null {
  if (!date) return null
  const [y, m, d] = date.split('-')
  const text = `${d}.${m}.${y}`
  if (date < today) return { text: `überfällig seit ${text}`, overdue: true }
  if (date === today) return { text: 'heute', overdue: false }
  return { text, overdue: false }
}

export function todayBerlin(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date())
}
