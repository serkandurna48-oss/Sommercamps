'use client'

import { useAdminPreview, previewNoopAction } from '../preview/AdminPreviewContext'

import { useActionState, useId } from 'react'
import Button from '../ui/Button'
import { setOrganizationPublishedAction, type PublishActionState } from '../actions/configActions'

/** Publication is separate from saving organization details. Withdrawal
 * requires confirmation because it hides all camps from parents.
 * Bewusst kein Teil
 * des großen Stammdaten-Formulars (OrganizationConfigForm), damit man
 * "Veröffentlichen" nie versehentlich mit-absendet. Wiederverwendet auf der
 * Vereins-Konfigurationsseite UND der Plattform-Konsole-Vereinsdetailseite
 * (platform/(console)/[org]) — derselbe Schalter, zwei Orte.
 *
 * Die Brand-Props sind optional, weil genau das die beiden Orte unterscheidet:
 * im Vereinsbereich ist „Veröffentlichen“ eine Hauptaktion in Vereinsfarbe wie
 * jedes Speichern daneben, in der Plattform-Konsole gibt es bewusst keine
 * Vereinsfarbe (wie NewOrgForm). Ohne die Props bleibt es beim bisherigen
 * --cp-ink aus Button.tsx. */
export default function PublishToggle({
  orgSlug,
  published,
  brandStrong,
  brandOn,
}: {
  orgSlug: string
  published: boolean
  brandStrong?: string
  brandOn?: string
}) {
  const feedbackId = useId()
  const hintId = `${feedbackId}-hint`
  const preview = useAdminPreview()
  const boundAction = preview ? previewNoopAction : setOrganizationPublishedAction.bind(null, orgSlug, !published)
  const [state, formAction, pending] = useActionState<PublishActionState, FormData>(boundAction, { error: null })

  return (
    <div
      id="publication"
      className="flex flex-wrap items-center justify-between gap-4 cp-card"
      style={{
        borderColor: published ? 'var(--cp-field-line)' : 'var(--cp-error-line)',
        background: published ? 'var(--cp-surface)' : 'var(--cp-error-bg)',
      }}
    >
      <div>
        <p className="cp-subheading" style={{ color: 'var(--cp-ink)' }}>
          {published ? 'Veröffentlicht' : 'Entwurf – noch nicht öffentlich sichtbar'}
        </p>
        <p id={hintId} className="cp-chip mt-0.5" style={{ color: 'var(--cp-muted)' }}>
          {published
            ? 'Die Vereinsseite ist für Eltern erreichbar.'
            : 'Nur du siehst diesen Verein – die öffentliche Seite antwortet mit „nicht gefunden“, bis du veröffentlichst.'}
        </p>
        {state.error && (
          <p className="cp-chip mt-1" style={{ color: 'var(--cp-error)' }} id={feedbackId} role="alert">
            {state.error}
          </p>
        )}
      </div>
      <form action={formAction} onSubmit={event => {
        if (published && !window.confirm('Vereinsseite zurückziehen?\nEltern können dann keine Camps mehr sehen oder buchen.')) event.preventDefault()
      }}>
        <Button
          aria-describedby={[hintId, state.error && feedbackId].filter(Boolean).join(' ')}
          type="submit"
          variant={published ? 'danger' : 'primary'}
          disabled={pending}
          brandStrong={brandStrong}
          brandOn={brandOn}
        >
          {pending ? 'Wird gespeichert …' : published ? 'Vereinsseite zurückziehen' : 'Vereinsseite veröffentlichen'}
        </Button>
      </form>
    </div>
  )
}
