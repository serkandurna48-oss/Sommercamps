'use client'

import { useState, useTransition } from 'react'
import type { PlayerFormState } from '../actions/playerActions'

const CONNECTION = 'Keine Verbindung zum Server – bitte erneut versuchen. Deine Eingaben bleiben erhalten.'

/** Sendet ein Formular an eine Server Action, ohne die Eingaben zurückzusetzen:
 * die Felder gehören der Komponente und werden nur nach Erfolg geleert. */
export function useSubmit(action: (prev: PlayerFormState, formData: FormData) => Promise<PlayerFormState>) {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<PlayerFormState | null>(null)

  function submit(formData: FormData, onSaved?: () => void) {
    setResult(null)
    startTransition(async () => {
      let next: PlayerFormState
      try {
        next = await action({ error: null }, formData)
      } catch {
        next = { error: CONNECTION }
      }
      setResult(next)
      if (next.saved) onSaved?.()
    })
  }

  /** Server-Fehler eines Feldes ausblenden, sobald es geändert wird. */
  function clearField(name: string) {
    setResult(current => {
      if (!current?.fieldErrors?.[name]) return current
      const { [name]: _removed, ...rest } = current.fieldErrors
      void _removed
      return { ...current, fieldErrors: rest }
    })
  }

  return { pending, result, submit, clearField, reset: () => setResult(null) }
}
