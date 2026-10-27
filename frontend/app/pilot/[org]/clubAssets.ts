/** Fixed mapping of org slugs to local club image assets. */

export interface ClubAssets {
  heroImage: string
  galleryImages: readonly string[]
  galleryAltTexts: Readonly<Record<string, string>>
  logoImage?: string
  heroPosition?: string
  heroPositionMobile?: string
  /** Optional desktop-only zoom. Mobile keeps its original crop and scale. */
  heroDesktopScale?: number
  sponsor?: {
    heading: string
    intro: string
    entries: readonly {
      name: string
      text?: string
      logoSrc?: string
      logoAlt?: string
      imageSrc?: string
      imageAlt?: string
      linkHref?: string
      linkLabel?: string
    }[]
  }
}

const ASSETS: Record<string, ClubAssets> = {
  'ksv-baunatal': {
    heroImage: '/clubs/ksv/ksv-1-mannschaft.jpg',
    galleryImages: [
      '/clubs/ksv/ksv-gruppenfoto.jpg',
      '/clubs/ksv/ksv-kinder-pokal.jpg',
      '/clubs/ksv/ksv-torwart.jpg',
    ],
    galleryAltTexts: {
      '/clubs/ksv/ksv-gruppenfoto.jpg': 'Gruppenfoto beim KSV Baunatal',
      '/clubs/ksv/ksv-kinder-pokal.jpg': 'Kinder mit Pokal beim KSV Baunatal',
      '/clubs/ksv/ksv-torwart.jpg': 'Torwart beim KSV Baunatal',
    },
    logoImage: '/clubs/ksv/ksv-logo.png',
    heroPosition: 'center 30%',
    heroPositionMobile: 'center 15%',
    heroDesktopScale: 1.08,
    sponsor: {
      heading: 'Sponsoren & Partner',
      intro: 'Sie möchten die Fußballschule KSV Baunatal unterstützen? Sprechen Sie mit uns über Möglichkeiten einer Partnerschaft.',
      // Add confirmed partners here; an empty list makes no company claims.
      entries: [],
    },
  },
}

/** Returns the static club assets for `orgSlug`, or null if none are defined. */
export function getClubAssets(orgSlug: string): ClubAssets | null {
  return ASSETS[orgSlug] ?? null
}
