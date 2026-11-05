'use client'

import { useState } from 'react'
import type { PlayerBooking, PlayerNote } from '../../../lib/saasAdminApi'
import { deleteNoteAction } from '../actions/playerActions'
import EmptyState from '../state/EmptyState'
import Button from '../ui/Button'
import ActionForm from '../ui/ActionForm'
import Notice, { type NoticeState } from './Notice'
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
  const [editing, setEditing] = useState(false)
  const remove = deleteNoteAction.bind(null, orgSlug, playerId, note.id)

  if (editing) {
    return (
      <li data-note-id={note.id}>
        <QuickNoteForm orgSlug={orgSlug} playerId={playerId} bookings={bookings} initialDate={note.note_date} note={note}
          onDone={() => { setEditing(false); onNotice({ kind: 'ok', text: 'Notiz gespeichert.' }) }} />
      </li>
    )
  }

  return (
    <li className="cp-card flex flex-col gap-3" data-note-id={note.id}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="cp-subheading" style={{ color: 'var(--cp-ink)' }}>{formatDay(note.note_date)}</p>
        {note.rating !== null && (
          <p className="inline-flex items-center gap-1" role="img" aria-label={`Bewertung ${note.rating} von 5`}>
            {ratingDots(note.rating).map((on, index) => (
              <span key={index} aria-hidden="true" className="inline-block h-3 w-3 rounded-full border"
                style={{ background: on ? 'var(--cp-ink)' : 'transparent', borderColor: 'var(--cp-ink)' }} />
            ))}
          </p>
        )}
      </div>
      {note.focus.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Schwerpunkt">
          {note.focus.map(value => (
            <li key={value} className="cp-chip rounded-[var(--cp-r-chip)] border px-2.5 py-1" style={{ color: 'var(--cp-ink-2)', borderColor: 'var(--cp-line)' }}>{focusLabel(value)}</li>
          ))}
        </ul>
      )}
      {booking && (
        <p className="cp-chip" style={{ color: 'var(--cp-muted)' }}>
          Termin: {formatDay(booking.local_date)}{booking.local_time ? `, ${booking.local_time} Uhr` : ''} · {booking.offer_title ?? booking.camp_title}
        </p>
      )}
      <p className="cp-body whitespace-pre-wrap break-words" style={{ color: 'var(--cp-ink)' }}>{note.body}</p>
      {note.next_steps && (
        <div>
          <p className="cp-label" style={{ color: 'var(--cp-ink-2)' }}>Nächste Schritte</p>
          <p className="cp-body whitespace-pre-wrap break-words" style={{ color: 'var(--cp-ink)' }}>{note.next_steps}</p>
        </div>
      )}
      {note.video_url && isHttpsUrl(note.video_url) && (
        <a href={note.video_url} target="_blank" rel="noopener noreferrer" className="cp-focus cp-body inline-flex min-h-[44px] items-center underline" style={{ color: 'var(--cp-ink)' }}>
          Video ansehen (öffnet in neuem Tab)
        </a>
      )}
      <div className="flex flex-wrap items-start gap-2">
        <Button type="button" onClick={() => setEditing(true)}>Bearbeiten</Button>
        <ActionForm action={remove} label="Löschen" pendingLabel="Wird gelöscht …" variant="danger"
          requireConfirm="Notiz endgültig löschen? Das lässt sich nicht rückgängig machen."
          onResult={result => { if (!result.error && result.success) onNotice({ kind: 'ok', text: result.success }) }} />
      </div>
    </li>
  )
}

/** Notizen, neueste zuerst (Reihenfolge kommt vom Server). */
export default function NotesTimeline({ orgSlug, playerId, notes, bookings }: {
  orgSlug: string
  playerId: string
  notes: PlayerNote[]
  bookings: PlayerBooking[]
}) {
  const [notice, setNotice] = useState<NoticeState | null>(null)
  const byCamp = new Map<string, PlayerBooking>()
  for (const booking of bookings) if (!byCamp.has(booking.camp_id)) byCamp.set(booking.camp_id, booking)

  return (
    <div className="flex flex-col gap-4">
      <Notice notice={notice} />
      {notes.length === 0 ? (
        <EmptyState title="Noch keine Notizen." body="Halten Sie nach dem Training kurz fest, was gut lief und woran gearbeitet wird." />
      ) : (
        <ol className="flex flex-col gap-4">
          {notes.map(note => (
            <NoteItem key={note.id} orgSlug={orgSlug} playerId={playerId} note={note} bookings={bookings}
              booking={note.camp_id ? byCamp.get(note.camp_id) : undefined} onNotice={setNotice} />
          ))}
        </ol>
      )}
    </div>
  )
}
