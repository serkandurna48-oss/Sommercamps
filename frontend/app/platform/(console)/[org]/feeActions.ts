'use server'

import { revalidatePath } from 'next/cache'
import { getValidAccessToken } from '../../../lib/supabaseServer'
import {
  AdminActionError,
  BillingValidationError,
  createFeeRuleAdmin,
  fetchMe,
  type FeePlan,
  type FeeRuleInput,
} from '../../../lib/saasAdminApi'

export interface FeeRuleActionState {
  error: string | null
  saved: boolean
}

const PLANS: FeePlan[] = ['starter', 'verein', 'individuell']

function text(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

/** "5", "5,5", "4.90" -> "5.50"-style string; null for empty; undefined for invalid. */
function percentValue(raw: string): string | null | undefined {
  if (!raw) return null
  const normalized = raw.replace(',', '.')
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(normalized)) return undefined
  const value = Number(normalized)
  return value <= 30 ? value.toFixed(2) : undefined
}

/** Euro amount ("0,25", "1") -> cents; null for empty; undefined for invalid. */
function euroCents(raw: string): number | null | undefined {
  if (!raw) return null
  const normalized = raw.replace(',', '.')
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(normalized)) return undefined
  return Math.round(Number(normalized) * 100)
}

export async function readFeeRule(formData: FormData): Promise<{ data?: FeeRuleInput; error?: string }> {
  const plan = text(formData, 'plan') as FeePlan
  if (!PLANS.includes(plan)) return { error: 'Bitte ein Paket wählen.' }
  const percent = percentValue(text(formData, 'percent'))
  if (percent === undefined) return { error: 'Prozentsatz zwischen 0 und 30 mit höchstens zwei Nachkommastellen.' }
  if (plan === 'individuell' && percent === null) return { error: 'Für „Individuell“ bitte einen Prozentsatz angeben.' }
  const fixed = euroCents(text(formData, 'fixed_eur'))
  const minimum = euroCents(text(formData, 'min_eur'))
  if (fixed === undefined || minimum === undefined) return { error: 'Beträge in Euro, z. B. 0,25.' }
  const validFrom = text(formData, 'valid_from')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(validFrom)) return { error: 'Bitte ein Startdatum wählen.' }
  return {
    data: {
      plan, percent, fixed_cents: fixed, min_fee_cents: minimum, valid_from: validFrom,
      note: text(formData, 'note') || null,
    },
  }
}

/** Platform owner only: append a fee rule (history is never edited). */
export async function addFeeRuleAction(
  orgSlug: string,
  _previous: FeeRuleActionState,
  formData: FormData,
): Promise<FeeRuleActionState> {
  const token = await getValidAccessToken()
  if (!token) return { error: 'Sitzung abgelaufen – bitte neu anmelden.', saved: false }
  const parsed = await readFeeRule(formData)
  if (!parsed.data) return { error: parsed.error ?? 'Bitte Angaben prüfen.', saved: false }
  try {
    const me = await fetchMe(token)
    if (!me.is_platform_owner) return { error: 'Nur Plattform-Betreiber dürfen Gebühren festlegen.', saved: false }
    await createFeeRuleAdmin(orgSlug, token, parsed.data)
  } catch (error) {
    if (error instanceof BillingValidationError || error instanceof AdminActionError) return { error: error.message, saved: false }
    return { error: 'Gebühr konnte nicht gespeichert werden.', saved: false }
  }
  revalidatePath(`/platform/${orgSlug}`)
  return { error: null, saved: true }
}
