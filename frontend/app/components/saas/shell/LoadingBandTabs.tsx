'use client'

import { usePathname } from 'next/navigation'
import { campTabs, orgTabs } from '../navTabs'
import BandTabs from './BandTabs'

/**
 * Bereichsnavigation für die Ladezustände. `loading.tsx` bekommt laut
 * Next.js keine Route-Params ("Loading UI components do not accept any
 * parameters"), deshalb kommen Verein und Camp hier aus dem Pfad — sonst
 * müsste das Band während des Ladens ohne Tabs auskommen und die Navigation
 * würde kurzzeitig verschwinden. Die Vereinsfarbe steht erst mit den Daten
 * fest; bis dahin markiert der neutrale Bandton den aktiven Bereich.
 */
export default function LoadingBandTabs() {
  const segments = usePathname().split('/').filter(Boolean)
  const orgSlug = segments[1]
  if (!orgSlug) return null
  const campSlug = segments[2] === 'camps' ? segments[3] : undefined
  return <BandTabs tabs={campSlug ? campTabs(orgSlug, campSlug) : orgTabs(orgSlug)} brandColor="var(--cp-on-band)" />
}
