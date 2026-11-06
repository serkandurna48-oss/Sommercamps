'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { PlayerBooking } from '../../../lib/saasAdminApi'
import Button from '../ui/Button'
import QuickNoteForm from './QuickNoteForm'

interface Composer {
  open: boolean
  /** Zählt hoch, sobald „Notiz schreiben“ geklickt wird – auch bei schon offenem Formular. */
  tick: number
  openComposer: () => void
  closeComposer: () => void
}

const ComposerContext = createContext<Composer | null>(null)

function useComposer(): Composer {
  const composer = useContext(ComposerContext)
  if (!composer) throw new Error('NoteComposerProvider fehlt')
  return composer
}

/** Gemeinsamer Zustand für Kopfzeilen-Button und Schnellerfassung: das Formular steht nur in der Notizliste, wenn es geöffnet wurde. */
export function NoteComposerProvider({ initialOpen, children }: { initialOpen: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(initialOpen)
  const [tick, setTick] = useState(0)
  const openComposer = useCallback(() => { setOpen(true); setTick(value => value + 1) }, [])
  const closeComposer = useCallback(() => setOpen(false), [])
  const value = useMemo(() => ({ open, tick, openComposer, closeComposer }), [open, tick, openComposer, closeComposer])
  return <ComposerContext.Provider value={value}>{children}</ComposerContext.Provider>
}

/** Primäre Aktion im Seitenkopf. */
export function WriteNoteButton() {
  const { openComposer } = useComposer()
  return <Button type="button" variant="primary" onClick={openComposer} data-write-note>Notiz schreiben</Button>
}

/** Oberster Platz der Notizliste; leer, solange das Formular zu ist. */
export function NoteComposerSlot({ orgSlug, playerId, bookings, initialDate, initialCampId }: {
  orgSlug: string
  playerId: string
  bookings: PlayerBooking[]
  initialDate: string
  initialCampId: string | null
}) {
  const { open, tick, closeComposer } = useComposer()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (tick === 0 || !ref.current) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ref.current.scrollIntoView?.({ block: 'start', behavior: reduce ? 'auto' : 'smooth' })
    ref.current.querySelector<HTMLTextAreaElement>('textarea')?.focus({ preventScroll: true })
  }, [tick])

  if (!open) return null
  return (
    <div ref={ref} id="note-composer" className="scroll-mt-4">
      <QuickNoteForm orgSlug={orgSlug} playerId={playerId} bookings={bookings} initialDate={initialDate}
        initialCampId={initialCampId} autoFocus onClose={closeComposer} />
    </div>
  )
}
