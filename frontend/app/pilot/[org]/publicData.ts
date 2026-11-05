import { cache } from 'react'
import { fetchCamps, fetchOrganization, fetchTrainingOffer, fetchTrainingOffers } from '../../lib/saasApi'

// Request-scoped: metadata and page share the same public API responses.
export const getPublicOrganization = cache((slug: string) => fetchOrganization(slug))
export const getPublicCamps = cache((slug: string) => fetchCamps(slug))

export const getPublicTrainingOffers = cache((slug: string) => fetchTrainingOffers(slug))
export const getPublicTrainingOffer = cache((slug: string, offerSlug: string) => fetchTrainingOffer(slug, offerSlug))
