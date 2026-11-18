/** Fixed mapping of org slugs to local club image assets. */

export interface ClubAssets {
  heroImage: string
  /** Below 700 px show the hero photo as a banner above the text instead of behind it (wide group photos). */
  heroMobileBanner?: boolean
  galleryImages: readonly string[]
  galleryAltTexts: Readonly<Record<string, string>>
  logoImage?: string
  heroPosition?: string
  heroPositionMobile?: string
  /** Phone zoom of the akademie hero (default 1.7); lower for taller 4:3 group photos. */
  heroMobileScale?: number
  /** transform-origin for that phone zoom (default '50% 96%'). */
  heroMobileOrigin?: string
  /** Optional desktop-only zoom. Mobile keeps its original crop and scale. */
  heroDesktopScale?: number
  /** Show the club's primary registration CTA before the dates CTA. */
  heroCtaEmphasis?: boolean
  sponsor?: {
    /** Section label; without it the block is labelled as "Sponsor / Anzeige" (also on each entry). */
    label?: string
    /** Position on the page; default is directly after the trainings. */
    placement?: 'afterTrainings' | 'afterTeam'
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
      /** Show `imageSrc` as a wide photo above the text instead of a small logo-sized image. */
      imageWide?: boolean
    }[]
  }
  /** Show the gallery images in "Über uns" as a slideshow (all images) instead of the static grid (max. 3). */
  aboutSlideshow?: boolean
  /** Photos shown as a strip inside the camps section. */
  campGallery?: {
    heading: string
    images: readonly { src: string; alt: string }[]
  }
  /** Trainer team shown below the founder/trainer block. */
  team?: {
    label: string
    heading: string
    /** Role line for the founder/trainer from the club's own data, shown as the first, larger card. */
    leadRole?: string
    photo?: { src: string; alt: string }
    members: readonly {
      name: string
      role?: string
      imageSrc?: string
      /** CSS object-position for the portrait crop. */
      imagePosition?: string
    }[]
  }
}

// JK Performance Academy: same shoot as the hero (frontend/public/jk). Used for the
// production slug and the staging demo, so both pages look the same.
const JK_ASSETS: ClubAssets = {
  heroImage: '/jk/hero.jpg',
  // Group photo: the people stand in the lower half of the frame. On phones it is a banner
  // above the text, so one picture works on every screen.
  heroPosition: 'center 65%',
  // 4:3 team photo (18.11.2026): smaller zoom keeps the back row's heads on phones.
  heroMobileScale: 1.15,
  heroMobileOrigin: '50% 90%',
  heroPositionMobile: '50% 88%',
  heroMobileBanner: true,
  // Five photos from training, shown as a slideshow next to the "Über uns" text (Serkan 17.11.).
  aboutSlideshow: true,
  galleryImages: [
    '/jk/about/01.jpg',
    '/jk/about/02.jpg',
    '/jk/about/03.jpg',
    '/jk/about/04.jpg',
    '/jk/about/05.jpg',
  ],
  galleryAltTexts: {
    '/jk/about/01.jpg': 'Trainer Jan-Maximilian Krug klatscht mit einem Spieler ab',
    '/jk/about/02.jpg': 'Spieler der JK Performance Academy beim gemeinsamen Aufwärmen',
    '/jk/about/03.jpg': 'Trainer erklärt einem jungen Spieler eine Übung am Ball',
    '/jk/about/04.jpg': 'Spieler bei einer Ballübung im Training',
    '/jk/about/05.jpg': 'Zwei Spieler der JK Performance Academy Arm in Arm',
  },
  logoImage: '/jk/logo.jpg',
  campGallery: {
    heading: 'Eindrücke aus unseren Camps',
    images: [
      { src: '/jk/camps/04.jpg', alt: 'Zweikampf vor dem Tor im Camp' },
      { src: '/jk/camps/01.jpg', alt: 'Spieler mit Bällen beim Camp-Training' },
      { src: '/jk/camps/03.jpg', alt: 'Spieler beim Torschuss, ein Trainer schaut zu' },
      { src: '/jk/camps/02.jpg', alt: 'Spieler jongliert den Ball im Camp' },
    ],
  },
  team: {
    label: 'Trainerteam',
    heading: 'Unser Team',
    leadRole: 'Gründer',
    photo: { src: '/jk/team/trainerteam.jpg', alt: 'Trainerteam der JK Performance Academy' },
    // Names and roles as confirmed by Jan (17.11.2026).
    members: [
      { name: 'Jan Baruschka', role: 'Partner-Trainer', imageSrc: '/jk/team/jan-baruschka.jpg', imagePosition: 'center 30%' },
      { name: 'Christian Andrecht', role: 'Partner-Trainer', imageSrc: '/jk/team/christian-andrecht.jpg', imagePosition: 'center 25%' },
      { name: 'Danny Breitfelder', role: 'Gast-Profi', imageSrc: '/jk/team/danny-breitfelder.jpg', imagePosition: '45% 20%' },
      { name: 'Jil Krug', imageSrc: '/jk/team/jil-krug.jpg', imagePosition: 'center 25%' },
      // Members without a photo are not shown on the page until one is added.
      { name: 'Serkan Durna', role: 'Gast-Profi und IT-Koordinator' },
    ],
  },
  sponsor: {
    label: 'Partner',
    placement: 'afterTeam',
    heading: 'Unsere Partner',
    intro: 'Sie möchten die JK Performance Academy unterstützen? Sprechen Sie mit uns über Möglichkeiten einer Partnerschaft.',
    entries: [
      {
        name: 'Sporthaus Kassel',
        text: 'Partner der JK Performance Academy.',
        imageSrc: '/jk/partner/sporthaus-kassel.jpg',
        imageAlt: 'Trainer der JK Performance Academy mit dem Sporthaus Kassel',
        imageWide: true,
      },
    ],
  },
}

const ASSETS: Record<string, ClubAssets> = {
  'jk-performance-academy': JK_ASSETS,
  'jk-academy-demo': JK_ASSETS,
  'ksv-baunatal': {
    heroImage: '/clubs/ksv/ksv-1-mannschaft.jpg',
    galleryImages: [
      '/clubs/ksv/ksv-kinder-2027.jpg',
      '/clubs/ksv/ksv-kinder-pokal.jpg',
      '/clubs/ksv/ksv-torwart.jpg',
    ],
    galleryAltTexts: {
      '/clubs/ksv/ksv-kinder-2027.jpg': 'Kinder der Fußballschule KSV Baunatal auf dem Trainingsgelände',
      '/clubs/ksv/ksv-kinder-pokal.jpg': 'Kinder mit Pokal beim KSV Baunatal',
      '/clubs/ksv/ksv-torwart.jpg': 'Torwart beim KSV Baunatal',
    },
    logoImage: '/clubs/ksv/ksv-logo.png',
    heroPosition: 'center 30%',
    heroPositionMobile: 'center 15%',
    heroDesktopScale: 1.08,
    heroCtaEmphasis: true,
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
