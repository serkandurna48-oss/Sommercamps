'use client'

import { useActionState, useRef, useState } from 'react'
import Link from 'next/link'
import Button from '../../../components/saas/ui/Button'
import type { OrganizationAdmin } from '../../../lib/saasAdminApi'
import { reviewOrganizationAction, type ReviewActionState } from './reviewActions'

function CheckItem({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex items-center gap-2 py-2">
      <span
        aria-hidden="true"
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs"
        style={{
          background: done ? 'var(--cp-success-bg, #E3F3E9)' : 'var(--cp-error-bg)',
          color: done ? 'var(--cp-success, #1C6B45)' : 'var(--cp-error)',
        }}
      >
        {done ? '✓' : '✗'}
      </span>
      <span className="cp-body" style={{ color: 'var(--cp-ink)' }}>
        {label}
      </span>
    </div>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function ReviewBox({ org, campCount }: { org: OrganizationAdmin; campCount: number }) {
  const statusRef = useRef<HTMLParagraphElement>(null)
  const [showRejectForm, setShowRejectForm] = useState(false)

  const [state, formAction, pending] = useActionState<ReviewActionState, FormData>(
    async (previous, data) => {
      const note = (data.get('note') as string | null) ?? ''
      if (data.get('decision') === 'reject' && note.trim().length < 10) {
        const result: ReviewActionState = {
          error: 'Bitte gib einen Ablehnungsgrund ein (min. 10 Zeichen).',
          done: false,
          decision: null,
        }
        requestAnimationFrame(() => statusRef.current?.focus())
        return result
      }
      const result = await reviewOrganizationAction(org.slug, previous, data)
      if (result.error) requestAnimationFrame(() => statusRef.current?.focus())
      return result
    },
    { error: null, done: false, decision: null },
  )

  const review_status = org.review_status ?? 'approved'

  if (review_status === 'draft') {
    return (
      <section className="mb-8" aria-label="Freigabe">
        <h2 className="cp-heading mb-3" style={{ color: 'var(--cp-ink)' }}>
          Freigabe
        </h2>
        <div
          className="rounded-[var(--cp-r-card)] border px-4 py-4"
          style={{ borderColor: 'var(--cp-line)', background: 'var(--cp-surface)' }}
        >
          <p className="cp-body" style={{ color: 'var(--cp-muted)' }}>
            Noch nicht eingereicht – der Verein hat den Antrag noch nicht abgesendet.
          </p>
        </div>
      </section>
    )
  }

  if (review_status === 'rejected') {
    return (
      <section className="mb-8" aria-label="Freigabe">
        <h2 className="cp-heading mb-3" style={{ color: 'var(--cp-ink)' }}>
          Freigabe
        </h2>
        <div
          className="rounded-[var(--cp-r-card)] border px-4 py-4"
          style={{ borderColor: 'var(--cp-error-line, #FCA5A5)', background: 'var(--cp-error-bg)' }}
        >
          <p className="cp-body font-medium" style={{ color: 'var(--cp-error)' }}>
            Abgelehnt
          </p>
          {org.review_note && (
            <p className="cp-body mt-2" style={{ color: 'var(--cp-ink)' }}>
              Grund: {org.review_note}
            </p>
          )}
        </div>
      </section>
    )
  }

  if (review_status === 'approved') {
    return (
      <section className="mb-8" aria-label="Freigabe">
        <h2 className="cp-heading mb-3" style={{ color: 'var(--cp-ink)' }}>
          Freigabe
        </h2>
        <div
          className="rounded-[var(--cp-r-card)] border px-4 py-4"
          style={{ borderColor: 'var(--cp-success-bg, #BBF7D0)', background: 'var(--cp-success-bg, #E3F3E9)' }}
        >
          <p className="cp-body" style={{ color: 'var(--cp-success, #1C6B45)' }}>
            Freigegeben{org.approved_at ? ` am ${formatDate(org.approved_at)}` : ''}
          </p>
        </div>
      </section>
    )
  }

  // review_status === 'submitted'
  const checklist = [
    { label: 'Vereinsname plausibel', done: !!org.name },
    { label: 'Impressum / Anschrift vorhanden', done: !!(org.legal_name && org.legal_address) },
    { label: 'Mindestens ein Camp', done: campCount > 0 },
    { label: 'Bankverbindung vorhanden', done: !!org.iban },
  ]

  return (
    <section className="mb-8" aria-label="Freigabe">
      <h2 className="cp-heading mb-3" style={{ color: 'var(--cp-ink)' }}>
        Freigabe
      </h2>
      <div
        className="rounded-[var(--cp-r-card)] border px-4 py-4"
        style={{ borderColor: 'var(--cp-line)', background: 'var(--cp-surface)' }}
      >
        <div className="mb-4 divide-y" style={{ borderColor: 'var(--cp-line)' }}>
          {checklist.map(item => (
            <CheckItem key={item.label} label={item.label} done={item.done} />
          ))}
        </div>

        <div className="mb-4">
          <Link
            href={`/platform/${org.slug}/preview`}
            className="cp-chip"
            style={{ color: 'var(--cp-ink)', textDecoration: 'underline' }}
          >
            Vorschau der Elternseite →
          </Link>
        </div>

        {state.done ? (
          <p
            ref={statusRef}
            role="status"
            tabIndex={-1}
            className="cp-body"
            style={{ color: 'var(--cp-success, #1C6B45)' }}
          >
            {state.decision === 'approve'
              ? 'Freigegeben. Seite wird aktualisiert …'
              : 'Abgelehnt. Seite wird aktualisiert …'}
          </p>
        ) : (
          <>
            {state.error && (
              <p
                ref={statusRef}
                role="alert"
                tabIndex={-1}
                className="cp-body mb-4"
                style={{ color: 'var(--cp-error)' }}
              >
                {state.error}
              </p>
            )}

            {!showRejectForm ? (
              <div className="flex flex-wrap gap-3">
                <form action={formAction}>
                  <input type="hidden" name="decision" value="approve" />
                  <Button type="submit" variant="primary" disabled={pending}>
                    {pending ? 'Wird gespeichert …' : 'Freigeben'}
                  </Button>
                </form>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => setShowRejectForm(true)}
                >
                  Ablehnen
                </Button>
              </div>
            ) : (
              <form action={formAction} className="flex flex-col gap-3">
                <input type="hidden" name="decision" value="reject" />
                <div>
                  <label
                    htmlFor="reject-note"
                    className="cp-body mb-1 block"
                    style={{ color: 'var(--cp-ink)' }}
                  >
                    Ablehnungsgrund <span aria-hidden="true">*</span>
                  </label>
                  <textarea
                    id="reject-note"
                    name="note"
                    rows={3}
                    placeholder="Mindestens 10 Zeichen …"
                    className="cp-focus w-full rounded-[var(--cp-r-field)] border px-3 py-2"
                    style={{ borderColor: 'var(--cp-field-line)', fontSize: '16px', minHeight: '44px' }}
                  />
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button type="submit" variant="danger" disabled={pending}>
                    {pending ? 'Wird abgelehnt …' : 'Ablehnen bestätigen'}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => setShowRejectForm(false)}
                  >
                    Abbrechen
                  </Button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </section>
  )
}
