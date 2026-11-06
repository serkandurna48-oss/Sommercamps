'use client'

import { useId, useState } from 'react'
import type { PlayerGoal, PlayerGoalStatus } from '../../../lib/saasAdminApi'
import { createGoalAction, setGoalStatusAction } from '../actions/playerActions'
import StatusChip, { type StatusTone } from '../data/StatusChip'
import EmptyState from '../state/EmptyState'
import ActionForm from '../ui/ActionForm'
import Button from '../ui/Button'
import Field from '../ui/Field'
import { INPUT_CLASS, INPUT_STYLE } from '../ui/formFieldStyles'
import { COMPACT_BUTTONS, COMPACT_CARD, DISCLOSURE_SUMMARY } from './compact'
import Notice, { FormError, type NoticeState } from './Notice'
import { FOCUS_OPTIONS, focusLabel, formatDay, goalsOpenFirst } from './playerLogic'
import { useSubmit } from './useSubmit'

const STATUS: Record<PlayerGoalStatus, { label: string; tone: StatusTone }> = {
  offen: { label: 'Offen', tone: 'info' },
  erreicht: { label: 'Erreicht', tone: 'ok' },
  verworfen: { label: 'Verworfen', tone: 'neutral' },
}

function GoalRow({ orgSlug, playerId, goal, onNotice }: { orgSlug: string; playerId: string; goal: PlayerGoal; onNotice: (n: NoticeState) => void }) {
  const set = (status: PlayerGoalStatus) => setGoalStatusAction.bind(null, orgSlug, playerId, goal.id, status)
  const done = (result: { error: string | null; success: string | null }) => { if (!result.error && result.success) onNotice({ kind: 'ok', text: result.success }) }
  const open = goal.status === 'offen'
  return (
    <li className="flex flex-col gap-1.5 border-t py-2.5 first:border-t-0 first:pt-0 last:pb-0" style={{ borderTopColor: 'var(--cp-line-2)' }} data-goal-status={goal.status}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="cp-label break-words" style={{ color: 'var(--cp-ink)', textDecoration: goal.status === 'verworfen' ? 'line-through' : undefined }}>{goal.title}</p>
          <p className="cp-chip" style={{ color: 'var(--cp-muted)' }}>
            {focusLabel(goal.area)}{goal.target_date ? ` · bis ${formatDay(goal.target_date)}` : ''}
          </p>
        </div>
        {!open && <StatusChip tone={STATUS[goal.status].tone} label={STATUS[goal.status].label} />}
      </div>
      <div className="flex flex-wrap items-start gap-2">
        {open ? (
          <>
            <ActionForm action={set('erreicht')} label="Erreicht" pendingLabel="Wird gespeichert …" onResult={done} />
            <ActionForm action={set('verworfen')} label="Verwerfen" pendingLabel="Wird gespeichert …" onResult={done} />
          </>
        ) : (
          <ActionForm action={set('offen')} label="Wieder öffnen" pendingLabel="Wird gespeichert …" onResult={done} />
        )}
      </div>
    </li>
  )
}

/** Angepinnte Karte „Ziele“: offene Ziele zuerst, erledigte eingeklappt, neues Ziel direkt darunter. */
export default function GoalsSection({ orgSlug, playerId, goals }: {
  orgSlug: string
  playerId: string
  goals: PlayerGoal[]
}) {
  const id = useId()
  const { pending, result, submit, clearField } = useSubmit(createGoalAction.bind(null, orgSlug, playerId))
  const [notice, setNotice] = useState<NoticeState | null>(null)
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [area, setArea] = useState('technik')
  const [targetDate, setTargetDate] = useState('')
  const err = (name: string) => result?.fieldErrors?.[name]
  const sorted = goalsOpenFirst(goals)
  const open = sorted.filter(goal => goal.status === 'offen')
  const closed = sorted.filter(goal => goal.status !== 'offen')
  const formOpen = adding || goals.length === 0

  const rows = (list: PlayerGoal[]) => list.map(goal => <GoalRow key={goal.id} orgSlug={orgSlug} playerId={playerId} goal={goal} onNotice={setNotice} />)

  return (
    <section className={`${COMPACT_CARD} ${COMPACT_BUTTONS} flex flex-col gap-3`} aria-labelledby="goals-heading">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="goals-heading" className="cp-subheading" style={{ color: 'var(--cp-ink)' }}>Ziele</h2>
        {goals.length > 0 && <p className="cp-chip" style={{ color: 'var(--cp-muted)' }}>{open.length} offen</p>}
      </div>
      <Notice notice={notice} />
      {goals.length === 0 ? (
        <EmptyState title="Noch keine Ziele." body="Ein Ziel gibt den Notizen eine Richtung, zum Beispiel „Linker Fuß sicherer“." />
      ) : (
        <>
          {open.length > 0 ? <ul className="flex flex-col">{rows(open)}</ul> : <p className="cp-body" style={{ color: 'var(--cp-muted)' }}>Keine offenen Ziele.</p>}
          {closed.length > 0 && (
            <details className="group">
              <summary className={DISCLOSURE_SUMMARY} style={{ color: 'var(--cp-ink-2)' }}>Erledigt und verworfen ({closed.length})</summary>
              <ul className="flex flex-col">{rows(closed)}</ul>
            </details>
          )}
        </>
      )}

      {!formOpen && (
        <Button type="button" className="w-full" onClick={() => { setNotice(null); setAdding(true) }}>Ziel hinzufügen</Button>
      )}
      {formOpen && (
        <form className="flex flex-col gap-3 border-t pt-3" style={{ borderTopColor: 'var(--cp-line-2)' }} aria-label="Ziel hinzufügen" noValidate onSubmit={event => {
          event.preventDefault()
          setNotice(null)
          const data = new FormData()
          data.set('title', title); data.set('area', area); data.set('target_date', targetDate)
          submit(data, () => { setTitle(''); setTargetDate(''); setAdding(false); setNotice({ kind: 'ok', text: 'Ziel gespeichert.' }) })
        }}>
          <h3 className="cp-label" style={{ color: 'var(--cp-ink)' }}>Ziel hinzufügen</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Field label="Ziel" htmlFor={`${id}-title`} error={err('title')}>
                <input id={`${id}-title`} required maxLength={200} autoComplete="off" value={title} className={INPUT_CLASS} style={INPUT_STYLE}
                  onChange={event => { setTitle(event.target.value); clearField('title') }} />
              </Field>
            </div>
            <Field label="Bereich" htmlFor={`${id}-area`} error={err('area')}>
              <select id={`${id}-area`} value={area} className={INPUT_CLASS} style={INPUT_STYLE} onChange={event => setArea(event.target.value)}>
                {FOCUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </Field>
            <Field label="Zieldatum (optional)" htmlFor={`${id}-date`} error={err('target_date')}>
              <input id={`${id}-date`} type="date" value={targetDate} className={INPUT_CLASS} style={INPUT_STYLE}
                onChange={event => { setTargetDate(event.target.value); clearField('target_date') }} />
            </Field>
          </div>
          {!pending && <FormError message={result?.error} />}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="secondary" disabled={pending} className="flex-1">
              {pending ? 'Wird gespeichert …' : 'Ziel speichern'}
            </Button>
            {goals.length > 0 && <Button type="button" disabled={pending} onClick={() => setAdding(false)}>Abbrechen</Button>}
          </div>
        </form>
      )}
    </section>
  )
}
