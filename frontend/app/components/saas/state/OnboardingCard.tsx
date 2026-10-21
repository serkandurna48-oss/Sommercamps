import type { ReactNode } from 'react'
import { ButtonLink } from '../ui/Button'
import { computeOnboardingSteps } from '../onboardingSteps'
import { de } from '../../../lib/i18n/de'
import type { OrganizationAdmin, CampAdmin } from '../../../lib/saasAdminApi'

export default function OnboardingCard({ orgSlug, org, camps, brandStrong, brandOn }: {
  orgSlug: string
  org: OrganizationAdmin
  camps: CampAdmin[]
  brandStrong: string
  brandOn: string
}) {
  const { step1Done, step2Done } = computeOnboardingSteps(org, camps)
  const activeStep = !step1Done ? 1 : !step2Done ? 2 : 3

  const configHref = `/pilot/${orgSlug}/konfiguration`
  const newCampHref = `/pilot/${orgSlug}/camps/new`
  const firstCamp = camps.find(c => c.status === 'draft') ?? camps[0]
  const publishHref = firstCamp
    ? `/pilot/${orgSlug}/camps/${firstCamp.slug}/konfiguration`
    : newCampHref

  return (
    <div className="cp-card" style={{ borderColor: 'var(--cp-line)', background: 'var(--cp-surface)' }}>
      <h3 className="cp-heading">{de.onboarding.cardTitle}</h3>
      <ol className="mt-5 flex flex-col gap-5">
        <Step number={1} done={step1Done} active={activeStep === 1} title={de.onboarding.step1Title} body={de.onboarding.step1Body}>
          {activeStep === 1 && (
            <ButtonLink href={configHref} variant="primary" brandStrong={brandStrong} brandOn={brandOn}>
              {de.onboarding.step1Action}
            </ButtonLink>
          )}
        </Step>
        <Step number={2} done={step2Done} active={activeStep === 2} title={de.onboarding.step2Title} body={de.onboarding.step2Body}>
          {activeStep === 2 && (
            <ButtonLink href={newCampHref} variant="primary" brandStrong={brandStrong} brandOn={brandOn}>
              {de.onboarding.step2Action}
            </ButtonLink>
          )}
        </Step>
        <Step number={3} done={false} active={activeStep === 3} title={de.onboarding.step3Title} body={de.onboarding.step3Body}>
          {activeStep === 3 && (
            <ButtonLink href={publishHref} variant="primary" brandStrong={brandStrong} brandOn={brandOn}>
              {de.onboarding.step3Action}
            </ButtonLink>
          )}
        </Step>
      </ol>
    </div>
  )
}

function Step({ number, done, active, title, body, children }: {
  number: number
  done: boolean
  active: boolean
  title: string
  body: string
  children?: ReactNode
}) {
  const muted = !done && !active
  return (
    <li className={`flex gap-4${muted ? ' opacity-40' : ''}`} aria-current={active ? 'step' : undefined}>
      <span
        aria-hidden="true"
        className="cp-subheading mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm leading-none"
        style={{
          background: done ? 'var(--cp-ok-bg)' : active ? 'var(--cp-ink)' : 'var(--cp-surface-2)',
          color: done ? 'var(--cp-ok)' : active ? '#fff' : 'var(--cp-ink-2)',
          border: done ? '1px solid var(--cp-ok-line)' : active ? 'none' : '1px solid var(--cp-line)',
        }}
      >
        {done ? '✓' : number}
      </span>
      <div className="min-w-0 flex-1">
        <p className="cp-subheading">
          {title}
          <span className="sr-only">{' '}{done ? 'erledigt' : active ? 'aktiv' : 'offen'}</span>
        </p>
        {active && <p className="cp-body mt-1" style={{ color: 'var(--cp-ink-2)' }}>{body}</p>}
        {children && <div className="mt-3">{children}</div>}
      </div>
    </li>
  )
}
