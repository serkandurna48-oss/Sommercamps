'use client'

import { useState } from 'react'
import { ButtonLink } from '../ui/Button'
import { de } from '../../../lib/i18n/de'
import { taskHref, type Task } from '../dashboardLogic'

function taskTitle(task: Task): string {
  switch (task.kind) {
    case 'payment':
      return de.tasks.payment.title(task.count, task.campTitle)
    case 'missing-contact':
      return de.tasks.missingContact.title(task.count, task.campTitle)
    case 'waitlist':
      return de.tasks.waitlist.title(task.count, task.campTitle)
  }
}

/** Ruhige Zeile mit einem Button (Abschnitt 4.2) — "Ansehen" statt eines
 * eigenen Erledigt-Reglers, den nur die große Karte bekommt. */
export default function TaskRow({ task, orgSlug, brandStrong, brandOn }: { task: Task; orgSlug: string; brandStrong?: string; brandOn?: string }) {
  const [done, setDone] = useState(false)

  return (
    <div
      className={`flex items-center justify-between gap-4 py-4 ${brandStrong ? 'rounded-[var(--cp-r-card)] border px-5' : 'border-t px-1'}`}
      style={{ borderColor: 'var(--cp-line-2)', background: 'var(--cp-surface)' }}
    >
      <p className={`cp-body ${done ? 'line-through' : ''}`} style={{ color: done ? 'var(--cp-muted)' : 'var(--cp-ink-2)' }}>
        {taskTitle(task)}
      </p>
      <ButtonLink
        href={taskHref(orgSlug, task)}
        onClick={() => setDone(true)}
        className="shrink-0"
        variant={brandStrong ? 'primary' : 'secondary'}
        brandStrong={brandStrong}
        brandOn={brandOn}
      >
        {de.tasks.review}
      </ButtonLink>
    </div>
  )
}
