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
import Notice, { FormError, type NoticeState } from './Notice'
import { FOCUS_OPTIONS, focusLabel, formatDay } from './playerLogic'
import { useSubmit } from './useSubmit'

const STATUS: Record<PlayerGoalStatus, { label: string; tone: StatusTone }> = {
  offen: { label: 'Offen', tone: 'info' },
  erreicht: { label: 'Erreicht', tone: 'ok' },
  verworfen: { label: 'Verworfen', tone: 'neutral' },
}

function GoalRow({ orgSlug, playerId, goal, onNotice }: { orgSlug: string; playerId: string; goal: PlayerGoal; onNotice: (n: NoticeState) => void }) {
  const set = (status: PlayerGoalStatus) => setGoalStatusAction.bind(null, orgSlug, playerId, goal.id, status)
  const done = (result: { error: string | null; success: string | null }) => { if (!result.error && result.success) onNotice({ kind: 'ok', text: result.success }) }
  return (
    <li className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-start sm:justify-between" style={{ borderTopColor: 'var(--cp-line-2)' }} data-goal-status={goal.status}>
      <div className="min-w-0 flex-1">
        <p className="cp-subheading break-words" style={{ color: 'var(--cp-ink)', textDecoration: goal.status === 'verworfen' ? 'line-through' : undefined }}>{goal.title}</p>
        <p className="cp-chip" style={{ color: 'var(--cp-muted)' }}>
          {focusLabel(goal.area)}{goal.target_date ? ` · bis ${formatDay(goal.target_date)}` : ''}
        </p>
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <StatusChip tone={STATUS[goal.status].tone} label={STATUS[goal.status].label} />
        {goal.status === 'offen' ? (
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

export default function GoalsSection({ orgSlug, playerId, goals, brandStrong, brandOn }: {
  orgSlug: string
  playerId: string
  goals: PlayerGoal[]
  brandStrong: string
  brandOn: string
}) {
  const id = useId()
  const { pending, result, submit, clearField } = useSubmit(createGoalAction.bind(null, orgSlug, playerId))
  const [notice, setNotice] = useState<NoticeState | null>(null)
  const [title, setTitle] = useState('')
  const [area, setArea] = useState('technik')
  const [targetDate, setTargetDate] = useState('')
  const err = (name: string) => result?.fieldErrors?.[name]

  return (
    <div className="flex flex-col gap-4">
      <Notice notice={notice} />
      {goals.length === 0 ? (
        <EmptyState title="Noch keine Ziele." body="Ein Ziel gibt den Notizen eine Richtung, zum Beispiel „Linker Fuß sicherer“." />
      ) : (
        <ul className="cp-card cp-card-list">
          {goals.map(goal => <GoalRow key={goal.id} orgSlug={orgSlug} playerId={playerId} goal={goal} onNotice={setNotice} />)}
        </ul>
      )}
      <form className="cp-card flex flex-col gap-4" aria-label="Ziel hinzufügen" noValidate onSubmit={event => {
        event.preventDefault()
        setNotice(null)
        const data = new FormData()
        data.set('title', title); data.set('area', area); data.set('target_date', targetDate)
        submit(data, () => { setTitle(''); setTargetDate(''); setNotice({ kind: 'ok', text: 'Ziel gespeichert.' }) })
      }}>
        <h3 className="cp-subheading" style={{ color: 'var(--cp-ink)' }}>Ziel hinzufügen</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
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
        <div>
          <Button type="submit" variant="primary" disabled={pending} brandStrong={brandStrong} brandOn={brandOn} className="w-full sm:w-auto">
            {pending ? 'Wird gespeichert …' : 'Ziel speichern'}
          </Button>
        </div>
      </form>
    </div>
  )
}
