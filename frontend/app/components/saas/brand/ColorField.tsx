'use client'

import { de } from '../../../lib/i18n/de'
import Field from '../ui/Field'
import { INPUT_CLASS, INPUT_STYLE } from '../ui/formFieldStyles'

export function normalizeHex(value: string): string | null {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value
  if (/^#[0-9a-f]{3}$/i.test(value)) return '#' + [...value.slice(1)].map(char => char + char).join('')
  return null
}

export default function ColorField({ id, value, onChange }: {
  id: string
  value: string
  onChange: (value: string) => void
}) {
  const normalized = normalizeHex(value)
  const error = value && !normalized ? 'Ungültiger Hex-Code – z. B. #1c6b45' : undefined
  return (
    <Field label={de.configPage.field.primaryColor} htmlFor={id} hint={de.configPage.hint.primaryColor} error={error}>
      <div className="flex items-center gap-2">
        <input
          type="color" aria-label="Farbwähler"
          value={normalized ?? '#000000'}
          onChange={event => onChange(event.target.value)}
          className="h-10 w-10 shrink-0 cursor-pointer rounded-[var(--cp-r-chip)] border p-0.5"
          style={{ borderColor: 'var(--cp-field-line)', background: 'var(--cp-surface)' }}
        />
        <input
          id={id} name="primary_color"
          value={value} onChange={event => onChange(event.target.value)}
          placeholder="#1c6b45" className={`${INPUT_CLASS} max-w-40`} style={INPUT_STYLE}
          aria-invalid={!!error || undefined}
        />
      </div>
    </Field>
  )
}
