'use client'

import { useActionState, useState } from 'react'
import Button from './Button'

export interface ActionFormState {
  error: string | null
  success: string | null
}

export const initialActionFormState: ActionFormState = { error: null, success: null }

/**
 * Ein Server-Action-Button ohne eigene Formularfelder (AufrÃ¼cken,
 * Zahlungsstatus setzen, Stornieren) â€” mit Pending- und Fehler-/Erfolgs-
 * Feedback Ã¼ber useActionState, gleiches Muster wie LoginForm. Kein
 * eigenes Fetch/State-Handling pro Aufrufstelle nÃ¶tig.
 *
 * `requireConfirm` (optional): wenn gesetzt, zeigt ein erster Klick
 * eine Inline-BestÃ¤tigungsfrage â€” zweiter Klick lÃ¶st die Aktion aus.
 * Verhindert unbeabsichtigte Klicks bei nicht rÃ¼ckgÃ¤ngig zu machenden
 * Aktionen (Warteliste aufrÃ¼cken, Zahlung erlassen).
 * Der BestÃ¤tigungszustand wird nach jeder abgeschlossenen Aktion
 * (Erfolg, Fehler, Abbrechen) zurÃ¼ckgesetzt.
 */
export default function ActionForm({
  action,
  label,
  pendingLabel,
  variant = 'secondary',
  brandStrong,
  brandOn,
  requireConfirm,
}: {
  action: (state: ActionFormState, formData: FormData) => Promise<ActionFormState>
  label: string
  pendingLabel: string
  variant?: 'primary' | 'secondary' | 'quiet' | 'quiet-danger'
  brandStrong?: string
  brandOn?: string
  /** Wenn gesetzt: Text der BestÃ¤tigungsfrage. Zeigt erst nach Klick. */
  requireConfirm?: string
}) {
  const [confirming, setConfirming] = useState(false)
  // BestÃ¤tigungszustand wird nach jeder abgeschlossenen Aktion zurÃ¼ckgesetzt â€“
  // unabhÃ¤ngig davon, ob der Ergebnistext derselbe ist wie zuvor.
  const [state, formAction, pending] = useActionState(
    async (prev: ActionFormState, formData: FormData) => {
      try {
        return { ...(await action(prev, formData)) }
      } finally {
        setConfirming(false)
      }
    },
    initialActionFormState,
  )

  const effectiveConfirming = !!requireConfirm && confirming

  if (requireConfirm && !confirming) {
    return (
      <div className="flex flex-col items-start gap-2">
        <Button type="button" variant={variant} brandStrong={brandStrong} brandOn={brandOn} onClick={() => setConfirming(true)}>
          {label}
        </Button>
        {state.error && (
          <p className="cp-confirm-pop cp-chip motion-reduce:animate-none" style={{ color: 'var(--cp-error)' }} role="alert">
            {state.error}
          </p>
        )}
        {state.success && (
          <p className="cp-confirm-pop cp-chip motion-reduce:animate-none" style={{ color: 'var(--cp-ok)' }} role="status">
            {state.success}
          </p>
        )}
      </div>
    )
  }

  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      {effectiveConfirming && (
        <p className="cp-chip" style={{ color: 'var(--cp-muted)' }}>
          {requireConfirm}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending} variant={variant} brandStrong={brandStrong} brandOn={brandOn}>
          {pending ? pendingLabel : label}
        </Button>
        {effectiveConfirming && (
          <Button type="button" variant="quiet" onClick={() => setConfirming(false)}>
            Abbrechen
          </Button>
        )}
      </div>
      {state.error && (
        <p className="cp-confirm-pop cp-chip motion-reduce:animate-none" style={{ color: 'var(--cp-error)' }} role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="cp-confirm-pop cp-chip motion-reduce:animate-none" style={{ color: 'var(--cp-ok)' }} role="status">
          {state.success}
        </p>
      )}
    </form>
  )
}
