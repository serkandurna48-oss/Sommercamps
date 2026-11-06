'use client'

import { useAdminPreview, previewNoopAction } from '../preview/AdminPreviewContext'

import { useActionState, useId } from 'react'
import Button, { ButtonLink } from '../ui/Button'
import ParentLinkActions from '../state/ParentLinkActions'
import { de } from '../../../lib/i18n/de'
import { setOrganizationPublishedAction, type PublishActionState } from '../actions/configActions'

/** Publication is separate from saving organization details. Withdrawal
 * requires confirmation because it hides all camps from parents.
 * Bewusst kein Teil
 * des großen Stammdaten-Formulars (OrganizationConfigForm), damit man
 * "Veröffentlichen" nie versehentlich mit-absendet. Wiederverwendet auf der
 * Vereins-Konfigurationsseite UND der Plattform-Konsole-Vereinsdetailseite
 * (platform/(console)/[org]) — derselbe Schalter, zwei Orte.
 *
 * `emphasis` hält die Regel „eine Primäraktion je Ansicht“ ein: Steht auf
 * derselben Seite ein Speichern-Button, stuft der Aufrufer ihn oder diesen
 * Schalter auf 'secondary' (Standard 'primary', z. B. in der Plattform-Konsole). */
export default function PublishToggle({
  orgSlug,
  published,
  emphasis = 'primary',
}: {
  orgSlug: string
  published: boolean
  emphasis?: 'primary' | 'secondary'
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
            : 'Deine Vereinsseite ist noch nicht für Eltern sichtbar. Veröffentliche die Seite nach der Freigabe.'}
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
          variant={published ? 'danger' : emphasis}
          disabled={pending}
        >
          {pending ? 'Wird gespeichert …' : published ? 'Vereinsseite zurückziehen' : 'Vereinsseite veröffentlichen'}
        </Button>
      </form>
      {published && !pending && <div className="flex w-full flex-col items-start gap-3">
        <p className="cp-body">{de.onboarding.publicationHint}</p>
        <ButtonLink href={`/pilot/${orgSlug}/dashboard`} variant="secondary">{de.onboarding.publicationNext}</ButtonLink>
        <ParentLinkActions orgSlug={orgSlug} />
      </div>}
    </div>
  )
}
