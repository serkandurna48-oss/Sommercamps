import { cache } from 'react'
import { fetchCamps, fetchOrganization } from '../../lib/saasApi'

// Request-scoped: metadata and page share the same public API responses.
export const getPublicOrganization = cache((slug: string) => fetchOrganization(slug))
export const getPublicCamps = cache((slug: string) => fetchCamps(slug))
