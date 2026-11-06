'use client'

import EmptyState from '../state/EmptyState'
import { ButtonLink } from '../ui/Button'
import { useIsPlatformOwner } from '../shell/ViewerContext'

/**
 * Body of ModuleDisabledScreen. The platform owner is the one person who can switch a
 * module on, so for them this is not a dead end: they get the link to the module switch
 * of this club in the platform console. Club admins are told to ask CampsPilot.
 */
export default function ModuleDisabledBody({ orgSlug }: { orgSlug: string }) {
  const isPlatformOwner = useIsPlatformOwner()
  return (
    <>
      {isPlatformOwner ? (
        <EmptyState
          title="Dieses Modul ist für diesen Verein nicht freigeschaltet"
          body="Als Plattform-Betreiber schaltest du es in der Plattform-Konsole beim Verein frei. Bereits angelegte Daten bleiben erhalten."
        />
      ) : (
        <EmptyState
          title="Dieses Modul ist für deinen Verein nicht aktiviert"
          body="Wenn du es nutzen möchtest, wende dich an deinen Ansprechpartner bei CampsPilot. Camps und Anmeldungen funktionieren unverändert."
        />
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {isPlatformOwner && (
          <ButtonLink href={`/platform/${orgSlug}#module`} variant="primary">Module freischalten</ButtonLink>
        )}
        <ButtonLink href={`/pilot/${orgSlug}/dashboard`} variant="secondary">Zur Übersicht</ButtonLink>
        <ButtonLink href={`/pilot/${orgSlug}/hilfe`} variant="secondary">Hilfe</ButtonLink>
      </div>
    </>
  )
}
