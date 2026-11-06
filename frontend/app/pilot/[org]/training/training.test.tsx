/**
 * Öffentliche Trainingsseiten: Liste, Angebotsdetail mit Terminen, Bestätigung,
 * Metadaten und Fehlerpfade. Server-Komponenten werden direkt gerendert.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrganizationPublic, RegistrationCreated, TrainingOfferDetail } from '../../../lib/saasApi'

vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('notFound') } }))
vi.mock('../GrainOverlay', () => ({ default: () => null }))
vi.mock('../publicFonts', () => ({ publicFontClassName: () => '' }))
vi.mock('../../AnalyticsConsent', () => ({ default: () => null }))
vi.mock('../publicData', () => ({
  getPublicOrganization: vi.fn(),
  getPublicTrainingOffers: vi.fn(),
  getPublicTrainingOffer: vi.fn(),
}))

import { getPublicOrganization, getPublicTrainingOffer, getPublicTrainingOffers } from '../publicData'
import TrainingOffersPage, { generateMetadata as listMetadata } from './page'
import TrainingOfferPage, { generateMetadata as offerMetadata } from './[offerSlug]/page'
import TrainingOfferFlow from './TrainingOfferFlow'
import TrainingDoneScreen from './TrainingDoneScreen'

const org: OrganizationPublic = {
  slug: 'testverein', name: 'Testverein', legal_name: 'Testverein e. V.', legal_address: null,
  contact_person_name: null, contact_email: 'kontakt@testverein.example', contact_phone: null,
  logo_url: null, primary_color: null, theme: 'tradition', iban: 'DE89370400440532013000',
  intro_heading: null, intro_text: null, hero_image_url: null,
  trainer_image_url: null, trainer_text: null, terms_text: null,
}

const offer: TrainingOfferDetail = {
  slug: 'einzel-30', title: 'Einzeltraining 30 Min', kind: 'einzel', description: 'Individuelles Training mit dem Torwarttrainer.',
  duration_minutes: 30, location: 'Sportplatz Nord', price_member_cents: 3500, price_nonmember_cents: 4500,
  sessions: [
    { slug: 's1', starts_at: '2026-11-12T15:00:00Z', ends_at: '2026-11-12T15:30:00Z', local_date: '2026-11-12', local_time: '16:00',
      capacity: 1, free_spots: 1, price_member_cents: 3500, price_nonmember_cents: 4500, age_min: 6, age_max: 14 },
    { slug: 's2', starts_at: '2026-11-12T16:00:00Z', ends_at: '2026-11-12T16:30:00Z', local_date: '2026-11-12', local_time: '17:00',
      capacity: 1, free_spots: 0, price_member_cents: 3500, price_nonmember_cents: 4500, age_min: 6, age_max: 14 },
  ],
}

beforeEach(() => {
  vi.mocked(getPublicOrganization).mockReset().mockResolvedValue(org)
  vi.mocked(getPublicTrainingOffers).mockReset().mockResolvedValue([{ ...offer, from_price_member_cents: 3500, from_price_nonmember_cents: 4500 }])
  vi.mocked(getPublicTrainingOffer).mockReset().mockResolvedValue(offer)
})

const listParams = Promise.resolve({ org: 'testverein' })
const offerParams = Promise.resolve({ org: 'testverein', offerSlug: 'einzel-30' })

describe('Angebotsliste', () => {
  it('lists published offers with a link, duration and the price text built from the real prices', async () => {
    const html = renderToStaticMarkup(await TrainingOffersPage({ params: listParams }))
    expect(html).toContain('href="/pilot/testverein/training/einzel-30"')
    expect(html).toContain('Einzeltraining 30 Min')
    expect(html).toContain('30 Minuten')
    expect(html).toContain('ab 35 € für Mitglieder, ab 45 € sonst – geprüft bei der Buchung')
  })

  it('shows the lowest session price (not the offer template) and no price without sessions', async () => {
    vi.mocked(getPublicTrainingOffers).mockResolvedValue([
      { ...offer, price_member_cents: 2000, price_nonmember_cents: 3000, from_price_member_cents: 3500, from_price_nonmember_cents: 4500 },
      { ...offer, slug: 'leer', title: 'Ohne Termin', from_price_member_cents: null, from_price_nonmember_cents: null },
    ])
    const html = renderToStaticMarkup(await TrainingOffersPage({ params: listParams }))
    expect(html).toContain('ab 35 € für Mitglieder')
    expect(html).not.toContain('20 €')
    expect(html.match(/tr-price/g)).toHaveLength(1)
  })

  it('shows a friendly empty state', async () => {
    vi.mocked(getPublicTrainingOffers).mockResolvedValue([])
    const html = renderToStaticMarkup(await TrainingOffersPage({ params: listParams }))
    expect(html).toContain('keine buchbaren Trainingsangebote')
  })

  it('uses the existing not-found handling for an unknown organization', async () => {
    vi.mocked(getPublicOrganization).mockResolvedValue(null)
    await expect(TrainingOffersPage({ params: listParams })).rejects.toThrow('notFound')
  })

  it('is not found when the club has no trainings module', async () => {
    vi.mocked(getPublicOrganization).mockResolvedValue({ ...org, modules: ['camps'] })
    await expect(TrainingOffersPage({ params: listParams })).rejects.toThrow('notFound')
    await expect(TrainingOfferPage({ params: offerParams })).rejects.toThrow('notFound')
  })

  it('shows the load error page when the API fails', async () => {
    vi.mocked(getPublicTrainingOffers).mockRejectedValue(new Error('down'))
    const html = renderToStaticMarkup(await TrainingOffersPage({ params: listParams }))
    expect(html).toContain('Training gerade nicht erreichbar')
  })
})

describe('Angebotsdetail', () => {
  it('shows description, duration, location, price text, cancellation note and sessions with time', async () => {
    const html = renderToStaticMarkup(await TrainingOfferPage({ params: offerParams }))
    expect(html).toContain('Individuelles Training mit dem Torwarttrainer.')
    expect(html).toContain('30 Minuten')
    expect(html).toContain('Sportplatz Nord')
    expect(html).toContain('35 € für Mitglieder, 45 € sonst – geprüft bei der Buchung')
    expect(html).toContain('Kostenlose Absage bis 24 h vorher – bitte direkt beim Verein melden.')
    expect(html).toContain('Do., 12. Nov. 2026, 16:00 Uhr')
    expect(html).toContain('Platz frei')
  })

  it('renders full sessions as ausgebucht and not selectable', () => {
    const html = renderToStaticMarkup(<TrainingOfferFlow org={org} initialOffer={offer} />)
    expect(html).toContain('ausgebucht')
    expect(html.match(/<button[^>]*class="tr-session"/g)).toHaveLength(1)
    expect(html).toContain('aria-disabled="true"')
  })

  it('tells the visitor when no sessions exist', () => {
    const html = renderToStaticMarkup(<TrainingOfferFlow org={org} initialOffer={{ ...offer, sessions: [] }} />)
    expect(html).toContain('Aktuell sind keine Termine buchbar')
  })

  it('collapses to the plain price when member and non-member price are equal', () => {
    const html = renderToStaticMarkup(<TrainingOfferFlow org={org} initialOffer={{ ...offer, sessions: offer.sessions.map(item => ({ ...item, price_member_cents: 4000, price_nonmember_cents: 4000 })) }} />)
    expect(html).not.toContain('Mitglieder')
    expect(html).toContain('40 €')
  })

  it('shows the sessions\' frozen price instead of a changed offer price', () => {
    const changed = { ...offer, price_member_cents: 2000, price_nonmember_cents: 3000 }
    const html = renderToStaticMarkup(<TrainingOfferFlow org={org} initialOffer={changed} />)
    expect(html).toContain('35 € für Mitglieder, 45 € sonst')
    expect(html).not.toContain('20 €')
    expect(html).not.toContain('tr-session-price')
  })

  it('shows the price per session where the sessions differ and no single offer price', () => {
    const mixed = {
      ...offer,
      sessions: [offer.sessions[0], { ...offer.sessions[1], free_spots: 1, price_member_cents: 2000, price_nonmember_cents: 4000 }],
    }
    const html = renderToStaticMarkup(<TrainingOfferFlow org={org} initialOffer={mixed} />)
    expect(html).not.toContain('<dt>Preis</dt>')
    expect(html.match(/tr-session-price/g)).toHaveLength(2)
    expect(html).toContain('35 € für Mitglieder, 45 € sonst')
    expect(html).toContain('20 € für Mitglieder, 40 € sonst')
  })

  it('renders no mailto:null link when the club has no contact email', () => {
    const noMail = { ...org, contact_email: null } as unknown as OrganizationPublic
    const html = renderToStaticMarkup(<TrainingOfferFlow org={noMail} initialOffer={{ ...offer, sessions: [] }} />)
    expect(html).not.toContain('mailto')
    expect(html).not.toContain('null')
  })

  it('keeps line breaks of the description without HTML', () => {
    const html = renderToStaticMarkup(<TrainingOfferFlow org={org} initialOffer={{ ...offer, description: 'Zeile 1\n<b>Zeile 2</b>' }} />)
    expect(html).toContain('white-space:pre-line')
    expect(html).toContain('&lt;b&gt;')
  })

  it('uses not-found for an unknown or unpublished offer and for an unknown organization', async () => {
    vi.mocked(getPublicTrainingOffer).mockResolvedValue(null)
    await expect(TrainingOfferPage({ params: offerParams })).rejects.toThrow('notFound')
    vi.mocked(getPublicOrganization).mockResolvedValue(null)
    await expect(TrainingOfferPage({ params: offerParams })).rejects.toThrow('notFound')
  })

  it('shows the load error page when the offer cannot be loaded', async () => {
    vi.mocked(getPublicTrainingOffer).mockRejectedValue(new Error('down'))
    const html = renderToStaticMarkup(await TrainingOfferPage({ params: offerParams }))
    expect(html).toContain('Training gerade nicht erreichbar')
  })

  it('addresses parents with Sie and never hints at membership beyond the price text', async () => {
    const html = renderToStaticMarkup(await TrainingOfferPage({ params: offerParams }))
    expect(html).not.toMatch(/\b(du|dich|dein|deine|deinen|dir)\b/i)
    expect(html).not.toContain('Vereinsmitglied')
    expect(html).not.toContain('Mitgliedschaft')
  })
})

describe('Metadaten', () => {
  it('builds title and description per offer without a custom image', async () => {
    const metadata = await offerMetadata({ params: offerParams })
    expect(metadata.title).toBe('Einzeltraining 30 Min – Testverein | Buchung')
    expect(metadata.description).toBe('Individuelles Training mit dem Torwarttrainer.')
    expect((metadata.openGraph as { images: unknown[] }).images).toEqual([])
  })

  it('falls back to a price-free text when the offer has no description (price is per session)', async () => {
    vi.mocked(getPublicTrainingOffer).mockResolvedValue({ ...offer, description: null })
    const metadata = await offerMetadata({ params: offerParams })
    expect(metadata.description).toContain('Termin auswählen')
    expect(metadata.description).not.toContain('€')
  })

  it('is neutral for unknown offers and when loading fails', async () => {
    vi.mocked(getPublicTrainingOffer).mockResolvedValue(null)
    expect((await offerMetadata({ params: offerParams })).title).toBe('CampsPilot')
    vi.mocked(getPublicOrganization).mockRejectedValue(new Error('down'))
    expect((await offerMetadata({ params: offerParams })).title).toBe('CampsPilot')
    expect((await listMetadata({ params: listParams })).title).toBe('CampsPilot')
  })

  it('titles the list page with the club name', async () => {
    expect((await listMetadata({ params: listParams })).title).toBe('Training buchen – Testverein')
  })
})

describe('Bestätigung', () => {
  const result: RegistrationCreated = {
    registration_token: 'tok', status: 'registered', payment_status: 'open', payment_reference: 'CP-1234', applied_price_cents: 3500,
  }
  const render = (over: { result?: Partial<RegistrationCreated>; method?: 'bar' | 'ueberweisung' | 'online'; org?: Partial<OrganizationPublic> } = {}) =>
    renderToStaticMarkup(
      <TrainingDoneScreen
        org={{ ...org, ...over.org }} offer={offer} session={offer.sessions[0]} result={{ ...result, ...over.result }}
        sessionSlug="einzel-1" childName="Mia" parentEmail="eva@example.de" paymentMethod={over.method ?? 'ueberweisung'} onBookAnother={() => {}}
      />,
    )

  it('shows session date with time and the price the server applied', () => {
    const html = render()
    expect(html).toContain('Do., 12. Nov. 2026, 16:00 Uhr')
    expect(html).toContain('35,00 €')
    expect(html).not.toContain('45,00')
  })

  it('uses the server price even when it differs from the displayed offer prices', () => {
    const html = render({ result: { applied_price_cents: 4500 } })
    expect(html).toContain('45,00 €')
    expect(html).not.toContain('35,00')
  })

  it('shows no price when the server sent none instead of computing one', () => {
    const html = render({ result: { applied_price_cents: undefined } })
    expect(html).not.toContain('35,00')
    expect(html).not.toContain('45,00')
    expect(html).not.toContain('Preis')
  })

  it('shows bank transfer details with IBAN and reference for Überweisung', () => {
    const html = render()
    expect(html).toContain('DE89370400440532013000')
    expect(html).toContain('CP-1234')
    expect(html).not.toContain('Bitte bar beim Training bezahlen.')
  })

  it('names the reference without IBAN when the club has none', () => {
    const html = render({ org: { iban: null } })
    expect(html).toContain('Der Verein meldet sich zur Zahlung.')
    expect(html).toContain('CP-1234')
  })

  it('asks for cash payment at the training for bar and shows no bank details', () => {
    const html = render({ method: 'bar' })
    expect(html).toContain('Bitte bar beim Training bezahlen.')
    expect(html).not.toContain('DE89370400440532013000')
  })

  it('online: shows the applied price, a pay button and no bank details', () => {
    const html = render({ method: 'online', result: { applied_price_cents: 4500 } })
    expect(html).toContain('Jetzt 45,00 € online bezahlen')
    expect(html).toContain('Online-Zahlung offen')
    expect(html).not.toContain('DE89370400440532013000')
    expect(html).not.toContain('35,00')
  })

  it('online: no pay button when the booking is no longer open', () => {
    const html = render({ method: 'online', result: { payment_status: 'paid' } })
    expect(html).not.toContain('online bezahlen</button>')
  })

  it('mentions the free cancellation and gives no membership hint', () => {
    const html = render()
    expect(html).toContain('Kostenlose Absage bis 24 h vorher – bitte direkt beim Verein melden.')
    expect(html).not.toContain('Mitglied')
  })
})

describe('Angebotsart als Label', () => {
  it('zeigt das Label in der Liste und auf der Angebotsseite, ohne Art nichts', async () => {
    vi.mocked(getPublicTrainingOffers).mockResolvedValue([
      { ...offer, category: 'premium', from_price_member_cents: 3500, from_price_nonmember_cents: 4500 },
      { ...offer, slug: 'ohne', title: 'Ohne Art', category: null, from_price_member_cents: null, from_price_nonmember_cents: null },
    ])
    const list = renderToStaticMarkup(await TrainingOffersPage({ params: listParams }))
    expect(list).toContain('Premium-Paket')
    expect(list.match(/data-testid="offer-category"/g)).toHaveLength(1)

    const flow = renderToStaticMarkup(<TrainingOfferFlow org={org} initialOffer={{ ...offer, category: 'videoanalyse' }} />)
    expect(flow).toContain('Videoanalyse')
    const none = renderToStaticMarkup(<TrainingOfferFlow org={org} initialOffer={offer} />)
    expect(none).not.toContain('offer-category')
  })
})
