'use client'

import { useState } from 'react'
import Link from 'next/link'
import { de } from '../../../lib/i18n/de'
import type { Task } from '../dashboardLogic'

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
export default function TaskRow({ task, orgSlug }: { task: Task; orgSlug: string }) {
  const [done, setDone] = useState(false)

  return (
    <div
      className="flex items-center justify-between gap-4 border-t px-1 py-4"
      style={{ borderColor: 'var(--cp-line-2)' }}
    >
      <p className={`cp-body ${done ? 'line-through' : ''}`} style={{ color: done ? 'var(--cp-muted)' : 'var(--cp-ink-2)' }}>
        {taskTitle(task)}
      </p>
      <Link
        href={`/pilot/${orgSlug}/camps/${task.campSlug}`}
        onClick={() => setDone(true)}
        className="cp-label shrink-0"
        style={{ color: 'var(--cp-ink)' }}
      >
        {de.tasks.review}
      </Link>
    </div>
  )
}
