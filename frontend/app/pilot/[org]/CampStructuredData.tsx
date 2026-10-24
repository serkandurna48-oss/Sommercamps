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
      offers: { '@type': 'Offer', price: camp.price_cents / 100, priceCurrency: 'EUR' },
      organizer: { '@type': 'SportsOrganization', name: org.name },
    }

    return <script key={camp.slug} type="application/ld+json" dangerouslySetInnerHTML={{
      __html: JSON.stringify(event).replace(/</g, '\\u003c'),
    }} />
  })
}
