import Button, { type ButtonVariant } from './ui/Button'

/** Gesperrter "Camp anlegen"-Knopf mit der Paketmeldung (Starter-Grenze). Die Meldung steht als Text
 * daneben, nicht nur im Tooltip, damit sie auf dem Handy und für Screenreader lesbar ist. */
export default function CampCreateBlocked({ message, variant = 'secondary', label = 'Camp anlegen' }: { message: string; variant?: ButtonVariant; label?: string }) {
  return (
    <div className="flex flex-col items-start gap-1 md:items-end">
      <Button type="button" variant={variant} disabled aria-describedby="camp-create-blocked">{label}</Button>
      <p id="camp-create-blocked" role="note" className="cp-body max-w-xs md:text-right" style={{ color: 'var(--cp-ink-2)' }}>{message}</p>
    </div>
  )
}
