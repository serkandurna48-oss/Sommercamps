'use server'

import { revalidatePath } from 'next/cache'
import { getValidAccessToken } from '../../../lib/supabaseServer'
import { AdminActionError, importSalesLeads, type LeadImportResult } from '../../../lib/saasAdminApi'

export interface ImportState {
  error: string | null
  result: LeadImportResult | null
}

const MAX_BYTES = 1_000_000

/** Two steps: "Prüfen" (dry run, nothing saved) and "Importieren".
 * Owner-only — enforced by the backend (403 for everyone else). */
export async function importLeadsAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const token = await getValidAccessToken()
  if (!token) return { error: 'Sitzung abgelaufen — bitte neu anmelden.', result: null }
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'Bitte eine CSV-Datei auswählen.', result: null }
  if (file.size > MAX_BYTES) return { error: 'Die Datei ist größer als 1 MB.', result: null }
  const dryRun = formData.get('mode') !== 'import'
  try {
    const result = await importSalesLeads(token, await file.text(), dryRun)
    if (!dryRun) revalidatePath('/vertrieb')
    return { error: null, result }
  } catch (err) {
    return { error: err instanceof AdminActionError ? err.message : 'Import fehlgeschlagen.', result: null }
  }
}
