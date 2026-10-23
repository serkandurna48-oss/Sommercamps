'use client'

import { useState } from 'react'
import { de } from '../../../lib/i18n/de'
import Button from '../ui/Button'

type SubmitAction = (orgSlug: string, avvVersion: string) => Promise<{ ok: boolean; error?: string }>
const AVV_VERSION = '2026-10'

export default function SubmitReviewButton({
  orgSlug,
  brandStrong,
  brandOn,
  reviewNote,
  submitAction,
}: {
  orgSlug: string
  brandStrong: string
  brandOn: string
  reviewNote: string | null
  submitAction: SubmitAction
}) {
  const [phase, setPhase] = useState<'idle' | 'dialog' | 'submitting' | 'submitted' | 'error'>('idle')
  const [avvChecked, setAvvChecked] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit() {
    if (!avvChecked) return
    setPhase('submitting')
    const result = await submitAction(orgSlug, AVV_VERSION)
    if (result.ok) {
      setPhase('submitted')
    } else {
      setPhase('error')
      setErrorMsg(result.error ?? 'Unbekannter Fehler.')
    }
  }

  if (phase === 'submitted') {
    return (
      <p role="status" className="cp-body mt-3" style={{ color: 'var(--cp-ok, #2d7a3a)' }}>
        {de.onboarding.reviewPendingBanner}
      </p>
    )
  }

  return (
    <div className="mt-3">
      {reviewNote && phase === 'idle' && (
        <p className="cp-body mb-3" style={{ color: 'var(--cp-ink-2)' }}>
          <span style={{ color: 'var(--cp-error, #b91c1c)', fontWeight: 600 }}>{de.onboarding.reviewRejectedPrefix}</span>
          {' '}{reviewNote}
        </p>
      )}

      {(phase === 'idle' || phase === 'error') && (
        <>
          <Button
            type="button"
            variant="primary"
            brandStrong={brandStrong}
            brandOn={brandOn}
            onClick={() => { setPhase('dialog'); setAvvChecked(false); setErrorMsg('') }}
          >
            {de.onboarding.step3ActionSubmit}
          </Button>
          {phase === 'error' && (
            <p role="alert" className="cp-body mt-2" style={{ color: 'var(--cp-error, #b91c1c)' }}>{errorMsg}</p>
          )}
        </>
      )}

      {(phase === 'dialog' || phase === 'submitting') && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Zur Freigabe einreichen"
          className="cp-card mt-3"
          style={{ borderColor: 'var(--cp-line)', background: 'var(--cp-surface-2, var(--cp-surface))' }}
        >
          <p className="cp-body" style={{ color: 'var(--cp-ink-2)' }}>{de.onboarding.reviewDialogAvvHint}</p>
          <label
            className="cp-body mt-3 flex items-start gap-2"
            style={{ cursor: 'pointer' }}
          >
            <input
              type="checkbox"
              checked={avvChecked}
              onChange={e => setAvvChecked(e.target.checked)}
              disabled={phase === 'submitting'}
              className="mt-0.5"
              style={{ width: 16, height: 16, flexShrink: 0 }}
            />
            <span>{de.onboarding.reviewDialogAvvLabel}</span>
          </label>
          <div className="mt-4 flex gap-3 flex-wrap">
            <Button
              type="button"
              variant="primary"
              brandStrong={brandStrong}
              brandOn={brandOn}
              disabled={!avvChecked || phase === 'submitting'}
              onClick={handleSubmit}
            >
              {phase === 'submitting' ? de.onboarding.reviewDialogSubmitting : de.onboarding.reviewDialogSubmit}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={phase === 'submitting'}
              onClick={() => setPhase('idle')}
            >
              {de.onboarding.reviewDialogCancel}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
