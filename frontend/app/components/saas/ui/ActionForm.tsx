'use client'

import { useActionState, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useAdminPreview, previewNoopAction } from '../preview/AdminPreviewContext'
import type { RegistrationStatusResult } from '../../../lib/saasAdminApi'
import Button from './Button'

export interface ActionFormState {
  error: string | null
  success: string | null
  promoted?: RegistrationStatusResult | null
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
 * Der Bestätigungszustand wird nach jeder abgeschlossenen Aktion
 * (Erfolg, Fehler, Abbrechen) zurückgesetzt.
 * Fokus: Beim Öffnen der Bestätigung wandert er auf den sicheren Knopf
 * (Abbrechen), der die Frage per aria-describedby mitliest; nach Abbrechen
 * oder einer abgeschlossenen Aktion kehrt er zum auslösenden Knopf zurück.
 */
export default function ActionForm({
  action,
  label,
  pendingLabel,
  variant = 'secondary',
  requireConfirm,
  cancelLabel = 'Abbrechen',
  onResult,
}: {
  action: (state: ActionFormState, formData: FormData) => Promise<ActionFormState>
  label: string
  pendingLabel: string
  variant?: 'primary' | 'secondary' | 'danger'
  /** Wenn gesetzt: Text der Bestätigungsfrage. Zeigt erst nach Klick. */
  requireConfirm?: ReactNode
  cancelLabel?: string
  onResult?: (result: ActionFormState) => void
}) {
  const feedbackId = useId()
  const confirmId = `${feedbackId}-confirm`
  const preview = useAdminPreview()
  const effectiveAction = preview ? previewNoopAction : action
  const [confirming, setConfirming] = useState(false)
  // Bestätigungszustand wird nach jeder abgeschlossenen Aktion zurückgesetzt –
  // unabhängig davon, ob der Ergebnistext derselbe ist wie zuvor.
  const [state, formAction, pending] = useActionState(
    async (prev: ActionFormState, formData: FormData) => {
      try {
        const result = await effectiveAction(prev, formData)
        onResult?.(result)
        return { ...result }
      } finally {
        setConfirming(false)
      }
    },
    initialActionFormState,
  )

  const effectiveConfirming = !!requireConfirm && confirming
  const triggerRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const wasConfirming = useRef(false)
  useEffect(() => {
    if (effectiveConfirming) cancelRef.current?.focus()
    else if (wasConfirming.current) triggerRef.current?.focus()
    wasConfirming.current = effectiveConfirming
  }, [effectiveConfirming])

  if (requireConfirm && !confirming) {
    return (
      <div className="flex flex-col items-start gap-2">
        <Button ref={triggerRef} aria-describedby={state.error ? feedbackId : undefined} type="button" variant={variant} onClick={() => setConfirming(true)}>
          {label}
        </Button>
        {state.error && (
          <p className="cp-confirm-pop cp-chip motion-reduce:animate-none" style={{ color: 'var(--cp-error)' }} id={feedbackId} role="alert">
            {state.error}
          </p>
        )}
        {state.success && !onResult && (
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
        <div id={confirmId} role="group" className="cp-body space-y-2" style={{ color: 'var(--cp-muted)' }}>
          {requireConfirm}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button aria-describedby={[effectiveConfirming && confirmId, state.error && feedbackId].filter(Boolean).join(' ') || undefined} type="submit" disabled={pending} variant={variant}>
          {pending ? pendingLabel : label}
        </Button>
        {effectiveConfirming && (
          <Button ref={cancelRef} aria-describedby={confirmId} type="button" variant="secondary" disabled={pending} aria-disabled={pending} onClick={() => setConfirming(false)}>
            {cancelLabel}
          </Button>
        )}
      </div>
      {state.error && (
        <p className="cp-confirm-pop cp-chip motion-reduce:animate-none" style={{ color: 'var(--cp-error)' }} id={feedbackId} role="alert">
          {state.error}
        </p>
      )}
      {state.success && !onResult && (
        <p className="cp-confirm-pop cp-chip motion-reduce:animate-none" style={{ color: 'var(--cp-ok)' }} role="status">
          {state.success}
        </p>
      )}
    </form>
  )
}
