import Image from 'next/image'

export interface WhyUsPoint {
  title: string
  text: string
}

interface WhyUsBProps {
  eyebrow: string
  heading: string
  points: WhyUsPoint[]
  imageSrc?: string
  imageAlt: string
}

/**
 * "Warum wir", Richtung B (CP-JK-105).
 *
 * Die alte Fassung reihte drei weisse Karten mit kleinen Icons — optisch
 * identisch zu den Nebenangeboten weiter unten. Hier tragen eine Akzentkante
 * und die Textgliederung die Argumente; das Foto steht gleichberechtigt
 * daneben statt als Dekoration darüber.
 */
export default function WhyUsB({ eyebrow, heading, points, imageSrc, imageAlt }: WhyUsBProps) {
  if (points.length === 0) return null

  return (
    <section className="bg-[var(--surface-inverse)]">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-20 sm:py-24 grid lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] gap-12 lg:gap-16 items-center">
        {imageSrc && (
          <div className="relative w-full aspect-[4/3] lg:aspect-[5/6] rounded-[var(--radius-card)] overflow-hidden">
            <Image src={imageSrc} alt={imageAlt} fill unoptimized sizes="(max-width: 1024px) 100vw, 45vw" className="object-cover" />
          </div>
        )}

        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.2em] uppercase text-[var(--accent-quiet)] mb-3">
            {eyebrow}
          </p>
          <h2 lang="de" className="font-display font-bold uppercase text-[var(--text-on-dark)] text-4xl sm:text-5xl leading-none mb-9 hyphens-manual break-words">
            {heading}
          </h2>

          <ul className="flex flex-col gap-6">
            {points.map(p => (
              <li key={p.title} className="border-l-2 border-[var(--accent)] pl-5">
                <p className="text-lg font-semibold text-[var(--text-on-dark)] mb-1.5">{p.title}</p>
                <p className="text-base leading-relaxed text-[var(--text-on-dark-muted)]">{p.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
