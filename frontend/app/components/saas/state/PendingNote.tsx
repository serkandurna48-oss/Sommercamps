/** Zwischenzustand beim Speichern. Ersetzt sichtbar die vorige Erfolgs-/Fehlermeldung,
 * damit ein zweiter Speicherklick nicht neben einem alten „Gespeichert." hängt. */
export default function PendingNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="cp-body rounded-[var(--cp-r-chip)] border px-3 py-2"
      style={{ color: 'var(--cp-muted)', background: 'var(--cp-surface-2)', borderColor: 'var(--cp-field-line)' }}
      role="status"
    >
      {children}
    </p>
  )
}
