/** Fixed mapping of org slugs to local club image assets. */

export interface ClubAssets {
  heroImage: string
  galleryImages: readonly string[]
  logoImage?: string
  heroPosition?: string
  heroPositionMobile?: string
}

const ASSETS: Record<string, ClubAssets> = {
  'ksv-baunatal': {
    heroImage: '/clubs/ksv/ksv-1-mannschaft.jpg',
    galleryImages: [
      '/clubs/ksv/ksv-gruppenfoto.jpg',
      '/clubs/ksv/ksv-kinder-pokal.jpg',
      '/clubs/ksv/ksv-torwart.jpg',
    ],
    logoImage: '/clubs/ksv/ksv-logo.png',
    heroPosition: 'center 30%',
    heroPositionMobile: 'center 15%',
  },
}

/** Returns the static club assets for `orgSlug`, or null if none are defined. */
export function getClubAssets(orgSlug: string): ClubAssets | null {
  return ASSETS[orgSlug] ?? null
}
