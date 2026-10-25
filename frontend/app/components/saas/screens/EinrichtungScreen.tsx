'use client'

import { useState, useActionState, useId } from 'react'
import type { CampAdmin, OrganizationAdmin } from '../../../lib/saasAdminApi'
import { computeBrandTokens, type BrandTokens } from '../brandPipeline'
import { computeWizardStep } from '../onboardingSteps'
import BrandPreview from '../brand/BrandPreview'
import ColorField from '../brand/ColorField'
import { VORLAGE_TEILNAHMEBEDINGUNGEN } from '../../../lib/vorlagen'
import { saveAuftrittAction, saveRechtlichesAction } from '../actions/wizardActions'
import { submitReviewAction } from '../state/reviewActions'
import { useAdminPreview } from '../preview/AdminPreviewContext'
import { de } from '../../../lib/i18n/de'
import MatchdayBand from '../shell/MatchdayBand'
import CampCreateForm from '../config/CampCreateForm'
import SubmitReviewButton from '../state/SubmitReviewButton'
import ReviewPending from '../state/ReviewPending'
import Button, { ButtonLink } from '../ui/Button'
import Field from '../ui/Field'
import Link from '../preview/AdminLink'
import { INPUT_CLASS, INPUT_STYLE } from '../ui/formFieldStyles'
import { orgTabs } from '../navTabs'

type WizardStep = 1 | 2 | 3 | 4
type SaveState = { ok: boolean; error?: string }

function isValidStep(n: number | undefined): n is WizardStep {
  return n === 1 || n === 2 || n === 3 || n === 4
}

export default function EinrichtungScreen({
  orgSlug,
  org,
  camps,
  requestedStep,
}: {
  orgSlug: string
  org: OrganizationAdmin
  camps: CampAdmin[]
  requestedStep?: number
}) {
  const auto = computeWizardStep(org, camps)
  const [step, setStep] = useState<WizardStep>(isValidStep(requestedStep) ? requestedStep : auto)

  const brand = computeBrandTokens(org.primary_color)
  const tabs = orgTabs(orgSlug)
  const preview = useAdminPreview()

  function goBack() { setStep(s => (s > 1 ? (s - 1) as WizardStep : s)) }
  function goNext() { setStep(s => (s < 4 ? (s + 1) as WizardStep : s)) }
  function goToStep(target: WizardStep) { setStep(target) }

  const reviewSubmitAction = preview
    ? async (_orgSlug: string, _avv: string) => ({ ok: true as const })
    : submitReviewAction

  return (
    <>
      <MatchdayBand
        backHref={`/pilot/${orgSlug}/dashboard`}
        orgSlug={orgSlug}
        orgName={org.name}
        orgLogoUrl={org.logo_url}
        title={de.einrichtung.title}
        tabs={tabs}
        brandColor={brand.brand}
      />
      <main className="mx-auto max-w-[640px] px-4 py-10 pb-24 md:px-8 md:pb-10 xl:px-6">
        <ProgressBar step={step} total={4} />
        {step === 1 && (
          <Step1Auftritt orgSlug={orgSlug} org={org} brand={brand} onSuccess={goNext} />
        )}
        {step === 2 && (
          <Step2Rechtliches orgSlug={orgSlug} org={org} brand={brand} onSuccess={goNext} onBack={goBack} />
        )}
        {step === 3 && (
          <Step3Camp orgSlug={orgSlug} org={org} camps={camps} brand={brand} onSuccess={goNext} onBack={goBack} />
        )}
        {step === 4 && (
          <Step4Pruefen
            orgSlug={orgSlug}
            org={org}
            camps={camps}
            brand={brand}
            onBack={goBack}
            goToStep={goToStep}
            submitAction={reviewSubmitAction}
          />
        )}
      </main>
    </>
  )
}

// --- Sub-components ---

function ProgressBar({ step, total }: { step: number; total: number }) {
  const labels = [
    de.einrichtung.step1Title,
    de.einrichtung.step2Title,
    de.einrichtung.step3Title,
    de.einrichtung.step4Title,
  ]
  return (
    <div className="mb-8" aria-label={de.einrichtung.stepOf(step, total)}>
      <p className="cp-chip mb-4" style={{ color: 'var(--cp-muted)' }}>
        {de.einrichtung.stepOf(step, total)}
      </p>
      <div className="flex items-center gap-1.5">
        {labels.map((label, i) => {
          const n = i + 1
          const done = n < step
          const active = n === step
          return (
            <div key={n} className="flex items-center gap-1.5">
              <div className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="cp-label flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs leading-none"
                  style={{
                    background: done ? 'var(--cp-ok-bg)' : active ? 'var(--cp-ink)' : 'var(--cp-surface-2)',
                    color: done ? 'var(--cp-ok)' : active ? '#fff' : 'var(--cp-muted)',
                    border: done ? '1px solid var(--cp-ok-line)' : active ? 'none' : '1px solid var(--cp-line)',
                  }}
                >
                  {done ? '✓' : n}
                </span>
                <span
                  className="cp-label hidden sm:block"
                  style={{ color: active ? 'var(--cp-ink)' : done ? 'var(--cp-ink-2)' : 'var(--cp-muted)' }}
                >
                  {label}
                </span>
              </div>
              {i < labels.length - 1 && (
                <div
                  className="h-px w-5 shrink-0"
                  style={{ background: n < step ? 'var(--cp-ok-line)' : 'var(--cp-line)' }}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StepHeader({ title, kicker }: { title: string; kicker: string }) {
  return (
    <div className="mb-6">
      <h2 className="cp-title" style={{ color: 'var(--cp-ink)' }}>{title}</h2>
      <p className="cp-body mt-1" style={{ color: 'var(--cp-muted)' }}>{kicker}</p>
    </div>
  )
}

function WizardNavButtons({
  step,
  total,
  pending = false,
  onBack,
  submitType = false,
  onNext,
  brandStrong,
  brandOn,
}: {
  step: number
  total: number
  pending?: boolean
  onBack?: () => void
  submitType?: boolean
  onNext?: () => void
  brandStrong: string
  brandOn: string
}) {
  const isLast = step === total
  return (
    <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
      {!isLast && submitType && (
        <Button type="submit" variant="primary" disabled={pending} brandStrong={brandStrong} brandOn={brandOn} className="w-full sm:w-auto sm:order-2">
          {pending ? de.einrichtung.weiterSaving : de.einrichtung.weiter}
        </Button>
      )}
      {!isLast && !submitType && onNext && (
        <Button type="button" variant="primary" onClick={onNext} brandStrong={brandStrong} brandOn={brandOn} className="w-full sm:w-auto sm:order-2">
          {de.einrichtung.weiter}
        </Button>
      )}
      {onBack && (
        <Button type="button" variant="secondary" onClick={onBack} disabled={pending} className="sm:order-1">
          {de.einrichtung.back}
        </Button>
      )}
    </div>
  )
}

function ErrorBanner({ id, children }: { id?: string; children: string }) {
  return (
    <p
      id={id}
      role="alert"
      className="cp-body rounded-[var(--cp-r-chip)] border px-3 py-2"
      style={{ color: 'var(--cp-error)', background: 'var(--cp-error-bg)', borderColor: 'var(--cp-error-line)' }}
    >
      {children}
    </p>
  )
}

// --- Step 1: Auftritt ---

function Step1Auftritt({
  orgSlug,
  org,
  brand,
  onSuccess,
}: {
  orgSlug: string
  org: OrganizationAdmin
  brand: BrandTokens
  onSuccess: () => void
}) {
  const preview = useAdminPreview()
  const boundAction = preview
    ? async (_prev: SaveState, _data: FormData): Promise<SaveState> => ({ ok: false, error: 'Vorschau – Änderungen werden nicht gespeichert.' })
    : saveAuftrittAction.bind(null, orgSlug)

  const [name, setName] = useState(org.name)
  const [logoUrl, setLogoUrl] = useState(org.logo_url ?? '')
  const [color, setColor] = useState(org.primary_color ?? '')
  const feedbackId = useId()

  const [state, formAction, pending] = useActionState<SaveState, FormData>(
    async (prev, formData) => {
      const result = await boundAction(prev, formData)
      if (result.ok) onSuccess()
      return result
    },
    { ok: false },
  )

  return (
    <>
      <StepHeader title={de.einrichtung.step1Title} kicker={de.einrichtung.step1Kicker} />
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <form
          action={formAction}
          className="flex flex-1 min-w-0 flex-col gap-4"
          aria-describedby={!pending && state.error ? feedbackId : undefined}
        >
          <Field label={de.configPage.field.name} htmlFor="w-name">
            <input
              id="w-name" name="name" required
              value={name} onChange={e => setName(e.target.value)}
              className={INPUT_CLASS} style={INPUT_STYLE}
            />
          </Field>
          <Field label={de.configPage.field.logoUrl} htmlFor="w-logo_url">
            <input
              id="w-logo_url" name="logo_url" inputMode="url"
              value={logoUrl} onChange={e => setLogoUrl(e.target.value)}
              className={INPUT_CLASS} style={INPUT_STYLE}
            />
          </Field>
          <ColorField id="w-primary_color" value={color} onChange={setColor} />

          {!pending && state.error && <ErrorBanner id={feedbackId}>{state.error}</ErrorBanner>}

          <WizardNavButtons
            step={1}
            total={4}
            pending={pending}
            submitType
            brandStrong={brand.brandStrong}
            brandOn={brand.brandOn}
          />
        </form>

        <BrandPreview name={name} logoUrl={logoUrl} color={color} />
      </div>
    </>
  )
}

// --- Step 2: Rechtliches ---

function Step2Rechtliches({
  orgSlug,
  org,
  brand,
  onSuccess,
  onBack,
}: {
  orgSlug: string
  org: OrganizationAdmin
  brand: BrandTokens
  onSuccess: () => void
  onBack: () => void
}) {
  const preview = useAdminPreview()
  const boundAction = preview
    ? async (_prev: SaveState, _data: FormData): Promise<SaveState> => ({ ok: false, error: 'Vorschau – Änderungen werden nicht gespeichert.' })
    : saveRechtlichesAction.bind(null, orgSlug)

  const [termsText, setTermsText] = useState(org.terms_text ?? '')
  const feedbackId = useId()

  const [state, formAction, pending] = useActionState<SaveState, FormData>(
    async (prev, formData) => {
      const result = await boundAction(prev, formData)
      if (result.ok) onSuccess()
      return result
    },
    { ok: false },
  )

  function handleVorlage() {
    if (!termsText.trim()) {
      setTermsText(VORLAGE_TEILNAHMEBEDINGUNGEN.replaceAll('[Vereinsname]', org.name))
    }
  }

  return (
    <>
      <StepHeader title={de.einrichtung.step2Title} kicker={de.einrichtung.step2Kicker} />
      <form
        action={formAction}
        className="flex flex-col gap-4"
        aria-describedby={!pending && state.error ? feedbackId : undefined}
      >
        <Field label={de.configPage.field.contactEmail} htmlFor="w-contact_email">
          <input
            id="w-contact_email" name="contact_email" type="email" required
            defaultValue={org.contact_email}
            className={INPUT_CLASS} style={INPUT_STYLE}
          />
        </Field>
        <Field
          label="Anschrift (für Impressum)"
          htmlFor="w-legal_address"
          hint="Straße, PLZ, Ort – erscheint auf der öffentlichen Impressum-Seite."
        >
          <textarea
            id="w-legal_address" name="legal_address"
            rows={2}
            defaultValue={org.legal_address ?? ''}
            className={INPUT_CLASS} style={INPUT_STYLE}
          />
        </Field>
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="w-terms_text" className="cp-label" style={{ color: 'var(--cp-ink-2)' }}>
              Teilnahmebedingungen
            </label>
            <Button
              type="button"
              variant="secondary"
              onClick={handleVorlage}
              disabled={!!termsText.trim()}
              className="text-sm"
            >
              {de.einrichtung.vorlagenBtn}
            </Button>
          </div>
          {!termsText.trim() && (
            <p className="cp-chip" style={{ color: 'var(--cp-muted)' }}>
              {de.einrichtung.vorlagenHint}
            </p>
          )}
          <textarea
            id="w-terms_text" name="terms_text"
            rows={8}
            value={termsText}
            onChange={e => setTermsText(e.target.value)}
            className={INPUT_CLASS} style={INPUT_STYLE}
          />
        </div>

        {!pending && state.error && <ErrorBanner id={feedbackId}>{state.error}</ErrorBanner>}

        <WizardNavButtons
          step={2}
          total={4}
          pending={pending}
          onBack={onBack}
          submitType
          brandStrong={brand.brandStrong}
          brandOn={brand.brandOn}
        />
      </form>
    </>
  )
}

// --- Step 3: Erstes Camp ---

function Step3Camp({
  orgSlug,
  org: _org,
  camps,
  brand,
  onSuccess,
  onBack,
}: {
  orgSlug: string
  org: OrganizationAdmin
  camps: CampAdmin[]
  brand: BrandTokens
  onSuccess: () => void
  onBack: () => void
}) {
  const firstCamp = camps[0]

  if (firstCamp) {
    return (
      <>
        <StepHeader title={de.einrichtung.step3Title} kicker={de.einrichtung.step3Kicker} />
        <div
          className="cp-card flex items-start gap-4"
          style={{ borderColor: 'var(--cp-ok-line)', background: 'var(--cp-ok-bg)' }}
        >
          <span className="cp-subheading mt-0.5" style={{ color: 'var(--cp-ok)' }}>✓</span>
          <div className="min-w-0 flex-1">
            <p className="cp-subheading" style={{ color: 'var(--cp-ink)' }}>{firstCamp.title}</p>
            <p className="cp-body mt-1" style={{ color: 'var(--cp-ink-2)' }}>
              {de.einrichtung.step3DoneHint}
            </p>
            <div className="mt-3">
              <Link
                href={`/pilot/${orgSlug}/camps/${firstCamp.slug}/konfiguration`}
                className="cp-focus cp-label underline"
                style={{ color: 'var(--cp-ink)' }}
              >
                {de.einrichtung.step3EditLink}
              </Link>
            </div>
          </div>
        </div>
        <WizardNavButtons
          step={3}
          total={4}
          onBack={onBack}
          onNext={onSuccess}
          brandStrong={brand.brandStrong}
          brandOn={brand.brandOn}
        />
      </>
    )
  }

  return (
    <>
      <StepHeader title={de.einrichtung.step3Title} kicker={de.einrichtung.step3Kicker} />
      <CampCreateForm
        orgSlug={orgSlug}
        brandStrong={brand.brandStrong}
        brandOn={brand.brandOn}
        backButton={
          <Button type="button" variant="secondary" onClick={onBack} className="sm:order-1">
            {de.einrichtung.back}
          </Button>
        }
      />
    </>
  )
}

// --- Step 4: Prüfen und einreichen ---

type SubmitAction = (orgSlug: string, avvVersion: string) => Promise<{ ok: boolean; error?: string }>

interface ChecklistEntry {
  label: string
  done: boolean
  step: WizardStep
}

function Step4Pruefen({
  orgSlug,
  org,
  camps,
  brand,
  onBack,
  goToStep,
  submitAction,
}: {
  orgSlug: string
  org: OrganizationAdmin
  camps: CampAdmin[]
  brand: BrandTokens
  onBack: () => void
  goToStep: (s: WizardStep) => void
  submitAction: SubmitAction
}) {
  const reviewStatus = org.review_status ?? 'draft'
  const needsReview = reviewStatus === 'draft' || reviewStatus === 'rejected'
  const reviewNote = needsReview ? (org.review_note ?? null) : null

  const checklist: ChecklistEntry[] = [
    { label: de.configPage.field.primaryColor, done: !!org.primary_color?.trim(), step: 1 },
    { label: de.configPage.field.contactEmail, done: !!org.contact_email?.trim(), step: 2 },
    { label: 'Anschrift', done: !!org.legal_address?.trim(), step: 2 },
    { label: 'Teilnahmebedingungen', done: !!org.terms_text?.trim(), step: 2 },
    { label: 'Erstes Camp', done: camps.length > 0, step: 3 },
  ]
  const allDone = checklist.every(c => c.done)

  return (
    <>
      <StepHeader title={de.einrichtung.step4Title} kicker={de.einrichtung.step4Kicker} />

      <section className="cp-card mb-6" style={{ borderColor: 'var(--cp-line)', background: 'var(--cp-surface)' }}>
        <h3 className="cp-subheading mb-4" style={{ color: 'var(--cp-ink)' }}>
          {de.einrichtung.checklistTitle}
        </h3>
        <ul className="flex flex-col gap-2">
          {checklist.map(item => (
            <li key={item.label} className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="cp-label flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs leading-none"
                style={{
                  background: item.done ? 'var(--cp-ok-bg)' : 'var(--cp-error-bg)',
                  color: item.done ? 'var(--cp-ok)' : 'var(--cp-error)',
                  border: item.done ? '1px solid var(--cp-ok-line)' : '1px solid var(--cp-error-line)',
                }}
              >
                {item.done ? '✓' : '!'}
              </span>
              <span className="cp-body flex-1" style={{ color: 'var(--cp-ink)' }}>{item.label}</span>
              {!item.done && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => goToStep(item.step)}
                >
                  {de.einrichtung.ergaenzen}
                </Button>
              )}
              {item.done && (
                <span className="cp-chip" style={{ color: 'var(--cp-ok)' }}>
                  {de.einrichtung.checklistDoneLabel}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {org.site_published ? <div className="mb-6">
        <ButtonLink
          href={`/pilot/${orgSlug}`}
          variant="secondary"
          brandStrong={brand.brandStrong}
          brandOn={brand.brandOn}
        >
          {de.einrichtung.previewLink}
        </ButtonLink>
      </div> : <p className="cp-body mb-6">{de.einrichtung.unpublishedHint}</p>}

      {reviewStatus === 'submitted' && (
        <ReviewPending orgSlug={orgSlug} />
      )}

      {reviewStatus === 'approved' && (
        <div className="mb-6">
          <p className="cp-body mb-3" style={{ color: 'var(--cp-ok)' }}>
            {de.einrichtung.approvedBanner}
          </p>
          <div className="mb-3 flex flex-wrap gap-3">
            {!org.site_published && <ButtonLink href={`/pilot/${orgSlug}/konfiguration#publication`} variant="primary" brandStrong={brand.brandStrong} brandOn={brand.brandOn}>
              {de.einrichtung.publishSite}
            </ButtonLink>}
            {camps.filter(camp => camp.status !== 'published').slice(0, 1).map(camp => (
              <ButtonLink key={camp.slug} href={`/pilot/${orgSlug}/camps/${camp.slug}/konfiguration`} variant="secondary">
                {de.einrichtung.publishCamp}
              </ButtonLink>
            ))}
          </div>
          <ButtonLink
            href={`/pilot/${orgSlug}/dashboard`}
            variant="primary"
            brandStrong={brand.brandStrong}
            brandOn={brand.brandOn}
          >
            {de.einrichtung.dashboardLink}
          </ButtonLink>
        </div>
      )}

      {(needsReview) && allDone && (
        <SubmitReviewButton
          orgSlug={orgSlug}
          brandStrong={brand.brandStrong}
          brandOn={brand.brandOn}
          reviewNote={reviewNote}
          submitAction={submitAction}
        />
      )}

      {(needsReview) && !allDone && (
        <p className="cp-body" style={{ color: 'var(--cp-muted)' }}>
          Zunächst alle Pflichtangaben ergänzen.
        </p>
      )}

      <WizardNavButtons
        step={4}
        total={4}
        onBack={onBack}
        brandStrong={brand.brandStrong}
        brandOn={brand.brandOn}
      />
    </>
  )
}
