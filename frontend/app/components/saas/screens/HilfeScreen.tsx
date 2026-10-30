import type { ReactNode } from 'react'
import { computeBrandTokens } from '../brandPipeline'
import MatchdayBand from '../shell/MatchdayBand'
import { orgTabs } from '../navTabs'
import { de } from '../../../lib/i18n/de'
import type { OrganizationIdentityProps } from './types'
import { PAGE_READING } from '../ui/pageLayout'

const sections = [
  { id: 'einrichtung', title: de.hilfe.s1 },
  { id: 'camp-veroeffentlichen', title: de.hilfe.s2 },
  { id: 'camp-filter', title: de.hilfe.s8 },
  { id: 'anmeldelink', title: de.hilfe.s3 },
  { id: 'zahlungen', title: de.hilfe.s4 },
  { id: 'warteliste', title: de.hilfe.s5 },
  { id: 'tagesliste', title: de.hilfe.s6 },
  { id: 'elternfragen', title: de.hilfe.s7 },
] as const

function HelpSection({ index, children }: { index: number; children: ReactNode }) {
  const { id, title } = sections[index]
  return (
    <section id={id} aria-labelledby={`${id}-titel`} className="scroll-mt-24">
      <h2 id={`${id}-titel`} className="cp-title mb-3" style={{ color: 'var(--cp-ink)' }}>{title}</h2>
      {children}
    </section>
  )
}

function Steps({ items }: { items: readonly string[] }) {
  return (
    <ol className="cp-body list-decimal space-y-2 pl-5" style={{ color: 'var(--cp-ink-2)' }}>
      {items.map(item => <li key={item}>{item}</li>)}
    </ol>
  )
}

export default function HilfeScreen({ orgSlug, org }: OrganizationIdentityProps) {
  const brand = computeBrandTokens(org.primary_color)

  return (
    <>
      <MatchdayBand
        backHref={`/pilot/${orgSlug}/dashboard`}
        orgSlug={orgSlug}
        orgName={org.name}
        orgLogoUrl={org.logo_url}
        title={de.hilfe.title}
        tabs={orgTabs(orgSlug)}
        brandColor={brand.brand}
      />
      <main
        className={`${PAGE_READING} space-y-10`}
        style={{ color: 'var(--cp-ink)' }}
      >
        <nav aria-label={de.hilfe.contents}>
          <p className="cp-subheading mb-2">{de.hilfe.contents}</p>
          <ul className="cp-body grid gap-x-6 sm:grid-cols-2">
            {sections.map(({ id, title }) => (
              <li key={id}>
                <a className="cp-focus inline-flex min-h-[44px] items-center underline" href={`#${id}`}>{title}</a>
              </li>
            ))}
          </ul>
        </nav>

        <HelpSection index={0}>
          <p className="cp-body mb-2" style={{ color: 'var(--cp-ink-2)' }}>{de.hilfe.setupIntro}</p>
          <ol className="cp-body list-decimal space-y-2 pl-5" style={{ color: 'var(--cp-ink-2)' }}>
            {de.hilfe.setupSteps.map(({ title, text }) => <li key={title}><strong>{title}</strong>{' – '}{text}</li>)}
          </ol>
          <p className="cp-body mt-2" style={{ color: 'var(--cp-ink-2)' }}>{de.hilfe.setupReview}</p>
        </HelpSection>

        <HelpSection index={1}>
          <Steps items={de.hilfe.campSteps} />
          <p className="cp-body mt-2" style={{ color: 'var(--cp-ink-2)' }}>{de.hilfe.campPublished}</p>
        </HelpSection>

        <HelpSection index={2}>
          {[de.hilfe.filterIntro, de.hilfe.filterDetails, de.hilfe.filterShare].map(text => (
            <p key={text} className="cp-body mb-2" style={{ color: 'var(--cp-ink-2)' }}>{text}</p>
          ))}
        </HelpSection>

        <HelpSection index={3}>
          <p className="cp-body mb-1" style={{ color: 'var(--cp-ink-2)' }}>
            {de.hilfe.linkLabel}{' '}<code className="cp-label">{de.hilfe.linkPath(orgSlug)}</code>
          </p>
          <p className="cp-body mb-4" style={{ color: 'var(--cp-ink-2)' }}>{de.hilfe.linkHint}</p>
          {[
            { id: 'whatsapp-vorlage', title: de.hilfe.whatsappHeading, text: de.hilfe.whatsappTemplate(orgSlug), rows: 6 },
            { id: 'instagram-vorlage', title: de.hilfe.instagramHeading, text: de.hilfe.instagramTemplate(orgSlug), rows: 3 },
          ].map(({ id, title, text, rows }) => (
            <div key={id} className="mt-4">
              <h3 id={id} className="cp-subheading mb-2" style={{ color: 'var(--cp-ink)' }}>{title}</h3>
              <textarea
                aria-labelledby={id}
                readOnly
                rows={rows}
                defaultValue={text}
                className="cp-body w-full rounded border p-3 font-[inherit]"
                style={{ borderColor: 'var(--cp-field-line)', background: 'var(--cp-surface-2)', color: 'var(--cp-ink)', resize: 'vertical' }}
              />
            </div>
          ))}
        </HelpSection>

        <HelpSection index={4}>
          <p className="cp-body mb-2" style={{ color: 'var(--cp-ink-2)' }}>{de.hilfe.paymentIntro}</p>
          <Steps items={de.hilfe.paymentSteps} />
        </HelpSection>

        <HelpSection index={5}>
          <ul className="cp-body list-disc space-y-2 pl-5" style={{ color: 'var(--cp-ink-2)' }}>
            {de.hilfe.waitlistItems.map(item => <li key={item}>{item}</li>)}
          </ul>
        </HelpSection>

        <HelpSection index={6}>
          <Steps items={de.hilfe.exportSteps} />
          <p className="cp-body mt-2" style={{ color: 'var(--cp-ink-2)' }}>{de.hilfe.exportHint}</p>
        </HelpSection>

        <HelpSection index={7}>
          <p className="cp-body mb-4" style={{ color: 'var(--cp-ink-2)' }}>{de.hilfe.faqIntro}</p>
          <dl className="space-y-5">
            {de.hilfe.faq.map(({ q, a }) => (
              <div key={q}>
                <dt className="cp-subheading mb-1" style={{ color: 'var(--cp-ink)' }}>{q}</dt>
                <dd className="cp-body" style={{ color: 'var(--cp-ink-2)' }}>{a}</dd>
              </div>
            ))}
          </dl>
        </HelpSection>
      </main>
    </>
  )
}
