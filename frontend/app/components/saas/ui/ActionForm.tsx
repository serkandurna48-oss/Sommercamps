'use client'

import { useActionState, useState } from 'react'
import Button from './Button'

export interface ActionFormState {
  error: string | null
  success: string | null
}

export const initialActionFormState: ActionFormState = { error: null, success: null }

/**
 * Ein Server-Action-Button ohne eigene Formularfelder (Aufrücken,
 * Zahlungsstatus setzen, Stornieren) — mit Pending- und Fehler-/Erfolgs-
 * Feedback über useActionState, gleiches Muster wie LoginForm. Kein
 * eigenes Fetch/State-Handling pro Aufrufstelle nötig.
 *
 * `requireConfirm` (optional): wenn gesetzt, zeigt ein erster Klick
 * eine Inline-Bestätigungsfrage — zweiter Klick löst die Aktion aus.
 * Verhindert unbeabsichtigte Klicks bei nicht rückgängig zu machenden
 * Aktionen (Warteliste aufrücken, Zahlung erlassen).
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
  /** Wenn gesetzt: Text der Bestätigungsfrage. Zeigt erst nach Klick. */
  requireConfirm?: string
}) {
  const [state, formAction, pending] = useActionState(action, initialActionFormState)
  const [confirming, setConfirming] = useState(false)

  // Nach erfolgter Aktion fällt effectiveConfirming auf false zurück, ohne
  // setState im Effect aufzurufen — state.success übersteuert confirming rein
  // visuell; beim nächsten Render-Zyklus (Server-Revalidierung) wird das
  // Component sowieso neu gemountet.
  const effectiveConfirming = !!requireConfirm && confirming && !state.success

  if (requireConfirm && !effectiveConfirming && !state.success && !state.error && !pending) {
    return (
      <Button type="button" variant={variant} brandStrong={brandStrong} brandOn={brandOn} onClick={() => setConfirming(true)}>
        {label}
      </Button>
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
