import { de } from '../../../lib/i18n/de'
import Button from '../ui/Button'

/** Fehlermeldungen entschuldigen sich nicht, nennen keinen Fehlercode —
 * sagen, was passiert ist und was jetzt zu tun ist (Abschnitt 9.2). */
export default function ErrorState({ onRetry }: { onRetry?: () => void }) {
  return (
    <div
      className="rounded-[var(--cp-r-card)] border px-6 py-10 text-center"
      style={{ borderColor: 'var(--cp-error-line)', background: 'var(--cp-error-bg)' }}
      role="alert"
    >
      <p className="cp-subheading" style={{ color: 'var(--cp-error)' }}>
        {de.states.errorTitle}
      </p>
      <p className="cp-body mt-1.5" style={{ color: 'var(--cp-ink-2)' }}>
        {de.states.errorBody}
      </p>
      {onRetry && (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" onClick={onRetry}>
            {de.states.retry}
          </Button>
        </div>
      )}
    </div>
  )
}
