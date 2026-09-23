'use client'

import { useActionState } from 'react'
import Button from '../ui/Button'
import { setOrganizationPublishedAction, type PublishActionState } from '../actions/configActions'

/** Ein Klick, sofortige Wirkung, kein "Speichern" nötig — bewusst kein Teil
 * des großen Stammdaten-Formulars (OrganizationConfigForm), damit man
 * "Veröffentlichen" nie versehentlich mit-absendet. Wiederverwendet auf der
 * Vereins-Konfigurationsseite UND der Plattform-Konsole-Vereinsdetailseite
 * (platform/(console)/[org]) — derselbe Schalter, zwei Orte. */
export default function PublishToggle({ orgSlug, published }: { orgSlug: string; published: boolean }) {
  const boundAction = setOrganizationPublishedAction.bind(null, orgSlug, !published)
  const [state, formAction, pending] = useActionState<PublishActionState, FormData>(boundAction, { error: null })

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-4 rounded-[var(--cp-r-card)] border p-5"
      style={{
        borderColor: published ? 'var(--cp-field-line)' : 'var(--cp-error-line)',
        background: published ? 'var(--cp-surface)' : 'var(--cp-error-bg)',
      }}
    >
      <div>
        <p className="cp-subheading" style={{ color: 'var(--cp-ink)' }}>
          {published ? 'Veröffentlicht' : 'Entwurf — noch nicht öffentlich sichtbar'}
        </p>
        <p className="cp-chip mt-0.5" style={{ color: 'var(--cp-muted)' }}>
          {published
            ? 'Die Vereinsseite ist für Eltern erreichbar.'
            : 'Nur du siehst diesen Verein — die öffentliche Seite antwortet mit „nicht gefunden", bis du veröffentlichst.'}
        </p>
        {state.error && (
          <p className="cp-chip mt-1" style={{ color: 'var(--cp-error)' }} role="alert">
            {state.error}
          </p>
        )}
      </div>
      <form action={formAction}>
        <Button type="submit" variant={published ? 'secondary' : 'primary'} disabled={pending}>
          {pending ? 'Wird gespeichert …' : published ? 'Zurückziehen' : 'Veröffentlichen'}
        </Button>
      </form>
    </div>
  )
}
