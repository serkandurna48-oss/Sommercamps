import type { CSSProperties, ReactNode } from 'react'
import type { Metadata } from 'next'
import { Fragment } from 'react'
import MediaSlideshow from './components/MediaSlideshow'
import { type CampConfig, fetchCampConfig } from './lib/campConfig'
import {
  CLUB_CONFIG,
  CAMPS,
  PROGRAMS,
  HIGHLIGHTS,
  INCLUDED_ITEMS,
  FAQ_ITEMS,
  VENUE_INFO_TEXT,
  FIRST_TEAM_INFO_TEXT,
  MEMBERSHIP_BENEFITS,
  SLIDESHOW_ITEMS,
} from './lib/clubConfig'
import {
  SECTION_ORDER,
  SITE_CONTENT,
  fill,
  fillOrNull,
  type SectionId,
  type TemplateVars,
} from './lib/siteContent'
import { THEME_TOKENS } from './lib/themeTokens'
import SiteHeader from './sections/SiteHeader'
import HeroSection, { type HeroFact } from './sections/HeroSection'
import SiteHeaderB from './sections/b/SiteHeaderB'
import HeroB from './sections/b/HeroB'
import TrustBar from './sections/b/TrustBar'
import CoreOffers from './sections/b/CoreOffers'
import CampListB from './sections/b/CampListB'
import WhyUsB from './sections/b/WhyUsB'
import CoachProfile from './sections/b/CoachProfile'
import DevelopmentProcess from './sections/b/DevelopmentProcess'
import SecondaryOffersB from './sections/b/SecondaryOffersB'
import RegistrationSectionB from './sections/b/RegistrationSectionB'
import FaqB from './sections/b/FaqB'
import ClosingCta from './sections/b/ClosingCta'
import SiteFooterB from './sections/b/SiteFooterB'
import FeaturedCampsSection from './sections/FeaturedCampsSection'
import OtherOffersSection from './sections/OtherOffersSection'
import WhyUsSection from './sections/WhyUsSection'
import HighlightsSection from './sections/HighlightsSection'
import CompactProcessSection from './sections/CompactProcessSection'
import ProcessSection from './sections/ProcessSection'
import MembershipSection from './sections/MembershipSection'
import CampDatesSection from './sections/CampDatesSection'
import RegistrationSection from './sections/RegistrationSection'
import FaqSection from './sections/FaqSection'
import SiteFooter from './sections/SiteFooter'

// ---------------------------------------------------------------------------
// CP-JK-104 — Schritt 2 der Sektions-Migration
//
// Diese Datei enthält keine Fallunterscheidung auf einen Mandanten mehr. Sie
// läuft über SECTION_ORDER und liest jeden Text aus SITE_CONTENT. Ein neuer
// Kunde braucht hier keine Zeile und in keiner Sektionskomponente eine Zeile —
// nur einen Eintrag in lib/siteContent.
//
// Was weiterhin fest steht, weil es keine Mandantenfrage ist: Kopfzeile, Hero
// und Footer rahmen jede Startseite. Variabel ist, was dazwischen liegt.
// ---------------------------------------------------------------------------

/**
 * Sektionen außerhalb von <main>. Bildet für 'classic' das bestehende DOM ab:
 * Die FAQ stand dort schon vorher hinter </main>. Semantisch gehörte sie
 * hinein — das zu ändern wäre eine echte DOM-Änderung und damit ein eigener
 * Schritt, kein Nebeneffekt dieser Umstellung.
 *
 * Im Theme 'editorial' gibt es kein Alt-DOM zu erhalten, und die FAQ steht dort
 * nicht am Ende, sondern vor der Abschluss-CTA. Sie bleibt deshalb in <main>.
 */
const SECTIONS_OUTSIDE_MAIN: SectionId[] =
  SITE_CONTENT.theme === 'editorial' ? [] : ['faq']

async function loadConfig(): Promise<CampConfig | null> {
  try {
    return await fetchCampConfig()
  } catch (e) {
    console.error('GET /config failed:', e)
    return null
  }
}

/**
 * Baut die Variablen für die Templates. Altersgrenzen kommen ausschließlich aus
 * GET /config — ist das Backend nicht erreichbar, bleiben sie null und die
 * zugehörigen Textteile entfallen, statt eine Zahl zu raten.
 */
function templateVars(config: CampConfig | null, campPrice: string): TemplateVars {
  const min = config?.camp.age_min
  const max = config?.camp.age_max
  const hasAges = typeof min === 'number' && typeof max === 'number'

  return {
    clubName: CLUB_CONFIG.name,
    subtitle: CLUB_CONFIG.subtitle,
    contactName: CLUB_CONFIG.contactName,
    contactEmail: CLUB_CONFIG.contactEmail,
    contactPhone: CLUB_CONFIG.contactPhone,
    venueName: CLUB_CONFIG.venueName,
    heroTagline: CLUB_CONFIG.heroTagline ?? null,
    campPrice,
    programCount: String(PROGRAMS.length),
    featuredCount: String(PROGRAMS.filter(p => p.featured).length),
    ageRange: hasAges ? `${min}–${max}` : null,
    ageRangeSpaced: hasAges ? `${min} – ${max}` : null,
    ageFrom: hasAges ? String(min) : null,
    ageTo: hasAges ? String(max) : null,
  }
}

function formatPrice(config: CampConfig | null): string {
  if (!config) return 'Preis auf Anfrage'
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: config.camp.currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(config.camp.price_cents / 100)
}

export async function generateMetadata(): Promise<Metadata> {
  const config = await loadConfig()
  const vars = templateVars(config, formatPrice(config))
  const title = fill(SITE_CONTENT.metaTitle, vars)
  const description = fill(SITE_CONTENT.metaDescription, vars)

  // Kein metadataBase gesetzt (Domain für JK noch nicht final) — deshalb bewusst kein
  // og:image mit relativer URL, das würde Next zu einer localhost-Warnung im Build führen.
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: CLUB_CONFIG.name,
      locale: 'de_DE',
      type: 'website',
    },
  }
}

export default async function Page() {
  const config = await loadConfig()
  const campPrice = formatPrice(config)
  const vars = templateVars(config, campPrice)
  const c = SITE_CONTENT

  const featuredPrograms = PROGRAMS.filter(p => p.featured)
  const otherPrograms = PROGRAMS.filter(p => !p.featured)

  // Kacheln mit unauflösbarer Variable entfallen, statt einen leeren Wert zu zeigen.
  const heroFacts: HeroFact[] = c.heroFacts.flatMap(f => {
    const value = fillOrNull(f.value, vars)
    return value ? [{ value, label: fill(f.label, vars) }] : []
  })

  const heroHeadlineText = c.heroHeadlineLines.map(l => fill(l.text, vars)).join(' ')

  function renderSection(id: SectionId): ReactNode {
    switch (id) {
      case 'hero':
        if (c.theme === 'editorial') {
          return (
            <HeroB
              eyebrow={fill(c.heroEyebrow, vars)}
              headline={heroHeadlineText}
              subline={fill(c.heroSubline, vars)}
              primaryCta={{ href: '#anmeldung', label: fill(c.heroPrimaryCtaLabel, vars) }}
              secondaryCta={{ href: '#camps', label: fill(c.heroSecondaryCtaLabel, vars) }}
              footnote={c.heroFootnote ? fill(c.heroFootnote, vars) : undefined}
              imageSrc={CLUB_CONFIG.heroImageSrc}
              imageAlt={fill(c.heroImageAlt, vars)}
            />
          )
        }
        return (
          <HeroSection
            imageSrc={CLUB_CONFIG.heroImageSrc}
            badgeText={fill(c.heroBadge, vars)}
            headline={
              <>
                {c.heroHeadlineLines.map((line, i) => (
                  <Fragment key={line.text}>
                    {i > 0 && <br />}
                    {line.accent ? (
                      <span className="text-[var(--brand-accent)]">{fill(line.text, vars)}</span>
                    ) : (
                      fill(line.text, vars)
                    )}
                  </Fragment>
                ))}
              </>
            }
            subline={fill(c.heroSubline, vars)}
            primaryCta={{ href: '#anmeldung', label: fill(c.heroPrimaryCtaLabel, vars) }}
            secondaryCta={{ href: '#termine', label: fill(c.heroSecondaryCtaLabel, vars) }}
            tertiaryCta={
              c.heroTertiaryCtaLabel && c.heroTertiaryCtaHref
                ? { href: c.heroTertiaryCtaHref, label: fill(c.heroTertiaryCtaLabel, vars) }
                : undefined
            }
            footnote={c.heroFootnote ? fill(c.heroFootnote, vars) : undefined}
            facts={heroFacts}
            compact={c.heroCompact}
          />
        )

      case 'trustBar':
        return (
          <TrustBar
            label={fill(c.trustBarLabel, vars)}
            partners={c.trustBarPartners}
            pendingNote={c.trustBarPendingNote || undefined}
          />
        )

      case 'coreOffers':
        return (
          <CoreOffers
            eyebrow={fill(c.coreOffersEyebrow, vars)}
            heading={fill(c.coreOffersHeading, vars)}
            intro={c.coreOffersIntro ? fill(c.coreOffersIntro, vars) : undefined}
            offers={c.coreOffers}
          />
        )

      case 'slideshow':
        if (SLIDESHOW_ITEMS.length === 0) return null
        return (
          // Full-bleed, kein Card-Wrapper: setzt die Foto-Erzählung aus dem Hero
          // nahtlos fort statt sie in einer weißen Box abzubrechen.
          <section className="bg-gray-950">
            <MediaSlideshow items={SLIDESHOW_ITEMS} />
          </section>
        )

      case 'featuredCamps':
        if (c.theme === 'editorial') {
          return (
            <CampListB
              eyebrow={fill(c.campsEyebrow, vars)}
              heading={fill(c.campsHeading, vars)}
              meta={c.campsMeta ? fill(c.campsMeta, vars) : undefined}
              programs={featuredPrograms}
              ctaLabel={fill(c.campsCtaLabel, vars)}
              ctaHref="#anmeldung"
              availabilityLabel={fill(c.campsAvailabilityLabel, vars)}
              venueInfoText={VENUE_INFO_TEXT}
            />
          )
        }
        return (
          <FeaturedCampsSection
            programs={featuredPrograms}
            backgroundImageSrc={CLUB_CONFIG.campsBackgroundSrc}
            venueInfoText={VENUE_INFO_TEXT}
            firstTeamInfoText={FIRST_TEAM_INFO_TEXT}
            ctaHref="#anmeldung"
          />
        )

      case 'otherOffers':
        if (c.theme === 'editorial') {
          return (
            <SecondaryOffersB
              eyebrow={fill(c.secondaryOffersEyebrow, vars)}
              heading={fill(c.secondaryOffersHeading, vars)}
              intro={fill(c.secondaryOffersIntro, vars)}
              programs={otherPrograms}
              ctaLabel={fill(c.secondaryOffersCtaLabel, vars)}
              ctaHref="#anmeldung"
            />
          )
        }
        return <OtherOffersSection programs={otherPrograms} ctaHref="#anmeldung" />

      case 'whyUs':
        if (c.theme === 'editorial') {
          return (
            <WhyUsB
              eyebrow={fill(c.highlightsEyebrow, vars)}
              heading={fill(c.highlightsHeading, vars)}
              points={c.whyUsPoints.map(p => ({
                title: fill(p.title, vars),
                text: fill(p.text, vars),
              }))}
              imageSrc={CLUB_CONFIG.whyUsImageSrc}
              imageAlt={fill(c.whyUsImageAlt, vars)}
            />
          )
        }
        return (
          <WhyUsSection
            eyebrow={fill(c.highlightsEyebrow, vars)}
            heading={fill(c.highlightsHeading, vars)}
            imageSrc={CLUB_CONFIG.whyUsImageSrc}
            highlights={HIGHLIGHTS}
          />
        )

      case 'highlights':
        return (
          <HighlightsSection
            eyebrow={fill(c.highlightsEyebrow, vars)}
            heading={fill(c.highlightsHeading, vars)}
            highlights={HIGHLIGHTS}
          />
        )

      case 'coachProfile':
        return (
          <CoachProfile
            eyebrow={fill(c.coachEyebrow, vars)}
            name={fill(c.coachName, vars)}
            intro={fill(c.coachIntro, vars)}
            portraitSrc={CLUB_CONFIG.coachPortraitSrc}
            portraitAlt={fill(c.coachPortraitAlt, vars)}
            pendingFields={c.coachPendingFields}
          />
        )

      case 'developmentProcess':
        return (
          <DevelopmentProcess
            eyebrow={fill(c.processEyebrow, vars)}
            heading={fill(c.processHeading, vars)}
            intro={fill(c.processIntro, vars)}
            steps={c.processSteps}
            pendingNote={c.processPendingNote || undefined}
          />
        )

      case 'closingCta':
        return (
          <ClosingCta
            heading={fill(c.closingCtaHeading, vars)}
            text={fill(c.closingCtaText, vars)}
            ctaLabel={fill(c.closingCtaLabel, vars)}
            ctaHref="#anmeldung"
          />
        )

      case 'compactProcess':
        return (
          <CompactProcessSection
            eyebrow={fill(c.compactProcessEyebrow, vars)}
            steps={c.compactProcessSteps}
          />
        )

      case 'process':
        return (
          <ProcessSection
            eyebrow={fill(c.processEyebrow, vars)}
            heading={fill(c.processHeading, vars)}
            steps={c.processSteps}
          />
        )

      case 'membership':
        return (
          <MembershipSection
            heading={fill(c.membershipHeading, vars)}
            text={fill(c.membershipText, vars)}
            benefits={MEMBERSHIP_BENEFITS}
            ctaLabel={fill(c.membershipCtaLabel, vars)}
            ctaHref={`mailto:${CLUB_CONFIG.contactEmail}?subject=${encodeURIComponent(c.membershipMailSubject)}`}
            portraitSrc={CLUB_CONFIG.coachPortraitSrc}
          />
        )

      case 'campDates':
        return (
          <CampDatesSection
            eyebrow={fill(c.campDatesEyebrow, vars)}
            heading={fill(c.campDatesHeading, vars)}
            camps={CAMPS}
            campPrice={campPrice}
            venueInfoText={VENUE_INFO_TEXT}
            firstTeamInfoText={FIRST_TEAM_INFO_TEXT}
            metaParts={c.campDatesMetaParts.map(p => fillOrNull(p, vars) ?? '')}
          />
        )

      case 'registration':
        if (c.theme === 'editorial') {
          return (
            <RegistrationSectionB
              eyebrow={fill(c.registrationEyebrow, vars)}
              heading={fill(c.registrationHeading, vars)}
              intro={fill(c.registrationIntro, vars)}
              topics={c.registrationTopics}
              sidebarHeading={fill(c.registrationSidebarHeading, vars)}
              sidebarSteps={c.registrationSidebarSteps.map(s => fill(s, vars))}
              contactHeading={fill(c.registrationContactHeading, vars)}
              contactPending={c.registrationContactPending}
            />
          )
        }
        return (
          <RegistrationSection
            eyebrow={fill(c.registrationEyebrow, vars)}
            heading={fill(c.registrationHeading, vars)}
            intro={fill(c.registrationIntro, vars)}
            mode={c.registrationMode}
            inquiryTopics={c.registrationTopics}
            config={config}
            contactEmail={CLUB_CONFIG.contactEmail}
            contactHeading={fill(c.registrationContactHeading, vars)}
            contactLines={
              <>
                {c.registrationContactLines.map((line, i) => (
                  <Fragment key={line.text}>
                    {i > 0 && <br />}
                    {line.link === 'email' ? (
                      <a
                        href={`mailto:${CLUB_CONFIG.contactEmail}`}
                        className="text-gray-700 hover:underline break-all rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-1"
                      >
                        {fill(line.text, vars)}
                      </a>
                    ) : (
                      fill(line.text, vars)
                    )}
                  </Fragment>
                ))}
              </>
            }
            includedItems={INCLUDED_ITEMS}
            sidebarStepsHeading={fill(c.registrationSidebarHeading, vars)}
            sidebarSteps={c.registrationSidebarSteps}
            inquirySteps={c.registrationInquirySteps}
          />
        )

      case 'faq':
        if (c.theme === 'editorial') {
          return (
            <FaqB
              eyebrow={fill(c.faqEyebrow, vars)}
              heading={fill(c.faqHeading, vars)}
              items={FAQ_ITEMS}
            />
          )
        }
        return (
          <FaqSection
            eyebrow={fill(c.faqEyebrow, vars)}
            heading={fill(c.faqHeading, vars)}
            items={FAQ_ITEMS}
          />
        )
    }
  }

  const inMain = SECTION_ORDER.filter(id => !SECTIONS_OUTSIDE_MAIN.includes(id))
  const afterMain = SECTION_ORDER.filter(id => SECTIONS_OUTSIDE_MAIN.includes(id))

  return (
    <div
      className={`min-h-screen flex flex-col ${
        c.theme === 'editorial'
          ? 'font-body bg-[var(--surface-inverse)] text-[var(--text-on-dark)]'
          : 'bg-white text-gray-900'
      }`}
      // Das vollständige Token-Set des Mandanten. Die Sektionen lesen es über
      // var(--…); --brand-accent bleibt für die Bauteile im Theme 'classic'.
      style={{
        ...THEME_TOKENS,
        '--brand-accent': CLUB_CONFIG.accentColor ?? THEME_TOKENS['--brand-accent'],
      } as CSSProperties}
    >
      <a href="#anmeldung" className="skip-link">Zum Anfrageformular springen</a>

      {/* Strukturierte Daten für Suchmaschinen — Werte kommen ausschließlich aus
          der Konfiguration, keine Nutzereingaben. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SportsActivityLocation',
            name: CLUB_CONFIG.name,
            description: fill(c.metaDescription, vars),
            areaServed: CLUB_CONFIG.venueName,
          }),
        }}
      />

      {c.theme === 'editorial' ? (
        <SiteHeaderB
          clubName={CLUB_CONFIG.name}
          logoSrc={CLUB_CONFIG.logoSrc}
          navItems={c.navItems}
          ctaLabelShort={fill(c.navCtaShort, vars)}
          ctaLabelLong={fill(c.navCtaLong, vars)}
          ctaHref="#anmeldung"
        />
      ) : (
        <SiteHeader
          clubName={CLUB_CONFIG.name}
          subtitle={CLUB_CONFIG.subtitle}
          ctaHref="#anmeldung"
          ctaLabelShort={fill(c.navCtaShort, vars)}
          ctaLabelLong={fill(c.navCtaLong, vars)}
        />
      )}

      <main className="flex-1">
        {inMain.map(id => (
          <Fragment key={id}>{renderSection(id)}</Fragment>
        ))}
      </main>

      {afterMain.map(id => (
        <Fragment key={id}>{renderSection(id)}</Fragment>
      ))}

      {c.theme === 'editorial' ? (
        <SiteFooterB
          clubName={fill(c.footerDisplayName, vars)}
          logoSrc={CLUB_CONFIG.logoSrc}
          description={fill(c.footerDescription, vars)}
          contactLines={c.footerContactLines.map(line => fill(line, vars))}
          contactPending={c.footerContactPending || undefined}
          privacyPurpose={fill(c.footerPrivacyPurpose, vars)}
          copyrightName={fill(c.footerCopyrightName, vars)}
        />
      ) : (
        <SiteFooter
          displayName={fill(c.footerDisplayName, vars)}
          description={fill(c.footerDescription, vars)}
          contactLines={
            <>
              {c.footerContactLines.map(line => (
                <li key={line}>{fill(line, vars)}</li>
              ))}
            </>
          }
          privacyPurpose={fill(c.footerPrivacyPurpose, vars)}
          copyrightName={fill(c.footerCopyrightName, vars)}
        />
      )}
    </div>
  )
}
