import PageHeader from '../shell/PageHeader'
import { ADMIN_PAGE } from '../ui/pageLayout'
import EmptyState from '../state/EmptyState'
import { ButtonLink } from '../ui/Button'
import type { OrgModule } from '../../../lib/orgModules'

const TITLES: Record<Exclude<OrgModule, 'camps'>, string> = {
  trainings: 'Trainings',
  members: 'Mitglieder',
  players: 'Spieler',
}

/** Shown instead of a module page when the platform owner has not enabled that module
 * for this club (the backend answers 403 module_disabled for its API anyway). */
export default function ModuleDisabledScreen({ orgSlug, module }: { orgSlug: string; module: Exclude<OrgModule, 'camps'> }) {
  return (
    <>
      <PageHeader title={TITLES[module]} />
      <main className={ADMIN_PAGE}>
        <section className="cp-card cp-dash-pad" aria-live="polite">
          <EmptyState
            title="Dieses Modul ist für Ihren Verein nicht aktiviert"
            body="Wenn Sie es nutzen möchten, wenden Sie sich an Ihren Ansprechpartner bei CampsPilot. Camps und Anmeldungen funktionieren unverändert."
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <ButtonLink href={`/pilot/${orgSlug}/dashboard`} variant="secondary">Zur Übersicht</ButtonLink>
            <ButtonLink href={`/pilot/${orgSlug}/hilfe`} variant="secondary">Hilfe</ButtonLink>
          </div>
        </section>
      </main>
    </>
  )
}
