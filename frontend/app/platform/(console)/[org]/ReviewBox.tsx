'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Button from '../../../components/saas/ui/Button'
import type { OrganizationAdmin } from '../../../lib/saasAdminApi'
import { computeReviewChecklist, exactReviewDate, type ReviewCamp } from '../../reviewChecklist'
import ReviewChecklist from '../ReviewChecklist'
import { reviewOrganizationAction, type ReviewActionState } from './reviewActions'

export default function ReviewBox({ org, camps }: { org: OrganizationAdmin; camps: ReviewCamp[] }) {
  const statusRef = useRef<HTMLParagraphElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const overrideRef = useRef<HTMLButtonElement>(null)
  const rejectRef = useRef<HTMLButtonElement>(null)
  const [panel, setPanel] = useState<'override' | 'reject' | null>(null)
  const checklist = computeReviewChecklist(org, camps)
  const missing = checklist.filter(item => !item.done)
  const missingText = missing.map(item => item.label).join(', ')

  useEffect(() => {
    if (panel) {
      panelRef.current?.focus()
      panelRef.current?.scrollIntoView?.({ block: 'center' })
    }
  }, [panel])

  function closePanel() {
    const trigger = panel === 'override' ? overrideRef : rejectRef
    setPanel(null)
    trigger.current?.focus()
  }

  const [state, formAction, pending] = useActionState<ReviewActionState, FormData>(
    async (previous, data) => {
      const note = (data.get('note') as string | null) ?? ''
      let error: string | null = null
      if (data.get('decision') === 'approve' && missing.length > 0
        && !(panel === 'override' && data.get('override') === 'confirmed')) {
        error = `Freigabe gesperrt. Es fehlen: ${missingText}.`
      }
      if (data.get('decision') === 'reject' && note.trim().length < 10) {
        error = 'Bitte gib einen Ablehnungsgrund ein (min. 10 Zeichen).'
      }
      const result: ReviewActionState = error
        ? { error, done: false, decision: null }
        : await reviewOrganizationAction(org.slug, previous, data)
      requestAnimationFrame(() => statusRef.current?.focus())
      return result
    },
    { error: null, done: false, decision: null },
  )

  const reviewStatus = org.review_status ?? 'approved'
  if (reviewStatus !== 'submitted') {
    return (
      <section className="mb-8" aria-label="Freigabe">
        <h2 className="cp-heading mb-3">Freigabe</h2>
        <div className="rounded-[var(--cp-r-card)] border p-4"
          style={{ borderColor: 'var(--cp-line)', background: 'var(--cp-surface)' }}>
          <p className="cp-body" style={{ color: reviewStatus === 'rejected' ? 'var(--cp-error)' : 'var(--cp-ink)' }}>
            {reviewStatus === 'draft' ? 'Noch nicht eingereicht – der Verein hat den Antrag noch nicht abgesendet.'
              : reviewStatus === 'rejected' ? 'Abgelehnt'
                : `Freigegeben${org.approved_at ? ` am ${exactReviewDate(org.approved_at)}` : ''}`}
          </p>
          {reviewStatus === 'rejected' && org.review_note && <p className="cp-body mt-2">Grund: {org.review_note}</p>}
        </div>
      </section>
    )
  }

  return (
    <section className="mb-8" aria-label="Freigabe">
      <h2 className="cp-heading mb-3">Freigabe</h2>
      <div className="rounded-[var(--cp-r-card)] border p-4"
        style={{ borderColor: 'var(--cp-line)', background: 'var(--cp-surface)' }}>
        <p className="cp-body mb-3">{org.contact_person_name || 'Kontaktperson fehlt'} · {org.contact_email || 'Kontakt-E-Mail fehlt'}</p>
        <p className="cp-chip mb-3" style={{ color: 'var(--cp-muted)' }}>
          Eingereicht: {exactReviewDate(org.submitted_at)}<br />
          AVV {org.avv_version || '– Version fehlt'} · Angenommen: {exactReviewDate(org.avv_accepted_at)}
        </p>
        <ReviewChecklist items={checklist} />
        {state.done ? (
          <p ref={statusRef} role="status" tabIndex={-1} className="cp-body mt-4" style={{ color: 'var(--cp-ok)' }}>
            {state.decision === 'approve' ? 'Freigegeben. Seite wird aktualisiert …' : 'Abgelehnt. Seite wird aktualisiert …'}
          </p>
        ) : (
          <>
            {state.error && <p ref={statusRef} role="alert" tabIndex={-1} className="cp-body mt-4" style={{ color: 'var(--cp-error)' }}>{state.error}</p>}
            {panel && (
              <div ref={panelRef} tabIndex={-1} role="region" aria-label={panel === 'override' ? 'Ausnahme bestätigen' : 'Ablehnung begründen'}
                className="cp-review-panel mt-4 rounded-[var(--cp-r-field)] border p-4"
                style={{ borderColor: 'var(--cp-error-line)' }}
                onKeyDown={event => { if (event.key === 'Escape' && !pending) closePanel() }}>
                {panel === 'override' ? (
                  <form action={formAction}>
                    <h3 className="cp-subheading mb-2">Trotz fehlender Angaben freigeben?</h3>
                    <p className="cp-body mb-4">Es fehlen: {missingText}. Mit der Freigabe wird die Vereinsseite öffentlich.</p>
                    <input type="hidden" name="decision" value="approve" />
                    <input type="hidden" name="override" value="confirmed" />
                    <div className="flex flex-wrap gap-3">
                      <Button type="submit" variant="danger" disabled={pending}>{pending ? 'Wird gespeichert …' : 'Ausnahme bestätigen und freigeben'}</Button>
                      <Button type="button" disabled={pending} onClick={closePanel}>Abbrechen</Button>
                    </div>
                  </form>
                ) : (
                  <form action={formAction} className="flex flex-col gap-3">
                    <input type="hidden" name="decision" value="reject" />
                    <label htmlFor="reject-note" className="cp-body">Ablehnungsgrund (mindestens 10 Zeichen)</label>
                    <textarea id="reject-note" name="note" rows={3} className="cp-focus cp-body w-full rounded-[var(--cp-r-field)] border px-3 py-2"
                      style={{ borderColor: 'var(--cp-field-line)' }} />
                    <div className="flex flex-wrap gap-3">
                      <Button type="submit" variant="danger" disabled={pending}>{pending ? 'Wird abgelehnt …' : 'Ablehnen bestätigen'}</Button>
                      <Button type="button" disabled={pending} onClick={closePanel}>Abbrechen</Button>
                    </div>
                  </form>
                )}
              </div>
            )}
            <div className="cp-review-bar" role="region" aria-label="Freigabeaktionen">
              <div className="cp-review-actions">
                <Link href={`/platform/${org.slug}/preview`} target="_blank" rel="noopener noreferrer"
                  className="cp-focus cp-subheading cp-review-preview">Vorschau öffnen<span className="sr-only"> (neuer Tab)</span></Link>
                <form action={formAction}>
                  <input type="hidden" name="decision" value="approve" />
                  <span className="cp-review-approve" tabIndex={missing.length ? 0 : undefined}
                    aria-label={missing.length ? `Freigabe gesperrt. Es fehlen: ${missingText}` : undefined}
                    aria-describedby={missing.length ? 'review-missing-tooltip' : undefined}
                    title={missing.length ? `Es fehlen: ${missingText}` : undefined}>
                    <Button type="submit" variant="primary" disabled={pending || missing.length > 0} aria-describedby={missing.length ? 'review-missing-tooltip' : undefined}>
                      {pending ? 'Wird gespeichert …' : 'Freigeben'}
                    </Button>
                    {missing.length > 0 && <span role="tooltip" id="review-missing-tooltip" className="cp-review-tooltip">Es fehlen: {missingText}</span>}
                  </span>
                </form>
                <Button ref={rejectRef} type="button" disabled={pending} onClick={() => setPanel('reject')}>Ablehnen mit Grund</Button>
                {missing.length > 0 && <Button ref={overrideRef} type="button" disabled={pending} onClick={() => setPanel('override')}>Trotzdem freigeben</Button>}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
