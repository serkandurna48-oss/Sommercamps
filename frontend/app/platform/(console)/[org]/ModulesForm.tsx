'use client'

import { useActionState } from 'react'
import Button from '../../../components/saas/ui/Button'
import { ALL_MODULES, MODULE_LABELS, type OrgModule } from '../../../lib/orgModules'
import { updateModulesAction, type ModulesActionState } from './modulesActions'

/** Platform console: which modules this club may use. Camps is always on (disabled checkbox). */
export default function ModulesForm({ orgSlug, modules }: { orgSlug: string; modules: readonly OrgModule[] }) {
  const [state, formAction, pending] = useActionState<ModulesActionState, FormData>(
    (previous, data) => updateModulesAction(orgSlug, previous, data),
    { error: null, saved: false },
  )

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Freigeschaltete Module</legend>
        {ALL_MODULES.map(module => {
          const always = module === 'camps'
          return (
            <label key={module} className="cp-body flex items-center gap-2" style={{ color: 'var(--cp-ink)' }}>
              <input
                type="checkbox"
                name="modules"
                value={module}
                defaultChecked={always || modules.includes(module)}
                disabled={always}
                className="h-4 w-4"
              />
              <span>{MODULE_LABELS[module]}{always ? ' – immer aktiv' : ''}</span>
            </label>
          )
        })}
      </fieldset>
      {pending && <p role="status">Wird gespeichert …</p>}
      {!pending && state.error && <p role="alert">{state.error}</p>}
      {!pending && state.saved && <p role="status">Gespeichert.</p>}
      <div>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? 'Wird gespeichert …' : 'Module speichern'}
        </Button>
      </div>
    </form>
  )
}
