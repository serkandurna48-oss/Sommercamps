'use server'

import { revalidatePath } from 'next/cache'
import { getValidAccessToken } from '../../../lib/supabaseServer'
import { fetchMe, updateOrganizationModulesAdmin } from '../../../lib/saasAdminApi'
import { normalizeModules } from '../../../lib/orgModules'

export interface ModulesActionState {
  error: string | null
  saved: boolean
}

/** Platform owner switches the premium modules of one club. camps always stays on. */
export async function updateModulesAction(
  orgSlug: string,
  _previous: ModulesActionState,
  formData: FormData,
): Promise<ModulesActionState> {
  const token = await getValidAccessToken()
  if (!token) return { error: 'Sitzung abgelaufen – bitte neu anmelden.', saved: false }

  const selected = formData.getAll('modules').filter((value): value is string => typeof value === 'string')
  const modules = normalizeModules(selected)

  try {
    const me = await fetchMe(token)
    if (!me.is_platform_owner) return { error: 'Nur Plattform-Betreiber dürfen Module freischalten.', saved: false }
    await updateOrganizationModulesAdmin(orgSlug, token, modules)
  } catch {
    return { error: 'Module konnten nicht gespeichert werden.', saved: false }
  }

  revalidatePath(`/platform/${orgSlug}`)
  revalidatePath(`/pilot/${orgSlug}`, 'layout')
  return { error: null, saved: true }
}
