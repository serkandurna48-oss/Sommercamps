'use client'

import { useActionState } from 'react'
import { importLeadsAction, type ImportState } from './actions'

const initial: ImportState = { error: null, result: null }
const BTN = 'cp-focus cp-btn inline-flex min-h-[44px] items-center justify-center px-4 disabled:opacity-50'

export default function ImportForm() {
  const [state, action, pending] = useActionState(importLeadsAction, initial)
  const r = state.result
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="cp-label" style={{ color: 'var(--cp-muted)' }}>CSV-Datei (Komma oder Semikolon, max. 1 MB)</span>
        <input name="file" type="file" accept=".csv,text/csv" required className="cp-body" />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="submit" name="mode" value="check" disabled={pending} className={`${BTN} cp-btn-secondary`}>
          {pending ? 'Wird geprüft …' : '1. Prüfen'}
        </button>
        <button type="submit" name="mode" value="import" disabled={pending || !r?.dry_run} className={`${BTN} cp-btn-primary`}>
          2. Importieren
        </button>
      </div>
      {state.error && <p className="cp-chip" role="alert" style={{ color: 'var(--cp-error)' }}>{state.error}</p>}
      {r && (
        <div role="status" className="cp-body rounded-[var(--cp-r-card)] border px-4 py-3" style={{ borderColor: 'var(--cp-line)', background: 'var(--cp-surface)' }}>
          <p><strong>{r.dry_run ? `${r.created} Leads würden angelegt.` : `${r.created} Leads angelegt.`}</strong></p>
          <p className="cp-chip mt-1" style={{ color: 'var(--cp-muted)' }}>
            {r.duplicates} doppelt (übersprungen) · {r.invalid} ohne Namen (übersprungen)
            {r.unknown_columns.length > 0 && <> · nicht übernommene Spalten: {r.unknown_columns.join(', ')}</>}
          </p>
          {r.dry_run && <p className="cp-chip mt-1">Passt das? Dann dieselbe Datei mit „2. Importieren“ übernehmen.</p>}
        </div>
      )}
    </form>
  )
}
