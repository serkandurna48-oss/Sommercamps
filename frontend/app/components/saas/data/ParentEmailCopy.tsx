'use client'

import { useId, useState } from 'react'
import type { RegistrationAdmin } from '../../../lib/saasAdminApi'
import { parentEmails } from '../parentEmails'
import Button from '../ui/Button'

export default function ParentEmailCopy({ registrations }: { registrations: RegistrationAdmin[] }) {
  const [includeWaitlist, setIncludeWaitlist] = useState(false)
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<{ text: string; copied: boolean } | null>(null)
  const fallbackId = useId()
  const hintId = useId()
  const emails = parentEmails(registrations, includeWaitlist)
  const text = emails.join('; ')
  const currentResult = result?.text === text ? result : null

  async function copyEmails() {
    if (pending || emails.length === 0) return
    setPending(true)
    setResult(null)
    try {
      await navigator.clipboard.writeText(text)
      setResult({ text, copied: true })
    } catch {
      setResult({ text, copied: false })
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="cp-noprint space-y-2 cp-body">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" disabled={pending || emails.length === 0} onClick={copyEmails}>
          E-Mail-Adressen kopieren
        </Button>
        <label className="inline-flex min-h-[44px] min-w-[44px] items-center gap-2">
          <input type="checkbox" checked={includeWaitlist} disabled={pending} onChange={e => {
            setIncludeWaitlist(e.target.checked)
            setResult(null)
          }} />
          Auch Warteliste
        </label>
      </div>
      <p className="cp-hint">Alle Anmeldungen dieses Camps ohne Stornierungen, unabhängig von Suche und Auswahl.</p>
      <div aria-live="polite">
        {emails.length === 0 && <p role="status">Keine E-Mail-Adressen zum Kopieren vorhanden.</p>}
        {currentResult?.copied && <p role="status">{emails.length} Adressen kopiert – fügen Sie sie in Ihrem E-Mail-Programm in das BCC-Feld ein.</p>}
        {currentResult && !currentResult.copied && <p role="status" id={hintId}>Fügen Sie die Adressen in Ihrem E-Mail-Programm in das BCC-Feld ein.</p>}
      </div>
      {currentResult && !currentResult.copied && <div>
        <label htmlFor={fallbackId} className="cp-label mb-1 block">Bitte manuell kopieren</label>
        <textarea id={fallbackId} readOnly value={currentResult.text} aria-describedby={hintId} rows={3}
          onFocus={e => e.currentTarget.select()}
          className="w-full max-w-xl rounded-[var(--cp-r-field)] border p-3 text-base"
          style={{ borderColor: 'var(--cp-field-line)', background: 'var(--cp-surface)', color: 'var(--cp-ink)' }} />
      </div>}
    </div>
  )
}
