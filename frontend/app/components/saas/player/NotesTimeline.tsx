'use client'

import { useId, useState } from 'react'
import type { PlayerBooking, PlayerNote } from '../../../lib/saasAdminApi'
import { deleteNoteAction } from '../actions/playerActions'
import EmptyState from '../state/EmptyState'
import Button from '../ui/Button'
import ActionForm from '../ui/ActionForm'
import Notice, { type NoticeState } from './Notice'
import { COMPACT_BUTTONS, COMPACT_CARD } from './compact'
import { NoteComposerSlot, WriteNoteButton } from './NoteComposer'
import QuickNoteForm from './QuickNoteForm'
import { focusLabel, formatDay, isHttpsUrl, ratingDots } from './playerLogic'

function NoteItem({ orgSlug, playerId, note, booking, bookings, onNotice }: {
  orgSlug: string
  playerId: string
  note: PlayerNote
  booking: PlayerBooking | undefined
  bookings: PlayerBooking[]
  onNotice: (notice: NoticeState) => void
}) {
  const bodyId = useId()
  const [editing, setEditing] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const remove = deleteNoteAction.bind(null, orgSlug, playerId, note.id)

  if (editing) {
    return (
      <li data-note-id={note.id}>
        <QuickNoteForm orgSlug={orgSlug} playerId={playerId} bookings={bookings} initialDate={note.note_date} note={note}
          onDone={() => { setEditing(false); onNotice({ kind: 'ok', text: 'Notiz gespeichert.' }) }} />
      </li>
    )
  }

  const nextSteps = note.next_steps
  const long = note.body.length > 220 || note.body.split('\n').length > 3 || (nextSteps?.length ?? 0) > 140
  const clamp = long && !expanded ? 'line-clamp-3' : ''

  return (
    <li className={`${COMPACT_CARD} ${COMPACT_BUTTONS} flex flex-col gap-2`} data-note-id={note.id}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="cp-label" style={{ color: 'var(--cp-ink)' }}>{formatDay(note.note_date)}</p>
        {note.rating !== null && (
          <p className="inline-flex items-center gap-1" role="img" aria-label={`Bewertung ${note.rating} von 5`}>
            {ratingDots(note.rating).map((on, index) => (
              <span key={index} aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full border"
                style={{ background: on ? 'var(--cp-ink)' : 'transparent', borderColor: 'var(--cp-ink)' }} />
            ))}
          </p>
        )}
        {note.focus.length > 0 && (
          <ul className="flex flex-wrap gap-1" aria-label="Schwerpunkt">
            {note.focus.map(value => (
              <li key={value} className="cp-chip rounded-[var(--cp-r-chip)] border px-2 py-0.5" style={{ color: 'var(--cp-ink-2)', borderColor: 'var(--cp-line)' }}>{focusLabel(value)}</li>
            ))}
          </ul>
        )}
      </div>
      {booking && (
        <p className="cp-chip" style={{ color: 'var(--cp-muted)' }}>
          Termin: {formatDay(booking.local_date)}{booking.local_time ? `, ${booking.local_time} Uhr` : ''} · {booking.offer_title ?? booking.camp_title}
        </p>
      )}
      <p id={`${bodyId}-body`} className={`cp-body whitespace-pre-wrap break-words ${clamp}`} style={{ color: 'var(--cp-ink)' }}>{note.body}</p>
      {nextSteps && (
        <p className={`cp-body whitespace-pre-wrap break-words ${long && !expanded ? 'line-clamp-2' : ''}`} style={{ color: 'var(--cp-ink)' }}>
          <span className="cp-label" style={{ color: 'var(--cp-ink-2)' }}>Nächste Schritte: </span>{nextSteps}
        </p>
      )}
      {long && (
        <Button type="button" className="self-start" aria-expanded={expanded} aria-controls={`${bodyId}-body`} onClick={() => setExpanded(value => !value)}>
          {expanded ? 'weniger' : 'mehr'}
        </Button>
      )}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        {note.video_url && isHttpsUrl(note.video_url) ? (
          <a href={note.video_url} target="_blank" rel="noopener noreferrer" className="cp-focus cp-label inline-flex min-h-[44px] items-center underline lg:min-h-9" style={{ color: 'var(--cp-ink)' }}>
            Video ansehen (öffnet in neuem Tab)
          </a>
        ) : <span />}
        <div className="flex flex-wrap items-start gap-2">
          <Button type="button" onClick={() => setEditing(true)}>Bearbeiten</Button>
          <ActionForm action={remove} label="Löschen" pendingLabel="Wird gelöscht …" variant="danger"
            requireConfirm="Notiz endgültig löschen? Das lässt sich nicht rückgängig machen."
            onResult={result => { if (!result.error && result.success) onNotice({ kind: 'ok', text: result.success }) }} />
        </div>
      </div>
    </li>
  )
}

/** Notizverlauf, neueste zuerst (Reihenfolge kommt vom Server). Das Formular für eine neue Notiz steht nur oben in der Liste, wenn es geöffnet wurde. */
export default function NotesTimeline({ orgSlug, playerId, notes, bookings, initialDate, initialCampId }: {
  orgSlug: string
  playerId: string
  notes: PlayerNote[]
  bookings: PlayerBooking[]
  initialDate: string
  initialCampId: string | null
}) {
  const [notice, setNotice] = useState<NoticeState | null>(null)
  const byCamp = new Map<string, PlayerBooking>()
  for (const booking of bookings) if (!byCamp.has(booking.camp_id)) byCamp.set(booking.camp_id, booking)

  return (
    <section className="flex min-w-0 flex-col gap-3" aria-labelledby="notes-heading">
      <h2 id="notes-heading" className="cp-heading" style={{ color: 'var(--cp-ink)' }}>
        Notizen <span className="cp-chip align-middle" style={{ color: 'var(--cp-muted)' }}>{notes.length}</span>
      </h2>
      <Notice notice={notice} />
      <NoteComposerSlot orgSlug={orgSlug} playerId={playerId} bookings={bookings} initialDate={initialDate} initialCampId={initialCampId} />
      {notes.length === 0 ? (
        <div className="flex flex-col items-center gap-3">
          <EmptyState title="Noch keine Notizen." body="Halten Sie nach dem Training kurz fest, was gut lief und woran gearbeitet wird." />
          <WriteNoteButton />
        </div>
      ) : (
        <ol className="flex flex-col gap-3">
          {notes.map(note => (
            <NoteItem key={note.id} orgSlug={orgSlug} playerId={playerId} note={note} bookings={bookings}
              booking={note.camp_id ? byCamp.get(note.camp_id) : undefined} onNotice={setNotice} />
          ))}
        </ol>
      )}
    </section>
  )
}
