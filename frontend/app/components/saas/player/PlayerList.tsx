'use client'

import { useId, useState } from 'react'
import type { PlayerSummary } from '../../../lib/saasAdminApi'
import Link from '../preview/AdminLink'
import EmptyState from '../state/EmptyState'
import Button from '../ui/Button'
import Field from '../ui/Field'
import { INPUT_CLASS, INPUT_STYLE } from '../ui/formFieldStyles'
import { filterPlayers, formatDay } from './playerLogic'

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/** Spielerliste mit Suche im Browser. Der Suchbegriff bleibt im Komponentenzustand
 * (nicht in der URL, kein Request); Namen sind Kinderdaten. */
export default function PlayerList({ orgSlug, players }: { orgSlug: string; players: PlayerSummary[] }) {
  const id = useId()
  const [q, setQ] = useState('')
  const filtered = q.trim() !== ''
  const shown = filterPlayers(players, q)

  return (
    <>
      <div role="search" className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-80">
          <Field label="Suche nach Name" htmlFor={`${id}-q`}>
            <input id={`${id}-q`} type="search" value={q} onChange={event => setQ(event.target.value)} maxLength={100} autoComplete="off" className={INPUT_CLASS} style={INPUT_STYLE} />
          </Field>
        </div>
        {filtered && <Button type="button" onClick={() => setQ('')}>Zurücksetzen</Button>}
      </div>
      <p className="cp-chip mb-2" role="status" style={{ color: 'var(--cp-muted)' }}>
        {filtered ? `${shown.length} von ${players.length} Spielern` : plural(players.length, 'Spieler', 'Spieler')}
      </p>
      {shown.length === 0 ? (
        <EmptyState title={filtered ? 'Keine Spieler gefunden.' : 'Noch keine Spieler.'}
          body={filtered ? 'Passen Sie die Suche an.' : 'Spieler erscheinen automatisch, sobald jemand ein Training oder Camp bucht.'} />
      ) : (
        <ul className="cp-card cp-card-list cp-table">
          <li className="cp-table-head cp-player-cols" aria-hidden="true">
            <span>Name</span><span>Alter</span><span>Letzte Buchung</span><span>Akte</span>
          </li>
          {shown.map(player => (
            <li key={player.id} className="cp-player-item">
              <Link href={`/pilot/${orgSlug}/spieler/${player.id}`} prefetch={false}
                className="cp-focus cp-table-row cp-player-cols cp-row-link min-h-[56px]">
                <span className="cp-subheading min-w-0 break-words" style={{ color: 'var(--cp-ink)' }}>{player.first_name} {player.last_name}</span>
                <span className="cp-chip cp-num" style={{ color: 'var(--cp-muted)' }}>{plural(player.age, 'Jahr', 'Jahre')}</span>
                <span className="cp-chip" style={{ color: 'var(--cp-muted)' }}>
                  {player.last_booking_at ? `zuletzt gebucht am ${formatDay(player.last_booking_at)}` : 'noch keine Buchung'}
                </span>
                <span className="cp-chip" style={{ color: 'var(--cp-ink-2)' }}>
                  {plural(player.note_count, 'Notiz', 'Notizen')} · {plural(player.open_goal_count, 'offenes Ziel', 'offene Ziele')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
