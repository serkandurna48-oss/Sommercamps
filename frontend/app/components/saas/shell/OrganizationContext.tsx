'use client'

import { createContext, useContext } from 'react'
import type { OrganizationAdmin } from '../../../lib/saasAdminApi'

export type OrganizationIdentity = Pick<OrganizationAdmin, 'name' | 'logo_url' | 'primary_color'>
export const OrganizationContext = createContext<OrganizationIdentity | undefined>(undefined)
export const useOrganizationIdentity = () => useContext(OrganizationContext)

export function OrganizationProvider({ org, children }: { org?: OrganizationIdentity; children: React.ReactNode }) {
  return <OrganizationContext.Provider value={org}>{children}</OrganizationContext.Provider>
}
