'use client'

import { useState, useSyncExternalStore } from 'react'
import ParticipantPrintDialog from '../../components/saas/data/ParticipantPrintDialog'
import type { CampAdmin, RegistrationAdmin, RegistrationQuestion } from '../../lib/saasAdminApi'
import { DEFAULT_PRINT_FIELDS, participantPrintFields, type PrintPurpose } from '../../components/saas/participantPrint'

const FIRST_NAMES = [
  'Anna', 'Ben', 'Clara', 'David', 'Emma', 'Felix', 'Greta', 'Hans', 'Ida', 'Jan',
  'Kira', 'Leon', 'Mia', 'Nick', 'Olivia', 'Paul', 'Quinn', 'Rosa', 'Sam', 'Tina',
  'Uwe', 'Vera', 'Wolf', 'Xena', 'Yuki', 'Zara', 'Alex', 'Beth', 'Carl', 'Dora',
]
const LAST_NAMES = ['Meier', 'Müller', 'Schmidt', 'Fischer', 'Weber', 'Schneider', 'Bauer']

const EXTRA_QUESTIONS: RegistrationQuestion[] = [
  { key: 'verein', label: 'Herkunftsverein laut Anmeldung', type: 'text', options: null, other_label: null, required: false },
  { key: 'position', label: 'Spielposition (z. B. Stürmer)', type: 'text', options: null, other_label: null, required: false },
  { key: 'tshirt', label: 'T-Shirt-Größe', type: 'text', options: null, other_label: null, required: false },
]

const LOGO_URLS: Record<string, string | undefined> = {
  none: undefined,
  square: '/dev-druck-test/logo-square.svg',
  wide: '/dev-druck-test/logo-wide.svg',
  tall: '/dev-druck-test/logo-tall.svg',
}

function addDays(dateStr: string, n: number): string {
  // UTC arithmetic: local midnight + toISOString shifts a day east of UTC.
  const day = new Date(`${dateStr}T00:00:00Z`)
  day.setUTCDate(day.getUTCDate() + n)
  return day.toISOString().slice(0, 10)
}

function makeRows(n: number): RegistrationAdmin[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `druck-test-${i}`,
    registration_token: `dt-${String(i).padStart(4, '0')}`,
    payment_reference: `CP-DT${String(i).padStart(6, '0')}`,
    status: 'confirmed' as const,
    payment_status: 'paid' as const,
    child_first_name: i === 0
      ? 'Maximilian-Alexander'
      : FIRST_NAMES[i % FIRST_NAMES.length],
    child_last_name: i === 0
      ? 'Wolfhardsson-Lindenfels'
      : LAST_NAMES[i % LAST_NAMES.length],
    child_birth_date: `${2015 - (i % 5)}-03-15`,
    parent_first_name: 'Testperson',
    parent_last_name: LAST_NAMES[i % LAST_NAMES.length],
    parent_email: i === 3
      ? 'maximilian.wolfhard.mustermann-sehr-langer-name@beispielverein-musterstadt.example'
      : `familie${i + 1}@campspilot.example`,
    parent_phone: '+49 170 1234567',
    emergency_contact_name: 'Notfall Kontakt',
    emergency_contact_phone: '+49 170 9876543',
    allergies: i === 1
      ? 'Nüsse, Erdnüsse, Sesam, Fisch, Krebstiere, Weizen (Gluten), Milch (Laktose), Eier, Soja, Sellerie, Senf und Sulfit – bitte keine Desserts ohne Rücksprache mit den Eltern. Notfallmedikament EpiPen vorhanden.'
      : i % 9 === 0
        ? 'Nüsse'
        : null,
    medical_notes: i === 2
      ? 'Leichte Herzschwäche (diagnostiziert 2024): täglich Betablocker morgens und abends. Bei Anzeichen von Schwindel oder Übelkeit sofort die Eltern anrufen (+49 170 9999 9999). Kein Leistungssport ohne Pause alle 30 min. Notfalldaten liegen beim Vereinsarzt vor.'
      : null,
    jersey_size: ['128', '140', '152', '164'][i % 4],
    pickup_authorized: 'Erziehungsberechtigte',
    photo_permission: i % 4 !== 0,
    created_at: `2027-01-${String((i % 28) + 1).padStart(2, '0')}T10:00:00Z`,
    extra_answers: {
      verein: `Sportverein ${LAST_NAMES[i % LAST_NAMES.length]} e. V.`,
      position: ['Stürmer', 'Mittelfeld', 'Abwehr', 'Tor'][i % 4],
      tshirt: ['S', 'M', 'L', 'XL'][i % 4],
    },
  }))
}

type Params = Record<string, string | string[] | undefined>

function str(p: string | string[] | undefined): string | undefined {
  return typeof p === 'string' ? p : undefined
}

export default function DruckTestClient({ params }: { params: Params }) {
  const n = Math.max(1, Math.min(60, parseInt(str(params.n) ?? '10', 10) || 10))
  const colsMode = str(params.cols) ?? 'default'
  const logoKey = str(params.logo) ?? 'none'
  const brandHex = str(params.brand)
  const purposeRaw = str(params.purpose)
  const purpose: PrintPurpose = purposeRaw === 'participants' ? 'participants' : 'daylist'
  const days = Math.max(1, Math.min(7, parseInt(str(params.days) ?? '5', 10) || 5))

  const startDate = '2027-07-05'
  const endDate = addDays(startDate, days - 1)

  const camp: CampAdmin = {
    id: 'dev-camp', organization_id: 'dev-org', slug: 'dev-camp',
    title: 'Testtechnikcamp Wolkenfeld', start_date: startDate, end_date: endDate,
    registration_start: null, registration_end: null,
    age_min: 7, age_max: 14, capacity: 60, price_cents: 18900, currency: 'EUR',
    location: 'Sportpark Testgelände', care_info: null, meals_info: null, includes: null, status: 'published',
  }

  const questions = colsMode === 'all' ? EXTRA_QUESTIONS : []
  const rows = makeRows(n)
  const fields = participantPrintFields(questions)
  const allIds = fields.map(f => f.id)
  const defaultIds = [...DEFAULT_PRINT_FIELDS[purpose]]

  const [selectedFields, setSelectedFields] = useState<string[]>(
    colsMode === 'all' ? allIds : defaultIds,
  )
  // The dialog portals into document.body: render it only in the browser.
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false)

  if (!mounted) return <p style={{ padding: 24, fontFamily: 'sans-serif' }}>Lade Druckvorschau…</p>

  return (
    <ParticipantPrintDialog
      camp={camp}
      rows={rows}
      filterText=""
      orgName="Testverein Druck-Test"
      orgLogoUrl={LOGO_URLS[logoKey]}
      brandColor={brandHex ? `#${brandHex}` : undefined}
      questions={questions}
      selectedFields={selectedFields}
      onFieldsChange={setSelectedFields}
      onClose={() => {}}
      purpose={purpose}
    />
  )
}
