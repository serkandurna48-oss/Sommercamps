'use client'

import { useId, useState } from 'react'
import { reminderLabels } from '../../../lib/zahlungserinnerung'
import Button from '../ui/Button'

export function PaymentTextFallback({ text }: { text: string }) {
  const id = useId()
  return (
    <div className="mt-2 max-w-2xl">
      <p role="alert" id={`${id}-help`}>{reminderLabels.fallback}</p>
      <label htmlFor={id} className="sr-only">{reminderLabels.fallbackLabel}</label>
      <textarea id={id} readOnly value={text} rows={8} aria-describedby={`${id}-help`}
        onFocus={event => event.currentTarget.select()}
        className="cp-focus mt-2 w-full rounded-[var(--cp-r-field)] border p-3"
        style={{ borderColor: 'var(--cp-field-line)', background: 'var(--cp-surface)', color: 'var(--cp-ink)' }} />
    </div>
  )
}

export default function PaymentTextCopy({ text, label, disabledReason, onFallback }: {
  text: string | null
  label: string
  disabledReason?: string
  onFallback?: (text: string | null) => void
}) {
  const id = useId()
  const [result, setResult] = useState<{ text: string; state: 'copied' | 'error' } | null>(null)
  const state = result?.text === text ? result.state : null

  async function copy() {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setResult({ text, state: 'copied' })
      onFallback?.(null)
    } catch {
      setResult({ text, state: 'error' })
      onFallback?.(text)
    }
  }

  return (
    <div className="min-w-0 max-w-full">
      <span title={disabledReason} tabIndex={disabledReason ? 0 : undefined}
        aria-describedby={disabledReason ? `${id}-reason` : undefined}>
        <Button type="button" onClick={copy} disabled={!text} title={disabledReason}
          aria-describedby={disabledReason ? `${id}-reason` : undefined}>{label}</Button>
      </span>
      {disabledReason && <span id={`${id}-reason`} className="sr-only">{disabledReason}</span>}
      {state === 'copied' && <p role="status" className="mt-2">{reminderLabels.copied}</p>}
      {state === 'error' && !onFallback && <PaymentTextFallback text={text ?? ''} />}
    </div>
  )
}
