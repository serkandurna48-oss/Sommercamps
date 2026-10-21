'use client'

import ListRow from '../ui/ListRow'
import StatusChip from '../data/StatusChip'
import { useState } from 'react'
import { de } from '../../../lib/i18n/de'
import { taskHref, type Task } from '../dashboardLogic'
import Button, { ButtonLink } from '../ui/Button'

function taskCopy(task: Task): { title: string; hint: string } {
  switch (task.kind) {
    case 'payment':
      return { title: de.tasks.payment.title(task.count, task.campTitle), hint: de.tasks.payment.hint }
    case 'missing-contact':
      return { title: de.tasks.missingContact.title(task.count, task.campTitle), hint: de.tasks.missingContact.hint }
    case 'waitlist':
      return { title: de.tasks.waitlist.title(task.count, task.campTitle), hint: de.tasks.waitlist.hint }
  }
}

/**
 * Die eine große Aufgabenkarte (Abschnitt 4.2). "Erledigt" ist rein
 * client-seitig — es gibt keine Aufgaben-Tabelle im Backend, also auch
 * nichts zu persistieren. "bleibt durchgestrichen stehen bis zum
 * Neuladen" (Abschnitt 4.2, wörtlich) statt der Collapse-Motion aus M4 —
 * die zwei Beschreibungen widersprechen sich leicht, diese ist die
 * spezifischere für genau diesen Block.
 */
export default function TaskCard({ task, orgSlug, brandStrong, brandOn }: { task: Task; orgSlug: string; brandStrong: string; brandOn: string }) {
  const [done, setDone] = useState(false)
  const copy = taskCopy(task)

  return (
    <div
      className="cp-card"
      style={{ borderColor: 'var(--cp-line)', background: 'var(--cp-surface)' }}
    >
      <ListRow main={<p className={`cp-heading ${done ? 'line-through' : ''}`} style={{ color: done ? 'var(--cp-muted)' : 'var(--cp-ink)' }}>
        {copy.title}
      </p>} secondary={<p className="cp-body" style={{ color: 'var(--cp-muted)' }}>
        {copy.hint}
      </p>} status={<StatusChip label={done ? 'Erledigt' : 'Offen'} tone={done ? 'ok' : 'pending'} />} action={<div className="flex flex-wrap gap-3">
        <ButtonLink href={taskHref(orgSlug, task)} variant="primary" brandStrong={brandStrong} brandOn={brandOn}>
          {de.tasks.review}
        </ButtonLink>
        <Button variant="secondary" onClick={() => setDone(v => !v)} aria-pressed={done}>
          {de.tasks.markDone}
        </Button>
      </div>} />
    </div>
  )
}
