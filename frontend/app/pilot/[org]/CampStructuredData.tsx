import type { CampPublic, OrganizationPublic } from '../../lib/saasApi'

export default function CampStructuredData({ org, camps }: {
  org: OrganizationPublic
  camps: CampPublic[]
}) {
  return camps.map(camp => {
    const event = {
      '@context': 'https://schema.org',
      '@type': 'SportsEvent',
      name: camp.title,
      startDate: camp.start_date,
      endDate: camp.end_date,
      ...(camp.location && { location: { '@type': 'Place', name: camp.location } }),
      offers: camp.price_member_cents != null && camp.price_member_cents < camp.price_cents
        ? { '@type': 'AggregateOffer', lowPrice: camp.price_member_cents / 100, highPrice: camp.price_cents / 100, priceCurrency: 'EUR' }
        : { '@type': 'Offer', price: camp.price_cents / 100, priceCurrency: 'EUR' },
      organizer: { '@type': 'SportsOrganization', name: org.name },
    }

    return <script key={camp.slug} type="application/ld+json" dangerouslySetInnerHTML={{
      __html: JSON.stringify(event).replace(/</g, '\\u003c'),
    }} />
  })
}
