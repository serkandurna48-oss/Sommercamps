import Image from 'next/image'
import ContentPlaceholder from './ContentPlaceholder'

interface CoachProfileProps {
  eyebrow: string
  name: string
  intro: string
  portraitSrc?: string
  portraitAlt: string
  /** Fehlende, nicht erfindbare Angaben. Werden sichtbar markiert. */
  pendingFields: string[]
}

/**
 * Trainerprofil, Richtung B (CP-JK-105).
 *
 * Diese Sektion gab es bisher nicht. Der Trainer war auf mehreren Fotos zu
 * sehen, wurde aber nirgends benannt — für Eltern, die ihr Kind jemandem
 * anvertrauen sollen, ist das die wichtigste Leerstelle der ganzen Seite.
 *
 * Nachname, Lizenz und Philosophie fehlen weiterhin und stehen deshalb als
 * markierte Lücken im UI. Erfunden wird hier nichts.
 */
export default function CoachProfile({
  eyebrow,
  name,
  intro,
  portraitSrc,
  portraitAlt,
  pendingFields,
}: CoachProfileProps) {
  return (
    <section id="trainer" className="bg-[var(--surface-panel)] scroll-mt-24">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-20 sm:py-24 grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.65fr)] gap-12 lg:gap-16 items-center">
        <div className="min-w-0 lg:order-1">
          <p className="text-xs font-semibold tracking-[0.2em] uppercase text-[var(--accent-quiet)] mb-3">
            {eyebrow}
          </p>
          <h2 className="font-display font-bold uppercase text-[var(--text-on-dark)] text-4xl sm:text-5xl leading-none mb-5">
            {name}
          </h2>
          <p className="text-lg leading-relaxed text-[var(--text-on-dark-muted)] max-w-xl mb-7">
            {intro}
          </p>

          {pendingFields.length > 0 && (
            <div className="flex flex-col gap-3 max-w-xl">
              {pendingFields.map(f => (
                <ContentPlaceholder key={f}>{f}</ContentPlaceholder>
              ))}
            </div>
          )}
        </div>

        {/* order-first: Auf schmalen Geräten steht das Gesicht über dem Text.
            Die markierten Lücken dürfen nicht zwischen Namen und Portrait
            geraten — wer ist das, ist hier die erste Frage der Eltern. */}
        {portraitSrc && (
          <div className="relative w-full aspect-[4/5] rounded-[var(--radius-card)] overflow-hidden order-first lg:order-2">
            <Image
              src={portraitSrc}
              alt={portraitAlt}
              fill
              unoptimized
              sizes="(max-width: 1024px) 100vw, 35vw"
              className="object-cover object-[50%_18%]"
            />
          </div>
        )}
      </div>
    </section>
  )
}
