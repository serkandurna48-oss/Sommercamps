'use client'

import { useState } from 'react'
import { removeMemberExtraFieldAction } from '../actions/trainingActions'
import Button from '../ui/Button'

/** Spaltenkopf eines Zusatzfelds mit „Entfernen“ (bei allen Mitgliedern) und
 * Bestätigung direkt an Ort und Stelle. */
export default function ExtraFieldRemove({ orgSlug, label }: { orgSlug: string; label: string }) {
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function remove() {
    setPending(true)
    setError(null)
    try {
      const result = await removeMemberExtraFieldAction(orgSlug, label)
      if (result.error) setError(result.error)
      else setConfirming(false)
    } catch {
      setError('Zusatzfeld konnte nicht entfernt werden.')
    } finally {
      setPending(false)
    }
  }

  return (
    <span className="flex min-w-0 flex-col gap-1" data-extra-head={label}>
      <span className="flex min-w-0 items-center gap-1">
        <span className="min-w-0 break-words">{label}</span>
        {!confirming && (
          <Button type="button" onClick={() => setConfirming(true)} aria-label={`Zusatzfeld „${label}“ entfernen`} title="Zusatzfeld entfernen"
            className="cp-extra-remove shrink-0" data-remove-extra={label}>
            <span aria-hidden="true">×</span>
          </Button>
        )}
      </span>
      {confirming && (
        <span className="flex flex-wrap items-center gap-1 font-normal" role="group" aria-label={`Zusatzfeld „${label}“ entfernen`}>
          <span style={{ color: 'var(--cp-ink-2)' }}>Bei allen Mitgliedern löschen?</span>
          <Button type="button" variant="danger" onClick={remove} disabled={pending} data-confirm-remove={label} className="cp-extra-remove">
            {pending ? 'Wird entfernt …' : 'Entfernen'}
          </Button>
          <Button type="button" onClick={() => { setConfirming(false); setError(null) }} disabled={pending} className="cp-extra-remove">
            Abbrechen
          </Button>
        </span>
      )}
      {error && <span role="alert" className="font-normal" style={{ color: 'var(--cp-error)' }}>{error}</span>}
    </span>
  )
}
