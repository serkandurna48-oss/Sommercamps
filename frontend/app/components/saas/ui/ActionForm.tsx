'use client'

import { useActionState } from 'react'
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
 */
export default function ActionForm({
  action,
  label,
  pendingLabel,
  variant = 'secondary',
  brandStrong,
  brandOn,
}: {
  action: (state: ActionFormState, formData: FormData) => Promise<ActionFormState>
  label: string
  pendingLabel: string
  variant?: 'primary' | 'secondary' | 'quiet'
  brandStrong?: string
  brandOn?: string
}) {
  const [state, formAction, pending] = useActionState(action, initialActionFormState)

  return (
    <form action={formAction} className="flex flex-col items-start gap-1.5">
      <Button type="submit" disabled={pending} variant={variant} brandStrong={brandStrong} brandOn={brandOn}>
        {pending ? pendingLabel : label}
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
    </form>
  )
}
