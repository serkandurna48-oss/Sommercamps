import PageHeader from '../shell/PageHeader'
import { ADMIN_PAGE } from '../ui/pageLayout'
import ModuleDisabledBody from './ModuleDisabledBody'
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
          <ModuleDisabledBody orgSlug={orgSlug} />
        </section>
      </main>
    </>
  )
}
