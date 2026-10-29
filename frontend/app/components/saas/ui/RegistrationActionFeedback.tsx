'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import type { RegistrationAdmin } from '../../../lib/saasAdminApi'
import type { ActionFormState } from './ActionForm'

const FeedbackContext = createContext<((result: ActionFormState) => void) | undefined>(undefined)

export const useRegistrationActionFeedback = () => useContext(FeedbackContext)

/** Keep the result above content that can disappear after revalidation. */
export default function RegistrationActionFeedback({ children, registrations, waitlistHref }: {
  children: ReactNode
  registrations: RegistrationAdmin[]
  waitlistHref: string
}) {
  const [feedback, setFeedback] = useState<{
    success: string
    promotedName: string | null
  } | null>(null)

  function reportResult(result: ActionFormState) {
    if (!result.success) return
    const promoted = registrations.find(r => r.registration_token === result.promoted?.registration_token)
    // Snapshot the name before revalidation removes the waiting child.
    setFeedback({
      success: result.success,
      promotedName: result.promoted
        ? (promoted ? `${promoted.child_first_name} ${promoted.child_last_name}` : 'Das nächste Kind auf der Warteliste')
        : null,
    })
  }

  return (
    <FeedbackContext.Provider value={reportResult}>
      {feedback && (
        <div role="status" className="cp-body mb-4 space-y-2 rounded-[var(--cp-r-field)] border p-4" style={{ color: 'var(--cp-ok)', borderColor: 'var(--cp-line-2)' }}>
          <p>{feedback.success}</p>
          {feedback.promotedName && (
            <>
              <p>{feedback.promotedName} hat den Platz erhalten. Die Familie wurde automatisch per E-Mail informiert.</p>
              <a className="underline" href={waitlistHref}>Zur Warteliste</a>
            </>
          )}
        </div>
      )}
      {children}
    </FeedbackContext.Provider>
  )
}
