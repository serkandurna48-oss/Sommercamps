'use server'

import { revalidatePath } from 'next/cache'
import { getValidAccessToken } from '../../../lib/supabaseServer'
import { AdminActionError, addPlatformOwnerAdmin, removePlatformOwnerAdmin } from '../../../lib/saasAdminApi'

export interface TeamActionState {
  error: string | null
  notice: string | null
}

const EXPIRED: TeamActionState = { error: 'Sitzung abgelaufen — bitte neu anmelden.', notice: null }

/** Plattform-Zugang für ein bestehendes Konto. Die Berechtigung prüft
 * ausschließlich das Backend (require_platform_owner); hier wird nur
 * weitergereicht und die Rückmeldung formuliert. */
export async function addPlatformOwnerAction(_prev: TeamActionState, formData: FormData): Promise<TeamActionState> {
  const token = await getValidAccessToken()
  if (!token) return EXPIRED

  const email = String(formData.get('email') ?? '').trim()
  if (!email) return { error: 'Bitte E-Mail-Adresse eingeben.', notice: null }

  try {
    const owner = await addPlatformOwnerAdmin(token, email)
    revalidatePath('/platform/team')
    return {
      error: null,
      notice: owner.already_owner
        ? `${owner.email ?? email} hat bereits Plattform-Zugang.`
        : `${owner.email ?? email} hat jetzt Plattform-Zugang. Beim nächsten Login öffnet sich die Plattform-Konsole.`,
    }
  } catch (err) {
    return { error: err instanceof AdminActionError ? err.message : 'Plattform-Zugang konnte nicht vergeben werden.', notice: null }
  }
}

export async function removePlatformOwnerAction(_prev: TeamActionState, formData: FormData): Promise<TeamActionState> {
  const token = await getValidAccessToken()
  if (!token) return EXPIRED

  const userId = String(formData.get('user_id') ?? '')
  const label = String(formData.get('label') ?? 'Konto')
  if (!userId) return { error: 'Kein Konto ausgewählt.', notice: null }

  try {
    await removePlatformOwnerAdmin(token, userId)
  } catch (err) {
    return { error: err instanceof AdminActionError ? err.message : 'Plattform-Zugang konnte nicht entzogen werden.', notice: null }
  }
  revalidatePath('/platform/team')
  return { error: null, notice: `${label}: Plattform-Zugang entzogen. Vereinszugänge bleiben bestehen.` }
}
