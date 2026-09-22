import type { ReactNode } from 'react'

interface FieldProps {
  label: string
  htmlFor: string
  hint?: string
  error?: string
  children: ReactNode
}

/** Label + Control + Hinweis + Fehler. Control (Input/Select/Textarea) wird
 * als Kind übergeben und muss selbst >=16px Schriftgröße setzen (sonst
 * zoomt iOS beim Fokussieren, Abschnitt 3.2) und >=46px Höhe (Abschnitt 5). */
export default function Field({ label, htmlFor, hint, error, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="cp-label" style={{ color: 'var(--cp-ink-2)' }}>
        {label}
      </label>
      {children}
      {hint && !error && (
        <p className="cp-chip" style={{ color: 'var(--cp-muted)' }}>
          {hint}
        </p>
      )}
      {error && (
        <p className="cp-chip" style={{ color: 'var(--cp-error)' }} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
