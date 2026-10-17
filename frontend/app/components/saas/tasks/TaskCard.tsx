'use client'

import { useState } from 'react'
import Link from 'next/link'
import { de } from '../../../lib/i18n/de'
import type { Task } from '../dashboardLogic'
import Button from '../ui/Button'

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
      className="rounded-[var(--cp-r-card)] border p-6"
      style={{ borderColor: 'var(--cp-line)', background: 'var(--cp-surface)' }}
    >
      <p className={`cp-heading ${done ? 'line-through' : ''}`} style={{ color: done ? 'var(--cp-muted)' : 'var(--cp-ink)' }}>
        {copy.title}
      </p>
      <p className="cp-body mt-1.5" style={{ color: 'var(--cp-muted)' }}>
        {copy.hint}
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link href={`/pilot/${orgSlug}/camps/${task.campSlug}`}>
          <Button variant="primary" brandStrong={brandStrong} brandOn={brandOn}>
            {de.tasks.review}
          </Button>
        </Link>
        <Button variant="secondary" onClick={() => setDone(v => !v)} aria-pressed={done}>
          {de.tasks.markDone}
        </Button>
      </div>
    </div>
  )
}
