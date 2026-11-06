import SuccessNote from '../state/SuccessNote'

export interface NoticeState {
  kind: 'ok' | 'error'
  text: string
}

/** Rückmeldung zu einer Aktion: Erfolg als role="status", Fehler als role="alert". */
export default function Notice({ notice }: { notice: NoticeState | null }) {
  if (!notice) return null
  if (notice.kind === 'ok') return <SuccessNote>{notice.text}</SuccessNote>
  return (
    <p className="cp-body rounded-[var(--cp-r-chip)] border px-3 py-2" role="alert"
      style={{ color: 'var(--cp-error)', background: 'var(--cp-error-bg)', borderColor: 'var(--cp-error-line)' }}>
      {notice.text}
    </p>
  )
}

/** Fehlerzeile für ein Formular (nach fehlgeschlagenem Speichern). */
export function FormError({ message }: { message: string | null | undefined }) {
  return message ? <Notice notice={{ kind: 'error', text: message }} /> : null
}
