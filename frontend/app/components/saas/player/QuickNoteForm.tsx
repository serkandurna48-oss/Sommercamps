'use client'

import { useId, useRef, useState, type FormEvent } from 'react'
import type { PlayerBooking, PlayerNote } from '../../../lib/saasAdminApi'
import { createNoteAction, updateNoteAction } from '../actions/playerActions'
import SuccessNote from '../state/SuccessNote'
import Button from '../ui/Button'
import Field from '../ui/Field'
import { INPUT_CLASS, INPUT_STYLE } from '../ui/formFieldStyles'
import { FormError } from './Notice'
import { FOCUS_OPTIONS, formatDay, validateVideoUrl } from './playerLogic'
import { useSubmit } from './useSubmit'

function sessionOptions(bookings: PlayerBooking[]): { campId: string; label: string; date: string }[] {
  const seen = new Set<string>()
  const options: { campId: string; label: string; date: string }[] = []
  for (const booking of bookings) {
    if (seen.has(booking.camp_id)) continue
    seen.add(booking.camp_id)
    const when = `${formatDay(booking.local_date)}${booking.local_time ? `, ${booking.local_time} Uhr` : ''}`
    options.push({ campId: booking.camp_id, label: `${when} · ${booking.offer_title ?? booking.camp_title}`, date: booking.local_date })
  }
  return options
}

const TOGGLE_BASE = 'min-h-[48px] px-4'

/**
 * Schnellerfassung einer Trainingsnotiz (Ziel: unter zwei Minuten, auch am Handy):
 * Datum, Schwerpunkt-Chips, Text; Bewertung, nächste Schritte und Video-Link
 * optional. Wird in der Spielerakte genutzt (neu und zum Bearbeiten). Die Felder
 * gehören diesem Formular und bleiben bei einem Fehler erhalten. Notiztexte
 * gelangen nie in URL, Log oder Konsole.
 */
export default function QuickNoteForm({ orgSlug, playerId, bookings, initialDate, initialCampId = null, note, autoFocus = false, onDone }: {
  orgSlug: string
  playerId: string
  bookings: PlayerBooking[]
  initialDate: string
  initialCampId?: string | null
  /** Gesetzt = bestehende Notiz bearbeiten. */
  note?: PlayerNote
  autoFocus?: boolean
  onDone?: () => void
}) {
  const id = useId()
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const action = note
    ? updateNoteAction.bind(null, orgSlug, playerId, note.id)
    : createNoteAction.bind(null, orgSlug, playerId)
  const { pending, result, submit, clearField } = useSubmit(action)
  const [date, setDate] = useState(note?.note_date ?? initialDate)
  const [campId, setCampId] = useState(note?.camp_id ?? initialCampId ?? '')
  const [focus, setFocus] = useState<string[]>(note?.focus ?? [])
  const [body, setBody] = useState(note?.body ?? '')
  const [rating, setRating] = useState(note?.rating ? String(note.rating) : '')
  const [nextSteps, setNextSteps] = useState(note?.next_steps ?? '')
  const [videoUrl, setVideoUrl] = useState(note?.video_url ?? '')
  const [savedOnce, setSavedOnce] = useState(false)
  const sessions = sessionOptions(bookings)
  const videoHint = videoUrl.trim() === '' ? undefined : validateVideoUrl(videoUrl) ?? undefined
  const err = (name: string) => result?.fieldErrors?.[name]

  function toggleFocus(value: string) {
    setFocus(current => (current.includes(value) ? current.filter(entry => entry !== value) : [...current, value]))
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSavedOnce(false)
    const data = new FormData()
    data.set('note_date', date)
    data.set('body', body)
    for (const value of focus) data.append('focus', value)
    data.set('rating', rating)
    data.set('next_steps', nextSteps)
    data.set('video_url', videoUrl)
    data.set('camp_id', campId)
    submit(data, () => {
      if (note) {
        onDone?.()
        return
      }
      setBody('')
      setFocus([])
      setRating('')
      setNextSteps('')
      setVideoUrl('')
      setSavedOnce(true)
      bodyRef.current?.focus()
    })
  }

  const toggleStyle = (on: boolean) => (on ? { background: 'var(--cp-accent-soft)', color: 'var(--cp-accent-ink)', borderColor: 'var(--cp-accent-ink)' } : undefined)

  return (
    <form onSubmit={onSubmit} className="cp-card flex flex-col gap-4" aria-label={note ? 'Notiz bearbeiten' : 'Neue Notiz'} noValidate>
      {/* Two columns once the form is wide enough (container query in tokens.css): meta left, text right. */}
      <div className="cp-note-grid"><div className="cp-note-cols">
        <div className="cp-note-col">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Datum" htmlFor={`${id}-date`} error={err('note_date')}>
              <input id={`${id}-date`} type="date" required value={date} className={INPUT_CLASS} style={INPUT_STYLE}
                onChange={event => { setDate(event.target.value); clearField('note_date') }} />
            </Field>
            {sessions.length > 0 && (
              <Field label="Termin (optional)" htmlFor={`${id}-camp`} error={err('camp_id')}>
                <select id={`${id}-camp`} value={campId} className={INPUT_CLASS} style={INPUT_STYLE}
                  onChange={event => {
                    setCampId(event.target.value)
                    const picked = sessions.find(option => option.campId === event.target.value)
                    if (picked) setDate(picked.date)
                  }}>
                  <option value="">Kein Termin</option>
                  {sessions.map(option => <option key={option.campId} value={option.campId}>{option.label}</option>)}
                </select>
              </Field>
            )}
          </div>
          <div role="group" aria-labelledby={`${id}-focus`} className="flex flex-col gap-1.5">
            <span id={`${id}-focus`} className="cp-label" style={{ color: 'var(--cp-ink-2)' }}>Schwerpunkt</span>
            <div className="flex flex-wrap gap-2">
              {FOCUS_OPTIONS.map(option => (
                <Button key={option.value} type="button" aria-pressed={focus.includes(option.value)} className={TOGGLE_BASE}
                  style={toggleStyle(focus.includes(option.value))} onClick={() => { toggleFocus(option.value); clearField('focus') }}>
                  {option.label}
                </Button>
              ))}
            </div>
            {err('focus') && <p className="cp-chip" role="alert" style={{ color: 'var(--cp-error)' }}>{err('focus')}</p>}
          </div>
          <div role="group" aria-labelledby={`${id}-rating`} className="flex flex-col gap-1.5">
            <span id={`${id}-rating`} className="cp-label" style={{ color: 'var(--cp-ink-2)' }}>Bewertung (optional)</span>
            <div className="flex flex-wrap gap-2">
              {['1', '2', '3', '4', '5'].map(value => (
                <Button key={value} type="button" aria-pressed={rating === value} aria-label={`${value} von 5`} className="min-h-[48px] min-w-[48px] px-0"
                  style={toggleStyle(rating === value)} onClick={() => { setRating(rating === value ? '' : value); clearField('rating') }}>
                  {value}
                </Button>
              ))}
            </div>
            {err('rating') && <p className="cp-chip" role="alert" style={{ color: 'var(--cp-error)' }}>{err('rating')}</p>}
          </div>
        </div>
        <div className="cp-note-col">
          <Field label="Notiz" htmlFor={`${id}-body`} error={err('body')}>
            <textarea id={`${id}-body`} ref={bodyRef} required rows={6} maxLength={10000} value={body} autoFocus={autoFocus}
              placeholder="Was lief gut, woran arbeiten wir weiter?" className={INPUT_CLASS} style={INPUT_STYLE}
              onChange={event => { setBody(event.target.value); clearField('body') }} />
          </Field>
          <Field label="Nächste Schritte (optional)" htmlFor={`${id}-next`} error={err('next_steps')}>
            <textarea id={`${id}-next`} rows={3} maxLength={4000} value={nextSteps} className={INPUT_CLASS} style={INPUT_STYLE}
              onChange={event => { setNextSteps(event.target.value); clearField('next_steps') }} />
          </Field>

          <Field label="Video-Link (optional)" htmlFor={`${id}-video`} hint="Nur Links, die mit https:// beginnen." error={videoHint ?? err('video_url')}>
            <input id={`${id}-video`} type="url" inputMode="url" autoComplete="off" maxLength={2000} value={videoUrl} className={INPUT_CLASS} style={INPUT_STYLE}
              onChange={event => { setVideoUrl(event.target.value); clearField('video_url') }} />
          </Field>
        </div>
      </div></div>

      {!pending && <FormError message={result?.error} />}
      {!pending && savedOnce && <SuccessNote>Notiz gespeichert.</SuccessNote>}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={pending} className="w-full min-h-[52px] sm:w-auto">
          {pending ? 'Wird gespeichert …' : note ? 'Änderungen speichern' : 'Notiz speichern'}
        </Button>
        {note && (
          <Button type="button" disabled={pending} onClick={onDone} className="w-full min-h-[52px] sm:w-auto">Abbrechen</Button>
        )}
      </div>
    </form>
  )
}
