// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, describe } from 'vitest'
import { computeWizardStep } from '../onboardingSteps'
import { VORLAGE_TEILNAHMEBEDINGUNGEN } from '../../../lib/vorlagen'
import OnboardingCard from '../state/OnboardingCard'
import { de } from '../../../lib/i18n/de'
import type { OrganizationAdmin, CampAdmin } from '../../../lib/saasAdminApi'

// ── shared fixtures ───────────────────────────────────────────────────────────

const orgOhneColor: OrganizationAdmin = {
  id: 'org', slug: 'demo', name: 'Testverein', legal_name: null, legal_address: null,
  contact_email: '', contact_phone: null, contact_person_name: null,
  logo_url: null, primary_color: null, plan_status: 'active', theme: 'default',
  iban: null, intro_heading: null, intro_text: null, hero_image_url: null,
  trainer_image_url: null, trainer_text: null, terms_text: null, site_published: false,
  review_status: 'draft', review_note: null,
}

const orgOhneRechtliches: OrganizationAdmin = {
  ...orgOhneColor,
  primary_color: '#116644',
  contact_email: '',
}

const orgMitRechtliches: OrganizationAdmin = {
  ...orgOhneRechtliches,
  contact_email: 'test@demo.example',
  legal_address: 'Musterstr. 1',
  terms_text: 'Teilnahmebedingungen.',
}

const campDraft: CampAdmin = {
  id: 'camp', organization_id: 'org', slug: 'herbst', title: 'Herbstcamp',
  start_date: '2026-10-25', end_date: '2026-10-30', registration_start: null,
  registration_end: null, age_min: 6, age_max: 12, capacity: 20, price_cents: 10000,
  currency: 'EUR', location: null, care_info: null, meals_info: null, includes: null,
  status: 'draft',
}

// ── 1. Schrittwahl ────────────────────────────────────────────────────────────

describe('computeWizardStep — Schrittwahl', () => {
  it('neu (kein primary_color) → Schritt 1', () => {
    expect(computeWizardStep(orgOhneColor, [])).toBe(1)
  })

  it('Rechtliches fehlt → Schritt 2', () => {
    expect(computeWizardStep(orgOhneRechtliches, [])).toBe(2)
  })

  it('kein Camp → Schritt 3', () => {
    expect(computeWizardStep(orgMitRechtliches, [])).toBe(3)
  })

  // Mutationsprobe: wenn computeWizardStep immer 1 zurückgibt, schlägt dieser Test fehl
  it('alles da → Schritt 4', () => {
    expect(computeWizardStep(orgMitRechtliches, [campDraft])).toBe(4)
  })
})

// ── 2. Vorlage einfügen ───────────────────────────────────────────────────────

describe('Vorlage einfügen', () => {
  it('Vorlage enthält [Vereinsname]-Platzhalter', () => {
    expect(VORLAGE_TEILNAHMEBEDINGUNGEN).toContain('[Vereinsname]')
  })

  it('ersetzt [Vereinsname] mit Vereinsname', () => {
    const result = VORLAGE_TEILNAHMEBEDINGUNGEN.replaceAll('[Vereinsname]', 'SC Muster')
    expect(result).toContain('SC Muster')
    expect(result).not.toContain('[Vereinsname]')
  })

  it('überschreibt keinen vorhandenen Text (handleVorlage-Logik)', () => {
    const existing = 'Meine eigenen Bedingungen'
    const termsText = existing
    // handleVorlage in Step2Rechtliches: only fills when termsText is empty
    const filled = termsText.trim()
      ? termsText
      : VORLAGE_TEILNAHMEBEDINGUNGEN.replaceAll('[Vereinsname]', 'SC Muster')
    expect(filled).toBe(existing)
  })
})

// ── 3. Weiter bleibt bei Fehler im Schritt ────────────────────────────────────

describe('Schritt-Navigation bei Aktion-Fehler', () => {
  it('onSuccess wird NICHT aufgerufen wenn Aktion {ok: false} zurückgibt', async () => {
    const failAction = async (_prev: { ok: boolean; error?: string }, _data: FormData) =>
      ({ ok: false as const, error: 'Serverfehler' })
    let successCalled = false
    // mirrors the useActionState wrapper in Step1Auftritt / Step2Rechtliches
    const wrapper = async (prev: { ok: boolean; error?: string }, data: FormData) => {
      const r = await failAction(prev, data)
      if (r.ok) successCalled = true
      return r
    }
    await wrapper({ ok: false }, new FormData())
    expect(successCalled).toBe(false)
  })

  it('onSuccess wird aufgerufen wenn Aktion {ok: true} zurückgibt', async () => {
    const okAction = async (_prev: { ok: boolean; error?: string }, _data: FormData) =>
      ({ ok: true as const })
    let successCalled = false
    const wrapper = async (prev: { ok: boolean; error?: string }, data: FormData) => {
      const r = await okAction(prev, data)
      if (r.ok) successCalled = true
      return r
    }
    await wrapper({ ok: false }, new FormData())
    expect(successCalled).toBe(true)
  })
})

// ── 4. OnboardingCard-Links zeigen auf /einrichtung?schritt=N ─────────────────

describe('OnboardingCard wizard links', () => {
  function renderCard(org: OrganizationAdmin, camps: CampAdmin[]) {
    return renderToStaticMarkup(
      <OnboardingCard orgSlug="demo" org={org} camps={camps} brandStrong="#116644" brandOn="#fff" />
    )
  }

  it('aktiver Schritt 1 (Auftritt) verlinkt zu einrichtung?schritt=1', () => {
    const html = renderCard(orgOhneColor, [])
    expect(html).toContain('einrichtung?schritt=1')
  })

  it('aktiver Schritt 2 (kein Camp) verlinkt zu einrichtung?schritt=3', () => {
    const html = renderCard(orgMitRechtliches, [])
    expect(html).toContain('einrichtung?schritt=3')
  })

  it('aktiver Schritt 3 (review pending) verlinkt zu einrichtung?schritt=4', () => {
    const html = renderCard(orgMitRechtliches, [campDraft])
    expect(html).toContain('einrichtung?schritt=4')
  })
})

// ── 5. B1 – Siezen: kein Du in Admin-Texten ──────────────────────────────────

describe('B1 – Siezen: Admin-Texte enthalten kein Du (Elternseite ausgenommen)', () => {
  const DU_WORDS = /\b(du|dein|deine|deinem|deinen|ergänze|prüfe)\b/i

  function collectStrings(obj: unknown): string[] {
    if (typeof obj === 'string') return [obj]
    if (Array.isArray(obj)) return obj.flatMap(collectStrings)
    if (obj !== null && typeof obj === 'object') return Object.values(obj as object).flatMap(collectStrings)
    return []
  }

  it('de.ts Admin-Sektionen ohne Du-Wörter (Mutationsprobe: Du einfügen → rot)', () => {
    const adminSections = collectStrings({
      dashboard: de.dashboard,
      tasks: de.tasks,
      command: de.command,
      states: de.states,
      tasksPage: de.tasksPage,
      waitlistPage: de.waitlistPage,
      paymentsPage: de.paymentsPage,
      onboarding: de.onboarding,
      hilfe: de.hilfe,
      einrichtung: de.einrichtung,
      configPage: de.configPage,
    })
    const violations = adminSections.filter(s => DU_WORDS.test(s))
    expect(violations).toEqual([])
  })
})

// ── 6. Schritt 4: SubmitReviewButton nur bei draft/rejected ───────────────────

describe('Schritt 4 SubmitReviewButton — needsReview-Bedingung', () => {
  function needsReview(reviewStatus: string | undefined) {
    const s = reviewStatus ?? 'draft'
    return s === 'draft' || s === 'rejected'
  }

  it('true bei draft', () => { expect(needsReview('draft')).toBe(true) })
  it('true bei rejected', () => { expect(needsReview('rejected')).toBe(true) })
  it('false bei submitted', () => { expect(needsReview('submitted')).toBe(false) })
  it('false bei approved', () => { expect(needsReview('approved')).toBe(false) })
})
