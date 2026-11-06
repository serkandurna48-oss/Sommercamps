'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { requestPasswordReset } from './actions'

export default function ResetRequestForm({ orgSlug }: { orgSlug: string }) {
  const [state, action, pending] = useActionState(requestPasswordReset.bind(null, orgSlug), { message: '' })
  return <>
    <h1 className="login-h1">Passwort vergessen?</h1>
    {state.message ? <p role="status">{state.message}</p> : <form action={action}>
      <p>Gib die E-Mail-Adresse deines Kontos ein. Wir schicken dir einen Link, mit dem du ein neues Passwort festlegst.</p>
      <label className="login-label" htmlFor="reset-email">E-Mail-Adresse</label>
      <input className="login-field" id="reset-email" name="email" type="email" autoComplete="email" required />
      <button className="login-btn" type="submit" disabled={pending}>{pending ? 'Wird angefordert …' : 'Link anfordern'}</button>
    </form>}
    <div className="auth-links">
      <Link className="cp-focus" href={`/pilot/${encodeURIComponent(orgSlug)}/login`}>Zur Anmeldung</Link>
    </div>
  </>
}
