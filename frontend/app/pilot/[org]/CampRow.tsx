'use client'

import { useEffect, useRef } from 'react'
import type { CampPublic } from '../../lib/saasApi'
import { formatCampRowDate, formatPrice } from '../../lib/parentFlowFormat'

/**
 * Eine Campzeile — Ticket §6.1 / reference card(). Identisches Markup in
 * org-Campliste und wait-Alternativenliste; nur .camps-Elternklasse ändert
 * sich zwischen "campList" (Kontext egal) und "waitAlt" (Kontext egal, da
 * rein CSS-gesteuert über [data-theme]).
 *
 * Ort/Uhrzeit fehlen bewusst (kein Datenfeld dafür, siehe Rückfrage zu
 * §6.2 — nichts erfunden statt Platzhaltertext zu zeigen).
 */
export default function CampRow({ camp, onSelect }: { camp: CampPublic; onSelect: (camp: CampPublic) => void }) {
  const { day, month, weekdays } = formatCampRowDate(camp.start_date, camp.end_date)
  const pct = camp.capacity > 0 ? Math.round((camp.registered_count / camp.capacity) * 100) : 0
  const tight = !camp.is_full && camp.spots_remaining <= 3
  const barRef = useRef<HTMLSpanElement>(null)

  // §6.1: Balken wächst beim Erscheinen von 0 auf den Zielwert.
  useEffect(() => {
    const bar = barRef.current
    if (!bar) return
    bar.style.width = '0'
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        bar.style.width = `${pct}%`
      })
    })
  }, [pct])

  return (
    <button
      type="button"
      className={`camp${camp.is_full ? ' full' : ''}`}
      onClick={() => onSelect(camp)}
      data-rise
    >
      <span className="c-date">
        <b className="num">{day}</b>
        <span>{month}</span>
        <em>{weekdays}</em>
      </span>
      <span className="c-body">
        <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="c-name">{camp.title}</span>
        </span>
        <span className="tags">
          {camp.is_full && <span className="chip info">Ausgebucht</span>}
          <span className="tag">
            {camp.age_min} bis {camp.age_max} Jahre
          </span>
        </span>
        <span className="cap">
          <span className={`bar${camp.is_full ? ' full' : ''}`}>
            <i ref={barRef} />
          </span>
          <span className={`t num${tight ? ' tight' : ''}`}>
            {camp.is_full
              ? `${camp.capacity} von ${camp.capacity} belegt, ${camp.waitlist_count} auf der Warteliste`
              : tight
                ? `Nur noch ${camp.spots_remaining} Plätze frei`
                : `${camp.spots_remaining} von ${camp.capacity} Plätzen frei`}
          </span>
        </span>
        <span className="c-foot">
          <span className={`c-price num${camp.is_full ? ' muted' : ''}`}>{formatPrice(camp.price_cents, camp.currency)}</span>
          <span className="c-go">{camp.is_full ? 'Auf die Warteliste' : 'Ansehen'}</span>
        </span>
      </span>
    </button>
  )
}
