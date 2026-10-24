import { notFound } from 'next/navigation'
import type { CampPublic, OrganizationPublic } from '../../lib/saasApi'
import { computeBrandSafe } from '../../lib/brandPipeline'
import { readableTextOn } from '../../lib/readableTextOn'
import ParentFlow from '../../pilot/[org]/ParentFlow'
import { publicFontClassName } from '../../pilot/[org]/publicFonts'
import GrainOverlay from '../../pilot/[org]/GrainOverlay'
import '../../pilot/[org]/publicTheme.css'
import type { FilterState } from '../../pilot/[org]/campFilterUtils'
import { parseUrlFilter } from '../../pilot/[org]/campFilterUtils'

export const metadata = { title: 'CF1 Vorschau – CampsPilot', robots: { index: false, follow: false } }

const LOCS = ['Baunatal', 'Fulda', 'Gießen', 'Hanau', 'Kassel', 'Marburg', 'Wetzlar', 'Wiesbaden']
const DATE_TRIPLES: Array<[string, string]> = [
  ['2027-07-07', '2027-07-11'],
  ['2027-07-14', '2027-07-18'],
  ['2027-08-04', '2027-08-08'],
]

function makeCamp(i: number): CampPublic {
  return {
    slug: `camp-${i}`,
    title: `Fußballcamp ${i + 1}`,
    start_date: DATE_TRIPLES[Math.floor(i / 8)][0],
    end_date: DATE_TRIPLES[Math.floor(i / 8)][1],
    registration_start: null,
    registration_end: null,
    age_min: 8,
    age_max: 14,
    capacity: 20,
    price_cents: 19900,
    currency: 'EUR',
    registration_open: true,
    location: LOCS[i % 8],
    care_info: null,
    meals_info: null,
    includes: null,
    registered_count: 5,
    waitlist_count: 0,
    spots_remaining: 15,
    is_full: false,
  }
}

const camps24 = Array.from({ length: 24 }, (_, i) => makeCamp(i))

const THEME_SURFACE: Record<string, string> = {
  tradition: '#FFFFFF',
  akademie: '#161C1A',
  kompakt: '#FFFFFF',
}

type SearchParams = Promise<{ theme?: string; ort?: string; zeit?: string }>

export default async function Cf1PreviewPage({ searchParams }: { searchParams: SearchParams }) {
  if (process.env.NODE_ENV !== 'development' && !process.env.CF1_PREVIEW) notFound()

  const query = await searchParams
  const theme = (query?.theme === 'akademie' || query?.theme === 'kompakt') ? query.theme : 'tradition'
  const ground = THEME_SURFACE[theme]
  const brand = computeBrandSafe('#cc0000', ground)

  const org: OrganizationPublic = {
    slug: 'demo-fc',
    name: 'Demo FC',
    legal_name: null,
    legal_address: null,
    contact_person_name: null,
    contact_email: 'demo@example.com',
    contact_phone: null,
    logo_url: null,
    primary_color: '#cc0000',
    theme,
    iban: null,
    intro_heading: 'Fußball, Freunde, Ferien',
    intro_text: 'Sechs Tage intensives Training, neue Freundschaften und unvergessliche Erinnerungen — für Kinder von 8 bis 14 Jahren.',
    hero_image_url: null,
    trainer_image_url: null,
    trainer_text: null,
    terms_text: null,
  }

  const searchStr = [
    query?.ort ? `ort=${query.ort}` : '',
    query?.zeit ? `zeit=${query.zeit}` : '',
  ].filter(Boolean).join('&')
  const testFilter: FilterState | undefined = searchStr ? parseUrlFilter(`?${searchStr}`) : undefined

  return (
    <div
      className={`cp-public ${publicFontClassName(theme)}`}
      data-theme={theme}
      style={
        {
          '--brand': brand.brand,
          '--brand-strong': brand.strong,
          '--brand-on': brand.on,
          '--on-primary': readableTextOn(brand.brand),
        } as React.CSSProperties
      }
    >
      <GrainOverlay />
      <div className="app">
        <ParentFlow org={org} camps={camps24} testFilter={testFilter} />
      </div>
    </div>
  )
}
