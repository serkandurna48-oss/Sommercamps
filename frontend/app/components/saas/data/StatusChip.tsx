export type StatusTone = 'ok' | 'pending' | 'error' | 'info' | 'neutral'

const TONE_VARS: Record<Exclude<StatusTone, 'neutral'>, { color: string; bg: string; line: string }> = {
  ok: { color: 'var(--cp-ok)', bg: 'var(--cp-ok-bg)', line: 'var(--cp-ok-line)' },
  pending: { color: 'var(--cp-pending)', bg: 'var(--cp-pending-bg)', line: 'var(--cp-pending-line)' },
  error: { color: 'var(--cp-error)', bg: 'var(--cp-error-bg)', line: 'var(--cp-error-line)' },
  info: { color: 'var(--cp-info)', bg: 'var(--cp-info-bg)', line: 'var(--cp-info-line)' },
}

/**
 * Die einzige Stelle, an der Status gerendert wird (Abschnitt 5). Nie die
 * Vereinsfarbe (Abschnitt 3.3: Statusflächen sind von --cp-brand-* immer
 * unabhängig) — nur die vier festen --cp-ok/pending/error/info-Tokens.
 */
export default function StatusChip({ tone, label }: { tone: StatusTone; label: string }) {
  const vars = tone === 'neutral' ? null : TONE_VARS[tone]
  return (
    <span
      className="cp-chip inline-flex items-center rounded-[var(--cp-r-chip)] border px-2.5 py-1"
      style={
        vars
          ? { color: vars.color, background: vars.bg, borderColor: vars.line }
          : { color: 'var(--cp-muted)', background: 'var(--cp-surface-2)', borderColor: 'var(--cp-line)' }
      }
    >
      {label}
    </span>
  )
}
